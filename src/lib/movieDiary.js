import { supabase, getUserFollowing } from './supabase';
import {
    syncMovieToTheaterCollection,
    watchedInTheaterFromContext,
} from './theaterWatch';

export async function createMovieLog(userId, input) {
    if (!userId) return { success: false, error: new Error('Not signed in') };

    const watchedInTheater = input.watchedInTheater
        ?? watchedInTheaterFromContext(input.watchedWith);

    const row = {
        user_id: userId,
        tmdb_id: String(input.tmdbId),
        media_type: input.mediaType || 'movie',
        movie_title: input.title,
        poster_path: input.posterPath || null,
        watched_on: input.watchedOn || new Date().toISOString().slice(0, 10),
        rating: input.rating ?? null,
        review_text: input.reviewText || null,
        watched_with: input.watchedWith || [],
        watched_in_theater: watchedInTheater,
        visibility: input.visibility || 'public',
        rewatch_count: input.rewatchCount || 0,
    };

    const { data, error } = await supabase
        .from('movie_logs')
        .insert(row)
        .select()
        .single();

    if (error) {
        console.error('createMovieLog:', error);
        return { success: false, error };
    }

    await supabase.from('activity_feed').insert({
        user_id: userId,
        event_type: 'log',
        target_tmdb_id: row.tmdb_id,
        target_movie_title: row.movie_title,
        target_poster_path: row.poster_path,
        media_type: row.media_type,
        watched_in_theater: watchedInTheater,
        payload: {
            rating: row.rating,
            watched_with: row.watched_with,
            watched_in_theater: watchedInTheater,
            log_id: data.id,
        },
        visibility: row.visibility,
    });

    if (watchedInTheater) {
        await syncMovieToTheaterCollection(userId, {
            tmdbId: row.tmdb_id,
            title: row.movie_title,
            posterPath: row.poster_path,
            mediaType: row.media_type,
        });
    }

    await supabase.from('user_watched_movies').upsert(
        {
            user_id: userId,
            movie_id: row.tmdb_id,
            movie_title: row.movie_title,
            poster_path: row.poster_path,
            media_type: row.media_type,
        },
        { onConflict: 'user_id,movie_id' },
    );

    import('./tasteProfileApi.js').then(({ requestTasteProfileRebuild }) => {
        requestTasteProfileRebuild().catch(() => {});
    });
    import('./socialApi.js').then(({ checkBadges }) => {
        checkBadges().catch(() => {});
    });

    return { success: true, data };
}

export async function getUserMovieLogs(userId, { limit = 50 } = {}) {
    if (!userId) return [];

    const { data, error } = await supabase
        .from('movie_logs')
        .select('*')
        .eq('user_id', userId)
        .order('watched_on', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('getUserMovieLogs:', error);
        return [];
    }

    return data || [];
}

export async function deleteMovieLog(userId, logId) {
    const { error } = await supabase
        .from('movie_logs')
        .delete()
        .eq('id', logId)
        .eq('user_id', userId);

    return { success: !error, error };
}

export async function publishRatingActivity(userId, ratingRow, movieMeta = {}) {
    if (!userId || !ratingRow) return;

    const overall = ['acting', 'screenplay', 'sound', 'direction', 'entertainment', 'pacing', 'cinematography']
        .map((k) => ratingRow[k])
        .filter((v) => v != null);
    const avg = overall.length
        ? overall.reduce((a, b) => a + Number(b), 0) / overall.length
        : null;

    await supabase.from('activity_feed').insert({
        user_id: userId,
        event_type: 'rating',
        target_tmdb_id: String(ratingRow.movie_id),
        target_movie_title: ratingRow.movie_title || movieMeta.title,
        target_poster_path: movieMeta.posterPath || null,
        media_type: movieMeta.mediaType || 'movie',
        payload: { overall: avg, axes: ratingRow },
        visibility: 'public',
    });

    import('./socialApi.js').then(({ checkBadges }) => checkBadges().catch(() => {}));
}

export async function getUserActivityFeed(userId, limit = 40) {
    if (!userId) return [];

    const { data, error } = await supabase
        .from('activity_feed')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('getUserActivityFeed:', error);
        return [];
    }

    return data || [];
}

export async function getFollowingActivityFeed(userId, limit = 40) {
    if (!userId) return [];

    const following = await getUserFollowing(userId);
    const userIds = [
        userId,
        ...following.map((f) => f.following_id).filter(Boolean),
    ];

    const { data, error } = await supabase
        .from('activity_feed')
        .select('*')
        .in('user_id', userIds)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('getFollowingActivityFeed:', error);
        return [];
    }

    const profiles = await loadProfilesForActivities(data || []);
    return (data || []).map((item) => ({
        ...item,
        profile: profiles.get(item.user_id),
    }));
}

async function loadProfilesForActivities(activities) {
    const ids = [...new Set(activities.map((a) => a.user_id).filter(Boolean))];
    const map = new Map();
    if (!ids.length) return map;

    const { data } = await supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_id')
        .in('id', ids);

    (data || []).forEach((p) => map.set(p.id, p));
    return map;
}

export async function getUserBadges(userId) {
    if (!userId) return [];

    const { data: earned, error } = await supabase
        .from('user_badges')
        .select('badge_id, earned_at')
        .eq('user_id', userId)
        .order('earned_at', { ascending: false });

    if (error) {
        console.error('getUserBadges:', error);
        return [];
    }

    if (!earned?.length) return [];

    const defs = await getBadgeDefinitions();
    const defMap = new Map(defs.map((d) => [d.id, d]));

    return earned.map((row) => ({
        ...defMap.get(row.badge_id),
        earned_at: row.earned_at,
    })).filter((b) => b.id);
}

export async function getBadgeDefinitions() {
    const { data } = await supabase
        .from('badge_definitions')
        .select('*')
        .order('sort_order', { ascending: true });

    return data || [];
}
