import { getSupabaseAdmin } from './supabase-admin.js';

/**
 * Manual taste preferences (Settings → Taste Preferences).
 *
 * Writes to the dedicated manual_* columns so a manual edit never destroys
 * behaviourally-learned signal. Recommendation scoring blends these as a
 * baseline floor with behavioural weights taking priority.
 */

// Spec genres → TMDB genre ids (the keys used in genre_weights).
export const TASTE_GENRES = [
    { id: 28, label: 'Action' },
    { id: 53, label: 'Thriller' },
    { id: 878, label: 'Sci-Fi' },
    { id: 27, label: 'Horror' },
    { id: 10749, label: 'Romance' },
    { id: 9648, label: 'Mystery' },
    { id: 35, label: 'Comedy' },
    { id: 14, label: 'Fantasy' },
    { id: 80, label: 'Crime' },
    { id: 99, label: 'Documentary' },
];

// Spec moods → mood_tag ids (aligned with onboarding MOOD_OPTIONS where possible).
export const TASTE_MOODS = [
    { id: 'mind_bending', label: 'Mind Bending' },
    { id: 'feel_good', label: 'Feel Good' },
    { id: 'emotional', label: 'Emotional' },
    { id: 'dark', label: 'Dark' },
    { id: 'suspenseful', label: 'Suspenseful' },
    { id: 'action_packed', label: 'Action Packed' },
    { id: 'family_friendly', label: 'Family Friendly' },
    { id: 'romantic', label: 'Romantic' },
];

export const TASTE_LANGUAGES = [
    { id: 'en', label: 'English' },
    { id: 'hi', label: 'Hindi' },
    { id: 'ko', label: 'Korean' },
    { id: 'ja', label: 'Japanese' },
    { id: 'es', label: 'Spanish' },
    { id: 'fr', label: 'French' },
    { id: 'other', label: 'Others' },
];

export const TASTE_ERAS = [1980, 1990, 2000, 2010, 2020];

const VALID_GENRE_IDS = new Set(TASTE_GENRES.map((g) => g.id));
const VALID_MOOD_IDS = new Set(TASTE_MOODS.map((m) => m.id));
const VALID_LANGUAGE_IDS = new Set(TASTE_LANGUAGES.map((l) => l.id));
const VALID_ERAS = new Set(TASTE_ERAS);

function sanitizeGenreWeights(genreIds) {
    if (!Array.isArray(genreIds)) return {};
    const weights = {};
    genreIds.forEach((id) => {
        const num = Number(id);
        if (VALID_GENRE_IDS.has(num)) weights[String(num)] = 1;
    });
    return weights;
}

function sanitizeMoodPrefs(moodIds) {
    if (!Array.isArray(moodIds)) return {};
    const prefs = {};
    moodIds.forEach((id) => {
        if (VALID_MOOD_IDS.has(id)) prefs[id] = 1;
    });
    return prefs;
}

function sanitizeLanguages(langs) {
    if (!Array.isArray(langs)) return [];
    return [...new Set(langs.filter((l) => VALID_LANGUAGE_IDS.has(l)))];
}

function sanitizeEras(eras) {
    if (!Array.isArray(eras)) return [];
    return [...new Set(eras.map(Number).filter((e) => VALID_ERAS.has(e)))].sort((a, b) => a - b);
}

function sanitizePeople(people) {
    if (!Array.isArray(people)) return { ids: [], list: [] };
    const seen = new Set();
    const list = [];
    const ids = [];
    people.slice(0, 20).forEach((p) => {
        const id = Number(p?.id ?? p);
        if (!Number.isFinite(id) || seen.has(id)) return;
        seen.add(id);
        ids.push(id);
        list.push({ id, name: String(p?.name || '').slice(0, 120) });
    });
    return { ids, list };
}

/** Read manual prefs + computed signal so the Settings UI can pre-fill. */
export async function getTastePreferences(userId) {
    const supabase = getSupabaseAdmin();
    const { data: profile, error } = await supabase
        .from('user_taste_profiles')
        .select('manual_genre_weights, manual_mood_preferences, manual_languages, '
            + 'manual_preferred_eras, favorite_actors, favorite_directors, '
            + 'genre_weights, mood_preferences, preferred_languages, preferred_decades, '
            + 'onboarding_step_data, onboarding_completed_at')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw new Error(error.message);

    return {
        manual: {
            genres: Object.keys(profile?.manual_genre_weights || {}).map(Number),
            moods: Object.keys(profile?.manual_mood_preferences || {}),
            languages: profile?.manual_languages || [],
            eras: profile?.manual_preferred_eras || [],
            actors: profile?.favorite_actors || [],
            directors: profile?.favorite_directors || [],
        },
        // Behavioural signal shown read-only so users see what was auto-learned.
        learned: {
            genres: profile?.genre_weights || {},
            moods: profile?.mood_preferences || {},
            languages: profile?.preferred_languages || [],
            decades: profile?.preferred_decades || [],
        },
        questionnaire: questionnaireFromStep(profile?.onboarding_step_data),
        onboardingCompletedAt: profile?.onboarding_completed_at || null,
        options: {
            genres: TASTE_GENRES,
            moods: TASTE_MOODS,
            languages: TASTE_LANGUAGES,
            eras: TASTE_ERAS,
        },
    };
}

