import { getSupabaseAdmin } from './supabase-admin.js';
import { embedTextWithProvider, buildUserTasteDocument, buildMovieDocument } from './embedding-server.js';
import { isLlmEnabled, summarizeTaste } from './llm-server.js';
import { computeUserDnaPreferences } from './movie-dna-server.js';
import { ensureLibraryCardsForCandidates } from './content-server.js';
import {
    buildFilmSignals,
    computeGenreWeights,
    computeMoodPreferences,
    computeAxisPreferences,
    computePreferredDecades,
    computePreferredLanguages,
    computeRuntimeRange,
    computeLearnedPeople,
    topLovedTitles,
} from './taste-compute.js';

const AXIS_KEYS = [
    'acting', 'screenplay', 'sound', 'direction',
    'entertainment', 'pacing', 'cinematography',
];


const GENRE_NAMES = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

function generateTasteSummaryText(profile) {
    const join = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} & ${xs[xs.length - 1]}`);
    const topGenres = Object.entries(profile?.genre_weights || {})
        .filter(([, w]) => Number(w) > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => GENRE_NAMES[id])
        .filter(Boolean);
    if (!topGenres.length) return null;
    const moods = Object.entries(profile?.mood_preferences || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([m]) => m.replace(/_/g, '-'));
    const decades = (profile?.preferred_decades || []).slice(0, 2).map((d) => `${d}s`);
    let text = `Loves ${join(topGenres)}`;
    if (moods.length) text += ` with ${join(moods)} vibes`;
    if (decades.length) text += `, mostly from the ${join(decades)}`;
    return `${text}.`;
}

export function computeOverallFromRatingRow(row) {
    const values = AXIS_KEYS
        .map((key) => row[key])
        .filter((value) => value != null && !Number.isNaN(Number(value)));

    if (!values.length) return null;
    return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
}

export function extractGenreIds(movie) {
    if (!movie) return [];
    if (Array.isArray(movie.genre_ids) && movie.genre_ids.length) {
        return movie.genre_ids.map((id) => String(id));
    }
    if (Array.isArray(movie.genres)) {
        return movie.genres
            .map((g) => String(g?.id ?? g))
            .filter((id) => id && id !== 'undefined');
    }
    return [];
}

function vectorToPgLiteral(vector) {
    if (!vector?.length) return null;
    return `[${vector.join(',')}]`;
}

/**
 * Rebuild user_taste_profiles from the user's FULL history: every rating,
 * diary-log rating, like and dislike (recency-weighted), judged against the
 * user's own rating scale. See taste-compute.js for the math.
 * @param {string} userId
 * @param {{ includeEmbedding?: boolean }} options
 */
export async function rebuildUserTasteProfile(userId, options = {}) {
    const { includeEmbedding = false } = options;
    const supabase = getSupabaseAdmin();

    const [
        { data: existing, error: profileError },
        { data: ratings, error: ratingsError },
        { data: logs },
        { data: likedRows },
        { data: dislikeRows },
    ] = await Promise.all([
        supabase.from('user_taste_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('ratings').select('*').eq('user_id', userId)
            .order('updated_at', { ascending: false }).limit(2000),
        supabase.from('movie_logs').select('tmdb_id, rating, created_at, watched_on')
            .eq('user_id', userId).limit(3000),
        supabase.from('user_liked_movies').select('movie_id, liked_at')
            .eq('user_id', userId).limit(2000),
        supabase.from('user_events').select('tmdb_id, created_at')
            .eq('user_id', userId).eq('event_type', 'movie_disliked').limit(500),
    ]);

    if (profileError) throw new Error(profileError.message);
    if (ratingsError) throw new Error(ratingsError.message);

    const ratingRows = ratings || [];

    // Quiz answers: loved films act as likes, disliked films as dislikes.
    const quiz = existing?.onboarding_step_data?.quiz || null;
    const quizAt = quiz?.savedAt || existing?.updated_at || null;
    const allLikes = [...(likedRows || [])];
    const likedSeen = new Set(allLikes.map((r) => String(r.movie_id)));
    (quiz?.lovedIds || []).forEach((id) => {
        if (!likedSeen.has(String(id))) allLikes.push({ movie_id: String(id), liked_at: quizAt });
    });
    const allDislikes = [
        ...(dislikeRows || []),
        ...(quiz?.dislikedIds || []).map((id) => ({ tmdb_id: String(id), created_at: quizAt })),
    ];
    const likedTmdbIds = allLikes.map((r) => String(r.movie_id));

    const tmdbIds = [...new Set([
        ...ratingRows.map((r) => String(r.movie_id)),
        ...(logs || []).filter((l) => l.rating != null).map((l) => String(l.tmdb_id)),
        ...likedTmdbIds,
        ...allDislikes.map((d) => String(d.tmdb_id)).filter(Boolean),
    ])];

    // Quiz picks may not be in the library yet — import them so genres/keywords are known.
    if (quiz) {
        try {
            const quizIds = [...(quiz.lovedIds || []), ...(quiz.dislikedIds || [])];
            await ensureLibraryCardsForCandidates(
                quizIds.map((id) => ({ id: String(id), media_type: 'movie' })),
                { maxImport: 25 },
            );
        } catch (err) {
            console.warn('[rebuild] quiz title import failed:', err.message);
        }
    }

    const movieById = new Map();
    for (let i = 0; i < tmdbIds.length; i += 300) {
        // eslint-disable-next-line no-await-in-loop
        const { data: movies, error: moviesError } = await supabase
            .from('movies_library')
            .select('tmdb_id, title, overview, genres, genre_ids, runtime, release_date, first_air_date, original_language, mood_tags, keywords, credits')
            .in('tmdb_id', tmdbIds.slice(i, i + 300));
        if (moviesError) throw new Error(moviesError.message);
        (movies || []).forEach((m) => movieById.set(String(m.tmdb_id), m));
    }

    const { films, stats } = buildFilmSignals({
        ratings: ratingRows,
        logs: logs || [],
        likes: allLikes,
        dislikes: allDislikes,
        movieById,
    });

    const { count: logCount } = await supabase
        .from('movie_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

    // Learned weights from behaviour. Manual Settings prefs live separately in
    // manual_genre_weights and are applied as a floor at scoring time — never
    // blended in here (the old 30% blend with the previous result compounded
    // stale taste forever).
    const learnedGenres = computeGenreWeights(films);
    const enoughSignal = stats.filmCount >= 5;
    const manualGenres = existing?.manual_genre_weights || {};
    const genreWeights = enoughSignal || !Object.keys(manualGenres).length
        ? learnedGenres
        : (() => {
            // Cold start: lean on the user's declared genres until they rate more.
            const merged = { ...learnedGenres };
            Object.keys(manualGenres).forEach((id) => {
                merged[id] = Math.max(Number(merged[id]) || 0, 0.6);
            });
            return merged;
        })();

    const learnedMoods = computeMoodPreferences(films);
    const moodPreferences = Object.keys(learnedMoods).length >= 2
        ? learnedMoods
        : (existing?.mood_preferences || {});

    const axisPreferences = {
        ...(existing?.axis_preferences || {}),
        ...computeAxisPreferences(ratingRows, stats.mean),
    };
    const preferredDecades = computePreferredDecades(films);
    const preferredLanguages = computePreferredLanguages(films);
    const runtimeRange = computeRuntimeRange(films) ?? existing?.preferred_runtime_range ?? null;
    const learnedPeople = computeLearnedPeople(films);

    // Aggregate Taste DNA from loved ratings + likes (not mere watches).
    let dnaPreferences = existing?.dna_preferences || {};
    try {
        const dna = await computeUserDnaPreferences(userId, { ratings: ratingRows, likedTmdbIds });
        if (Object.keys(dna).length) dnaPreferences = dna;
    } catch (err) {
        console.warn('dna preferences compute failed:', err.message);
    }

    const now = new Date().toISOString();
    const updatePayload = {
        user_id: userId,
        genre_weights: genreWeights,
        mood_preferences: moodPreferences,
        dna_preferences: dnaPreferences,
        axis_preferences: axisPreferences,
        avg_rating_given: stats.ratedCount ? stats.mean : (existing?.avg_rating_given ?? null),
        rating_count: stats.ratedCount,
        log_count: logCount || 0,
        preferred_runtime_range: runtimeRange,
        preferred_decades: preferredDecades.length ? preferredDecades : (existing?.preferred_decades || []),
        preferred_languages: preferredLanguages.length ? preferredLanguages : (existing?.preferred_languages || []),
        learned_people: learnedPeople,
        taste_stats: { ...stats, computedAt: now },
        profile_version: (existing?.profile_version || 0) + 1,
        last_computed_at: now,
        updated_at: now,
    };

    const topGenreNames = Object.entries(genreWeights)
        .filter(([, w]) => w > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([id]) => GENRE_NAMES[id])
        .filter(Boolean);

    // Taste summary: LLM sentence grounded in the real top genres, moods,
    // directors and best-loved titles; template fallback.
    let tasteSummary = generateTasteSummaryText({ ...existing, ...updatePayload }) || existing?.taste_summary || null;
    if (isLlmEnabled() && enoughSignal) {
        const llmSummary = await summarizeTaste({
            genres: topGenreNames,
            moods: Object.keys(moodPreferences).slice(0, 3),
            decades: preferredDecades,
            lovedTitles: [
                ...topLovedTitles(films, 8),
                ...learnedPeople.directors.slice(0, 2).map((d) => `films by ${d.name}`),
            ],
        });
        if (llmSummary) tasteSummary = llmSummary;
    }
    updatePayload.taste_summary = tasteSummary;

    if (includeEmbedding) {
        const profileForEmbed = { ...existing, ...updatePayload };
        const doc = buildUserTasteDocument(profileForEmbed, ratingRows, movieById);
        const { vector, provider } = await embedTextWithProvider(doc, 'query');
        const literal = vectorToPgLiteral(vector);
        if (literal) {
            updatePayload.embedding = literal;
            updatePayload.embedding_provider = provider;
        }
    }

    const save = (payload) => supabase
        .from('user_taste_profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select('user_id, profile_version, last_computed_at, rating_count, log_count')
        .single();

    let { data: updated, error: updateError } = await save(updatePayload);
    if (updateError && /learned_people|taste_stats/.test(updateError.message || '')) {
        // Migration 20261107000000 not applied yet — save everything else.
        const { learned_people: _p, taste_stats: _s, ...rest } = updatePayload;
        ({ data: updated, error: updateError } = await save(rest));
    }
    if (updateError) throw new Error(updateError.message);

    // Saved Watch rows are kept until their 7 days are up; the new taste
    // profile shapes the next weekly refresh.

    return {
        userId,
        profile: updated,
        ratingsProcessed: ratingRows.length,
        filmsUsed: stats.filmCount,
        embeddingUpdated: !!updatePayload.embedding,
    };
}

/**
 * True when the user has rated / liked / logged / disliked anything since the
 * profile was last computed (so the Taste Map would show stale data).
 */
export async function isTasteProfileStale(userId) {
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
        .from('user_taste_profiles')
        .select('last_computed_at')
        .eq('user_id', userId)
        .maybeSingle();
    if (!profile?.last_computed_at) return true;
    const since = profile.last_computed_at;
    const newer = async (query) => {
        const { count } = await query;
        return (count || 0) > 0;
    };
    const head = { count: 'exact', head: true };
    const checks = await Promise.all([
        newer(supabase.from('ratings').select('id', head).eq('user_id', userId).gt('updated_at', since)),
        newer(supabase.from('user_liked_movies').select('id', head).eq('user_id', userId).gt('liked_at', since)),
        newer(supabase.from('movie_logs').select('id', head).eq('user_id', userId).gt('created_at', since)),
        newer(supabase.from('user_events').select('id', head).eq('user_id', userId)
            .eq('event_type', 'movie_disliked').gt('created_at', since)),
    ]);
    return checks.some(Boolean);
}

export async function rebuildStaleTasteProfiles({ limit = 25, includeEmbedding = false } = {}) {
    const supabase = getSupabaseAdmin();
    const staleBefore = new Date();
    staleBefore.setDate(staleBefore.getDate() - 7);

    const { data: profiles, error } = await supabase
        .from('user_taste_profiles')
        // Everyone with a profile — users who skipped onboarding need fresh taste too.
        .select('user_id, last_computed_at')
        .or(`last_computed_at.is.null,last_computed_at.lt.${staleBefore.toISOString()}`)
        .order('last_computed_at', { ascending: true, nullsFirst: true })
        .limit(limit);

    if (error) {
        throw new Error(error.message);
    }

    const results = [];
    for (const row of profiles || []) {
        try {
            const result = await rebuildUserTasteProfile(row.user_id, { includeEmbedding });
            results.push({ userId: row.user_id, ok: true, ...result });
        } catch (err) {
            results.push({ userId: row.user_id, ok: false, error: err.message });
        }
    }

    return { processed: results.length, results };
}

/** Backfill movie embeddings in batches. */
export async function backfillMovieEmbeddings({ limit = 20 } = {}) {
    const supabase = getSupabaseAdmin();

    const { data: movies, error } = await supabase
        .from('movies_library')
        .select('tmdb_id, media_type, title, tagline, overview, genres, genre_ids, keywords, credits, mood_tags, original_language, release_date, first_air_date')
        .eq('is_active', true)
        // Missing, or from an older provider — everything should be in one vector space.
        .or('embedding.is.null,embedding_provider.is.null,embedding_provider.neq.openai')
        .order('synced_at', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (error) {
        throw new Error(error.message);
    }

    const results = [];

    for (const movie of movies || []) {
        try {
            const doc = buildMovieDocument(movie);
            const { vector, provider } = await embedTextWithProvider(doc, 'document');
            const literal = vectorToPgLiteral(vector);
            if (!literal) {
                results.push({ tmdbId: movie.tmdb_id, ok: false, error: 'Empty embedding' });
                continue;
            }

            const { error: updateError } = await supabase
                .from('movies_library')
                .update({ embedding: literal, embedding_provider: provider })
                .eq('tmdb_id', movie.tmdb_id)
                .eq('media_type', movie.media_type || 'movie');

            if (updateError) {
                results.push({ tmdbId: movie.tmdb_id, ok: false, error: updateError.message });
            } else {
                results.push({ tmdbId: movie.tmdb_id, ok: true });
            }
        } catch (err) {
            results.push({ tmdbId: movie.tmdb_id, ok: false, error: err.message });
        }
    }

    return { processed: results.length, results };
}
