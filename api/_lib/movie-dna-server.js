import { getSupabaseAdmin } from './supabase-admin.js';
import { isLlmEnabled, generateJson } from './llm-server.js';
import { computeOverallFromRatingRow } from './taste-profile-server.js';

/**
 * Movie DNA — rich weighted traits per movie, and the user's aggregated Taste
 * DNA. DNA is LLM-tagged once per movie (cheap, cached forever) and used both
 * for sharper matching and for trait-based discovery sections.
 */

// Canonical DNA traits. Keep this list stable — it's the vocabulary the LLM
// must use and the keys stored in movie_dna / dna_preferences.
export const DNA_TRAITS = [
    'mind_bending', 'plot_twist', 'psychological', 'emotional', 'feel_good',
    'dark', 'suspenseful', 'thought_provoking', 'slow_burn', 'fast_paced',
    'family_friendly', 'inspirational', 'action_heavy', 'mystery_driven',
    'crime_focused', 'character_driven', 'dialogue_heavy', 'atmospheric',
    'intense', 'philosophical', 'epic', 'romantic', 'funny', 'tearjerker',
];

const DNA_TRAIT_SET = new Set(DNA_TRAITS);

export const DNA_TRAIT_LABELS = {
    mind_bending: 'Mind-Bending', plot_twist: 'Plot Twist', psychological: 'Psychological',
    emotional: 'Emotional', feel_good: 'Feel-Good', dark: 'Dark', suspenseful: 'Suspenseful',
    thought_provoking: 'Thought-Provoking', slow_burn: 'Slow Burn', fast_paced: 'Fast-Paced',
    family_friendly: 'Family-Friendly', inspirational: 'Inspirational', action_heavy: 'Action-Heavy',
    mystery_driven: 'Mystery-Driven', crime_focused: 'Crime', character_driven: 'Character-Driven',
    dialogue_heavy: 'Dialogue-Heavy', atmospheric: 'Atmospheric', intense: 'Intense',
    philosophical: 'Philosophical', epic: 'Epic', romantic: 'Romantic', funny: 'Funny',
    tearjerker: 'Tearjerker',
};

function sanitizeDna(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const dna = {};
    for (const [k, v] of Object.entries(raw)) {
        const key = String(k).toLowerCase().replace(/[\s-]+/g, '_');
        if (!DNA_TRAIT_SET.has(key)) continue;
        const score = Math.round(Number(v));
        if (Number.isFinite(score) && score > 0) dna[key] = Math.max(0, Math.min(100, score));
    }
    return dna;
}

/**
 * Tag a single movie's DNA via the LLM. Returns {trait: 0-100} or null.
 * Only the dominant traits should score high; absent traits are omitted.
 */
export async function computeMovieDna(movie) {
    if (!isLlmEnabled()) return null;

    const genres = Array.isArray(movie.genres)
        ? movie.genres.map((g) => g?.name || g).filter(Boolean).join(', ')
        : '';

    const prompt = [
        'You are a film analyst. Score this movie on its DNA traits from 0-100,',
        'where 100 means the trait is a defining quality and 0 means absent.',
        'ONLY include traits that genuinely apply (score >= 40); omit the rest.',
        '',
        `Title: ${movie.title || movie.name || ''}`,
        genres ? `Genres: ${genres}` : '',
        movie.overview ? `Overview: ${String(movie.overview).slice(0, 600)}` : '',
        '',
        `Allowed traits (use these exact keys): ${DNA_TRAITS.join(', ')}`,
        '',
        'Return ONLY a JSON object mapping trait -> score, e.g.',
        '{"mind_bending":95,"emotional":90,"philosophical":85,"slow_burn":70,"epic":95}',
    ].filter(Boolean).join('\n');

    const parsed = await generateJson(prompt, { temperature: 0.2, maxOutputTokens: 400 });
    const dna = sanitizeDna(parsed);
    return Object.keys(dna).length ? dna : null;
}

/** Backfill DNA for active movies that don't have it yet (popular first). */
export async function backfillMovieDna({ limit = 20 } = {}) {
    const supabase = getSupabaseAdmin();

    const { data: movies, error } = await supabase
        .from('movies_library')
        .select('tmdb_id, title, overview, genres')
        .eq('is_active', true)
        .is('dna_computed_at', null)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (error) throw new Error(error.message);

    const results = [];
    for (const movie of movies || []) {
        try {
            const dna = await computeMovieDna(movie);
            const { error: upErr } = await supabase
                .from('movies_library')
                .update({ movie_dna: dna || {}, dna_computed_at: new Date().toISOString() })
                .eq('tmdb_id', movie.tmdb_id);
            results.push({ tmdbId: movie.tmdb_id, ok: !upErr, traits: dna ? Object.keys(dna).length : 0 });
        } catch (err) {
            results.push({ tmdbId: movie.tmdb_id, ok: false, error: err.message });
        }
    }

    return { processed: results.length, results };
}

/**
 * Aggregate a user's Taste DNA from the movie_dna of titles they engaged with
 * positively (rated >= 7 or strong events), weighted by how much they loved it.
 * Returns {trait: 0-100}.
 */
export async function computeUserDnaPreferences(userId, { ratings = null } = {}) {
    const supabase = getSupabaseAdmin();

    let ratingRows = ratings;
    if (!ratingRows) {
        const { data } = await supabase.from('ratings').select('*').eq('user_id', userId).limit(300);
        ratingRows = data || [];
    }

    const loved = [];
    ratingRows.forEach((r) => {
        const overall = computeOverallFromRatingRow(r);
        if (overall != null && overall >= 6.5) loved.push({ tmdbId: String(r.movie_id), weight: overall / 10 });
    });

    if (!loved.length) return {};

    const { data: movies } = await supabase
        .from('movies_library')
        .select('tmdb_id, movie_dna')
        .in('tmdb_id', loved.map((l) => l.tmdbId).slice(0, 100));

    const dnaById = new Map((movies || []).map((m) => [String(m.tmdb_id), m.movie_dna || {}]));

    const sums = {};
    let totalWeight = 0;
    loved.forEach(({ tmdbId, weight }) => {
        const dna = dnaById.get(tmdbId);
        if (!dna || !Object.keys(dna).length) return;
        totalWeight += weight;
        for (const [trait, score] of Object.entries(dna)) {
            sums[trait] = (sums[trait] || 0) + Number(score) * weight;
        }
    });

    if (!totalWeight) return {};

    const prefs = {};
    for (const [trait, sum] of Object.entries(sums)) {
        prefs[trait] = Math.round(sum / totalWeight);
    }
    return prefs;
}

/** Cosine-like similarity between a user's Taste DNA and a movie's DNA, 0-1. */
export function dnaMatchScore(userDna, movieDna) {
    if (!userDna || !movieDna) return null;
    const uKeys = Object.keys(userDna);
    const mKeys = Object.keys(movieDna);
    if (!uKeys.length || !mKeys.length) return null;

    let dot = 0;
    let uMag = 0;
    let mMag = 0;
    const all = new Set([...uKeys, ...mKeys]);
    all.forEach((trait) => {
        const u = Number(userDna[trait]) || 0;
        const m = Number(movieDna[trait]) || 0;
        dot += u * m;
        uMag += u * u;
        mMag += m * m;
    });
    if (!uMag || !mMag) return null;
    return dot / (Math.sqrt(uMag) * Math.sqrt(mMag));
}
