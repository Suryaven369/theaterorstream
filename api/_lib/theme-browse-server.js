/**
 * Theme / micro-genre browse for Search → Categories.
 * TMDB Discover (with_keywords) is the primary source — same idea as genre
 * browse, but keywords instead of genre_ids. Library rows enrich cards when present.
 */

import { createClient } from '@supabase/supabase-js';
import { fetchTmdbApi } from './tmdb-server.js';
import { getSupabaseAdmin } from './supabase-admin.js';

const LIBRARY_CARD_SELECT =
    'tmdb_id, title, poster_path, backdrop_path, media_type, release_date, first_air_date, vote_average, popularity, overview, genres, runtime, number_of_seasons, number_of_episodes';

const TMDB_PAGE_SIZE = 20;
const BROWSE_THEMES_KEY = 'browse_themes';

function getSupabase() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
    }
    return createClient(supabaseUrl, supabaseKey);
}

/** @typedef {{ label: string, keywordIds?: number[], keywordQueries?: string[], terms?: string[], genreIds?: number[], originalLanguage?: string, genreAny?: boolean }} ThemeConfig */

/** Min votes so theme browse only returns popular titles */
export const THEME_POPULAR_VOTE_COUNT = 100;

/**
 * Curated TMDB keyword IDs (verified via /search/keyword).
 * Keep in sync with src/constants/searchCategories.js SEARCH_THEMES.
 * One primary keyword per theme — wrong IDs (e.g. 9715=superhero) break accuracy.
 */
/** @type {Record<string, ThemeConfig>} */
export const THEME_CONFIG = {
    'found-footage': {
        label: 'Found Footage',
        keywordIds: [163053],
        keywordQueries: ['found footage'],
    },
    dystopia: {
        label: 'Dystopia',
        keywordIds: [4565],
        keywordQueries: ['dystopia'],
    },
    disturbing: {
        label: 'Disturbing',
        keywordIds: [361070],
        keywordQueries: ['disturbing'],
    },
    anthology: {
        label: 'Anthology',
        keywordIds: [9706],
        keywordQueries: ['anthology'],
    },
    'mind-bending': {
        label: 'Mind-Bending',
        keywordIds: [362567],
        keywordQueries: ['mind-bending'],
    },
    'slow-burn': {
        label: 'Slow Burn',
        keywordIds: [277551],
        keywordQueries: ['slow burn'],
    },
    psychological: {
        label: 'Psychological',
        keywordIds: [12565],
        keywordQueries: ['psychological thriller'],
    },
    cyberpunk: {
        label: 'Cyberpunk',
        keywordIds: [12190],
        keywordQueries: ['cyberpunk'],
    },
    'time-travel': {
        label: 'Time Travel',
        keywordIds: [4379],
        keywordQueries: ['time travel'],
    },
    heist: {
        label: 'Heist',
        keywordIds: [10051],
        keywordQueries: ['heist'],
    },
    'coming-of-age': {
        label: 'Coming of Age',
        keywordIds: [10683],
        keywordQueries: ['coming of age'],
    },
    mockumentary: {
        label: 'Mockumentary',
        keywordIds: [11800],
        keywordQueries: ['mockumentary'],
    },
    'neo-noir': {
        label: 'Neo-Noir',
        keywordIds: [207268],
        keywordQueries: ['neo-noir'],
    },
    'body-horror': {
        label: 'Body Horror',
        keywordIds: [283085],
        keywordQueries: ['body horror'],
    },
    survival: {
        label: 'Survival',
        keywordIds: [10349],
        keywordQueries: ['survival'],
    },
    'cult-classic': {
        label: 'Cult Classic',
        keywordIds: [374649],
        keywordQueries: ['cult film'],
    },
    'based-on-true-story': {
        label: 'Based on a True Story',
        keywordIds: [9672],
        keywordQueries: ['based on true story'],
    },
    'period-piece': {
        label: 'Period Piece',
        keywordIds: [5776],
        keywordQueries: ['period drama'],
    },
    superhero: {
        label: 'Superhero',
        keywordIds: [9715],
        keywordQueries: ['superhero'],
    },
    anime: {
        label: 'Anime',
        keywordQueries: ['anime'],
        genreIds: [16],
        originalLanguage: 'ja',
    },
    whodunit: {
        label: 'Whodunit',
        keywordIds: [12570],
        keywordQueries: ['whodunit'],
    },
    'space-opera': {
        label: 'Space Opera',
        keywordIds: [161176],
        keywordQueries: ['space opera'],
    },
};

