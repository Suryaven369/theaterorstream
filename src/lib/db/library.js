import {
    MOVIES_LIBRARY_LIST_SELECT,
    MOVIE_DETAIL_SELECT,
    LIBRARY_UPSERT_SELECT,
} from '../moviesLibrarySelect.js';
import { upsertMoviesViaAdminApi } from '../adminLibraryApi.js';
import { dedupeLibraryRecords, upsertMoviesLibrary } from '../libraryDedupe.js';
import { supabase } from '../supabaseClient.js';
import { pickBestPosterPath } from '../../utils/imageHelper.js';

const stripImagesBase64 = (images) => {
    if (!images || typeof images !== 'object' || Array.isArray(images)) return images;
    const { poster_base64, backdrop_base64, ...clean } = images;
    return clean;
};

const stripCreditsBase64 = (credits) => {
    if (!credits) return credits;
    const stripPerson = ({ profile_base64, ...rest }) => rest;
    return {
        ...credits,
        cast: credits.cast?.map(stripPerson),
        crew: credits.crew?.map(stripPerson),
    };
};

// =============================================
// ADMIN - Movies Library Functions
// =============================================

// Get all movies from library
export const getMoviesLibrary = async (options = {}) => {
    const { mediaType, featured, collectionTag, displaySection, limit = 100, offset = 0 } = options;

    let query = supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_LIST_SELECT)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (mediaType) query = query.eq('media_type', mediaType);
    if (featured !== undefined) query = query.eq('featured', featured);
    if (collectionTag) query = query.contains('collection_tags', [collectionTag]);
    if (displaySection) query = query.contains('display_sections', [displaySection]);

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching movies library:', error);
        return [];
    }
    return data || [];
};

// Get movies by collection tag
export const getMoviesByCollection = async (collectionTag, limit = 20) => {
    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_LIST_SELECT)
        .eq('is_active', true)
        .contains('collection_tags', [collectionTag])
        .order('priority', { ascending: false })
        .limit(limit);

    if (error) return [];
    return data || [];
};

// Get movies by display section
export const getMoviesByDisplaySection = async (section, limit = 20) => {
    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_LIST_SELECT)
        .eq('is_active', true)
        .contains('display_sections', [section])
        .order('priority', { ascending: false })
        .limit(limit);

    if (error) return [];
    return data || [];
};

// Get movie from library by TMDB ID (detail payload — credits/videos for editor/UI)
export const getMovieFromLibrary = async (tmdbId) => {
    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIE_DETAIL_SELECT)
        .eq('tmdb_id', tmdbId.toString())
        .single();

    if (error) return null;
    return data;
};

function sanitizeLibraryRecord(record) {
    const clean = { ...record };
    if (clean.tmdb_id != null) clean.tmdb_id = String(clean.tmdb_id);
    if (clean.release_date === '') delete clean.release_date;
    if (clean.first_air_date === '') delete clean.first_air_date;
    if (clean.last_air_date === '') delete clean.last_air_date;
    Object.keys(clean).forEach((key) => {
        if (clean[key] === undefined) delete clean[key];
    });
    return clean;
}

const LIBRARY_UPSERT_CHUNK_SIZE = 40;

async function upsertLibraryChunk(records) {
    const { data, error } = await upsertMoviesLibrary(
        supabase,
        records,
        LIBRARY_UPSERT_SELECT,
    );

    if (error) {
        return { success: false, error, data: [] };
    }

    return { success: true, data: data || [], error: null };
}

/**
 * Upsert one or many library rows. Never deletes other titles — each row is keyed by tmdb_id.
 */
async function persistLibraryRecords(records) {
    const rawList = (Array.isArray(records) ? records : [records]).map(sanitizeLibraryRecord);
    const normalized = dedupeLibraryRecords(rawList);
    const duplicatesSkipped = rawList.length - normalized.length;

    if (!normalized.length) {
        return { success: false, error: new Error('No records to save') };
    }

    let apiResult = null;
    try {
        apiResult = await upsertMoviesViaAdminApi(normalized);
    } catch (error) {
        console.warn('Admin library API save failed:', error.message);
        if (error.message?.includes('Admin sign-in')) {
            return { success: false, error };
        }
    }

    if (apiResult?.success) {
        return {
            ...apiResult,
            savedCount: apiResult.savedCount ?? apiResult.data?.length ?? normalized.length,
            duplicatesSkipped,
        };
    }

    const savedRows = [];
    for (let i = 0; i < normalized.length; i += LIBRARY_UPSERT_CHUNK_SIZE) {
        const chunk = normalized.slice(i, i + LIBRARY_UPSERT_CHUNK_SIZE);
        const result = await upsertLibraryChunk(chunk);
        if (!result.success) {
            console.error('Error saving to movies_library:', result.error);
            return {
                success: false,
                error: result.error,
                savedCount: savedRows.length,
                partial: savedRows.length > 0,
            };
        }
        savedRows.push(...result.data);
    }

    return {
        success: true,
        data: savedRows,
        savedCount: savedRows.length,
        duplicatesSkipped,
    };
}

