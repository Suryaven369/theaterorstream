/**
 * Production-Ready Content API
 * 
 * This module provides optimized, database-driven API functions
 * to replace direct TMDB API calls in the frontend.
 * 
 * All data comes from the Supabase database - NO TMDB API calls here.
 */

import { supabase } from './supabase';
import { MOVIES_LIBRARY_SELECT, MOVIE_DETAIL_SELECT } from './moviesLibrarySelect.js';

// =============================================
// CACHING LAYER
// =============================================

const cache = new Map();
const CACHE_TTL = {
    sections: 5 * 60 * 1000,     // 5 minutes for homepage sections
    genres: 60 * 60 * 1000,      // 1 hour for genre list
    trending: 10 * 60 * 1000,    // 10 minutes for trending
    library: 2 * 60 * 1000,      // 2 minutes for library queries
};

const getCached = (key, ttl) => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
        return cached.data;
    }
    return null;
};

const setCache = (key, data) => {
    cache.set(key, { data, timestamp: Date.now() });
};

export const clearCache = (keyPrefix = null) => {
    if (keyPrefix) {
        for (const key of cache.keys()) {
            if (key.startsWith(keyPrefix)) cache.delete(key);
        }
    } else {
        cache.clear();
    }
};

// =============================================
// GENRE CONSTANTS (From TMDB, stored locally)
// =============================================

export const MOVIE_GENRES = [
    { id: 28, name: "Action" },
    { id: 12, name: "Adventure" },
    { id: 16, name: "Animation" },
    { id: 35, name: "Comedy" },
    { id: 80, name: "Crime" },
    { id: 99, name: "Documentary" },
    { id: 18, name: "Drama" },
    { id: 10751, name: "Family" },
    { id: 14, name: "Fantasy" },
    { id: 36, name: "History" },
    { id: 27, name: "Horror" },
    { id: 10402, name: "Music" },
    { id: 9648, name: "Mystery" },
    { id: 10749, name: "Romance" },
    { id: 878, name: "Science Fiction" },
    { id: 53, name: "Thriller" },
    { id: 10752, name: "War" },
    { id: 37, name: "Western" },
];

export const TV_GENRES = [
    { id: 10759, name: "Action & Adventure", emoji: "💥" },
    { id: 16, name: "Animation", emoji: "🎨" },
    { id: 35, name: "Comedy", emoji: "😂" },
    { id: 80, name: "Crime", emoji: "🔍" },
    { id: 99, name: "Documentary", emoji: "🎬" },
    { id: 18, name: "Drama", emoji: "🎭" },
    { id: 10751, name: "Family", emoji: "👨‍👩‍👧‍👦" },
    { id: 10762, name: "Kids", emoji: "👶" },
    { id: 9648, name: "Mystery", emoji: "🕵️" },
    { id: 10764, name: "Reality", emoji: "📹" },
    { id: 10765, name: "Sci-Fi & Fantasy", emoji: "🚀" },
    { id: 10767, name: "Talk", emoji: "🎤" },
    { id: 10768, name: "War & Politics", emoji: "⚔️" },
    { id: 37, name: "Western", emoji: "🤠" },
];

// =============================================
// MOVIES API - Database Driven
// =============================================

/**
 * Get movies from database with advanced filtering
 * @param {Object} options - Filter options
 * @returns {Promise<{data: Array, total: number}>}
 */
