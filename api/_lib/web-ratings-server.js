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

const MAX_REVIEWS = 15;
const MAX_REVIEW_CHARS = 1200;
const MIN_REVIEW_CHARS = 25;
const STALE_DAYS = 7;
/** Score the full In Theaters rail (9) in one Control Tower / cron pass */
const DEFAULT_ANALYZE_LIMIT = 9;
/** Home "In Theaters" rail — top popular now-playing only */
export const IN_THEATERS_RAIL_LIMIT = 9;

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
        .filter((text) => text.length >= MIN_REVIEW_CHARS)
        .slice(0, MAX_REVIEWS)
        .map((text) => (text.length > MAX_REVIEW_CHARS ? `${text.slice(0, MAX_REVIEW_CHARS)}…` : text));
}

function mergeReviewResults(...lists) {
    const seen = new Set();
    const out = [];
    for (const list of lists) {
        for (const r of list || []) {
            const key = String(r?.id || r?.content || '').slice(0, 120);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(r);
        }
    }
    return out;
}

/**
 * Pull TMDB reviews across languages — English-only often returns nothing
 * for India / regional theatrical titles.
 */
async function ensureReviews(supabase, row) {
    const existingRaw = Array.isArray(row.reviews) ? row.reviews : [];
    let existing = extractReviewTexts(existingRaw);
    if (existing.length >= 3) return { texts: existing, raw: existingRaw };

    const collected = [...existingRaw];
    try {
        // Default + no language filter + a few common locales
        const langs = [undefined, '', 'en-US', 'hi-IN', 'ta-IN', 'te-IN'];
        for (const language of langs) {
            const params = { page: 1 };
            if (language !== undefined) params.language = language;
            const payload = await fetchTmdbApi(`/movie/${row.tmdb_id}/reviews`, params);
            const batch = payload?.results || [];
            if (batch.length) {
                collected.splice(0, collected.length, ...mergeReviewResults(collected, batch));
            }
            existing = extractReviewTexts(collected);
            if (existing.length >= 5) break;
        }

        // Detail append as a final pass
        if (existing.length < 2) {
            const detail = await fetchTmdbApi(`/movie/${row.tmdb_id}`, {
                append_to_response: 'reviews',
            });
            collected.splice(
                0,
                collected.length,
                ...mergeReviewResults(collected, detail?.reviews?.results || []),
            );
            existing = extractReviewTexts(collected);
        }

        if (collected.length > 0) {
            await supabase
                .from('movies_library')
                .update({ reviews: collected.slice(0, 40) })
                .eq('tmdb_id', String(row.tmdb_id))
                .eq('media_type', 'movie');
        }
    } catch (err) {
        console.warn(`[web-ratings] TMDB reviews fetch failed for ${row.tmdb_id}:`, err.message);
    }

    return { texts: extractReviewTexts(collected), raw: collected };
}

function buildReviewPrompt(title, reviewTexts) {
    const joined = reviewTexts.map((t, i) => `[${i + 1}] ${t}`).join('\n\n');
    return [
        `You are a film critic assistant. Analyze audience reviews for "${title}".`,
        'Return ONLY valid JSON with these numeric fields (0-10 scale, one decimal max):',
        'acting, screenplay, sound, direction, entertainment, pacing, cinematography.',
        'Also include verdict: a short phrase (max 40 chars) like "Worth theaters" or "Wait for stream".',
        'Base scores on consensus across the reviews, not one outlier.',
        '',
        'Reviews:',
        joined,
    ].join('\n');
}

function buildSynopsisPrompt(row) {
    const genres = Array.isArray(row.genres)
        ? row.genres.map((g) => (typeof g === 'string' ? g : g?.name)).filter(Boolean).join(', ')
        : '';
    const vote = row.vote_average != null ? Number(row.vote_average).toFixed(1) : 'n/a';
    return [
        `You are a film critic assistant. There are few or no public TMDB user reviews yet for "${row.title}".`,
        'Estimate Theater-or-Stream style scores from the synopsis, genre, and TMDB audience score.',
        'Return ONLY valid JSON with these numeric fields (0-10 scale, one decimal max):',
        'acting, screenplay, sound, direction, entertainment, pacing, cinematography.',
        'Also include verdict: a short phrase (max 40 chars) like "Worth theaters" or "Wait for stream".',
        'Keep scores realistic and close to the TMDB score; do not invent extreme praise or hate.',
        '',
        `Title: ${row.title || 'Unknown'}`,
        `TMDB score: ${vote}/10 (from ${row.vote_count || 0} votes)`,
        `Genres: ${genres || 'n/a'}`,
        `Tagline: ${row.tagline || 'n/a'}`,
        `Overview: ${(row.overview || '').slice(0, 900) || 'n/a'}`,
    ].join('\n');
}