// Save movie to library (from TMDB data)
export const saveMovieToLibrary = async (movieData, mediaType = 'movie', additionalData = {}) => {
    const movieRecord = {
        tmdb_id: movieData.id.toString(),
        media_type: mediaType,
        title: movieData.title || movieData.name,
        original_title: movieData.original_title || movieData.original_name,
        overview: movieData.overview,
        tagline: movieData.tagline,
        poster_path: movieData.poster_path,
        backdrop_path: movieData.backdrop_path,
        release_date: movieData.release_date || movieData.first_air_date,
        status: movieData.status,
        runtime: movieData.runtime || movieData.episode_run_time?.[0],
        vote_average: movieData.vote_average,
        vote_count: movieData.vote_count,
        popularity: movieData.popularity,
        genres: movieData.genres || (movieData.genre_ids ? movieData.genre_ids.map(id => ({ id })) : null),
        production_companies: movieData.production_companies,
        production_countries: movieData.production_countries,
        spoken_languages: movieData.spoken_languages,
        imdb_id: movieData.imdb_id,
        homepage: movieData.homepage,
        budget: movieData.budget,
        revenue: movieData.revenue,
        is_active: true,
        synced_at: new Date().toISOString(),
        ...additionalData
    };

    return persistLibraryRecords(movieRecord);
};

// Bulk save movies to library
export const bulkSaveMoviesToLibrary = async (moviesArray, mediaType = 'movie', additionalData = {}) => {
    const movieRecords = moviesArray.map(movie => ({
        tmdb_id: movie.id.toString(),
        // Mixed lists (e.g. TMDB "trending/all") tag each item with its own media_type;
        // that must win over the single mediaType passed in, or TV shows get saved as movies.
        media_type: movie.media_type || mediaType,
        title: movie.title || movie.name,
        original_title: movie.original_title || movie.original_name,
        overview: movie.overview,
        poster_path: movie.poster_path,
        backdrop_path: movie.backdrop_path,
        release_date: movie.release_date || movie.first_air_date,
        vote_average: movie.vote_average,
        vote_count: movie.vote_count,
        popularity: movie.popularity,
        genres: movie.genre_ids ? movie.genre_ids.map(id => ({ id })) : movie.genres,
        is_active: true,
        synced_at: new Date().toISOString(),
        ...additionalData
    }));

    return persistLibraryRecords(movieRecords);
};

// Update movie in library
export const updateMovieInLibrary = async (tmdbId, updates) => {
    const { data, error } = await supabase
        .from('movies_library')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('tmdb_id', tmdbId.toString())
        .select();

    if (error) {
        console.error('Error updating movie:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Delete movie from library
export const deleteMovieFromLibrary = async (tmdbId) => {
    const { error } = await supabase
        .from('movies_library')
        .delete()
        .eq('tmdb_id', tmdbId.toString());

    if (error) {
        console.error('Error deleting movie:', error);
        return { success: false, error };
    }
    return { success: true };
};

// Toggle featured status
export const toggleMovieFeatured = async (tmdbId) => {
    const movie = await getMovieFromLibrary(tmdbId);
    if (!movie) return { success: false, error: 'Movie not found' };

    return updateMovieInLibrary(tmdbId, { featured: !movie.featured });
};

// Toggle active status
export const toggleMovieActive = async (tmdbId) => {
    const movie = await getMovieFromLibrary(tmdbId);
    if (!movie) return { success: false, error: 'Movie not found' };

    return updateMovieInLibrary(tmdbId, { is_active: !movie.is_active });
};

// Add/remove collection tag
export const updateMovieCollections = async (tmdbId, collectionTags) => {
    return updateMovieInLibrary(tmdbId, { collection_tags: collectionTags });
};

// Add/remove display section
export const updateMovieDisplaySections = async (tmdbId, displaySections) => {
    return updateMovieInLibrary(tmdbId, { display_sections: displaySections });
};

// Update streaming platforms
export const updateMovieStreamingPlatforms = async (tmdbId, platforms) => {
    return updateMovieInLibrary(tmdbId, { streaming_platforms: platforms });
};

// Update custom vibe meter
export const updateMovieVibes = async (tmdbId, vibes) => {
    return updateMovieInLibrary(tmdbId, { custom_vibes: vibes });
};

// Update custom parent guide
export const updateMovieParentGuide = async (tmdbId, parentGuide, certification = null) => {
    const updates = { custom_parent_guide: parentGuide };
    if (certification) updates.certification = certification;
    return updateMovieInLibrary(tmdbId, updates);
};

/**
 * Browse titles by parent-guide category (violence, nudity, …).
 * Only returns rows where the category level is mild|moderate|severe (never none).
 */
export const getMoviesByParentGuide = async (categoryKey, options = {}) => {
    const { level = null, limit = 48, offset = 0 } = options;
    const allowed = ['violence', 'nudity', 'profanity', 'frightening'];
    if (!allowed.includes(categoryKey)) return { data: [], total: 0 };

    const path = `custom_parent_guide->>${categoryKey}`;
    const levels = level && ['mild', 'moderate', 'severe'].includes(level)
        ? [level]
        : ['mild', 'moderate', 'severe'];

    let query = supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_LIST_SELECT, { count: 'exact' })
        .eq('is_active', true)
        .in(path, levels)
        .order('popularity', { ascending: false })
        .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
        console.error('Error fetching parent-guide movies:', error);
        return { data: [], total: 0 };
    }

    const rows = (data || []).map((m) => ({
        ...m,
        id: m.tmdb_id ?? m.id,
    }));

    return { data: rows, total: count ?? rows.length };
};

// Update editor review
export const updateMovieEditorReview = async (tmdbId, review, rating = null) => {
    const updates = { editor_review: review };
    if (rating !== null) updates.editor_rating = rating;
    return updateMovieInLibrary(tmdbId, updates);
};

// Search movies in library
export const searchMoviesLibrary = async (searchTerm, activeOnly = false) => {
    const { buildLibrarySearchOrClause, rankLibrarySearchHits } = await import('../searchUtils.js');
    const orClause = buildLibrarySearchOrClause(searchTerm);
    if (!orClause) return [];

    let query = supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_LIST_SELECT)
        .or(orClause)
        .order('popularity', { ascending: false })
        .limit(100);

    if (activeOnly) query = query.eq('is_active', true);

    const { data, error } = await query;

    if (error) {
        console.error('Error searching library:', error);
        return [];
    }
    return rankLibrarySearchHits(searchTerm, data || []).slice(0, 50);
};