export const getMoviesFromDb = async (options = {}) => {
    const {
        mediaType = null,        // 'movie' or 'tv'
        genreIds = [],           // Array of genre IDs to filter
        minRating = null,        // Minimum vote_average
        maxRating = null,        // Maximum vote_average
        yearFrom = null,         // Minimum release year
        yearTo = null,           // Maximum release year
        sortBy = 'popularity',   // 'popularity', 'vote_average', 'release_date', 'title'
        sortOrder = 'desc',      // 'asc' or 'desc'
        limit = 20,
        offset = 0,
        featured = null,         // Filter by featured status
        searchTerm = null,       // Search in title
        activeOnly = true,       // Only return is_active = true
    } = options;

    // Build cache key
    const cacheKey = `movies:${JSON.stringify(options)}`;
    const cached = getCached(cacheKey, CACHE_TTL.library);
    if (cached) return cached;

    let query = supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_SELECT, { count: 'exact' });

    // Apply filters
    if (activeOnly) query = query.eq('is_active', true);
    if (mediaType) query = query.eq('media_type', mediaType);
    if (featured !== null) query = query.eq('featured', featured);
    if (minRating) query = query.gte('vote_average', minRating);
    if (maxRating) query = query.lte('vote_average', maxRating);
    if (searchTerm) {
        const { buildLibrarySearchOrClause } = await import('./searchUtils.js');
        const orClause = buildLibrarySearchOrClause(searchTerm);
        if (orClause) query = query.or(orClause);
    }

    // Year filtering
    if (yearFrom) {
        query = query.gte('release_date', `${yearFrom}-01-01`);
    }
    if (yearTo) {
        query = query.lte('release_date', `${yearTo}-12-31`);
    }

    // Genre filtering (using JSONB contains)
    if (genreIds.length > 0) {
        // Filter where any of the genre IDs match
        const genreConditions = genreIds.map(id =>
            `genres @> '[{"id": ${id}}]'`
        ).join(' OR ');
        query = query.or(genreConditions);
    }

    // Sorting
    const isAsc = sortOrder === 'asc';
    switch (sortBy) {
        case 'popularity':
            query = query.order('popularity', { ascending: isAsc, nullsFirst: false });
            break;
        case 'vote_average':
            query = query.order('vote_average', { ascending: isAsc, nullsFirst: false });
            break;
        case 'release_date':
            query = query.order('release_date', { ascending: isAsc, nullsFirst: false });
            break;
        case 'title':
            query = query.order('title', { ascending: isAsc });
            break;
        default:
            query = query.order('popularity', { ascending: false, nullsFirst: false });
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
        console.error('Error fetching movies from DB:', error);
        return { data: [], total: 0, error };
    }

    const result = { data: data || [], total: count || 0 };
    setCache(cacheKey, result);
    return result;
};

/**
 * Get a single movie/TV show from database by TMDB ID
 */
export const getContentByTmdbId = async (tmdbId, mediaType = null) => {
    const cacheKey = `content:${tmdbId}:${mediaType || 'any'}`;
    const cached = getCached(cacheKey, CACHE_TTL.library);
    if (cached) return cached;

    // tmdb_id alone isn't unique — movie IDs and TV IDs are separate numbering
    // spaces in TMDB, so the same id can match a movie row AND a show row.
    // Filter by media_type when known so .single() doesn't error out on that
    // collision (it requires exactly one match).
    let query = supabase
        .from('movies_library')
        .select(MOVIE_DETAIL_SELECT)
        .eq('tmdb_id', tmdbId.toString())
        .eq('is_active', true);

    if (mediaType) {
        query = query.eq('media_type', mediaType);
    }

    const { data, error } = await query.single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching content:', error);
        return null;
    }

    if (data) {
        setCache(cacheKey, data);
    }
    return data;
};

// =============================================
// TV SERIES API - Database Driven
// =============================================

/**
 * Get TV series from database
 */
export const getTVSeriesFromDb = async (options = {}) => {
    return getMoviesFromDb({ ...options, mediaType: 'tv' });
};

/**
 * Get trending TV series (featured or high popularity)
 */
export const getTrendingTVFromDb = async (limit = 10) => {
    const cacheKey = `tv:trending:${limit}`;
    const cached = getCached(cacheKey, CACHE_TTL.trending);
    if (cached) return cached;

    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_SELECT)
        .eq('media_type', 'tv')
        .eq('is_active', true)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching trending TV:', error);
        return [];
    }

    setCache(cacheKey, data || []);
    return data || [];
};

/**
 * Get TV series by genre
 */
export const getTVByGenreFromDb = async (genreId, limit = 20) => {
    const cacheKey = `tv:genre:${genreId}:${limit}`;
    const cached = getCached(cacheKey, CACHE_TTL.library);
    if (cached) return cached;

    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_SELECT)
        .eq('media_type', 'tv')
        .eq('is_active', true)
        .contains('genres', [{ id: genreId }])
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching TV by genre:', error);
        return [];
    }

    setCache(cacheKey, data || []);
    return data || [];
};

// =============================================
// TV SECTIONS API
// =============================================

/**
 * Get TV sections from database (similar to homepage sections)
 */
