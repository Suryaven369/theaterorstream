import { createClient } from '@supabase/supabase-js';
import { buildLibrarySearchOrClause } from './search-utils.js';

export const LIBRARY_CARD_SELECT =
    'tmdb_id, title, poster_path, backdrop_path, media_type, release_date, first_air_date, vote_average, overview, genres, runtime, number_of_seasons, number_of_episodes';

export const MOVIE_DETAIL_SELECT =
    'tmdb_id, title, original_title, overview, tagline, poster_path, backdrop_path, media_type, release_date, first_air_date, status, runtime, vote_average, vote_count, popularity, genres, certification, custom_parent_guide, custom_vibes, streaming_platforms, editor_review, editor_rating, credits, videos, number_of_seasons, number_of_episodes, networks, imdb_id, homepage, production_companies, spoken_languages, belongs_to_collection, adult, budget, revenue';

export function getSupabase() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
    }

    return createClient(supabaseUrl, supabaseKey);
}

export function jsonResponse(data, cacheControl) {
    return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': cacheControl,
        },
    });
}

export function errorResponse(message, status = 500) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        },
    });
}

export function normalizeLibraryItem(item) {
    if (!item) return null;
    return {
        ...item,
        id: item.tmdb_id,
        release_date: item.release_date || item.first_air_date || null,
    };
}

async function getBatchMovieRatings(supabase, movieIds) {
    if (!movieIds?.length) return new Map();

    const { data, error } = await supabase
        .from('ratings')
        .select('movie_id, acting, screenplay, sound, direction, entertainment, pacing, cinematography')
        .in('movie_id', movieIds.map((id) => String(id)));

    if (error || !data?.length) return new Map();

    const ratingsByMovie = new Map();
    data.forEach((rating) => {
        const movieId = String(rating.movie_id);
        if (!ratingsByMovie.has(movieId)) ratingsByMovie.set(movieId, []);
        ratingsByMovie.get(movieId).push(rating);
    });

    const result = new Map();
    const categories = ['acting', 'screenplay', 'sound', 'direction', 'entertainment', 'pacing', 'cinematography'];

    ratingsByMovie.forEach((ratings, movieId) => {
        let totalSum = 0;
        let totalCount = 0;

        categories.forEach((cat) => {
            const validRatings = ratings.filter((r) => r[cat] != null);
            if (validRatings.length > 0) {
                totalSum += validRatings.reduce((sum, r) => sum + r[cat], 0) / validRatings.length;
                totalCount += 1;
            }
        });

        if (totalCount > 0) {
            result.set(movieId, {
                score: totalSum / totalCount,
                count: ratings.length,
            });
        }
    });

    return result;
}

async function hydrateSections(supabase, sections) {
    if (!sections?.length) return [];

    const tmdbIdsToFetch = new Set();
    sections.forEach((section) => {
        if (!section.movies_by_region) return;
        Object.values(section.movies_by_region).forEach((movieList) => {
            if (!Array.isArray(movieList)) return;
            movieList.forEach((movie) => {
                if (movie.tmdb_id) tmdbIdsToFetch.add(String(movie.tmdb_id));
            });
        });
    });

    if (tmdbIdsToFetch.size === 0) return sections;

    const { data: globalMovies, error: libError } = await supabase
        .from('movies_library')
        .select(LIBRARY_CARD_SELECT)
        .in('tmdb_id', Array.from(tmdbIdsToFetch));

    if (libError) return sections;

    const movieMap = new Map();
    globalMovies?.forEach((m) => movieMap.set(String(m.tmdb_id), m));

    const ratingsMap = await getBatchMovieRatings(supabase, Array.from(tmdbIdsToFetch));

    return sections.map((section) => {
        if (!section.movies_by_region) return section;

        const hydratedMoviesByRegion = {};
        Object.keys(section.movies_by_region).forEach((regionCode) => {
            const rawMovies = section.movies_by_region[regionCode] || [];
            hydratedMoviesByRegion[regionCode] = rawMovies.map((rawMovie) => {
                const globalMovie = movieMap.get(String(rawMovie.tmdb_id));
                const tosRating = ratingsMap.get(String(rawMovie.tmdb_id));

                if (globalMovie) {
                    return {
                        ...rawMovie,
                        ...globalMovie,
                        release_date: globalMovie.release_date || globalMovie.first_air_date || rawMovie.release_date,
                        tos_rating: tosRating || null,
                    };
                }

                return {
                    ...rawMovie,
                    tos_rating: tosRating || null,
                };
            });
        });

        return {
            ...section,
            movies_by_region: hydratedMoviesByRegion,
        };
    });
}

export async function fetchHomepageSections(activeOnly = true) {
    const supabase = getSupabase();

    let query = supabase
        .from('homepage_sections')
        .select('*')
        .order('display_order', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data: sections, error } = await query;
    if (error) throw error;

    return hydrateSections(supabase, sections || []);
}