function normalizeLlmResult(parsed, { reviewCount = 0, source = 'reviews' } = {}) {
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
        source,
        analyzed_at: new Date().toISOString(),
        model: process.env.GEMINI_MODEL || process.env.MISTRAL_MODEL || 'gemini-2.0-flash',
    };
}

/** Fill missing overview / scores from TMDB so synopsis fallback can always run. */
async function enrichRowFromTmdb(row) {
    const needsOverview = !(row.overview && String(row.overview).trim().length >= 40);
    const needsVote = row.vote_average == null;
    if (!needsOverview && !needsVote) return row;

    try {
        const detail = await fetchTmdbApi(`/movie/${row.tmdb_id}`);
        if (!detail?.id) return row;
        return {
            ...row,
            title: row.title || detail.title || row.title,
            overview: (row.overview && String(row.overview).trim()) || detail.overview || '',
            tagline: row.tagline || detail.tagline || null,
            vote_average: row.vote_average ?? detail.vote_average ?? null,
            vote_count: row.vote_count ?? detail.vote_count ?? null,
            genres: (Array.isArray(row.genres) && row.genres.length)
                ? row.genres
                : (detail.genres || []),
        };
    } catch (err) {
        console.warn(`[web-ratings] TMDB enrich failed for ${row.tmdb_id}:`, err.message);
        return row;
    }
}

export async function analyzeWebRatingsForMovie(tmdbId, { force = false } = {}) {
    if (!isLlmEnabled()) {
        return { tmdb_id: String(tmdbId), skipped: true, reason: 'llm_disabled' };
    }

    const supabase = getSupabaseAdmin();
    const id = String(tmdbId);

    const { data: row, error } = await supabase
        .from('movies_library')
        .select('tmdb_id, title, overview, tagline, genres, vote_average, vote_count, reviews, web_ratings, media_type')
        .eq('tmdb_id', id)
        .eq('media_type', 'movie')
        .maybeSingle();

    if (error) throw error;
    if (!row) return { tmdb_id: id, skipped: true, reason: 'not_in_library' };

    // Already scored from real reviews — skip unless force re-run
    if (
        !force
        && row.web_ratings?.analyzed_at
        && !isStale(row.web_ratings.analyzed_at)
        && (row.web_ratings.source === 'reviews' || (row.web_ratings.review_count || 0) > 0)
    ) {
        return { tmdb_id: id, skipped: true, reason: 'fresh', web_ratings: row.web_ratings };
    }

    // Synopsis-only scores: re-run when force, or when we can upgrade to reviews
    if (
        !force
        && row.web_ratings?.analyzed_at
        && !isStale(row.web_ratings.analyzed_at)
        && row.web_ratings.source === 'synopsis'
    ) {
        // Fall through only if we might now have reviews; otherwise keep synopsis
        const probe = await ensureReviews(supabase, row);
        if (probe.texts.length < 1) {
            return { tmdb_id: id, skipped: true, reason: 'fresh', web_ratings: row.web_ratings };
        }
    }

    let working = await enrichRowFromTmdb(row);
    const { texts: reviewTexts } = await ensureReviews(supabase, working);
    const useReviews = reviewTexts.length >= 1;
    const hasSynopsis = !!(working.overview && String(working.overview).trim().length >= 20);
    const hasVote = working.vote_average != null;

    if (!useReviews && !hasSynopsis && !hasVote) {
        return {
            tmdb_id: id,
            skipped: true,
            reason: 'no_signal',
            count: 0,
            title: working.title || id,
        };
    }

    const prompt = useReviews
        ? buildReviewPrompt(working.title || 'this film', reviewTexts)
        : buildSynopsisPrompt(working);

    const parsed = await generateJson(prompt, { maxOutputTokens: 400 });
    const webRatings = normalizeLlmResult(parsed, {
        reviewCount: reviewTexts.length,
        source: useReviews ? 'reviews' : 'synopsis',
    });
    if (!webRatings) {
        return {
            tmdb_id: id,
            skipped: true,
            reason: 'llm_parse_failed',
            title: working.title || id,
            review_count: reviewTexts.length,
        };
    }

    const { error: updateError } = await supabase
        .from('movies_library')
        .update({ web_ratings: webRatings })
        .eq('tmdb_id', id)
        .eq('media_type', 'movie');

    if (updateError) throw updateError;

    // Persist enriched overview/votes when library row was thin
    if (needsLibraryEnrich(row, working)) {
        await supabase
            .from('movies_library')
            .update({
                overview: working.overview || row.overview,
                tagline: working.tagline || row.tagline,
                vote_average: working.vote_average ?? row.vote_average,
                vote_count: working.vote_count ?? row.vote_count,
            })
            .eq('tmdb_id', id)
            .eq('media_type', 'movie');
    }

    return {
        tmdb_id: id,
        analyzed: true,
        source: webRatings.source,
        review_count: webRatings.review_count,
        title: working.title || id,
        web_ratings: webRatings,
    };
}

