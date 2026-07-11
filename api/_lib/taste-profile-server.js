import { getSupabaseAdmin } from './supabase-admin.js';
import { embedTextWithProvider, buildUserTasteDocument, buildMovieDocument } from './embedding-server.js';
import { getBehavioralSignals, genreSignalToWeights } from './events-server.js';
import { isLlmEnabled, summarizeTaste } from './llm-server.js';
import { computeUserDnaPreferences } from './movie-dna-server.js';

const AXIS_KEYS = [
    'acting', 'screenplay', 'sound', 'direction',
    'entertainment', 'pacing', 'cinematography',
];

const HIGH_RATING = 7;
const LOW_RATING = 4;
const LOOKBACK_DAYS_DEFAULT = 90;

const GENRE_NAMES = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

function generateTasteSummaryText(profile) {
    const topGenres = Object.entries(profile?.genre_weights || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => GENRE_NAMES[id] || `Genre ${id}`);

    const moods = Object.keys(profile?.mood_preferences || {}).slice(0, 2);
    const decades = (profile?.preferred_decades || []).slice(0, 2);
    const parts = [];
    if (topGenres.length) parts.push(`Loves ${topGenres.join(', ')}`);
    if (moods.length) parts.push(`with ${moods.join(' & ')} vibes`);
    if (decades.length) parts.push(`from the ${decades.join(' & ')}s`);
    return parts.length ? `${parts.join('. ')}.` : null;
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

function normalizeWeights(scores) {
    const entries = Object.entries(scores);
    if (!entries.length) return {};

    const max = Math.max(...entries.map(([, v]) => v), 0.001);
    const min = Math.min(...entries.map(([, v]) => v), 0);
    const span = max - min || 1;

    return Object.fromEntries(
        entries.map(([id, value]) => [id, Math.round(((value - min) / span) * 100) / 100]),
    );
}

function mergeGenreWeights(declared = {}, computed = {}, hasRatings) {
    const ids = new Set([...Object.keys(declared), ...Object.keys(computed)]);
    const merged = {};

    ids.forEach((id) => {
        const d = Number(declared[id]) || 0;
        const c = Number(computed[id]) || 0;
        merged[id] = hasRatings ? Math.round((0.3 * d + 0.7 * c) * 100) / 100 : d || c;
    });

    return merged;
}

/**
 * Blend rating-derived and behaviour-derived genre weights (both 0..1).
 * Behaviour leads slightly because it captures intent ratings can't (e.g. the
 * trailers a user replays but never logs).
 */
function blendGenreSources(ratingGenres, behavioralGenres) {
    const ids = new Set([...Object.keys(ratingGenres), ...Object.keys(behavioralGenres)]);
    if (!ids.size) return {};
    const blended = {};
    ids.forEach((id) => {
        const r = Number(ratingGenres[id]) || 0;
        const b = Number(behavioralGenres[id]) || 0;
        blended[id] = Math.round((0.45 * r + 0.55 * b) * 100) / 100;
    });
    return blended;
}

function computeGenreWeightsFromRatings(ratings, movieByTmdbId) {
    const raw = {};

    ratings.forEach((rating) => {
        const overall = computeOverallFromRatingRow(rating);
        if (overall == null) return;

        const movie = movieByTmdbId.get(String(rating.movie_id));
        const genreIds = extractGenreIds(movie);
        if (!genreIds.length) return;

        let signal;
        if (overall >= HIGH_RATING) signal = overall / 10;
        else if (overall <= LOW_RATING) signal = -0.35;
        else signal = 0.15;

        genreIds.forEach((genreId) => {
            raw[genreId] = (raw[genreId] || 0) + signal;
        });
    });

    return normalizeWeights(
        Object.fromEntries(Object.entries(raw).filter(([, v]) => v > 0)),
    );
}

function computeAxisPreferences(ratings) {
    const sums = {};
    const weights = {};

    ratings.forEach((rating) => {
        const overall = computeOverallFromRatingRow(rating);
        if (overall == null || overall < 5) return;

        const weight = overall - 4;
        AXIS_KEYS.forEach((key) => {
            const value = rating[key];
            if (value == null || Number.isNaN(Number(value))) return;
            sums[key] = (sums[key] || 0) + Number(value) * weight;
            weights[key] = (weights[key] || 0) + weight;
        });
    });

    const prefs = {};
    AXIS_KEYS.forEach((key) => {
        if (weights[key]) {
            prefs[key] = Math.round((sums[key] / weights[key]) * 100) / 100;
        }
    });

    return prefs;
}

function percentile(sorted, p) {
    if (!sorted.length) return null;
    const idx = Math.floor((sorted.length - 1) * p);
    return sorted[idx];
}

function computeRuntimeRange(ratings, movieByTmdbId) {
    const runtimes = ratings
        .map((r) => {
            const overall = computeOverallFromRatingRow(r);
            if (overall == null || overall < HIGH_RATING) return null;
            const runtime = movieByTmdbId.get(String(r.movie_id))?.runtime;
            return runtime > 0 ? runtime : null;
        })
        .filter((v) => v != null)
        .sort((a, b) => a - b);

    if (runtimes.length < 2) return null;

    const low = percentile(runtimes, 0.25);
    const high = percentile(runtimes, 0.75);
    if (low == null || high == null || low >= high) return null;

    return `[${Math.floor(low)},${Math.ceil(high)})`;
}

function computePreferredDecades(ratings, movieByTmdbId) {
    const decades = new Set();

    ratings.forEach((rating) => {
        const overall = computeOverallFromRatingRow(rating);
        if (overall == null || overall < HIGH_RATING) return;

        const movie = movieByTmdbId.get(String(rating.movie_id));
        const date = movie?.release_date || movie?.first_air_date;
        if (!date) return;

        const year = parseInt(String(date).slice(0, 4), 10);
        if (!Number.isNaN(year) && year >= 1900) {
            decades.add(Math.floor(year / 10) * 10);
        }
    });

    return [...decades].sort((a, b) => a - b);
}

function computePreferredLanguages(ratings, movieByTmdbId) {
    const counts = {};

    ratings.forEach((rating) => {
        const lang = movieByTmdbId.get(String(rating.movie_id))?.original_language;
        if (!lang) return;
        counts[lang] = (counts[lang] || 0) + 1;
    });

    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([lang]) => lang);
}