// Get library stats
export const getLibraryStats = async () => {
    const { data: all } = await supabase.from('movies_library').select('id, media_type, featured, is_active, collection_tags');

    if (!all) return { total: 0, movies: 0, tv: 0, featured: 0, active: 0, collections: {} };

    const collectionCounts = {};
    all.forEach(m => {
        (m.collection_tags || []).forEach(tag => {
            collectionCounts[tag] = (collectionCounts[tag] || 0) + 1;
        });
    });

    return {
        total: all.length,
        movies: all.filter(m => m.media_type === 'movie').length,
        tv: all.filter(m => m.media_type === 'tv').length,
        featured: all.filter(m => m.featured).length,
        active: all.filter(m => m.is_active).length,
        collections: collectionCounts
    };
};

// Get movies from library by array of tmdb_ids
// Returns a map of tmdb_id -> full movie data for easy lookup
export const getMoviesFromLibraryByIds = async (tmdbIds) => {
    if (!tmdbIds || tmdbIds.length === 0) return new Map();

    // Convert all IDs to strings for consistent matching
    const stringIds = tmdbIds.map(id => String(id));

    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_LIST_SELECT)
        .in('tmdb_id', stringIds);

    if (error) {
        console.error('Error fetching movies from library:', error);
        return new Map();
    }

    // Create a map for quick lookup
    const movieMap = new Map();
    (data || []).forEach(movie => {
        movieMap.set(String(movie.tmdb_id), movie);
    });

    return movieMap;
};

// =============================================
// ADVANCED MOVIES LIBRARY - Full TMDB Data
// =============================================

