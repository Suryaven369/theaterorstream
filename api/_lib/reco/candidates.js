/**
 * Phase 2 — candidate generation from TMDB (the source of truth).
 *
 * Every candidate is a real TMDB title. Pools:
 *   1. Loved-film neighbours: /movie/{id}/recommendations + /similar per loved film
 *   2. Keyword discover: the keywords loved films share most → /discover/movie with_keywords
 *   3. Platform discover: /discover/movie on the user's services + region, in their
 *      languages, vote_count ≥ 200, runtime ≤ their limit
 * Hard filters (seen, disliked, platforms, dealbreakers) are applied by the caller
 * through passesDealbreakers() + the engine's base filters.
 *
 * All TMDB calls go through fetchTmdbApi (cached + retried) and fail soft: a
 * pool that errors just contributes nothing.
 */
import { fetchTmdbApi } from '../tmdb-server.js';

export const CANDIDATE_TARGET_MAX = 250;
// Per-pool quotas so no single source crowds out the others.
const POOL_QUOTA = { neighbours: 150, keywords: 60, platforms: 60 };
const SIMILAR_PER_SEED = 8; // TMDB /similar is weaker than /recommendations — keep only its top
const NEIGHBOUR_SEEDS = 8;
const KEYWORDS_FOR_DISCOVER = 6;
const MIN_DISCOVER_VOTES = 200;

// Keywords that describe production trivia, not taste.
const GENERIC_KEYWORDS = new Set([
    'duringcreditsstinger', 'aftercreditsstinger', 'woman director', 'based on novel or book',
    'sequel', 'remake', 'based on comic', 'based on true story', 'biography', 'imax',
    '3d', 'live action remake', 'anime', 'female protagonist', 'male protagonist',
]);

// ---------------------------------------------------------------------------
// Dealbreakers
// ---------------------------------------------------------------------------

const HORROR_GENRE = 27;
const SEVERITY = { none: 0, mild: 1, moderate: 2, severe: 3 };
const DEALBREAKER_KEYWORDS = {
    gore: /\b(gore|gory|splatter|body horror|dismemberment|torture porn|disembowel)/i,
    sexual_content: /\b(erotic|explicit sex|sex scene|softcore|nudity|sexual content)/i,
    violence: /\b(graphic violence|extreme violence|brutality|massacre|torture|ultraviolence)/i,
};

function genreIdsOf(movie) {
    if (Array.isArray(movie?.genre_ids) && movie.genre_ids.length) return movie.genre_ids.map(Number);
    return (movie?.genres || []).map((g) => Number(g?.id ?? g)).filter(Boolean);
}

function keywordText(movie) {
    return (Array.isArray(movie?.keywords) ? movie.keywords : [])
        .map((k) => k?.name || k)
        .filter((k) => typeof k === 'string')
        .join(' | ');
}

function guideLevel(guide, ...keys) {
    if (!guide || typeof guide !== 'object') return 0;
    return Math.max(0, ...keys.map((k) => SEVERITY[String(guide[k] || '').toLowerCase()] ?? 0));
}

/**
 * True when the title doesn't hit any of the user's dealbreakers.
 * prefs: { dealbreakers: string[], languages: string[], maxRuntime: number|null }
 * Unknown data never excludes (e.g. no runtime → can't be "too long").
 */