export async function fetchTVSections(activeOnly = true) {
    const supabase = getSupabase();

    let query = supabase
        .from('tv_sections')
        .select('*')
        .order('display_order', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data: sections, error } = await query;

    if (error) {
        if (error.code === '42P01') {
            return fetchHomepageSections(activeOnly);
        }
        throw error;
    }

    return hydrateSections(supabase, sections || []);
}

export async function fetchUpcoming(options = {}) {
    const supabase = getSupabase();
    const {
        yearFrom = null,
        yearTo = null,
        minReleaseDate = null,
        mediaType = null,
        limit = 24,
        offset = 0,
        fetchAll = false,
    } = options;

    const today = new Date().toISOString().split('T')[0];
    const hasCalendarRange = yearFrom != null || yearTo != null || minReleaseDate != null;
    const effectiveMinDate = minReleaseDate ?? (hasCalendarRange ? null : today);

    const buildQuery = (rangeFrom, rangeTo) => {
        let query = supabase
            .from('movies_library')
            .select(LIBRARY_CARD_SELECT, { count: 'exact' })
            .eq('is_active', true)
            .not('release_date', 'is', null)
            .order('release_date', { ascending: true, nullsFirst: false })
            .order('popularity', { ascending: false, nullsFirst: false });

        if (effectiveMinDate) query = query.gte('release_date', effectiveMinDate);
        if (yearFrom) query = query.gte('release_date', `${yearFrom}-01-01`);
        if (yearTo) query = query.lte('release_date', `${yearTo}-12-31`);
        if (mediaType) query = query.eq('media_type', mediaType);

        return query.range(rangeFrom, rangeTo);
    };

    if (!fetchAll) {
        const { data, error, count } = await buildQuery(offset, offset + limit - 1);
        if (error) throw error;
        return {
            data: (data || []).map(normalizeLibraryItem),
            total: count || 0,
        };
    }

    const PAGE_SIZE = 500;
    const MAX_ROWS = 2000;
    let allData = [];
    let total = 0;
    let pageOffset = 0;

    while (pageOffset < MAX_ROWS) {
        const { data, error, count } = await buildQuery(pageOffset, pageOffset + PAGE_SIZE - 1);
        if (error) throw error;

        total = count || 0;
        const batch = data || [];
        allData = allData.concat(batch);

        if (batch.length < PAGE_SIZE || allData.length >= total) break;
        pageOffset += PAGE_SIZE;
    }

    return {
        data: allData.map(normalizeLibraryItem),
        total,
    };
}

export async function fetchMovieDetail(tmdbId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIE_DETAIL_SELECT)
        .eq('tmdb_id', String(tmdbId))
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }

    return data;
}

export async function searchContent(query, options = {}) {
    const supabase = getSupabase();
    const { mediaType = null, limit = 20, offset = 0 } = options;

    const term = (query || '').trim();
    if (term.length < 2) {
        return { data: [], total: 0 };
    }

    const orClause = buildLibrarySearchOrClause(term);
    if (!orClause) {
        return { data: [], total: 0 };
    }

    let dbQuery = supabase
        .from('movies_library')
        .select(LIBRARY_CARD_SELECT, { count: 'exact' })
        .eq('is_active', true)
        .or(orClause)
        .order('popularity', { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

    if (mediaType) {
        dbQuery = dbQuery.eq('media_type', mediaType);
    }

    const { data, error, count } = await dbQuery;
    if (error) throw error;

    return {
        data: (data || []).map(normalizeLibraryItem),
        total: count || 0,
    };
}

export async function fetchExploreContent(options = {}) {
    const supabase = getSupabase();
    const {
        mediaType = 'movie',
        category = 'popular',
        genreId = null,
        limit = 20,
        offset = 0,
    } = options;

    let query = supabase
        .from('movies_library')
        .select(LIBRARY_CARD_SELECT, { count: 'exact' })
        .eq('is_active', true)
        .eq('media_type', mediaType);

    if (genreId) {
        query = query.contains('genres', [{ id: Number(genreId) }]);
    }

    switch (category) {
        case 'top_rated':
            query = query
                .gte('vote_count', 50)
                .order('vote_average', { ascending: false, nullsFirst: false });
            break;
        case 'new_releases':
            {
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                query = query
                    .gte('release_date', sixMonthsAgo.toISOString().split('T')[0])
                    .order('release_date', { ascending: false, nullsFirst: false });
            }
            break;
        case 'popular':
        default:
            query = query.order('popularity', { ascending: false, nullsFirst: false });
            break;
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    return {
        data: (data || []).map(normalizeLibraryItem),
        total: count || 0,
    };
}

export async function fetchTrendingContent(mediaType = null, limit = 20) {
    const supabase = getSupabase();

    let query = supabase
        .from('movies_library')
        .select(LIBRARY_CARD_SELECT)
        .eq('is_active', true)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (mediaType) {
        query = query.eq('media_type', mediaType);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(normalizeLibraryItem);
}
