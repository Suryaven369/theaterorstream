import { getSupabaseAdmin } from './supabase-admin.js';
import { generateJson, isLlmEnabled } from './llm-server.js';
import { fetchTmdbApi } from './tmdb-server.js';

const CATEGORY_KEYS = [
    'acting',
    'screenplay',
    'sound',
    'direction',
    'entertainment',
    'pacing',
    'cinematography',
];

const MIN_REVIEWS = 3;
const MAX_REVIEWS = 15;
const MAX_REVIEW_CHARS = 1200;
const STALE_DAYS = 7;
const DEFAULT_ANALYZE_LIMIT = 5;

function clampScore(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.round(Math.min(10, Math.max(0, n)) * 10) / 10;
}

function isStale(analyzedAt) {
    if (!analyzedAt) return true;
    const ageMs = Date.now() - new Date(analyzedAt).getTime();
    return ageMs > STALE_DAYS * 24 * 60 * 60 * 1000;
}

function extractReviewTexts(reviews) {
    if (!Array.isArray(reviews)) return [];
    return reviews
        .map((r) => (typeof r === 'string' ? r : r?.content || r?.review || ''))
        .map((text) => String(text).trim())
        .filter((text) => text.length >= 40)
        .slice(0, MAX_REVIEWS)
        .map((text) => (text.length > MAX_REVIEW_CHARS ? `${text.slice(0, MAX_REVIEW_CHARS)}…` : text));
}

async function ensureReviews(supabase, row) {
    const existing = extractReviewTexts(row.reviews);
    if (existing.length >= MIN_REVIEWS) return existing;

    try {
        const detail = await fetchTmdbApi(`/movie/${row.tmdb_id}`, {
            append_to_response: 'reviews',
        });
        const texts = extractReviewTexts(detail?.reviews?.results || []);
        if (texts.length > 0) {
            await supabase
                .from('movies_library')
                .update({ reviews: detail.reviews?.results || [] })
                .eq('tmdb_id', String(row.tmdb_id))
                .eq('media_type', 'movie');
        }
        return texts;
    } catch (err) {
        console.warn(`[web-ratings] TMDB reviews fetch failed for ${row.tmdb_id}:`, err.message);
        return existing;
    }
}

function buildPrompt(title, reviewTexts) {
    const joined = reviewTexts.map((t, i) => `[${i + 1}] ${t}`).join('\n\n');
    return [
        `You are a film critic assistant. Analyze TMDB user reviews for "${title}".`,
        'Return ONLY valid JSON with these numeric fields (0-10 scale, one decimal max):',
        'acting, screenplay, sound, direction, entertainment, pacing, cinematography.',
        'Also include verdict: a short phrase (max 40 chars) like "Worth theaters" or "Wait for stream".',
        'Base scores on consensus across the reviews, not one outlier.',
        '',
        'Reviews:',
        joined,
    ].join('\n');
}

function normalizeLlmResult(parsed, reviewCount) {
    if (!parsed || typeof parsed !== 'object') return null;

    const scores = {};
    let validCount = 0;
    for (const key of CATEGORY_KEYS) {
        const val = clampScore(parsed[key]);
        if (val == null) return null;
        scores[key] = val;
        validCount += 1;
    }
    if (validCount !== CATEGORY_KEYS.length) return null;

    const overall = Math.round(
        (CATEGORY_KEYS.reduce((sum, key) => sum + scores[key], 0) / CATEGORY_KEYS.length) * 10,
    ) / 10;

    let verdict = String(parsed.verdict || '').trim().slice(0, 60);
    if (!verdict) {
        verdict = overall >= 7 ? 'Worth theaters' : overall >= 5 ? 'Good for streaming' : 'Mixed reception';
    }

    return {
        ...scores,
        overall,
        verdict,
        review_count: reviewCount,
        analyzed_at: new Date().toISOString(),
        model: process.env.GEMINI_MODEL || process.env.MISTRAL_MODEL || 'gemini-2.0-flash',
    };
}

export async function analyzeWebRatingsForMovie(tmdbId) {
    if (!isLlmEnabled()) {
        return { tmdb_id: String(tmdbId), skipped: true, reason: 'llm_disabled' };
    }

    const supabase = getSupabaseAdmin();
    const id = String(tmdbId);

    const { data: row, error } = await supabase
        .from('movies_library')
        .select('tmdb_id, title, reviews, web_ratings, media_type')
        .eq('tmdb_id', id)
        .eq('media_type', 'movie')
        .maybeSingle();

    if (error) throw error;
    if (!row) return { tmdb_id: id, skipped: true, reason: 'not_in_library' };

    if (row.web_ratings?.analyzed_at && !isStale(row.web_ratings.analyzed_at)) {
        return { tmdb_id: id, skipped: true, reason: 'fresh', web_ratings: row.web_ratings };
    }

    const reviewTexts = await ensureReviews(supabase, row);
    if (reviewTexts.length < MIN_REVIEWS) {
        return { tmdb_id: id, skipped: true, reason: 'insufficient_reviews', count: reviewTexts.length };
    }

    const parsed = await generateJson(buildPrompt(row.title || 'this film', reviewTexts), {
        maxOutputTokens: 400,
    });
    const webRatings = normalizeLlmResult(parsed, reviewTexts.length);
    if (!webRatings) {
        return { tmdb_id: id, skipped: true, reason: 'llm_parse_failed' };
    }

    const { error: updateError } = await supabase
        .from('movies_library')
        .update({ web_ratings: webRatings })
        .eq('tmdb_id', id)
        .eq('media_type', 'movie');

    if (updateError) throw updateError;

    return { tmdb_id: id, analyzed: true, web_ratings: webRatings };
}

