import { supabase } from '../supabaseClient.js';

// =============================================
// USER MOVIE INTERACTIONS (Watchlist, Liked, Watched)
// =============================================

// Get user's movie status (watchlist, liked, watched)
// Gracefully handles missing tables
export const getUserMovieStatus = async (userId, movieId) => {
    if (!userId) return { inWatchlist: false, isLiked: false, isWatched: false };

    try {
        const [watchlist, liked, watched] = await Promise.all([
            supabase.from('user_watchlist').select('id').eq('user_id', userId).eq('movie_id', movieId).maybeSingle(),
            supabase.from('user_liked_movies').select('id').eq('user_id', userId).eq('movie_id', movieId).maybeSingle(),
            supabase.from('user_watched_movies').select('id').eq('user_id', userId).eq('movie_id', movieId).maybeSingle()
        ]);

        return {
            inWatchlist: !!watchlist?.data,
            isLiked: !!liked?.data,
            isWatched: !!watched?.data
        };
    } catch (error) {
        console.log('User movie status fetch error (tables may not exist):', error.message);
        return { inWatchlist: false, isLiked: false, isWatched: false };
    }
};

// Toggle Watchlist
export const toggleWatchlist = async (userId, movieId, movieTitle, posterPath, mediaType = 'movie') => {
    if (!userId) return { success: false, error: 'Not logged in' };
    const id = String(movieId);

    // maybeSingle() = no 406 console noise when the row doesn't exist yet.
    const { data: existing } = await supabase
        .from('user_watchlist')
        .select('id')
        .eq('user_id', userId)
        .eq('movie_id', id)
        .maybeSingle();

    if (existing) {
        const { error } = await supabase
            .from('user_watchlist')
            .delete()
            .eq('user_id', userId)
            .eq('movie_id', id);
        if (error) console.error('[watchlist] remove failed:', error.message);
        return { success: !error, added: false, error: error?.message };
    }

    const { error } = await supabase
        .from('user_watchlist')
        .insert({ user_id: userId, movie_id: id, movie_title: movieTitle, poster_path: posterPath, media_type: mediaType });
    if (error) console.error('[watchlist] add failed:', error.message);
    return { success: !error, added: true, error: error?.message };
};

/**
 * Mark watched without toggling off (like/dislike imply seen).
 * @returns {{ success: boolean, added: boolean, error?: string }}
 */
export const ensureWatchedMovie = async (userId, movieId, movieTitle, posterPath, mediaType = 'movie') => {
    if (!userId) return { success: false, added: false, error: 'Not logged in' };
    const id = String(movieId);

    const { data: existing } = await supabase
        .from('user_watched_movies')
        .select('id')
        .eq('user_id', userId)
        .eq('movie_id', id)
        .maybeSingle();

    if (existing) return { success: true, added: false };

    const { error } = await supabase
        .from('user_watched_movies')
        .insert({
            user_id: userId,
            movie_id: id,
            movie_title: movieTitle,
            poster_path: posterPath,
            media_type: mediaType,
        });
    if (error) {
        console.error('[watched] ensure failed:', error.message);
        return { success: false, added: false, error: error.message };
    }
    return { success: true, added: true };
};

// Toggle Liked — liking also marks watched (unlike does not unwatch).
export const toggleLikedMovie = async (userId, movieId, movieTitle, posterPath, mediaType = 'movie') => {
    if (!userId) return { success: false, error: 'Not logged in' };

    const { data: existing } = await supabase
        .from('user_liked_movies')
        .select('id')
        .eq('user_id', userId)
        .eq('movie_id', String(movieId))
        .maybeSingle();

    if (existing) {
        const { error } = await supabase
            .from('user_liked_movies')
            .delete()
            .eq('user_id', userId)
            .eq('movie_id', String(movieId));
        if (error) console.error('[like] remove failed:', error.message);
        return { success: !error, added: false, error: error?.message };
    } else {
        const { error } = await supabase
            .from('user_liked_movies')
            .insert({ user_id: userId, movie_id: movieId, movie_title: movieTitle, poster_path: posterPath, media_type: mediaType });
        if (!error) {
            await ensureWatchedMovie(userId, movieId, movieTitle, posterPath, mediaType);
            supabase.from('activity_feed').insert({
                user_id: userId,
                event_type: 'like',
                target_tmdb_id: String(movieId),
                target_movie_title: movieTitle,
                target_poster_path: posterPath,
                media_type: mediaType,
                visibility: 'public',
            }).then(({ error: feedErr }) => {
                if (feedErr) console.warn('like -> activity_feed failed:', feedErr.message);
            });
        }
        if (error) console.error('[like] add failed:', error.message);
        return { success: !error, added: true, error: error?.message };
    }
};

// Toggle Watched
export const toggleWatchedMovie = async (userId, movieId, movieTitle, posterPath, mediaType = 'movie') => {
    if (!userId) return { success: false, error: 'Not logged in' };

    const { data: existing } = await supabase
        .from('user_watched_movies')
        .select('id')
        .eq('user_id', userId)
        .eq('movie_id', String(movieId))
        .maybeSingle();

    if (existing) {
        const { error } = await supabase
            .from('user_watched_movies')
            .delete()
            .eq('user_id', userId)
            .eq('movie_id', String(movieId));
        if (error) console.error('[watched] remove failed:', error.message);
        return { success: !error, added: false, error: error?.message };
    } else {
        const { error } = await supabase
            .from('user_watched_movies')
            .insert({ user_id: userId, movie_id: String(movieId), movie_title: movieTitle, poster_path: posterPath, media_type: mediaType });
        if (error) console.error('[watched] add failed:', error.message);
        return { success: !error, added: true, error: error?.message };
    }
};

// Get user's watchlist
export const getUserWatchlist = async (userId) => {
    if (!userId) return [];
    const { data, error } = await supabase
        .from('user_watchlist')
        .select('*')
        .eq('user_id', userId)
        .order('added_at', { ascending: false });
    return data || [];
};

// Get user's liked movies
export const getUserLikedMovies = async (userId) => {
    if (!userId) return [];
    const { data } = await supabase
        .from('user_liked_movies')
        .select('*')
        .eq('user_id', userId)
        .order('liked_at', { ascending: false });
    return data || [];
};

// Get user's watched movies
export const getUserWatchedMovies = async (userId) => {
    if (!userId) return [];
    const { data } = await supabase
        .from('user_watched_movies')
        .select('*')
        .eq('user_id', userId)
        .order('watched_at', { ascending: false });
    return data || [];
};