// Save full movie/TV details to the existing movies_library table
// This now uses a single table with JSONB columns for detailed data
// Enhanced to properly handle TV series with all fields
export const saveFullMovieToLibrary = async (movieData, additionalData = {}) => {
    // Determine the ID: prefer passed ID, then stringified ID from object
    const tmdbId = movieData.id.toString();

    // Determine if this is a TV show based on data properties
    const isTV = !!(movieData.first_air_date || movieData.number_of_seasons || movieData.episode_run_time);
    const mediaType = additionalData.media_type || (isTV ? 'tv' : 'movie');

    // Extract genre IDs for efficient filtering
    const genreIds = movieData.genres?.map(g => g.id).filter(Boolean) || [];

    // Prepare the record with all detailed data
    const movieRecord = {
        tmdb_id: tmdbId,
        media_type: mediaType,
        title: movieData.title || movieData.name,
        original_title: movieData.original_title || movieData.original_name,
        overview: movieData.overview,
        tagline: movieData.tagline,
        poster_path: pickBestPosterPath(movieData) || movieData.poster_path,
        backdrop_path: movieData.backdrop_path,
        release_date: movieData.release_date || movieData.first_air_date,
        status: movieData.status,
        runtime: movieData.runtime || movieData.episode_run_time?.[0],
        vote_average: movieData.vote_average,
        vote_count: movieData.vote_count,
        popularity: movieData.popularity,

        // JSONB Fields for Lists
        genres: movieData.genres,
        genre_ids: genreIds,  // Extract for efficient filtering
        production_companies: movieData.production_companies,
        production_countries: movieData.production_countries,
        spoken_languages: movieData.spoken_languages,

        // TV Series specific fields
        first_air_date: movieData.first_air_date,
        last_air_date: movieData.last_air_date,
        number_of_seasons: movieData.number_of_seasons,
        number_of_episodes: movieData.number_of_episodes,
        seasons: movieData.seasons || [],
        networks: movieData.networks,
        in_production: movieData.in_production,
        episode_run_time: movieData.episode_run_time,
        origin_country: movieData.origin_country,
        original_language: movieData.original_language,

        // New Detailed JSONB Fields (base64 stripped — use TMDB CDN paths)
        credits: stripCreditsBase64(movieData.credits),
        videos: movieData.videos?.results || [],
        images: stripImagesBase64(movieData.images),
        reviews: movieData.reviews?.results || [], // TMDB user reviews
        similar_movies: movieData.similar?.results || movieData.similar || [], // Similar movies/TV
        recommendations: movieData.recommendations?.results || movieData.recommendations || [], // Recommended
        keywords: movieData.keywords?.keywords || movieData.keywords?.results || [], // Keywords
        release_dates_data: movieData.release_dates?.results || [], // Certifications and dates

        // Additional Info
        imdb_id: movieData.imdb_id || movieData.external_ids?.imdb_id,
        homepage: movieData.homepage,
        budget: movieData.budget,
        revenue: movieData.revenue,
        belongs_to_collection: movieData.belongs_to_collection,
        adult: movieData.adult || false,

        // Meta
        is_active: true,
        synced_at: new Date().toISOString(),
        ...additionalData
    };

    const result = await persistLibraryRecords(movieRecord);
    if (!result.success) return result;

    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return { success: true, data: row };
};

// Get Single Advanced Movie (just wraps standard get)
export const getAdvancedMovieFromLibrary = async (movieId) => {
    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIE_DETAIL_SELECT)
        .eq('tmdb_id', movieId.toString())
        .single();

    if (error) {
        console.error('Error fetching movie details:', error);
        return { success: false, error };
    }

    return { success: true, data };
};

// Get stats for the library (simplified for single table)
export const getAdvancedLibraryStats = async () => {
    const { count, error } = await supabase
        .from('movies_library')
        .select('id', { count: 'exact', head: true });

    if (error) return { totalMovies: 0 };
    return { totalMovies: count };
};

export const getAdvancedMoviesLibrary = async (options = {}) => {
    let query = supabase.from('movies_library').select(MOVIES_LIBRARY_LIST_SELECT);

    if (options.limit) query = query.limit(options.limit);
    if (options.page && options.limit) {
        const from = (options.page - 1) * options.limit;
        query = query.range(from, from + options.limit - 1);
    }

    // Sorting (default to created_at desc)
    const sortField = options.sort || 'created_at';
    const sortOrder = options.order === 'asc';
    query = query.order(sortField, { ascending: sortOrder });

    const { data, error, count } = await query;

    if (error) {
        console.error('Error fetching advanced movies:', error);
        return { success: false, error };
    }

    return { success: true, data, count };
};

export const searchAdvancedMoviesLibrary = async (searchTerm, limit = 20) => {
    const { buildLibrarySearchOrClause, rankLibrarySearchHits } = await import('../searchUtils.js');
    const orClause = buildLibrarySearchOrClause(searchTerm);
    if (!orClause) return [];

    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_LIST_SELECT)
        .or(orClause)
        .order('popularity', { ascending: false })
        .limit(Math.min(100, Math.max(40, limit * 4)));

    if (error) {
        console.error('Error searching advanced movies:', error);
        return [];
    }

    return rankLibrarySearchHits(searchTerm, data || []).slice(0, limit);
};

// Check if movie exists in the new library
export const checkMovieInAdvancedLibrary = async (movieId) => {
    const { data, error } = await supabase
        .from('movies')
        .select('id, title, synced_at')
        .eq('id', movieId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error checking movie:', error);
    }

    return data;
};

// Bulk check which movies are in the library (by TMDB id)
export const checkMoviesInAdvancedLibrary = async (movieIds) => {
    const ids = movieIds.map((id) => String(id));
    const { data, error } = await supabase
        .from('movies_library')
        .select('tmdb_id')
        .in('tmdb_id', ids);

    if (error) {
        console.error('Error bulk checking movies_library:', error);
        return new Set();
    }

    return new Set(data?.map((m) => Number(m.tmdb_id)) || []);
};
