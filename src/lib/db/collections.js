import { LIBRARY_CARD_SELECT } from '../moviesLibrarySelect.js';
import { supabase } from '../supabaseClient.js';

// =============================================
// ADMIN COLLECTIONS (CMS)
// =============================================

export const getCollections = async () => {
    const { data, error } = await supabase
        .from('collections')
        .select('*')
        .order('display_order', { ascending: true });

    if (error) {
        console.error('Error fetching collections:', error);
        return [];
    }
    return data || [];
};

export const createCollection = async (collection) => {
    const { data, error } = await supabase
        .from('collections')
        .insert(collection)
        .select();

    if (error) {
        console.error('Error creating collection:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

export const updateCollectionAdmin = async (slug, updates) => {
    const { data, error } = await supabase
        .from('collections')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('slug', slug)
        .select();

    if (error) {
        console.error('Error updating collection:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

export const deleteCollection = async (slug) => {
    const { error } = await supabase
        .from('collections')
        .delete()
        .eq('slug', slug);

    if (error) {
        console.error('Error deleting collection:', error);
        return { success: false, error };
    }
    return { success: true };
};

export const updateCollection = async (slug, updates) => updateCollectionAdmin(slug, updates);

// =============================================
// USER LISTS (user_collections) — NOT Boards
// =============================================

function sortCollectionMoviesNewestFirst(movies) {
    if (!Array.isArray(movies) || movies.length < 2) return movies || [];
    return [...movies].sort((a, b) => {
        const aTime = new Date(a.added_at || a.created_at || 0).getTime();
        const bTime = new Date(b.added_at || b.created_at || 0).getTime();
        return bTime - aTime;
    });
}

export const getUserCollections = async (userId) => {
    if (!userId) return [];
    const { data } = await supabase
        .from('user_collections')
        .select('*, collection_movies(movie_id, poster_path, movie_title, added_at)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('added_at', { foreignTable: 'collection_movies', ascending: false });
    return (data || []).map((c) => ({
        ...c,
        collection_movies: sortCollectionMoviesNewestFirst(c.collection_movies),
    }));
};

export const LIST_NAME_MAX = 70;
export const LIST_DESCRIPTION_MAX = 200;

const createSlug = (text) =>
    String(text || '')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

export const createUserCollection = async (userId, name, description = '', isPublic = false) => {
    if (!userId) return { success: false };
    const cleanName = name.trim().slice(0, LIST_NAME_MAX);
    const cleanDescription = (description || '').trim().slice(0, LIST_DESCRIPTION_MAX);

    const { data, error } = await supabase
        .from('user_collections')
        .insert({ user_id: userId, name: cleanName, description: cleanDescription, is_public: isPublic })
        .select()
        .single();

    if (!error && isPublic) {
        await supabase.from('activity_feed').insert({
            user_id: userId,
            event_type: 'list_created',
            payload: { collection_id: data.id, name: cleanName, description: cleanDescription },
            visibility: 'public',
            engagement_score: 5,
        });

        await supabase.from('feed_posts').insert({
            user_id: userId,
            content: cleanDescription ? `${cleanName}\n${cleanDescription}` : cleanName,
            movie_title: cleanName,
            post_type: 'list',
            has_image: false,
            visibility: 'public',
        }).then(({ error: feedErr }) => {
            if (feedErr) console.warn('list -> feed_posts failed:', feedErr.message);
        });
    }

    return { success: !error, data };
};

export const getCollectionBySlug = async (slug, viewerUserId = null) => {
    if (!slug) return null;

    // 1) Load collection rows (no nested movies — avoids PostgREST embed truncation)
    let query = supabase
        .from('user_collections')
        .select('*')
        .order('created_at', { ascending: false });

    if (viewerUserId) {
        query = query.or(`is_public.eq.true,user_id.eq.${viewerUserId}`);
    } else {
        query = query.eq('is_public', true);
    }

    const { data: collections, error } = await query;
    if (error) {
        console.error('Error fetching collections:', error);
        return null;
    }

    // Prefer the viewer's own list when slug collides across users
    const matches = (collections || []).filter((c) => createSlug(c.name) === slug);
    if (!matches.length) return null;
    const collection =
        (viewerUserId && matches.find((c) => c.user_id === viewerUserId)) ||
        matches.find((c) => c.is_public) ||
        matches[0];

    // 2) Load items for this collection only
    const { data: movies, error: moviesError } = await supabase
        .from('collection_movies')
        .select('*')
        .eq('collection_id', collection.id)
        .order('added_at', { ascending: false });

    if (moviesError) {
        console.error('Error fetching collection movies:', moviesError);
        collection.collection_movies = [];
    } else {
        collection.collection_movies = movies || [];
    }

    if (collection.user_id) {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('username, display_name, avatar_id, avatar_url')
            .eq('id', collection.user_id)
            .maybeSingle();
        collection.user_profiles = profile || null;
    }

    if (collection.collection_movies?.length) {
        const movieIds = collection.collection_movies.map((m) => String(m.movie_id));
        // Chunk .in() queries — PostgREST/URL limits on very large lists
        const chunkSize = 100;
        const movieMap = new Map();
        for (let i = 0; i < movieIds.length; i += chunkSize) {
            const chunk = movieIds.slice(i, i + chunkSize);
            const { data: libraryMovies } = await supabase
                .from('movies_library')
                .select(LIBRARY_CARD_SELECT)
                .in('tmdb_id', chunk);
            (libraryMovies || []).forEach((m) => movieMap.set(String(m.tmdb_id), m));
        }

        if (movieMap.size) {
            collection.collection_movies = collection.collection_movies.map((collMovie) => {
                const libraryMovie = movieMap.get(String(collMovie.movie_id));
                if (!libraryMovie) return collMovie;
                return {
                    ...collMovie,
                    poster_path: libraryMovie.poster_path || collMovie.poster_path,
                    backdrop_path: libraryMovie.backdrop_path,
                    title: libraryMovie.title || collMovie.movie_title,
                    vote_average: libraryMovie.vote_average,
                    release_date: libraryMovie.release_date,
                    overview: libraryMovie.overview,
                    genres: libraryMovie.genres,
                    runtime: libraryMovie.runtime,
                };
            });
        }
        collection.collection_movies = sortCollectionMoviesNewestFirst(collection.collection_movies);
    }

    return collection;
};

export const updateUserCollection = async (collectionId, updates) => {
    const { data: existing } = await supabase
        .from('user_collections')
        .select('is_system, collection_kind')
        .eq('id', collectionId)
        .maybeSingle();

    const patch = existing?.is_system
        ? { description: updates.description, is_public: updates.is_public }
        : { name: updates.name, description: updates.description, is_public: updates.is_public };

    if (updates.cover_image !== undefined) patch.cover_image = updates.cover_image;
    if (updates.banner_image !== undefined) patch.banner_image = updates.banner_image;

    const { data, error } = await supabase
        .from('user_collections')
        .update(patch)
        .eq('id', collectionId)
        .select()
        .single();

    if (error) console.error('Error updating collection:', error);
    return { success: !error, data, error };
};

export const addToCollection = async (collectionId, movieId, movieTitle, posterPath, mediaType = 'movie') => {
    const movieKey = String(movieId);
    const { data, error } = await supabase
        .from('collection_movies')
        .upsert(
            {
                collection_id: collectionId,
                movie_id: movieKey,
                movie_title: movieTitle,
                poster_path: posterPath,
                media_type: mediaType,
            },
            { onConflict: 'collection_id,movie_id' },
        )
        .select();

    if (error) {
        console.error('Error adding to collection:', error);
        return { success: false, error, data };
    }
    return { success: true, error: null, data };
};

export const removeFromCollection = async (collectionId, movieId) => {
    const { error } = await supabase
        .from('collection_movies')
        .delete()
        .eq('collection_id', collectionId)
        .eq('movie_id', movieId);
    return { success: !error, error };
};

export const getCollection = async (collectionId) => {
    const { data: collection, error } = await supabase
        .from('user_collections')
        .select('*, collection_movies(*)')
        .eq('id', collectionId)
        .order('added_at', { foreignTable: 'collection_movies', ascending: false })
        .single();

    if (error) {
        console.error('Error fetching collection:', error);
        return null;
    }

    if (collection?.user_id) {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('username, display_name, avatar_id, avatar_url')
            .eq('id', collection.user_id)
            .maybeSingle();
        collection.user_profiles = profile || null;
    }

    if (collection?.collection_movies) {
        collection.collection_movies = sortCollectionMoviesNewestFirst(collection.collection_movies);
    }
    return collection;
};

export const getCollectionByName = async (userId, collectionName) => {
    const { data: collection, error } = await supabase
        .from('user_collections')
        .select('*, collection_movies(*)')
        .eq('user_id', userId)
        .eq('name', collectionName)
        .order('created_at', { ascending: false })
        .order('added_at', { foreignTable: 'collection_movies', ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('Error fetching collection by name:', error);
        return null;
    }

    if (collection?.user_id) {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('username, display_name, avatar_id, avatar_url')
            .eq('id', collection.user_id)
            .maybeSingle();
        collection.user_profiles = profile || null;
    }

    if (collection?.collection_movies) {
        collection.collection_movies = sortCollectionMoviesNewestFirst(collection.collection_movies);
    }
    return collection;
};

export const addMoviesToCollection = async (collectionId, movies) => {
    const byMovieId = new Map();
    for (const m of movies || []) {
        const movieId = String(m.id ?? m.tmdb_id ?? m.movie_id);
        if (!movieId) continue;
        byMovieId.set(movieId, {
            collection_id: collectionId,
            movie_id: movieId,
            movie_title: m.title || m.name || m.movie_title,
            poster_path: m.poster_path,
            media_type: m.media_type || 'movie',
        });
    }

    const records = Array.from(byMovieId.values());
    if (!records.length) return { success: false, error: new Error('No movies to add') };

    const { data, error } = await supabase
        .from('collection_movies')
        .upsert(records, { onConflict: 'collection_id,movie_id' })
        .select();

    if (error) console.error('Error adding movies:', error);
    return { success: !error, error, data };
};

/** Delete a user list. System lists (e.g. Watched in Theaters) cannot be deleted. */
export const deleteUserCollection = async (collectionId, userId) => {
    if (!collectionId || !userId) return { success: false, error: new Error('Missing id') };

    const { data: existing } = await supabase
        .from('user_collections')
        .select('id, user_id, is_system, collection_kind')
        .eq('id', collectionId)
        .maybeSingle();

    if (!existing || existing.user_id !== userId) {
        return { success: false, error: new Error('Collection not found') };
    }
    if (existing.is_system || existing.collection_kind === 'watched_in_theater') {
        return { success: false, error: new Error('System collections cannot be deleted') };
    }

    const { error } = await supabase
        .from('user_collections')
        .delete()
        .eq('id', collectionId)
        .eq('user_id', userId);

    if (error) console.error('Error deleting collection:', error);
    return { success: !error, error };
};