const VALID_WATCH_STYLES = new Set(['theater', 'stream', 'both']);
const VALID_COMPANY = new Set(['solo', 'partner', 'friends', 'family']);

function sanitizeWatchStyle(value) {
    return VALID_WATCH_STYLES.has(value) ? value : null;
}

function sanitizeCompany(ids) {
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.filter((id) => VALID_COMPANY.has(id)))];
}

function questionnaireFromStep(step = {}) {
    return {
        status: step.taste_questionnaire === 'completed' || step.taste_questionnaire === 'skipped'
            ? step.taste_questionnaire
            : null,
        watchStyle: sanitizeWatchStyle(step.watch_style),
        company: sanitizeCompany(step.questionnaire_company),
    };
}

function isEmptyWeights(obj) {
    return !obj || typeof obj !== 'object' || Object.keys(obj).length === 0;
}

/** Persist manual prefs and invalidate the recommendation cache. */
export async function updateTastePreferences(userId, input) {
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
        .from('user_taste_profiles')
        .select('onboarding_step_data, onboarding_completed_at, genre_weights, mood_preferences, preferred_languages, preferred_decades')
        .eq('user_id', userId)
        .maybeSingle();

    const status = input?.questionnaireStatus === 'skipped' || input?.questionnaireStatus === 'completed'
        ? input.questionnaireStatus
        : null;
    const skipOnly = status === 'skipped'
        && input?.genres == null
        && input?.moods == null
        && input?.languages == null
        && input?.eras == null;

    const now = new Date().toISOString();
    const step = { ...(existing?.onboarding_step_data || {}) };
    if (status) step.taste_questionnaire = status;
    if (input?.watchStyle !== undefined) {
        const style = sanitizeWatchStyle(input.watchStyle);
        if (style) step.watch_style = style;
        else delete step.watch_style;
    }
    if (input?.company !== undefined) {
        step.questionnaire_company = sanitizeCompany(input.company);
    }

    if (skipOnly) {
        const { error } = await supabase
            .from('user_taste_profiles')
            .upsert({
                user_id: userId,
                onboarding_step_data: step,
                onboarding_completed_at: existing?.onboarding_completed_at || now,
                updated_at: now,
            }, { onConflict: 'user_id' });
        if (error) throw new Error(error.message);
        return { ok: true };
    }

    const actors = sanitizePeople(input?.actors);
    const directors = sanitizePeople(input?.directors);
    const genreWeights = sanitizeGenreWeights(input?.genres);
    const moodPrefs = sanitizeMoodPrefs(input?.moods);
    const languages = sanitizeLanguages(input?.languages);
    const eras = sanitizeEras(input?.eras);

    if (!status && (Object.keys(genreWeights).length || Object.keys(moodPrefs).length)) {
        step.taste_questionnaire = 'completed';
    }

    const payload = {
        user_id: userId,
        manual_genre_weights: genreWeights,
        manual_mood_preferences: moodPrefs,
        manual_languages: languages,
        manual_preferred_eras: eras,
        favorite_actor_ids: actors.ids,
        favorite_director_ids: directors.ids,
        favorite_actors: actors.list,
        favorite_directors: directors.list,
        onboarding_step_data: step,
        onboarding_completed_at: existing?.onboarding_completed_at || now,
        manual_updated_at: now,
        updated_at: now,
    };

    // Cold start: seed computed columns so For You has signal before any logs.
    if (isEmptyWeights(existing?.genre_weights) && Object.keys(genreWeights).length) {
        payload.genre_weights = genreWeights;
    }
    if (isEmptyWeights(existing?.mood_preferences) && Object.keys(moodPrefs).length) {
        payload.mood_preferences = moodPrefs;
    }
    if (!(existing?.preferred_languages || []).length && languages.length) {
        payload.preferred_languages = languages.filter((l) => l !== 'other');
    }
    if (!(existing?.preferred_decades || []).length && eras.length) {
        payload.preferred_decades = eras;
    }

    const { error } = await supabase
        .from('user_taste_profiles')
        .upsert(payload, { onConflict: 'user_id' });

    if (error) throw new Error(error.message);

    await supabase.from('recommendation_cache').delete().eq('user_id', userId);

    return { ok: true };
}