function needsLibraryEnrich(before, after) {
    const thinOverview = !(before.overview && String(before.overview).trim().length >= 40);
    return thinOverview || before.vote_average == null;
}

export async function analyzeWebRatingsForTmdbIds(tmdbIds, { limit = DEFAULT_ANALYZE_LIMIT, force = false } = {}) {
    const unique = [...new Set((tmdbIds || []).map(String))].slice(0, limit);
    const results = [];

    for (const id of unique) {
        try {
            results.push(await analyzeWebRatingsForMovie(id, { force }));
        } catch (err) {
            results.push({ tmdb_id: id, error: err.message, skipped: true, reason: 'error' });
        }
    }

    return {
        processed: results.length,
        analyzed: results.filter((r) => r.analyzed).length,
        skipped: results.filter((r) => r.skipped).length,
        fresh: results.filter((r) => r.reason === 'fresh').length,
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
 * Replace the In Theaters CMS rail for a region with the top N synced
 * now-playing titles (by popularity). Caps at IN_THEATERS_RAIL_LIMIT (9).
 * When tmdbIds is empty, trims the existing rail to the limit without a full replace.
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

    const lookupIds = [...new Set([
        ...syncedIds,
        ...existingById.keys(),
    ])];
    let libraryById = new Map();
    if (lookupIds.length > 0) {
        const { data: libraryRows, error: libError } = await supabase
            .from('movies_library')
            .select('tmdb_id, title, poster_path, backdrop_path, release_date, vote_average, overview, popularity')
            .eq('media_type', 'movie')
            .in('tmdb_id', lookupIds);

        if (libError) throw libError;
        libraryById = new Map((libraryRows || []).map((r) => [String(r.tmdb_id), r]));
    }

    const popularityOf = (id) => {
        const lib = libraryById.get(id);
        const existing = existingById.get(id);
        return Number(lib?.popularity ?? existing?.popularity ?? existing?.vote_average ?? 0) || 0;
    };

    let orderedIds;
    if (syncedIds.length > 0) {
        // Prefer sync order (already popularity-sorted from Control Tower),
        // then fill gaps by library popularity — never more than the rail limit.
        orderedIds = syncedIds.slice(0, IN_THEATERS_RAIL_LIMIT);
    } else {
        orderedIds = [...existingById.keys()]
            .sort((a, b) => popularityOf(b) - popularityOf(a))
            .slice(0, IN_THEATERS_RAIL_LIMIT);
    }

    const cmsMovies = [];
    const used = new Set();
    for (const id of orderedIds) {
        if (used.has(id)) continue;
        const row = libraryById.get(id) || existingById.get(id);
        if (!row) continue;
        cmsMovies.push(toCmsMovie(row, cmsMovies.length + 1));
        used.add(id);
    }

    moviesByRegion[regionCode] = cmsMovies;

    const { error: updateError } = await supabase
        .from('homepage_sections')
        .update({ movies_by_region: moviesByRegion })
        .eq('id', section.id);

    if (updateError) throw updateError;

    const allSectionIds = collectSectionTmdbIds(moviesByRegion);

    return {
        updated: true,
        section_id: section.id,
        region: regionCode,
        count: cmsMovies.length,
        tmdb_ids: allSectionIds,
        synced_count: syncedIds.length,
        limit: IN_THEATERS_RAIL_LIMIT,
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
    // Include cron-synced + every title already on the In Theaters rail
    const candidateIds = [...new Set([
        ...(cms.tmdb_ids || []),
        ...(tmdbIds || []).map(String),
    ])];
    const toAnalyze = await pickMoviesNeedingWebRatings(candidateIds, {
        limit: IN_THEATERS_RAIL_LIMIT,
    });
    const ratings = await analyzeWebRatingsForTmdbIds(toAnalyze, {
        limit: IN_THEATERS_RAIL_LIMIT,
    });

    return { cms, ratings };
}
