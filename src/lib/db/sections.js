import { LIBRARY_CARD_SELECT } from '../moviesLibrarySelect.js';
import { supabase } from '../supabaseClient.js';
import { getBatchMovieRatings } from './ratings.js';
import { pickBestPosterPath } from '../../utils/imageHelper.js';

// =============================================
// HOMEPAGE SECTIONS CMS
// =============================================

function sectionMergeKey(section) {
    const blob = `${section.slug || ''} ${section.name || ''} ${section.api_source || ''}`.toLowerCase();
    if (/airing.?today/.test(blob) || section.api_source === 'airing_today') return null;

    // Provider / OTT first — never collapse into "Hot" (e.g. "Hotstar" matched /hot/)
    const provider = (section.api_source || '').match(/^provider_(\d+)$/);
    if (provider) return `ott:${provider[1]}`;
    if (/hotstar/.test(blob)) return 'ott:122';
    if (/netflix/.test(blob)) return 'ott:8';
    if (/prime|amazon/.test(blob)) return 'ott:119';
    if (/disney/.test(blob)) return 'ott:337';
    if (/hulu/.test(blob)) return 'ott:15';
    if (/hbo|\bmax\b/.test(blob)) return 'ott:1899';
    if (/apple/.test(blob)) return 'ott:350';

    // Word-boundary "hot" so Hotstar / Hotstar-named rows stay OTT
    if (/\bhot\b|trend|right.?now/.test(blob)) return 'hot';
    if (/theater|theatre|now.?play|cinema|in.?theater/.test(blob)) return 'theater';
    if (/coming|upcoming|soon/.test(blob)) return 'coming';
    return section.slug || `id:${section.id}`;
}

