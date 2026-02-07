/**
 * Production-Ready Content API
 * 
 * This module provides optimized, database-driven API functions
 * to replace direct TMDB API calls in the frontend.
 * 
 * All data comes from the Supabase database - NO TMDB API calls here.
 */

import { supabase } from './supabase';

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
        .select('*', { count: 'exact' });

    // Apply filters
    if (activeOnly) query = query.eq('is_active', true);
    if (mediaType) query = query.eq('media_type', mediaType);
    if (featured !== null) query = query.eq('featured', featured);
    if (minRating) query = query.gte('vote_average', minRating);
    if (maxRating) query = query.lte('vote_average', maxRating);
    if (searchTerm) query = query.ilike('title', `%${searchTerm}%`);

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
export const getContentByTmdbId = async (tmdbId) => {
    const cacheKey = `content:${tmdbId}`;
    const cached = getCached(cacheKey, CACHE_TTL.library);
    if (cached) return cached;

    const { data, error } = await supabase
        .from('movies_library')
        .select('*')
        .eq('tmdb_id', tmdbId.toString())
        .eq('is_active', true)
        .single();

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
        .select('*')
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
        .select('*')
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
        .select('*')
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
        .select('*')
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
        .select('*')
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
        mediaType = null,  // null = search all, 'movie' or 'tv'
        limit = 20,
        offset = 0,
    } = options;

    if (!query || query.trim().length < 2) {
        return { data: [], total: 0 };
    }

    const cacheKey = `search:${query}:${mediaType}:${limit}:${offset}`;
    const cached = getCached(cacheKey, CACHE_TTL.library);
    if (cached) return cached;

    let dbQuery = supabase
        .from('movies_library')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .ilike('title', `%${query}%`)
        .order('popularity', { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

    if (mediaType) {
        dbQuery = dbQuery.eq('media_type', mediaType);
    }

    const { data, error, count } = await dbQuery;

    if (error) {
        console.error('Error searching content:', error);
        return { data: [], total: 0, error };
    }

    const result = { data: data || [], total: count || 0 };
    setCache(cacheKey, result);
    return result;
};

/**
 * Quick search for autocomplete (lighter query)
 */
export const quickSearchFromDb = async (query, limit = 8) => {
    if (!query || query.trim().length < 2) return [];

    const cacheKey = `quicksearch:${query}:${limit}`;
    const cached = getCached(cacheKey, CACHE_TTL.library);
    if (cached) return cached;

    const { data, error } = await supabase
        .from('movies_library')
        .select('tmdb_id, title, poster_path, media_type, release_date, vote_average')
        .eq('is_active', true)
        .ilike('title', `%${query}%`)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (error) {
        console.error('Error in quick search:', error);
        return [];
    }

    setCache(cacheKey, data || []);
    return data || [];
};

// =============================================
// EXPLORE PAGE API
// =============================================

/**
 * Get content for explore page with category filtering
 */
export const getExploreContent = async (options = {}) => {
    const {
        mediaType = 'movie',
        category = 'popular',  // 'popular', 'top_rated', 'new_releases'
        genreId = null,
        limit = 20,
        offset = 0,
    } = options;

    const cacheKey = `explore:${mediaType}:${category}:${genreId}:${limit}:${offset}`;
    const cached = getCached(cacheKey, CACHE_TTL.library);
    if (cached) return cached;

    let query = supabase
        .from('movies_library')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .eq('media_type', mediaType);

    // Genre filter
    if (genreId) {
        query = query.contains('genres', [{ id: genreId }]);
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

/**
 * Get upcoming movies/series from database (release_date >= today)
 */
export const getUpcomingFromDb = async (options = {}) => {
    const {
        mediaType = null,    // 'movie', 'tv', or null for both
        limit = 24,
        offset = 0,
    } = options;

    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `upcoming:${mediaType}:${limit}:${offset}`;
    const cached = getCached(cacheKey, CACHE_TTL.library);
    if (cached) return cached;

    let query = supabase
        .from('movies_library')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .gte('release_date', today)
        .order('release_date', { ascending: true, nullsFirst: false });

    if (mediaType) {
        query = query.eq('media_type', mediaType);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
        console.error('Error fetching upcoming from DB:', error);
        return { data: [], total: 0, error };
    }

    const result = { data: data || [], total: count || 0 };
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
        .select('*')
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
        .select('*')
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