export function passesDealbreakers(movie, prefs = {}) {
    const deal = new Set(prefs.dealbreakers || []);
    const genres = genreIdsOf(movie);
    const kw = keywordText(movie);
    const guide = movie?.custom_parent_guide;

    if (deal.has('horror') && genres.includes(HORROR_GENRE)) return false;
    if (deal.has('gore') && (DEALBREAKER_KEYWORDS.gore.test(kw) || guideLevel(guide, 'gore') >= 2)) return false;
    if (deal.has('violence') && (DEALBREAKER_KEYWORDS.violence.test(kw) || guideLevel(guide, 'violence') >= SEVERITY.severe)) return false;
    if (deal.has('sexual_content')
        && (DEALBREAKER_KEYWORDS.sexual_content.test(kw) || guideLevel(guide, 'nudity', 'sex', 'sex_nudity') >= SEVERITY.moderate)) return false;

    // "No subtitles": only films originally in a language the user watches.
    const langs = prefs.languages || [];
    if (deal.has('subtitles') && langs.length && movie?.original_language && !langs.includes(movie.original_language)) {
        return false;
    }

    const runtime = Number(movie?.runtime);
    if (prefs.maxRuntime && runtime > 0 && runtime > prefs.maxRuntime) return false;
    return true;
}

// ---------------------------------------------------------------------------
// Keyword profile
// ---------------------------------------------------------------------------

/**
 * Most frequent keywords across the loved films (ids), favouring keywords
 * shared by several films. lovedKeywords: array of keyword arrays [{id,name}].
 */
export function topSharedKeywords(lovedKeywords, n = KEYWORDS_FOR_DISCOVER) {
    const clean = (list) => (list || [])
        .map((k) => ({ id: Number(k?.id), name: String(k?.name || '').toLowerCase() }))
        .filter((k) => k.id && k.name && !GENERIC_KEYWORDS.has(k.name));
    const perFilm = lovedKeywords.map(clean);

    const counts = new Map();
    perFilm.forEach((list) => {
        new Map(list.map((k) => [k.id, k])).forEach((k) => {
            const e = counts.get(k.id) || { ...k, count: 0 };
            e.count += 1;
            counts.set(k.id, e);
        });
    });
    const shared = [...counts.values()]
        .filter((k) => k.count >= 2)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    if (shared.length >= 2) return shared.slice(0, n);

    // Little overlap: take each film's leading keywords in turn (TMDB lists the
    // most characteristic first), so every loved film is represented.
    const out = [...shared];
    const taken = new Set(out.map((k) => k.id));
    for (let depth = 0; out.length < n && depth < 10; depth += 1) {
        perFilm.forEach((list) => {
            const k = list[depth];
            if (k && !taken.has(k.id) && out.length < n) {
                taken.add(k.id);
                out.push({ ...k, count: counts.get(k.id)?.count || 1 });
            }
        });
    }
    return out;
}

// ---------------------------------------------------------------------------
// TMDB pools
// ---------------------------------------------------------------------------

function liteCard(m, mediaType = 'movie') {
    return {
        tmdb_id: String(m.id),
        id: String(m.id),
        media_type: mediaType,
        title: m.title || m.name,
        poster_path: m.poster_path || null,
        backdrop_path: m.backdrop_path || null,
        release_date: m.release_date || m.first_air_date || null,
        vote_average: m.vote_average ?? null,
        vote_count: m.vote_count ?? null,
        popularity: m.popularity ?? 0,
        genre_ids: (m.genre_ids || []).map(Number),
        genres: (m.genre_ids || []).map((id) => ({ id })),
        original_language: m.original_language || null,
        overview: m.overview || null,
        runtime: null,
        streaming_platforms: [],
        mood_tags: [],
        movie_dna: {},
        _lite: true,
    };
}

async function safe(promise) {
    try { return await promise; } catch { return null; }
}

/** Recommendations + similar for each loved film. */
async function lovedNeighbourPool(lovedIds) {
    const seeds = lovedIds.slice(0, NEIGHBOUR_SEEDS);
    const [recs, similar] = await Promise.all([
        Promise.all(seeds.map((id) => safe(fetchTmdbApi(`/movie/${id}/recommendations`, { page: '1' })))),
        Promise.all(seeds.map((id) => safe(fetchTmdbApi(`/movie/${id}/similar`, { page: '1' })))),
    ]);
    // Interleave seeds rank-by-rank so every loved film contributes its best matches first.
    const interleave = (lists, per) => {
        const out = [];
        for (let rank = 0; rank < per; rank += 1) {
            lists.forEach((d) => { const m = d?.results?.[rank]; if (m) out.push(m); });
        }
        return out;
    };
    return [...interleave(recs, 20), ...interleave(similar, SIMILAR_PER_SEED)];
}