export async function analyzeWebRatingsForTmdbIds(tmdbIds, { limit = DEFAULT_ANALYZE_LIMIT } = {}) {
    const unique = [...new Set((tmdbIds || []).map(String))].slice(0, limit);
    const results = [];

    for (const id of unique) {
        try {
            results.push(await analyzeWebRatingsForMovie(id));
        } catch (err) {
            results.push({ tmdb_id: id, error: err.message });
        }
    }

    return {
        processed: results.length,
        analyzed: results.filter((r) => r.analyzed).length,
        skipped: results.filter((r) => r.skipped).length,
        results,
    };
}

function toCmsMovie(row, order) {
    return {
        tmdb_id: Number(row.tmdb_id) || row.tmdb_id,
        title: row.title,
        poster_path: row.poster_path || null,
        backdrop_path: row.backdrop_path || null,
        media_type: 'movie',
        release_date: row.release_date || null,
        vote_average: row.vote_average ?? null,
        overview: row.overview || null,
        order,
    };
}

function collectSectionTmdbIds(moviesByRegion) {
    const ids = [];
    const seen = new Set();
    for (const list of Object.values(moviesByRegion || {})) {
        if (!Array.isArray(list)) continue;
        for (const movie of list) {
            const id = String(movie?.tmdb_id || '');
            if (!id || seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
        }
    }
    return ids;
}

/**
 * Merge TMDB now-playing into the In Theaters CMS row without wiping
 * manually added titles. Synced titles are refreshed/ordered first;
 * existing manual titles that aren't in the sync stay at the end.
 */
export async function syncInTheatersCmsSection(region, tmdbIds) {
    const supabase = getSupabaseAdmin();
    const regionCode = region || 'IN';
    const syncedIds = [...new Set((tmdbIds || []).map(String))];

    const { data: section, error: sectionError } = await supabase
        .from('homepage_sections')
        .select('id, movies_by_region')
        .or('api_source.eq.now_playing,slug.eq.in-theaters')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

    if (sectionError) throw sectionError;
    if (!section) {
        return { updated: false, reason: 'section_not_found', tmdb_ids: [] };
    }

    const moviesByRegion = { ...(section.movies_by_region || {}) };
    const existingList = Array.isArray(moviesByRegion[regionCode])
        ? moviesByRegion[regionCode]
        : [];
    const existingById = new Map(
        existingList
            .filter((m) => m?.tmdb_id != null)
            .map((m) => [String(m.tmdb_id), m]),
    );

    const lookupIds = [...new Set([...syncedIds, ...existingById.keys()])];
    let libraryById = new Map();
    if (lookupIds.length > 0) {
        const { data: libraryRows, error: libError } = await supabase
            .from('movies_library')
            .select('tmdb_id, title, poster_path, backdrop_path, release_date, vote_average, overview')
            .eq('media_type', 'movie')
            .in('tmdb_id', lookupIds);

        if (libError) throw libError;
        libraryById = new Map((libraryRows || []).map((r) => [String(r.tmdb_id), r]));
    }

    const cmsMovies = [];
    const used = new Set();

    // 1) Synced now-playing titles first (refreshed from library when possible)
    for (const id of syncedIds) {
        if (used.has(id)) continue;
        const row = libraryById.get(id) || existingById.get(id);
        if (!row) continue;
        cmsMovies.push(toCmsMovie(row, cmsMovies.length + 1));
        used.add(id);
    }

    // 2) Keep manual / other-region titles already on this rail
    for (const [id, existing] of existingById) {
        if (used.has(id)) continue;
        const row = libraryById.get(id) || existing;
        cmsMovies.push(toCmsMovie(row, cmsMovies.length + 1));
        used.add(id);
    }

    moviesByRegion[regionCode] = cmsMovies;

    const { error: updateError } = await supabase
        .from('homepage_sections')
        .update({ movies_by_region: moviesByRegion })
        .eq('id', section.id);

    if (updateError) throw updateError;

    // Score every title currently on the In Theaters section (all regions)
    const allSectionIds = collectSectionTmdbIds(moviesByRegion);

    return {
        updated: true,
        section_id: section.id,
        region: regionCode,
        count: cmsMovies.length,
        tmdb_ids: allSectionIds,
        synced_count: syncedIds.length,
    };
}

export async function pickMoviesNeedingWebRatings(tmdbIds, { limit = DEFAULT_ANALYZE_LIMIT } = {}) {
    const supabase = getSupabaseAdmin();
    const ids = [...new Set((tmdbIds || []).map(String))];
    if (!ids.length) return [];

    const { data, error } = await supabase
        .from('movies_library')
        .select('tmdb_id, web_ratings')
        .eq('media_type', 'movie')
        .in('tmdb_id', ids);

    if (error) throw error;

    const staleOrMissing = (data || [])
        .filter((row) => !row.web_ratings?.analyzed_at || isStale(row.web_ratings.analyzed_at))
        .map((row) => String(row.tmdb_id));

    const known = new Set((data || []).map((row) => String(row.tmdb_id)));
    const missingFromLibrary = ids.filter((id) => !known.has(id));

    return [...new Set([...staleOrMissing, ...missingFromLibrary])].slice(0, limit);
}

export async function runNowPlayingPostSync({ region = 'IN', tmdbIds = [] } = {}) {
    const cms = await syncInTheatersCmsSection(region, tmdbIds);
    // Include cron-synced + every title already on the In Theaters rail (manual adds too)
    const candidateIds = [...new Set([
        ...(cms.tmdb_ids || []),
        ...(tmdbIds || []).map(String),
    ])];
    const toAnalyze = await pickMoviesNeedingWebRatings(candidateIds);
    const ratings = await analyzeWebRatingsForTmdbIds(toAnalyze);

    return { cms, ratings };
}