export const getTVSections = async (activeOnly = true) => {
    const cacheKey = `tv:sections:${activeOnly}`;
    const cached = getCached(cacheKey, CACHE_TTL.sections);
    if (cached) return cached;

    let query = supabase
        .from('tv_sections')
        .select(MOVIES_LIBRARY_SELECT)
        .order('display_order', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching TV sections:', error);
        // Fall back to using homepage_sections with TV filter
        return getTVFromHomepageSections(activeOnly);
    }

    setCache(cacheKey, data || []);
    return data || [];
};

/**
 * Fallback: Get TV content from homepage sections
 */
const getTVFromHomepageSections = async (activeOnly = true) => {
    let query = supabase
        .from('homepage_sections')
        .select(MOVIES_LIBRARY_SELECT)
        .order('display_order', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error || !data) return [];

    // Filter sections to only include TV content
    return data.map(section => {
        const moviesByRegion = section.movies_by_region || {};
        const tvOnlyByRegion = {};

        Object.keys(moviesByRegion).forEach(region => {
            const movies = moviesByRegion[region] || [];
            tvOnlyByRegion[region] = movies.filter(m => m.media_type === 'tv');
        });

        return {
            ...section,
            movies_by_region: tvOnlyByRegion,
            shows_by_region: tvOnlyByRegion, // Alias for TV sections
        };
    }).filter(section => {
        // Only return sections that have TV content
        return Object.values(section.shows_by_region || {}).some(arr => arr.length > 0);
    });
};

// =============================================
// HOMEPAGE SECTIONS API (Optimized)
// =============================================

/**
 * Get homepage sections with embedded movie data
 * Uses caching for performance
 */
export const getHomepageSectionsOptimized = async (activeOnly = true) => {
    const cacheKey = `homepage:sections:${activeOnly}`;
    const cached = getCached(cacheKey, CACHE_TTL.sections);
    if (cached) return cached;

    let query = supabase
        .from('homepage_sections')
        .select(MOVIES_LIBRARY_SELECT)
        .order('display_order', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching homepage sections:', error);
        return [];
    }

    setCache(cacheKey, data || []);
    return data || [];
};

/**
 * Get sections for a specific region (optimized single call)
 */
export const getSectionsForRegion = async (regionCode, activeOnly = true) => {
    const sections = await getHomepageSectionsOptimized(activeOnly);

    return sections.map(section => ({
        ...section,
        movies: section.movies_by_region?.[regionCode] || section.movies || [],
    })).filter(section => section.movies.length > 0);
};

// =============================================
// SEARCH API - Database Driven
// =============================================

/**
 * Search content in database
 * Replaces TMDB search API
 */
export const searchContentFromDb = async (query, options = {}) => {
    const {
        mediaType = null,
        limit = 20,
        offset = 0,
    } = options;

    const term = (query || '').trim();
    if (term.length < 2) {
        return { data: [], total: 0 };
    }

    const cacheKey = `search:v4:${term}:${mediaType}:${limit}:${offset}`;
    const cached = getCached(cacheKey, CACHE_TTL.library);
    if (cached) return cached;

    const { buildLibrarySearchOrClause, rankLibrarySearchHits } = await import('./searchUtils.js');
    const orClause = buildLibrarySearchOrClause(term);

    const pool = Math.min(120, Math.max(60, limit * 4));
    let titleHits = [];

    if (orClause) {
        let dbQuery = supabase
            .from('movies_library')
            .select('tmdb_id, title, original_title, poster_path, backdrop_path, media_type, release_date, first_air_date, vote_average, popularity, overview, genres, runtime, number_of_seasons, number_of_episodes')
            .eq('is_active', true)
            .or(orClause)
            .order('popularity', { ascending: false, nullsFirst: false })
            .range(0, pool - 1);

        if (mediaType) dbQuery = dbQuery.eq('media_type', mediaType);

        const { data, error } = await dbQuery;
        if (error) {
            console.error('Error searching content:', error);
            return { data: [], total: 0, error };
        }
        titleHits = rankLibrarySearchHits(term, data || []);
    }

    let personHits = [];
    if (offset === 0) {
        personHits = await searchLibraryByPersonLocal(term, { mediaType, limit: Math.max(limit, 30) });
    }

    const seen = new Set();
    const merged = [];
    for (const row of [...titleHits, ...personHits]) {
        const id = String(row.tmdb_id || row.id);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push(row);
    }

    const result = { data: merged.slice(offset, offset + limit), total: merged.length };
    setCache(cacheKey, result);
    return result;
};