function themeFromRow(row) {
    if (!row?.id) return null;
    return {
        id: String(row.id),
        label: String(row.label || row.id),
        keywordIds: Array.isArray(row.keywordIds) ? row.keywordIds.map(Number).filter((n) => n > 0) : [],
        keywordQueries: Array.isArray(row.keywordQueries)
            ? row.keywordQueries.map((q) => String(q).trim()).filter(Boolean)
            : [],
        genreIds: Array.isArray(row.genreIds) ? row.genreIds.map(Number).filter((n) => n > 0) : [],
        originalLanguage: row.originalLanguage || null,
        enabled: row.enabled !== false,
        sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : 0,
    };
}

/** Defaults as a list (for admin seed + public API). */
export function getDefaultBrowseThemesList() {
    return Object.entries(THEME_CONFIG).map(([id, cfg], index) => ({
        id,
        label: cfg.label,
        keywordIds: [...(cfg.keywordIds || [])],
        keywordQueries: [...(cfg.keywordQueries || cfg.terms || [])],
        genreIds: [...(cfg.genreIds || [])],
        originalLanguage: cfg.originalLanguage || null,
        enabled: true,
        sortOrder: index,
    }));
}

/**
 * Load admin-managed themes from app_settings, else defaults.
 * Returns full list (including disabled) for admin; pass { activeOnly: true } for public.
 */
export async function loadBrowseThemes({ activeOnly = false } = {}) {
    let list = getDefaultBrowseThemesList();
    try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', BROWSE_THEMES_KEY)
            .maybeSingle();
        if (!error && Array.isArray(data?.value?.themes) && data.value.themes.length) {
            const seen = new Set();
            list = data.value.themes
                .map((row, index) => themeFromRow({ ...row, sortOrder: row.sortOrder ?? index }))
                .filter((t) => {
                    if (!t || seen.has(t.id)) return false;
                    seen.add(t.id);
                    return true;
                })
                .sort((a, b) => a.sortOrder - b.sortOrder);
        }
    } catch (err) {
        console.warn('[theme-browse] loadBrowseThemes fallback to defaults:', err.message);
    }

    if (activeOnly) list = list.filter((t) => t.enabled);

    // Overlay curated keyword IDs so public chips + discover stay accurate
    return list.map((t) => {
        const curated = THEME_CONFIG[t.id];
        if (!curated) return t;
        return {
            ...t,
            keywordIds: curated.keywordIds?.length ? [...curated.keywordIds] : t.keywordIds,
            keywordQueries: curated.keywordQueries?.length
                ? [...curated.keywordQueries]
                : t.keywordQueries,
            genreIds: curated.genreIds?.length ? [...curated.genreIds] : t.genreIds,
            originalLanguage: curated.originalLanguage || t.originalLanguage,
        };
    });
}

/** Resolve a theme id — curated keyword IDs always win for known themes. */
export async function resolveThemeConfig(themeId) {
    const defaults = THEME_CONFIG[themeId] || null;
    const list = await loadBrowseThemes({ activeOnly: false });
    const saved = list.find((t) => t.id === themeId && t.enabled);
    if (!saved && !defaults) return null;
    if (!saved) return defaults;

    return {
        label: saved.label || defaults?.label || themeId,
        // Curated code IDs take priority (stale app_settings had wrong keywords)
        keywordIds: defaults?.keywordIds?.length
            ? defaults.keywordIds
            : (saved.keywordIds || []),
        keywordQueries: defaults?.keywordQueries || saved.keywordQueries || [],
        genreIds: defaults?.genreIds?.length
            ? defaults.genreIds
            : (saved.genreIds || []),
        originalLanguage: defaults?.originalLanguage || saved.originalLanguage || null,
    };
}