function vectorToPgLiteral(vector) {
    if (!vector?.length) return null;
    return `[${vector.join(',')}]`;
}

async function invalidateRecommendationCache(supabase, userId) {
    const { error } = await supabase
        .from('recommendation_cache')
        .delete()
        .eq('user_id', userId);

    if (error) {
        console.warn('recommendation_cache invalidate failed:', error.message);
    }
}

/**
 * Rebuild user_taste_profiles from ratings, logs, and library metadata.
 * @param {string} userId
 * @param {{ includeEmbedding?: boolean, lookbackDays?: number }} options
 */
export async function rebuildUserTasteProfile(userId, options = {}) {
    const {
        includeEmbedding = false,
        lookbackDays = LOOKBACK_DAYS_DEFAULT,
    } = options;

    const supabase = getSupabaseAdmin();
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);
    const sinceIso = since.toISOString();

    const { data: existing, error: profileError } = await supabase
        .from('user_taste_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (profileError) {
        throw new Error(profileError.message);
    }

    const { data: ratings, error: ratingsError } = await supabase
        .from('ratings')
        .select('*')
        .eq('user_id', userId)
        .gte('updated_at', sinceIso)
        .order('updated_at', { ascending: false });

    if (ratingsError) {
        throw new Error(ratingsError.message);
    }

    const ratingRows = ratings || [];
    const tmdbIds = [...new Set(ratingRows.map((r) => String(r.movie_id)))];

    let movieByTmdbId = new Map();
    if (tmdbIds.length) {
        const { data: movies, error: moviesError } = await supabase
            .from('movies_library')
            .select('tmdb_id, genres, genre_ids, runtime, release_date, first_air_date, original_language, title, overview, mood_tags')
            .in('tmdb_id', tmdbIds);

        if (moviesError) {
            throw new Error(moviesError.message);
        }

        movieByTmdbId = new Map((movies || []).map((m) => [String(m.tmdb_id), m]));
    }

    const [
        { count: logCount, error: logError },
        { count: totalRatingCount, error: totalRatingsError },
    ] = await Promise.all([
        supabase
            .from('movie_logs')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId),
        supabase
            .from('ratings')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId),
    ]);

    if (logError) throw new Error(logError.message);
    if (totalRatingsError) throw new Error(totalRatingsError.message);

    const ratingGenres = computeGenreWeightsFromRatings(ratingRows, movieByTmdbId);

    // Fold in recency-decayed behavioural signal (views, trailers, watchlists,
    // shares, reco clicks). Best-effort: never block a rebuild on it.
    let behavioralGenres = {};
    try {
        const signals = await getBehavioralSignals(userId);
        behavioralGenres = genreSignalToWeights(signals.genreSignal || {});
    } catch (err) {
        console.warn('behavioral signals unavailable during rebuild:', err.message);
    }

    const computedGenres = blendGenreSources(ratingGenres, behavioralGenres);
    const declaredGenres = existing?.genre_weights || {};
    const hasSignal = ratingRows.length > 0 || Object.keys(behavioralGenres).length > 0;
    const genreWeights = mergeGenreWeights(declaredGenres, computedGenres, hasSignal);

    const axisFromRatings = computeAxisPreferences(ratingRows);
    const axisPreferences = {
        ...(existing?.axis_preferences || {}),
        ...axisFromRatings,
    };

    const overalls = ratingRows
        .map(computeOverallFromRatingRow)
        .filter((v) => v != null);

    const avgRatingGiven = overalls.length
        ? Math.round((overalls.reduce((a, b) => a + b, 0) / overalls.length) * 100) / 100
        : existing?.avg_rating_given ?? null;

    const runtimeRange = computeRuntimeRange(ratingRows, movieByTmdbId)
        ?? existing?.preferred_runtime_range
        ?? null;

    const preferredDecades = computePreferredDecades(ratingRows, movieByTmdbId);
    const preferredLanguages = computePreferredLanguages(ratingRows, movieByTmdbId);

    // Aggregate Taste DNA from the movie_dna of loved titles (best-effort).
    let dnaPreferences = existing?.dna_preferences || {};
    try {
        const dna = await computeUserDnaPreferences(userId, { ratings: ratingRows });
        if (Object.keys(dna).length) dnaPreferences = dna;
    } catch (err) {
        console.warn('dna preferences compute failed:', err.message);
    }

    const now = new Date().toISOString();
    const updatePayload = {
        user_id: userId,
        genre_weights: genreWeights,
        dna_preferences: dnaPreferences,
        axis_preferences: axisPreferences,
        avg_rating_given: avgRatingGiven,
        rating_count: totalRatingCount ?? ratingRows.length,
        log_count: logCount || 0,
        preferred_runtime_range: runtimeRange,
        preferred_decades: preferredDecades.length
            ? preferredDecades
            : (existing?.preferred_decades || []),
        preferred_languages: preferredLanguages.length
            ? preferredLanguages
            : (existing?.preferred_languages || []),
        profile_version: (existing?.profile_version || 0) + 1,
        last_computed_at: now,
        updated_at: now,
    };

    // Taste summary: prefer an LLM-written sentence, fall back to the template,
    // then to whatever we had before. Runs in the weekly cron (cheap, 1×/user).
    const templatedSummary = generateTasteSummaryText({ ...existing, ...updatePayload });
    let tasteSummary = templatedSummary || existing?.taste_summary || null;

    if (isLlmEnabled()) {
        const topGenreNames = Object.entries(genreWeights)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([id]) => GENRE_NAMES[id])
            .filter(Boolean);

        const lovedTitles = ratingRows
            .filter((r) => {
                const o = computeOverallFromRatingRow(r);
                return o != null && o >= HIGH_RATING;
            })
            .map((r) => movieByTmdbId.get(String(r.movie_id))?.title)
            .filter(Boolean);

        const llmSummary = await summarizeTaste({
            genres: topGenreNames,
            moods: Object.keys(existing?.mood_preferences || {}),
            decades: preferredDecades,
            lovedTitles,
        });
        if (llmSummary) tasteSummary = llmSummary;
    }

    updatePayload.taste_summary = tasteSummary;

    if (includeEmbedding) {
        const profileForEmbed = { ...existing, ...updatePayload };
        const doc = buildUserTasteDocument(profileForEmbed, ratingRows, movieByTmdbId);
        const { vector, provider } = await embedTextWithProvider(doc, 'query');
        const literal = vectorToPgLiteral(vector);
        if (literal) {
            updatePayload.embedding = literal;
            updatePayload.embedding_provider = provider;
        }
    }

    const { data: updated, error: updateError } = await supabase
        .from('user_taste_profiles')
        .upsert(updatePayload, { onConflict: 'user_id' })
        .select('user_id, profile_version, last_computed_at, rating_count, log_count')
        .single();

    if (updateError) {
        throw new Error(updateError.message);
    }

    await invalidateRecommendationCache(supabase, userId);

    return {
        userId,
        profile: updated,
        ratingsProcessed: ratingRows.length,
        embeddingUpdated: !!updatePayload.embedding,
    };
}

/** Rebuild profiles that are stale or never computed. */
export async function rebuildStaleTasteProfiles({ limit = 25, includeEmbedding = false } = {}) {
    const supabase = getSupabaseAdmin();
    const staleBefore = new Date();
    staleBefore.setDate(staleBefore.getDate() - 7);

    const { data: profiles, error } = await supabase
        .from('user_taste_profiles')
        .select('user_id, last_computed_at, onboarding_completed_at')
        .not('onboarding_completed_at', 'is', null)
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
        .select('tmdb_id, title, overview, genres, genre_ids, mood_tags, original_language')
        .eq('is_active', true)
        .is('embedding', null)
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
                .eq('tmdb_id', movie.tmdb_id);

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
