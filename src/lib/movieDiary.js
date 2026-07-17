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

    // Everything below is secondary (feed/streak/taste-profile bookkeeping) — fire
    // it in the background instead of awaiting so the modal can close immediately
    // once the diary row itself is saved.
    supabase.from('activity_feed').insert({
        user_id: userId,
        event_type: 'log',
        target_tmdb_id: row.tmdb_id,
        target_movie_title: row.movie_title,
        target_poster_path: row.poster_path,
        media_type: row.media_type,
        payload: {
            rating: row.rating,
            watched_with: row.watched_with,
            watched_in_theater: watchedInTheater,
            log_id: data.id,
        },
        visibility: row.visibility,
    }).then(({ error: feedErr }) => {
        if (feedErr) console.warn('log -> activity_feed failed:', feedErr.message);
    });

    // Public logs also become a home-feed post so they show up there with working
    // likes/comments (which are keyed to feed_posts). Best-effort — never block the log.
    if (row.visibility === 'public') {
        supabase.from('feed_posts').insert({
            user_id: userId,
            content: row.review_text || '',
            tmdb_id: row.tmdb_id,
            media_type: row.media_type,
            movie_title: row.movie_title,
            movie_poster: row.poster_path,
            movie_rating: row.rating,
            post_type: 'log',
            has_image: false,
            visibility: 'public',
        }).then(({ error: feedErr }) => {
            if (feedErr) console.warn('log -> feed_posts failed:', feedErr.message);
        });
    }

    if (watchedInTheater) {
        syncMovieToTheaterCollection(userId, {
            tmdbId: row.tmdb_id,
            title: row.movie_title,
            posterPath: row.poster_path,
            mediaType: row.media_type,
        }).catch((err) => console.warn('log -> theater collection sync failed:', err?.message));
    }

    supabase.from('user_watched_movies').upsert(
        {
            user_id: userId,
            movie_id: row.tmdb_id,
            movie_title: row.movie_title,
            poster_path: row.poster_path,
            media_type: row.media_type,
        },
        { onConflict: 'user_id,movie_id' },
    ).then(({ error: watchedErr }) => {
        if (watchedErr) console.warn('log -> user_watched_movies failed:', watchedErr.message);
    });

    // Seen ≠ loved: watching only excludes from recs. Rebuild taste when the
    // log includes a rating (opinion), not for watch-only diary entries.
    if (row.rating != null) {
        import('./tasteProfileApi.js').then(({ requestTasteProfileRebuild }) => {
            requestTasteProfileRebuild().catch(() => {});
        });
    }
    import('./socialApi.js').then(({ checkBadges, updateStreak }) => {
        checkBadges().catch(() => {});
        updateStreak().catch(() => {});
    });

    return { success: true, data };
}

// Which seasons of this show the user has already marked watched — used to
// decide each season card's eye-icon state (filled vs outline).
export async function getUserWatchedSeasons(userId, tmdbId) {
    if (!userId || !tmdbId) return [];

    const { data, error } = await supabase
        .from('movie_logs')
        .select('season_number')
        .eq('user_id', userId)
        .eq('tmdb_id', String(tmdbId))
        .not('season_number', 'is', null);

    if (error) {
        console.error('getUserWatchedSeasons:', error);
        return [];
    }
    return (data || []).map((row) => row.season_number);
}