async function searchLibraryByPersonLocal(term, { mediaType = null, limit = 40 } = {}) {
    let people = [];
    try {
        const { tmdbFetch } = await import('./tmdbApi.js');
        const res = await tmdbFetch('/search/person', { query: term, include_adult: 'false' });
        const q = term.toLowerCase();
        people = (res?.results || [])
            .filter((p) => {
                const n = (p.name || '').toLowerCase();
                return n === q || n.includes(q) || q.includes(n) ||
                    q.split(/\s+/).every((t) => n.split(/\s+/).some((w) => w.startsWith(t) || t.startsWith(w)));
            })
            .slice(0, 2);
    } catch {
        return [];
    }
    if (!people.length) return [];

    const ids = new Set();
    const CREW_JOBS = new Set(['Director', 'Writer', 'Screenplay', 'Producer', 'Creator', 'Executive Producer']);

    await Promise.all(people.map(async (person) => {
        for (const k of person.known_for || []) {
            if (k?.id) ids.add(String(k.id));
        }
        try {
            const { tmdbFetch } = await import('./tmdbApi.js');
            const credits = await tmdbFetch(`/person/${person.id}/combined_credits`, {});
            for (const c of credits?.cast || []) if (c?.id) ids.add(String(c.id));
            for (const c of credits?.crew || []) {
                if (c?.id && CREW_JOBS.has(c.job)) ids.add(String(c.id));
            }
        } catch { /* known_for only */ }
    }));

    const idList = [...ids].slice(0, 80);
    if (!idList.length) return [];

    let dbQuery = supabase
        .from('movies_library')
        .select('tmdb_id, title, original_title, poster_path, backdrop_path, media_type, release_date, first_air_date, vote_average, popularity, overview, genres, runtime, number_of_seasons, number_of_episodes')
        .eq('is_active', true)
        .in('tmdb_id', idList)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (mediaType) dbQuery = dbQuery.eq('media_type', mediaType);

    const { data } = await dbQuery;
    return data || [];
}

/**
 * Search cast & crew via TMDB person search (fast).
 */
export const searchCastCrewFromDb = async (query) => {
    const term = (query || '').trim();
    if (term.length < 2) return [];

    try {
        const { tmdbFetch } = await import('./tmdbApi.js');
        const res = await tmdbFetch('/search/person', { query: term, include_adult: 'false' });
        return (res?.results || []).slice(0, 24).map((p) => {
            const kf = (p.known_for || [])[0];
            const dept = p.known_for_department || '';
            return {
                id: p.id,
                name: p.name,
                role: dept === 'Directing' ? 'Director' : dept === 'Acting' ? 'Actor' : dept || 'Person',
                profile_path: p.profile_path,
                known_for_movie: kf?.title || kf?.name || '',
                known_for_tmdb_id: kf?.id || null,
                media_type: kf?.media_type || 'movie',
            };
        });
    } catch {
        return [];
    }
};

/**
 * Quick search for autocomplete (lighter query)
 */
export const quickSearchFromDb = async (query, limit = 8) => {
    const term = (query || '').trim();
    if (term.length < 2) return [];

    const cacheKey = `quicksearch:v3:${term}:${limit}`;
    const cached = getCached(cacheKey, CACHE_TTL.library);
    if (cached) return cached;

    const { buildLibrarySearchOrClause, rankLibrarySearchHits } = await import('./searchUtils.js');
    const orClause = buildLibrarySearchOrClause(term);
    if (!orClause) return [];

    const { data, error } = await supabase
        .from('movies_library')
        .select('tmdb_id, title, poster_path, media_type, release_date, vote_average, popularity, original_title')
        .eq('is_active', true)
        .or(orClause)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(Math.min(80, Math.max(24, limit * 6)));

    if (error) {
        console.error('Error in quick search:', error);
        return [];
    }

    const ranked = rankLibrarySearchHits(term, data || []).slice(0, limit);
    setCache(cacheKey, ranked);
    return ranked;
};

// =============================================
// EXPLORE PAGE API
// =============================================

/**
 * Theme browse via TMDB Discover (client fallback when edge API is unavailable).
 * Mirrors api/_lib/theme-browse-server.js so Categories fill like Genres.
 */