export function themeLabelById(themeId) {
    return THEME_CONFIG[themeId]?.label || null;
}

function mapTmdbToCard(m) {
    return {
        tmdb_id: String(m.id),
        id: String(m.id),
        title: m.title || m.name,
        poster_path: m.poster_path,
        backdrop_path: m.backdrop_path || null,
        media_type: 'movie',
        release_date: m.release_date || null,
        first_air_date: null,
        vote_average: m.vote_average ?? null,
        vote_count: m.vote_count ?? null,
        popularity: m.popularity ?? 0,
        overview: m.overview || null,
        genres: (m.genre_ids || []).map((id) => ({ id })),
        genre_ids: m.genre_ids || [],
        runtime: null,
    };
}

async function resolveKeywordIds(config) {
    // Prefer curated IDs — fuzzy keyword search previously polluted results
    // (e.g. found-footage accidentally used 9715 = superhero).
    const curated = (config.keywordIds || []).map(Number).filter((n) => n > 0);
    if (curated.length) return curated;

    const ids = new Set();
    const queries = config.keywordQueries || config.terms || [];
    for (const q of queries) {
        if (!q || ids.size >= 2) break;
        try {
            // eslint-disable-next-line no-await-in-loop
            const data = await fetchTmdbApi('/search/keyword', { query: q, page: '1' });
            const needle = String(q).toLowerCase();
            const hit = (data?.results || []).find(
                (r) => String(r.name || '').toLowerCase() === needle,
            );
            if (hit?.id) ids.add(Number(hit.id));
        } catch (err) {
            console.warn('[theme-browse] keyword search failed:', q, err.message);
        }
    }
    return Array.from(ids);
}

function mapSort(sort, mediaType) {
    if (sort === 'newest') {
        return mediaType === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc';
    }
    if (sort === 'rating') return 'vote_average.desc';
    return 'popularity.desc';
}

/** US movie certs that are actually family-safe (PG-13 is not). */
const FAMILY_MOVIE_CERT_MAX = 'PG';
/** US TV ratings allowed when Family Friendly is on. */
const FAMILY_TV_RATINGS = new Set(['TV-Y', 'TV-Y7', 'TV-Y7-FV', 'TV-G', 'TV-PG']);
/** Horror / thriller / crime / war — not family viewing. */
const FAMILY_BLOCKED_MOVIE_GENRES = '27|53|80|10752';
/** Crime / war & politics — TV discover has no certification filter. */
const FAMILY_BLOCKED_TV_GENRES = '80|10768';
const FAMILY_TV_SAFE_GENRES = new Set([10751, 10762]); // Family, Kids
const FAMILY_MOVIE_BLOCKED_GENRE_SET = new Set([27, 53, 80, 10752]);

function mergeWithoutGenres(existing, blocked) {
    const parts = new Set(
        String(existing || '')
            .split('|')
            .map((s) => s.trim())
            .filter(Boolean),
    );
    String(blocked)
        .split('|')
        .forEach((id) => parts.add(id));
    return Array.from(parts).join('|');
}

/**
 * Apply discover params that keep Family Friendly results accurate.
 * Movies: US cert ≤ PG + block mature genres.
 * TV: discover has no cert filter — block mature genres; narrow to Family|Kids
 * when not already genre-scoped; content ratings are verified after fetch.
 */