function mergeRegionLists(a = [], b = []) {
    const seen = new Set();
    const out = [];
    for (const item of [...a, ...b]) {
        const key = `${item.media_type || 'movie'}:${item.tmdb_id}`;
        if (!item.tmdb_id || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out.sort((x, y) => (y.popularity || 0) - (x.popularity || 0));
}

function mergeHomepageAndTvSections(homeSections = [], tvSections = []) {
    const byKey = new Map();
    for (const section of [...homeSections, ...tvSections]) {
        const key = sectionMergeKey(section);
        if (!key) continue;
        const existing = byKey.get(key);
        const regionBag = { ...(section.movies_by_region || section.shows_by_region || {}) };
        if (!existing) {
            byKey.set(key, { ...section, movies_by_region: regionBag });
            continue;
        }
        const regions = new Set([
            ...Object.keys(existing.movies_by_region || {}),
            ...Object.keys(regionBag),
        ]);
        const merged = { ...existing.movies_by_region };
        for (const region of regions) {
            merged[region] = mergeRegionLists(existing.movies_by_region?.[region], regionBag[region]);
        }
        existing.movies_by_region = merged;
    }
    return [...byKey.values()].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

// Get all homepage sections (ordered by display_order)
// Movies + series are stored together per region in movies_by_region.
// mergeTv defaults to false — legacy tv_sections merge overwrote admin OTT publishes.
export const getHomepageSections = async (activeOnly = false, { mergeTv = false } = {}) => {
    let query = supabase
        .from('homepage_sections')
        .select('id, name, slug, icon, display_order, is_active, movies_by_region, section_type, api_source, max_movies, created_at, updated_at')
        .order('display_order', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data: homeSections, error } = await query;

    if (error) {
        console.error('Error fetching homepage sections:', error);
        return [];
    }

    let tvSections = [];
    if (mergeTv) {
        try {
            let tvQuery = supabase
                .from('tv_sections')
                .select('id, name, slug, icon, display_order, is_active, movies_by_region, section_type, api_source, max_movies, created_at, updated_at')
                .order('display_order', { ascending: true });
            if (activeOnly) tvQuery = tvQuery.eq('is_active', true);
            const { data: tvData, error: tvError } = await tvQuery;
            if (!tvError) tvSections = tvData || [];
        } catch {
            tvSections = [];
        }
    }

    const sections = mergeTv
        ? mergeHomepageAndTvSections(homeSections || [], tvSections)
        : (homeSections || []);
    if (!sections.length) return [];

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

    const ids = Array.from(tmdbIdsToFetch);

    // Library + ratings in parallel so posters aren't blocked on ratings
    const [libResult, ratingsMap] = await Promise.all([
        supabase
            .from('movies_library')
            .select(LIBRARY_CARD_SELECT)
            .in('tmdb_id', ids),
        getBatchMovieRatings(ids).catch((err) => {
            console.error('Error fetching batch ratings for sections:', err);
            return new Map();
        }),
    ]);

    const { data: globalMovies, error: libError } = libResult;

    if (libError) {
        console.error('Error fetching global movies for sections:', libError);
        return sections;
    }

    const movieMap = new Map();
    globalMovies?.forEach((m) => {
        movieMap.set(`${m.media_type || 'movie'}:${m.tmdb_id}`, m);
        if (!movieMap.has(`*:${m.tmdb_id}`)) movieMap.set(`*:${m.tmdb_id}`, m);
    });

    return sections.map((section) => {
        if (!section.movies_by_region) return section;
        const hydatedMoviesByRegion = {};
        Object.keys(section.movies_by_region).forEach((regionCode) => {
            const rawMovies = section.movies_by_region[regionCode] || [];
            hydatedMoviesByRegion[regionCode] = rawMovies.map((rawMovie) => {
                const mt = rawMovie.media_type || 'movie';
                const globalMovie = movieMap.get(`${mt}:${rawMovie.tmdb_id}`) || movieMap.get(`*:${rawMovie.tmdb_id}`);
                const tosRating = ratingsMap.get(String(rawMovie.tmdb_id));
                if (globalMovie) {
                    const bestPoster = pickBestPosterPath(globalMovie) || globalMovie.poster_path || rawMovie.poster_path;
                    return {
                        ...rawMovie,
                        ...globalMovie,
                        poster_path: bestPoster,
                        media_type: globalMovie.media_type || mt,
                        release_date: globalMovie.release_date || globalMovie.first_air_date || rawMovie.release_date,
                        tos_rating: tosRating || null,
                    };
                }
                return { ...rawMovie, tos_rating: tosRating || null };
            });
        });
        return { ...section, movies_by_region: hydatedMoviesByRegion };
    });
};

// Create a new homepage section
export const createHomepageSection = async (section) => {
    // Generate slug if not provided
    const slug = section.slug || section.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Get max display_order
    const { data: existing } = await supabase
        .from('homepage_sections')
        .select('display_order')
        .order('display_order', { ascending: false })
        .limit(1);

    const nextOrder = existing?.[0]?.display_order ? existing[0].display_order + 1 : 1;

    const { data, error } = await supabase
        .from('homepage_sections')
        .insert({
            ...section,
            slug,
            display_order: section.display_order ?? nextOrder,
            movies: [], // Deprecated: using movies_by_region now
            movies_by_region: section.movies_by_region || {}
        })
        .select();

    if (error) {
        console.error('Error creating homepage section:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Update a homepage section
export const updateHomepageSection = async (id, updates) => {
    const { data, error } = await supabase
        .from('homepage_sections')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select();

    if (error) {
        console.error('Error updating homepage section:', error);
        return { success: false, error };
    }
    // RLS can "succeed" with 0 rows when the user is not an admin
    if (!data?.length) {
        const emptyError = new Error('Section update blocked (no rows updated). Sign in as an admin and try again.');
        console.error('Error updating homepage section:', emptyError);
        return { success: false, error: emptyError };
    }
    return { success: true, data };
};

// Delete a homepage section
export const deleteHomepageSection = async (id) => {
    const { error } = await supabase
        .from('homepage_sections')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting homepage section:', error);
        return { success: false, error };
    }
    return { success: true };
};

// Get all TV sections (ordered by display_order)
// Hydrates from movies_library with slim card fields only
export const getTVSections = async (activeOnly = false) => {
    let query = supabase
        .from('tv_sections')
        .select('id, name, slug, icon, display_order, is_active, movies_by_region, section_type, api_source, max_movies, created_at, updated_at')
        .order('display_order', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data: sections, error } = await query;

    if (error) {
        console.error('Error fetching tv sections:', error);
        return [];
    }

    if (!sections || sections.length === 0) return [];

    // ============================================================
    // GLOBAL LIBRARY HYDRATION LOGIC (Unified for TV)
    // ============================================================
    const tmdbIdsToFetch = new Set();

    sections.forEach(section => {
        if (!section.movies_by_region) return;

        Object.values(section.movies_by_region).forEach(movieList => {
            if (!Array.isArray(movieList)) return;
            movieList.forEach(movie => {
                if (movie.tmdb_id) {
                    tmdbIdsToFetch.add(String(movie.tmdb_id));
                }
            });
        });
    });

    if (tmdbIdsToFetch.size === 0) return sections;

    const { data: globalMovies, error: libError } = await supabase
        .from('movies_library')
        .select(LIBRARY_CARD_SELECT)
        .in('tmdb_id', Array.from(tmdbIdsToFetch));

    if (libError) {
        console.error('Error fetching global movies for TV sections:', libError);
        return sections;
    }

    const movieMap = new Map();
    globalMovies?.forEach(m => {
        movieMap.set(String(m.tmdb_id), m);
    });

    const hydratedSections = sections.map(section => {
        if (!section.movies_by_region) return section;

        const hydatedMoviesByRegion = {};

        Object.keys(section.movies_by_region).forEach(regionCode => {
            const rawMovies = section.movies_by_region[regionCode] || [];

            hydatedMoviesByRegion[regionCode] = rawMovies.map(rawMovie => {
                const globalMovie = movieMap.get(String(rawMovie.tmdb_id));

                if (globalMovie) {
                    return {
                        ...rawMovie,
                        ...globalMovie,
                        release_date: globalMovie.release_date || globalMovie.first_air_date || rawMovie.release_date,
                    };
                }
                return rawMovie;
            });
        });

        return {
            ...section,
            movies_by_region: hydatedMoviesByRegion
        };
    });

    return hydratedSections;
};

// Toggle section active status
export const toggleHomepageSectionActive = async (id) => {
    // First get current status
    const { data: section } = await supabase
        .from('homepage_sections')
        .select('is_active')
        .eq('id', id)
        .single();

    if (!section) return { success: false, error: 'Section not found' };

    return updateHomepageSection(id, { is_active: !section.is_active });
};

// Reorder sections (update display_order for all)
export const reorderHomepageSections = async (orderedIds) => {
    const updates = orderedIds.map((id, index) => ({
        id,
        display_order: index + 1,
        updated_at: new Date().toISOString()
    }));

    // Update each section's order
    for (const update of updates) {
        await supabase
            .from('homepage_sections')
            .update({ display_order: update.display_order, updated_at: update.updated_at })
            .eq('id', update.id);
    }

    return { success: true };
};

// =============================================
// SHOWCASE TRAILERS (admin-curated Home feed trailers)
// =============================================

export const getShowcaseTrailers = async (activeOnly = false) => {
    let query = supabase
        .from('showcase_trailers')
        .select('*')
        .order('display_order', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching showcase trailers:', error);
        return [];
    }

    return data || [];
};

// Add a trailer candidate (from the admin browser) to the public showcase
export const createShowcaseTrailer = async (trailer) => {
    const { data: existing } = await supabase
        .from('showcase_trailers')
        .select('display_order')
        .order('display_order', { ascending: false })
        .limit(1);

    const nextOrder = existing?.[0]?.display_order ? existing[0].display_order + 1 : 1;

    const { data, error } = await supabase
        .from('showcase_trailers')
        .insert({
            tmdb_id: String(trailer.tmdb_id),
            media_type: trailer.media_type || 'movie',
            title: trailer.title,
            poster_path: trailer.poster_path || null,
            backdrop_path: trailer.backdrop_path || null,
            release_date: trailer.release_date || null,
            trailer_key: trailer.trailer_key,
            trailer_name: trailer.trailer_name || null,
            trailer_published_at: trailer.trailer_published_at || null,
            youtube_url: trailer.youtube_url || null,
            thumbnail_url: trailer.thumbnail_url || null,
            thumbnail_fallback_url: trailer.thumbnail_fallback_url || null,
            category: trailer.category || 'latest',
            display_order: trailer.display_order ?? nextOrder,
            is_active: trailer.is_active ?? true,
        })
        .select();

    if (error) {
        console.error('Error creating showcase trailer:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

export const updateShowcaseTrailer = async (id, updates) => {
    const { data, error } = await supabase
        .from('showcase_trailers')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select();

    if (error) {
        console.error('Error updating showcase trailer:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

export const deleteShowcaseTrailer = async (id) => {
    const { error } = await supabase
        .from('showcase_trailers')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting showcase trailer:', error);
        return { success: false, error };
    }
    return { success: true };
};

export const toggleShowcaseTrailerActive = async (id) => {
    const { data: trailer } = await supabase
        .from('showcase_trailers')
        .select('is_active')
        .eq('id', id)
        .single();

    if (!trailer) return { success: false, error: 'Trailer not found' };

    return updateShowcaseTrailer(id, { is_active: !trailer.is_active });
};

export const reorderShowcaseTrailers = async (orderedIds) => {
    const updates = orderedIds.map((id, index) => ({
        id,
        display_order: index + 1,
        updated_at: new Date().toISOString(),
    }));

    for (const update of updates) {
        await supabase
            .from('showcase_trailers')
            .update({ display_order: update.display_order, updated_at: update.updated_at })
            .eq('id', update.id);
    }

    return { success: true };
};

// Add movie to a section - stores rich movie data for display
export const addMovieToSection = async (sectionId, movie) => {
    // Get current section
    const { data: section } = await supabase
        .from('homepage_sections')
        .select('movies')
        .eq('id', sectionId)
        .single();

    if (!section) return { success: false, error: 'Section not found' };

    const currentMovies = section.movies || [];

    const tmdbId = movie.tmdb_id || movie.id;

    // Check if movie already exists
    if (currentMovies.some(m => m.tmdb_id === tmdbId || m.tmdb_id === String(tmdbId))) {
        return { success: false, error: 'Movie already in section' };
    }

    // Add movie with rich data for display (includes all fields needed for Home page)
    const newMovie = {
        tmdb_id: tmdbId,
        title: movie.title || movie.name,
        poster_path: movie.poster_path,
        backdrop_path: movie.backdrop_path,
        media_type: movie.media_type || 'movie',
        release_date: movie.release_date || movie.first_air_date,
        vote_average: movie.vote_average,
        overview: movie.overview,
        popularity: movie.popularity,
        original_language: movie.original_language,
        genres: movie.genres,
        runtime: movie.runtime,
        order: currentMovies.length + 1
    };

    return updateHomepageSection(sectionId, { movies: [...currentMovies, newMovie] });
};

// Remove movie from a section
export const removeMovieFromSection = async (sectionId, tmdbId) => {
    // Get current section
    const { data: section } = await supabase
        .from('homepage_sections')
        .select('movies')
        .eq('id', sectionId)
        .single();

    if (!section) return { success: false, error: 'Section not found' };

    const updatedMovies = (section.movies || [])
        .filter(m => m.tmdb_id !== tmdbId)
        .map((m, index) => ({ ...m, order: index + 1 }));

    return updateHomepageSection(sectionId, { movies: updatedMovies });
};

// Reorder movies within a section
export const reorderSectionMovies = async (sectionId, orderedTmdbIds) => {
    // Get current section
    const { data: section } = await supabase
        .from('homepage_sections')
        .select('movies')
        .eq('id', sectionId)
        .single();

    if (!section) return { success: false, error: 'Section not found' };

    const movieMap = new Map((section.movies || []).map(m => [m.tmdb_id, m]));
    const reorderedMovies = orderedTmdbIds
        .filter(id => movieMap.has(id))
        .map((id, index) => ({ ...movieMap.get(id), order: index + 1 }));

    return updateHomepageSection(sectionId, { movies: reorderedMovies });
};