const FAMILY_MOVIE_CERT_MAX = 'PG';
const FAMILY_TV_RATINGS = new Set(['TV-Y', 'TV-Y7', 'TV-Y7-FV', 'TV-G', 'TV-PG']);
const FAMILY_BLOCKED_MOVIE_GENRES = '27|53|80|10752';
const FAMILY_BLOCKED_TV_GENRES = '80|10768';
const FAMILY_MOVIE_BLOCKED_GENRE_SET = new Set([27, 53, 80, 10752]);

function mergeWithoutGenres(existing, blocked) {
    const parts = new Set(
        String(existing || '')
            .split('|')
            .map((s) => s.trim())
            .filter(Boolean),
    );
    String(blocked).split('|').forEach((id) => parts.add(id));
    return Array.from(parts).join('|');
}

function applyFamilyFriendlyDiscoverParams(params, type, { region = 'US', genreId = null } = {}) {
    params.include_adult = false;
    if (Number(params['vote_count.gte']) > 50) {
        params['vote_count.gte'] = 50;
    }

    if (type === 'movie') {
        params.certification_country = region || 'US';
        params['certification.lte'] = FAMILY_MOVIE_CERT_MAX;
        params.without_genres = mergeWithoutGenres(params.without_genres, FAMILY_BLOCKED_MOVIE_GENRES);
        return;
    }

    delete params.certification_country;
    delete params['certification.lte'];
    params.without_genres = mergeWithoutGenres(params.without_genres, FAMILY_BLOCKED_TV_GENRES);

    // Open browse only — genre/theme keep scope; US content ratings enforce safety.
    if (!genreId && !params.with_genres && !params.with_keywords) {
        params.with_genres = '10751|10762';
    }
}

function isFamilySafeMovieRow(row) {
    const ids = (row.genres || []).map((g) => Number(g?.id ?? g)).filter((n) => n > 0);
    return !ids.some((id) => FAMILY_MOVIE_BLOCKED_GENRE_SET.has(id));
}