function applyFamilyFriendlyDiscoverParams(params, type, { region = 'US', genreId = null } = {}) {
    params.include_adult = 'false';
    // Family catalog is smaller — don't starve results with a high vote floor
    if (Number(params['vote_count.gte']) > 50) {
        params['vote_count.gte'] = '50';
    }

    if (type === 'movie') {
        params.certification_country = region || 'US';
        params['certification.lte'] = FAMILY_MOVIE_CERT_MAX;
        params.without_genres = mergeWithoutGenres(params.without_genres, FAMILY_BLOCKED_MOVIE_GENRES);
        return;
    }

    // TV: certification.* is ignored by /discover/tv — ratings checked after fetch.
    delete params.certification_country;
    delete params['certification.lte'];
    params.without_genres = mergeWithoutGenres(params.without_genres, FAMILY_BLOCKED_TV_GENRES);

    // Open browse only: seed with Family|Kids (not bare Animation — that includes adult anime).
    // Genre/theme filters keep their scope; US content ratings enforce family-safety.
    if (!genreId && !params.with_genres && !params.with_keywords) {
        params.with_genres = '10751|10762';
    }
}

function cardGenreIds(card) {
    if (Array.isArray(card.genre_ids) && card.genre_ids.length) {
        return card.genre_ids.map(Number);
    }
    return (card.genres || []).map((g) => Number(g?.id ?? g)).filter((n) => n > 0);
}

function isFamilySafeMovieCard(card) {
    if (card?.adult === true) return false;
    const ids = cardGenreIds(card);
    return !ids.some((id) => FAMILY_MOVIE_BLOCKED_GENRE_SET.has(id));
}

/**
 * Verify US TV content rating — discover cannot filter by rating.
 * Unrated titles are excluded so unverified mature shows do not slip through.
 */
async function filterTvRowsByUsContentRating(rows, region = 'US') {
    if (!rows.length) return [];
    const country = (region || 'US').toUpperCase();

    const checks = await Promise.all(
        rows.map(async (row) => {
            try {
                const data = await fetchTmdbApi(`/tv/${row.tmdb_id}/content_ratings`);
                const match = (data?.results || []).find(
                    (r) => String(r.iso_3166_1 || '').toUpperCase() === country,
                ) || (data?.results || []).find(
                    (r) => String(r.iso_3166_1 || '').toUpperCase() === 'US',
                );
                const rating = String(match?.rating || '').trim().toUpperCase();
                if (!rating || rating === 'NR') return false;
                return FAMILY_TV_RATINGS.has(rating);
            } catch {
                return false;
            }
        }),
    );

    return rows.filter((_, i) => checks[i]);
}

/**
 * TMDB Discover for theme/genre browse with sort, OTT, family-friendly filters.
 * @returns {{ rows: object[], totalResults: number, totalPages: number }}
 */
async function discoverThemePages(config, keywordIds, {
    startPage = 1,
    pageCount = 1,
    mediaType = 'movie',
    sort = 'popular',
    providerId = null,
    region = 'US',
    familyFriendly = false,
    genreId = null,
} = {}) {
    const rows = [];
    let totalResults = 0;
    let totalPages = 1;
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const endpoint = type === 'tv' ? '/discover/tv' : '/discover/movie';

    for (let p = startPage; p < startPage + pageCount; p += 1) {
        const params = {
            sort_by: mapSort(sort, type),
            'vote_count.gte': String(sort === 'rating' ? 150 : THEME_POPULAR_VOTE_COUNT),
            include_adult: 'false',
            page: String(p),
        };

        if (genreId) {
            params.with_genres = String(genreId);
        } else if (keywordIds.length) {
            params.with_keywords = String(keywordIds[0]);
        } else if (config.genreIds?.length) {
            params.with_genres = config.genreIds.join('|');
        }

        if (config.originalLanguage) {
            params.with_original_language = config.originalLanguage;
        }

        // Anime: Japanese animation
        if (config.originalLanguage === 'ja' && config.genreIds?.includes(16) && !genreId) {
            params.with_genres = '16';
            params.with_original_language = 'ja';
            delete params.with_keywords;
        }

        if (providerId) {
            params.with_watch_providers = String(providerId);
            params.watch_region = region || 'US';
            params.with_watch_monetization_types = 'flatrate|free|ads|rent|buy';
        }

        if (familyFriendly) {
            applyFamilyFriendlyDiscoverParams(params, type, { region, genreId });
        }

        let data;
        try {
            // eslint-disable-next-line no-await-in-loop
            data = await fetchTmdbApi(endpoint, params);
        } catch (err) {
            console.warn('[theme-browse] TMDB discover failed:', err.message);
            break;
        }

        totalResults = data?.total_results || totalResults;
        totalPages = data?.total_pages || totalPages;
        (data?.results || []).forEach((m) => {
            if (m?.id && m.poster_path && !m.adult) {
                rows.push({
                    ...mapTmdbToCard(m),
                    media_type: type,
                    adult: Boolean(m.adult),
                    release_date: m.release_date || m.first_air_date || null,
                    first_air_date: m.first_air_date || null,
                });
            }
        });

        if (p >= totalPages) break;
    }

    let out = rows;
    if (familyFriendly && type === 'movie') {
        out = rows.filter(isFamilySafeMovieCard);
    }

    return { rows: out, totalResults, totalPages };
}