// One-click toggle for the season "eye icon" — click to mark a season watched
// (creates a lightweight log + a public activity-feed/home-feed post), click
// again to unmark (removes them). Deliberately skips the richer rating/review/
// watched-with fields createMovieLog asks for — this is a quick watched marker,
// not a full diary entry.
export async function toggleSeasonWatched(userId, input) {
    if (!userId) return { success: false, error: new Error('Not signed in') };

    const tmdbId = String(input.tmdbId);
    const seasonNumber = input.seasonNumber;

    const { data: existing } = await supabase
        .from('movie_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('tmdb_id', tmdbId)
        .eq('season_number', seasonNumber)
        .maybeSingle();

    if (existing) {
        const { error } = await supabase.from('movie_logs').delete().eq('id', existing.id);
        if (error) {
            console.error('toggleSeasonWatched (unmark):', error);
            return { success: false, error };
        }

        // Best-effort cleanup of the activity/feed rows this log created.
        await supabase.from('activity_feed').delete()
            .eq('user_id', userId).eq('target_tmdb_id', tmdbId).eq('season_number', seasonNumber);
        await supabase.from('feed_posts').delete()
            .eq('user_id', userId).eq('tmdb_id', tmdbId).eq('season_number', seasonNumber).eq('post_type', 'log');

        return { success: true, watched: false };
    }

    const row = {
        user_id: userId,
        tmdb_id: tmdbId,
        media_type: 'tv',
        movie_title: input.title,
        poster_path: input.posterPath || null,
        season_number: seasonNumber,
        watched_on: new Date().toISOString().slice(0, 10),
        visibility: 'public',
    };

    const { data, error } = await supabase.from('movie_logs').insert(row).select().single();
    if (error) {
        console.error('toggleSeasonWatched (mark):', error);
        return { success: false, error };
    }

    const seasonLabel = input.seasonName || `Season ${seasonNumber}`;

    supabase.from('activity_feed').insert({
        user_id: userId,
        event_type: 'log',
        target_tmdb_id: tmdbId,
        target_movie_title: row.movie_title,
        target_poster_path: row.poster_path,
        media_type: 'tv',
        season_number: seasonNumber,
        payload: { log_id: data.id, season_name: seasonLabel },
        visibility: 'public',
    }).then(({ error: feedErr }) => {
        if (feedErr) console.warn('season log -> activity_feed failed:', feedErr.message);
    });

    supabase.from('feed_posts').insert({
        user_id: userId,
        content: `Watched ${seasonLabel} of ${row.movie_title}`,
        tmdb_id: tmdbId,
        media_type: 'tv',
        movie_title: row.movie_title,
        movie_poster: row.poster_path,
        season_number: seasonNumber,
        post_type: 'log',
        has_image: false,
        visibility: 'public',
    }).then(({ error: feedErr }) => {
        if (feedErr) console.warn('season log -> feed_posts failed:', feedErr.message);
    });

    supabase.from('user_watched_movies').upsert(
        { user_id: userId, movie_id: tmdbId, movie_title: row.movie_title, poster_path: row.poster_path, media_type: 'tv' },
        { onConflict: 'user_id,movie_id' },
    ).then(({ error: watchedErr }) => {
        if (watchedErr) console.warn('season log -> user_watched_movies failed:', watchedErr.message);
    });

    import('./socialApi.js').then(({ checkBadges, updateStreak }) => {
        checkBadges().catch(() => {});
        updateStreak().catch(() => {});
    });

    return { success: true, watched: true, data };
}

export async function getUserMovieLogs(userId, { limit = 50, offset = 0 } = {}) {
    if (!userId) return [];

    const { data, error } = await supabase
        .from('movie_logs')
        .select('*')
        .eq('user_id', userId)
        .order('watched_on', { ascending: false })
        .range(offset, offset + limit - 1);

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

// Pretty labels + display order for the Achievements page categories.
const ACHIEVEMENT_CATEGORIES = [
    { key: 'watching', label: 'Watching' },
    { key: 'reviewing', label: 'Reviewing' },
    { key: 'rating', label: 'Rating' },
    { key: 'collections', label: 'Collections' },
    { key: 'genre', label: 'Genre Explorer' },
    { key: 'decades', label: 'Decades' },
    { key: 'theater', label: 'Theater' },
    { key: 'streaks', label: 'Streaks' },
    { key: 'social', label: 'Social' },
    { key: 'community', label: 'Community' },
];

const prettify = (k) => String(k || 'Other').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Reddit-style achievements: ALL badge definitions merged with the user's earned
 * state, grouped by category with per-category + overall progress. Earned badges
 * sort first (newest), then locked ones (by definition order).
 */
export async function getAchievements(userId) {
    const defs = await getBadgeDefinitions();

    let earnedMap = new Map();
    if (userId) {
        const { data } = await supabase
            .from('user_badges').select('badge_id, earned_at').eq('user_id', userId);
        earnedMap = new Map((data || []).map((r) => [r.badge_id, r.earned_at]));
    }

    const merged = defs.map((d) => ({ ...d, earned: earnedMap.has(d.id), earned_at: earnedMap.get(d.id) || null }));

    const groups = {};
    for (const b of merged) {
        const k = b.category || 'other';
        (groups[k] = groups[k] || []).push(b);
    }

    const sortBadges = (arr) => [...arr].sort((a, b) => {
        if (a.earned !== b.earned) return a.earned ? -1 : 1;
        if (a.earned && b.earned) return new Date(b.earned_at) - new Date(a.earned_at);
        return (a.sort_order || 0) - (b.sort_order || 0);
    });

    const orderedKeys = [
        ...ACHIEVEMENT_CATEGORIES.map((c) => c.key).filter((k) => groups[k]),
        ...Object.keys(groups).filter((k) => !ACHIEVEMENT_CATEGORIES.some((c) => c.key === k)),
    ];

    const categories = orderedKeys.map((key) => {
        const label = ACHIEVEMENT_CATEGORIES.find((c) => c.key === key)?.label || prettify(key);
        const badges = sortBadges(groups[key]);
        return { key, label, badges, unlocked: badges.filter((b) => b.earned).length, total: badges.length };
    });

    return {
        categories,
        totalUnlocked: merged.filter((b) => b.earned).length,
        total: merged.length,
    };
}