async function filterTvRowsByUsContentRating(rows, tmdbFetch, region = 'US') {
    if (!rows.length) return [];
    const country = (region || 'US').toUpperCase();
    const checks = await Promise.all(
        rows.map(async (row) => {
            try {
                const data = await tmdbFetch(`/tv/${row.tmdb_id}/content_ratings`);
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
 * Theme browse via TMDB Discover (client fallback when edge API is unavailable).
 * Mirrors api/_lib/theme-browse-server.js so Categories fill like Genres.
 */
async function getExploreContentByTheme(themeId, {
    limit = 30,
    offset = 0,
    mediaType = 'movie',
    sort = 'popular',
    providerId = null,
    region = 'US',
    familyFriendly = false,
    genreId = null,
} = {}) {
    const { fetchPublicBrowseThemes } = await import('./browseThemes.js');
    const { getThemeConfig, THEME_POPULAR_VOTE_COUNT } = await import('../constants/searchCategories.js');
    const publicThemes = await fetchPublicBrowseThemes();
    const theme = themeId
        ? (publicThemes.find((t) => t.id === themeId) || getThemeConfig(themeId))
        : null;
    if (themeId && !theme && !genreId) return { data: [], total: 0 };

    const { tmdbFetch } = await import('./tmdbApi.js');
    const TMDB_PAGE_SIZE = 20;
    const keywordIds = (theme?.keywordIds || []).map(Number).filter((n) => n > 0);
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const endpoint = type === 'tv' ? '/discover/tv' : '/discover/movie';
    const sortBy = sort === 'newest'
        ? (type === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc')
        : sort === 'rating'
            ? 'vote_average.desc'
            : 'popularity.desc';

    const buildParams = (page) => {
        const params = {
            sort_by: sortBy,
            'vote_count.gte': sort === 'rating' ? 150 : THEME_POPULAR_VOTE_COUNT,
            include_adult: false,
            page,
        };

        if (genreId) {
            params.with_genres = Number(genreId);
        } else if (theme?.originalLanguage === 'ja' && theme.genreIds?.includes(16)) {
            params.with_genres = 16;
            params.with_original_language = 'ja';
        } else if (keywordIds.length) {
            params.with_keywords = String(keywordIds[0]);
        } else if (theme?.genreIds?.length) {
            params.with_genres = theme.genreIds.join('|');
        }

        if (theme?.originalLanguage && !params.with_original_language) {
            params.with_original_language = theme.originalLanguage;
        }
        if (providerId) {
            params.with_watch_providers = providerId;
            params.watch_region = region || 'US';
            params.with_watch_monetization_types = 'flatrate|free|ads|rent|buy';
        }
        if (familyFriendly) {
            applyFamilyFriendlyDiscoverParams(params, type, { region, genreId });
        }
        return params;
    };

    const mapRow = (m) => ({
        tmdb_id: String(m.id),
        id: String(m.id),
        title: m.title || m.name,
        poster_path: m.poster_path,
        backdrop_path: m.backdrop_path || null,
        media_type: type,
        release_date: m.release_date || m.first_air_date || null,
        vote_average: m.vote_average ?? null,
        popularity: m.popularity ?? 0,
        overview: m.overview || null,
        genres: (m.genre_ids || []).map((gid) => ({ id: gid })),
    });

    // TV Family Friendly: verify US content ratings (discover ignores certs for TV)
    if (familyFriendly && type === 'tv') {
        const need = offset + limit;
        const filtered = [];
        let page = 1;
        let totalPages = 1;
        let rawSeen = 0;
        let rawTotal = 0;
        const maxPages = 12;

        while (filtered.length < need && page <= totalPages && page <= maxPages) {
            let data;
            try {
                // eslint-disable-next-line no-await-in-loop
                data = await tmdbFetch(endpoint, buildParams(page));
            } catch (err) {
                console.error('Theme TMDB discover failed:', err);
                break;
            }
            totalPages = data?.total_pages || 1;
            rawTotal = data?.total_results || rawTotal;
            const batch = (data?.results || [])
                .filter((m) => m?.id && m.poster_path && !m.adult)
                .map(mapRow);
            rawSeen += batch.length;
            // eslint-disable-next-line no-await-in-loop
            const safe = await filterTvRowsByUsContentRating(batch, tmdbFetch, region);
            filtered.push(...safe);
            page += 1;
            if (page > totalPages) break;
        }

        const exhausted = page > totalPages || page > maxPages;
        const keepRatio = rawSeen > 0 ? filtered.length / rawSeen : 0.25;
        const total = exhausted
            ? filtered.length
            : Math.max(filtered.length, Math.round(rawTotal * Math.min(Math.max(keepRatio, 0.1), 0.85)));
        return { data: filtered.slice(offset, offset + limit), total };
    }

    const startPage = Math.floor(offset / TMDB_PAGE_SIZE) + 1;
    const endPage = Math.ceil((offset + limit) / TMDB_PAGE_SIZE) || 1;
    const rows = [];
    let totalResults = 0;

    for (let page = startPage; page <= endPage; page += 1) {
        let data;
        try {
            // eslint-disable-next-line no-await-in-loop
            data = await tmdbFetch(endpoint, buildParams(page));
        } catch (err) {
            console.error('Theme TMDB discover failed:', err);
            break;
        }

        totalResults = data?.total_results || totalResults;
        (data?.results || []).forEach((m) => {
            if (!m?.id || !m.poster_path || m.adult) return;
            rows.push(mapRow(m));
        });

        if (page >= (data?.total_pages || 1)) break;
    }

    const safeRows = familyFriendly && type === 'movie'
        ? rows.filter(isFamilySafeMovieRow)
        : rows;
    const pageStart = offset % TMDB_PAGE_SIZE;
    const data = safeRows.slice(pageStart, pageStart + limit);
    return { data, total: totalResults || data.length };
}

/**
 * Get content for explore page with category filtering
 */
export const getExploreContent = async (options = {}) => {
    const {
        mediaType = 'movie',
        category = 'popular',  // 'popular', 'top_rated', 'new_releases'
        genreId = null,
        theme = null,
        limit = 20,
        offset = 0,
    } = options;

    if (theme || (genreId && options.browse)) {
        const cacheKey = `explore:browse:${theme || ''}:${genreId || ''}:${mediaType}:${options.sort}:${options.providerId}:${options.familyFriendly}:${limit}:${offset}`;
        const cached = getCached(cacheKey, CACHE_TTL.library);
        if (cached) return cached;
        const result = await getExploreContentByTheme(theme, {
            limit,
            offset,
            mediaType,
            sort: options.sort || 'popular',
            providerId: options.providerId || null,
            region: options.region || 'US',
            familyFriendly: Boolean(options.familyFriendly),
            genreId: genreId || null,
        });
        setCache(cacheKey, result);
        return result;
    }

    const cacheKey = `explore:${mediaType}:${category}:${genreId}:${limit}:${offset}`;
    const cached = getCached(cacheKey, CACHE_TTL.library);
    if (cached) return cached;

    let query = supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_SELECT, { count: 'exact' })
        .eq('is_active', true)
        .eq('media_type', mediaType);

    // Genre filter — genre_ids int[] is canonical; genres JSONB is fallback
    if (genreId) {
        const gid = Number(genreId);
        query = query.or(`genre_ids.cs.{${gid}},genres.cs.[{"id": ${gid}}]`);
    }

    // Category-based sorting
    switch (category) {
        case 'popular':
            query = query.order('popularity', { ascending: false, nullsFirst: false });
            break;
        case 'top_rated':
            query = query
                .gte('vote_count', 50)  // Require minimum votes for top rated
                .order('vote_average', { ascending: false, nullsFirst: false });
            break;
        case 'new_releases':
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            query = query
                .gte('release_date', sixMonthsAgo.toISOString().split('T')[0])
                .order('release_date', { ascending: false, nullsFirst: false });
            break;
        default:
            query = query.order('popularity', { ascending: false, nullsFirst: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
        console.error('Error fetching explore content:', error);
        return { data: [], total: 0, error };
    }

    const result = { data: data || [], total: count || 0 };
    setCache(cacheKey, result);
    return result;
};

// =============================================
// UPCOMING CONTENT FROM DB
// =============================================

/** Slim fields for list/card views */
const UPCOMING_SELECT = 'tmdb_id, title, poster_path, backdrop_path, media_type, release_date, first_air_date, vote_average, popularity, overview';

/**
 * Normalize a movies_library row for frontend card components
 */
export const normalizeLibraryItem = (item) => {
    if (!item) return null;
    const releaseDate = item.release_date || item.first_air_date || null;
    return {
        ...item,
        id: item.tmdb_id,
        release_date: releaseDate,
    };
};

/**
 * Get upcoming movies/series from database
 * @param {Object} options
 * @param {string|null} options.mediaType - 'movie', 'tv', or null for both
 * @param {number} options.limit - Page size (default 24 for explore, use 500+ for calendar views)
 * @param {number} options.offset - Pagination offset
 * @param {number|null} options.yearFrom - Min release year (inclusive)
 * @param {number|null} options.yearTo - Max release year (inclusive)
 * @param {string|null} options.minReleaseDate - ISO date lower bound (overrides upcomingOnly)
 * @param {boolean} options.upcomingOnly - If true and no minReleaseDate, uses today
 * @param {boolean} options.fetchAll - Paginate until all matching rows are loaded (max 2000)
 */
export const getUpcomingFromDb = async (options = {}) => {
    const {
        mediaType = null,
        limit = 24,
        offset = 0,
        yearFrom = null,
        yearTo = null,
        minReleaseDate = null,
        upcomingOnly = false,
        fetchAll = false,
    } = options;

    const today = new Date().toISOString().split('T')[0];
    const hasCalendarRange = yearFrom != null || yearTo != null || minReleaseDate != null;
    const effectiveMinDate = minReleaseDate ?? ((upcomingOnly || !hasCalendarRange) ? today : null);

    const cacheKey = `upcoming:${JSON.stringify(options)}`;
    const cached = getCached(cacheKey, CACHE_TTL.library);
    if (cached) return cached;

    const buildQuery = (rangeFrom, rangeTo) => {
        let query = supabase
            .from('movies_library')
            .select(UPCOMING_SELECT, { count: 'exact' })
            .eq('is_active', true)
            .not('release_date', 'is', null)
            .order('release_date', { ascending: true, nullsFirst: false })
            .order('popularity', { ascending: false, nullsFirst: false });

        if (effectiveMinDate) {
            query = query.gte('release_date', effectiveMinDate);
        }
        if (yearFrom) {
            query = query.gte('release_date', `${yearFrom}-01-01`);
        }
        if (yearTo) {
            query = query.lte('release_date', `${yearTo}-12-31`);
        }
        if (mediaType) {
            query = query.eq('media_type', mediaType);
        }

        return query.range(rangeFrom, rangeTo);
    };

    const PAGE_SIZE = 500;
    const MAX_ROWS = 2000;

    if (!fetchAll) {
        const { data, error, count } = await buildQuery(offset, offset + limit - 1);

        if (error) {
            console.error('Error fetching upcoming from DB:', error);
            return { data: [], total: 0, error };
        }

        const result = {
            data: (data || []).map(normalizeLibraryItem),
            total: count || 0,
        };
        setCache(cacheKey, result);
        return result;
    }

    // Fetch all pages for calendar-style views
    let allData = [];
    let total = 0;
    let pageOffset = 0;

    while (pageOffset < MAX_ROWS) {
        const { data, error, count } = await buildQuery(pageOffset, pageOffset + PAGE_SIZE - 1);

        if (error) {
            console.error('Error fetching upcoming from DB:', error);
            return { data: allData.map(normalizeLibraryItem), total: allData.length, error };
        }

        total = count || 0;
        const batch = data || [];
        allData = allData.concat(batch);

        if (batch.length < PAGE_SIZE || allData.length >= total) break;
        pageOffset += PAGE_SIZE;
    }

    const result = {
        data: allData.map(normalizeLibraryItem),
        total,
    };
    setCache(cacheKey, result);
    return result;
};

// =============================================
// FEATURED & TRENDING API
// =============================================

/**
 * Get featured content (admin-curated)
 */
export const getFeaturedContent = async (mediaType = null, limit = 10) => {
    const cacheKey = `featured:${mediaType}:${limit}`;
    const cached = getCached(cacheKey, CACHE_TTL.trending);
    if (cached) return cached;

    let query = supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_SELECT)
        .eq('is_active', true)
        .eq('featured', true)
        .order('priority', { ascending: false, nullsFirst: false })
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (mediaType) {
        query = query.eq('media_type', mediaType);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching featured content:', error);
        return [];
    }

    setCache(cacheKey, data || []);
    return data || [];
};

/**
 * Get trending content by popularity
 */
export const getTrendingContent = async (mediaType = null, limit = 20) => {
    const cacheKey = `trending:${mediaType}:${limit}`;
    const cached = getCached(cacheKey, CACHE_TTL.trending);
    if (cached) return cached;

    let query = supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_SELECT)
        .eq('is_active', true)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (mediaType) {
        query = query.eq('media_type', mediaType);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching trending content:', error);
        return [];
    }

    setCache(cacheKey, data || []);
    return data || [];
};

// =============================================
// UTILITY FUNCTIONS
// =============================================

/**
 * Get all available genres from database content
 */
export const getAvailableGenres = async (mediaType = null) => {
    // Return static genres based on media type
    if (mediaType === 'tv') return TV_GENRES;
    if (mediaType === 'movie') return MOVIE_GENRES;
    return [...MOVIE_GENRES, ...TV_GENRES];
};

/**
 * Get content stats
 */
export const getContentStats = async () => {
    const cacheKey = 'stats:content';
    const cached = getCached(cacheKey, CACHE_TTL.sections);
    if (cached) return cached;

    const { data } = await supabase
        .from('movies_library')
        .select('media_type, is_active, featured')
        .eq('is_active', true);

    if (!data) return { movies: 0, tv: 0, featured: 0 };

    const stats = {
        movies: data.filter(m => m.media_type === 'movie').length,
        tv: data.filter(m => m.media_type === 'tv').length,
        featured: data.filter(m => m.featured).length,
        total: data.length,
    };

    setCache(cacheKey, stats);
    return stats;
};

/**
 * Check if content exists in library
 */
export const checkContentExists = async (tmdbId) => {
    const { data } = await supabase
        .from('movies_library')
        .select('tmdb_id')
        .eq('tmdb_id', tmdbId.toString())
        .single();

    return !!data;
};

export default {
    // Movies
    getMoviesFromDb,
    getContentByTmdbId,

    // TV Series
    getTVSeriesFromDb,
    getTrendingTVFromDb,
    getTVByGenreFromDb,
    getTVSections,

    // Homepage
    getHomepageSectionsOptimized,
    getSectionsForRegion,

    // Search
    searchContentFromDb,
    quickSearchFromDb,

    // Explore
    getExploreContent,

    // Upcoming
    getUpcomingFromDb,

    // Featured & Trending
    getFeaturedContent,
    getTrendingContent,

    // Utilities
    getAvailableGenres,
    getContentStats,
    checkContentExists,
    clearCache,

    // Constants
    MOVIE_GENRES,
    TV_GENRES,
};