/**
 * Walk discover pages and keep only family-safe TV (US content rating verified).
 */
async function gatherFamilyFriendlyTv(config, keywordIds, {
    limit,
    offset,
    sort = 'popular',
    providerId = null,
    region = 'US',
    genreId = null,
} = {}) {
    const need = offset + limit;
    const filtered = [];
    let page = 1;
    let totalPages = 1;
    let rawSeen = 0;
    let rawTotal = 0;
    const maxPages = 12;

    while (filtered.length < need && page <= totalPages && page <= maxPages) {
        // eslint-disable-next-line no-await-in-loop
        const batch = await discoverThemePages(config, keywordIds, {
            startPage: page,
            pageCount: 1,
            mediaType: 'tv',
            sort,
            providerId,
            region,
            familyFriendly: true,
            genreId,
        });
        totalPages = batch.totalPages || 1;
        rawTotal = batch.totalResults || rawTotal;
        rawSeen += batch.rows.length;

        // eslint-disable-next-line no-await-in-loop
        const safe = await filterTvRowsByUsContentRating(batch.rows, region);
        // Prefer Kids/Family-tagged shows when rating is borderline-OK
        const ranked = safe.sort((a, b) => {
            const aKids = cardGenreIds(a).some((id) => FAMILY_TV_SAFE_GENRES.has(id)) ? 1 : 0;
            const bKids = cardGenreIds(b).some((id) => FAMILY_TV_SAFE_GENRES.has(id)) ? 1 : 0;
            return bKids - aKids;
        });
        filtered.push(...ranked);
        page += 1;
        if (page > totalPages) break;
    }

    const exhausted = page > totalPages || page > maxPages;
    const keepRatio = rawSeen > 0 ? filtered.length / rawSeen : 0.25;
    const total = exhausted
        ? filtered.length
        : Math.max(filtered.length, Math.round(rawTotal * Math.min(Math.max(keepRatio, 0.1), 0.85)));

    return {
        data: filtered.slice(offset, offset + limit),
        total,
    };
}

async function enrichFromLibrary(cards) {
    if (!cards.length) return cards;
    const ids = cards.map((c) => String(c.tmdb_id));
    try {
        const supabase = getSupabase();
        const { data } = await supabase
            .from('movies_library')
            .select(LIBRARY_CARD_SELECT)
            .eq('media_type', 'movie')
            .eq('is_active', true)
            .in('tmdb_id', ids);

        if (!data?.length) return cards;
        const byId = new Map(data.map((row) => [String(row.tmdb_id), row]));
        return cards.map((card) => {
            const lib = byId.get(String(card.tmdb_id));
            return lib ? { ...card, ...lib, tmdb_id: String(lib.tmdb_id) } : card;
        });
    } catch (err) {
        console.warn('[theme-browse] library enrich failed:', err.message);
        return cards;
    }
}

/**
 * @param {string} themeId
 * @param {{ limit?: number, offset?: number, mediaType?: string, sort?: string, providerId?: number|string, region?: string, familyFriendly?: boolean }} [options]
 */