/** Discover by the keywords the loved films share. */
async function keywordDiscoverPool(keywords, prefs) {
    if (!keywords.length) return [];
    const params = {
        with_keywords: keywords.map((k) => k.id).join('|'),
        sort_by: 'popularity.desc',
        'vote_count.gte': String(MIN_DISCOVER_VOTES),
        'vote_average.gte': '6.5',
        include_adult: 'false',
    };
    if (prefs.maxRuntime) params['with_runtime.lte'] = String(prefs.maxRuntime);
    const pages = await Promise.all([1, 2].map((page) => safe(fetchTmdbApi('/discover/movie', { ...params, page: String(page) }))));
    return pages.flatMap((d) => d?.results || []);
}

/** Discover on the user's own services, region, languages and runtime. */
async function platformDiscoverPool(prefs, topGenreIds = []) {
    if (!prefs.platformIds?.length) return [];
    const base = {
        with_watch_providers: prefs.platformIds.join('|'),
        watch_region: prefs.region || 'IN',
        with_watch_monetization_types: 'flatrate|free|ads',
        'vote_count.gte': String(MIN_DISCOVER_VOTES),
        sort_by: 'popularity.desc',
        include_adult: 'false',
    };
    if (prefs.languages?.length) base.with_original_language = prefs.languages.join('|');
    if (prefs.maxRuntime) base['with_runtime.lte'] = String(prefs.maxRuntime);
    const jobs = [1, 2].map((page) => safe(fetchTmdbApi('/discover/movie', { ...base, page: String(page) })));
    if (topGenreIds.length) {
        jobs.push(safe(fetchTmdbApi('/discover/movie', { ...base, with_genres: topGenreIds.join('|'), page: '1' })));
    }
    return (await Promise.all(jobs)).flatMap((d) => d?.results || []);
}

/**
 * Build the candidate pool for a user.
 * @param {{ lovedIds: string[], lovedKeywords: Array<Array<{id,name}>>, prefs: object,
 *           topGenreIds?: number[], exclude?: Set<string> }} input
 * @returns {Promise<{ cards: Map<string, object>, knownAvailable: Map<string, number[]>,
 *           sources: Record<string, number>, keywords: Array<{id,name,count}> }>}
 */
export async function generateCandidates({ lovedIds = [], lovedKeywords = [], prefs = {}, topGenreIds = [], exclude = new Set() }) {
    const keywords = topSharedKeywords(lovedKeywords);
    const [neighbours, byKeyword, onPlatforms] = await Promise.all([
        lovedNeighbourPool(lovedIds.map(String)),
        keywordDiscoverPool(keywords, prefs),
        platformDiscoverPool(prefs, topGenreIds),
    ]);

    const cards = new Map();
    const knownAvailable = new Map();
    const sources = { neighbours: 0, keywords: 0, platforms: 0 };
    const add = (list, source) => {
        list.forEach((m) => {
            const id = String(m?.id || '');
            if (!id || exclude.has(id) || m.adult) return;
            if (!cards.has(id)) {
                if (cards.size >= CANDIDATE_TARGET_MAX || sources[source] >= POOL_QUOTA[source]) return;
                cards.set(id, { ...liteCard(m), _source: source });
                sources[source] += 1;
            }
            if (source === 'platforms') knownAvailable.set(id, prefs.platformIds.map(Number));
        });
    };
    // Order = priority when the pool is capped: closest to taste first.
    add(neighbours, 'neighbours');
    add(byKeyword, 'keywords');
    add(onPlatforms, 'platforms');

    return { cards, knownAvailable, sources, keywords };
}