export async function fetchExploreByTheme(themeId, options = {}) {
    const config = await resolveThemeConfig(themeId);
    if (!config) {
        return { data: [], total: 0, error: 'Unknown theme' };
    }

    const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 60);
    const offset = Math.max(Number(options.offset) || 0, 0);
    const mediaType = options.mediaType === 'tv' ? 'tv' : 'movie';
    const familyFriendly = Boolean(options.familyFriendly);
    const discoverOpts = {
        mediaType,
        sort: options.sort || 'popular',
        providerId: options.providerId || null,
        region: options.region || 'US',
        familyFriendly,
    };

    const keywordIds = await resolveKeywordIds(config);

    // TV Family Friendly: verify US content ratings (discover cannot filter certs)
    if (familyFriendly && mediaType === 'tv') {
        const gathered = await gatherFamilyFriendlyTv(config, keywordIds, {
            limit,
            offset,
            sort: discoverOpts.sort,
            providerId: discoverOpts.providerId,
            region: discoverOpts.region,
        });
        const enriched = await enrichFromLibrary(gathered.data);
        return { data: enriched, total: gathered.total };
    }

    const startPage = Math.floor(offset / TMDB_PAGE_SIZE) + 1;
    const endOffset = offset + limit;
    const endPage = Math.ceil(endOffset / TMDB_PAGE_SIZE) || 1;
    const pageCount = Math.max(1, endPage - startPage + 1);

    const { rows, totalResults } = await discoverThemePages(config, keywordIds, {
        startPage,
        pageCount,
        ...discoverOpts,
    });

    // Slice to the requested window within the fetched pages
    const pageStart = offset % TMDB_PAGE_SIZE;
    let page = rows.slice(pageStart, pageStart + limit);

    // If first page was sparse (bad keyword), fall back to genre discover
    if (!page.length && config.genreIds?.length && keywordIds.length) {
        const fallback = await discoverThemePages(
            { ...config, keywordIds: [] },
            [],
            { startPage: 1, pageCount: Math.ceil(limit / TMDB_PAGE_SIZE), ...discoverOpts },
        );
        page = fallback.rows.slice(0, limit);
        const enriched = await enrichFromLibrary(page);
        return { data: enriched, total: fallback.totalResults || enriched.length };
    }

    const enriched = await enrichFromLibrary(page);
    return {
        data: enriched,
        total: totalResults || enriched.length,
    };
}

/**
 * Genre browse via TMDB Discover (same filters as themes).
 */
export async function fetchExploreByGenre(genreId, options = {}) {
    const gid = Number(genreId);
    if (!Number.isFinite(gid) || gid <= 0) {
        return { data: [], total: 0, error: 'Unknown genre' };
    }

    const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 60);
    const offset = Math.max(Number(options.offset) || 0, 0);
    const mediaType = options.mediaType === 'tv' ? 'tv' : 'movie';
    const familyFriendly = Boolean(options.familyFriendly);
    const discoverOpts = {
        mediaType,
        sort: options.sort || 'popular',
        providerId: options.providerId || null,
        region: options.region || 'US',
        familyFriendly,
        genreId: gid,
    };

    if (familyFriendly && mediaType === 'tv') {
        const gathered = await gatherFamilyFriendlyTv({}, [], {
            limit,
            offset,
            sort: discoverOpts.sort,
            providerId: discoverOpts.providerId,
            region: discoverOpts.region,
            genreId: gid,
        });
        const enriched = await enrichFromLibrary(gathered.data);
        return { data: enriched, total: gathered.total };
    }

    const startPage = Math.floor(offset / TMDB_PAGE_SIZE) + 1;
    const endPage = Math.ceil((offset + limit) / TMDB_PAGE_SIZE) || 1;
    const pageCount = Math.max(1, endPage - startPage + 1);

    const { rows, totalResults } = await discoverThemePages({}, [], {
        startPage,
        pageCount,
        ...discoverOpts,
    });

    const pageStart = offset % TMDB_PAGE_SIZE;
    const page = rows.slice(pageStart, pageStart + limit);
    const enriched = await enrichFromLibrary(page);
    return { data: enriched, total: totalResults || enriched.length };
}
