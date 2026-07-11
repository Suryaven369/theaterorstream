import { getSupabaseAdmin } from './supabase-admin.js';
import { updateUserStreak } from './streak-server.js';

async function countTable(supabase, table, userId, extra = () => {}) {
    let q = supabase.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId);
    q = extra(q) || q;
    const { count } = await q;
    return count || 0;
}

const BADGE_CHECKS = {
    first_reel: (s, uid) => countTable(s, 'movie_logs', uid).then((c) => c >= 1),
    watch_bronze: (s, uid) => countTable(s, 'movie_logs', uid).then((c) => c >= 1),
    watch_silver: (s, uid) => countTable(s, 'movie_logs', uid).then((c) => c >= 25),
    watch_gold: (s, uid) => countTable(s, 'movie_logs', uid).then((c) => c >= 100),
    watch_platinum: (s, uid) => countTable(s, 'movie_logs', uid).then((c) => c >= 500),

    review_bronze: (s, uid) => countTable(s, 'social_reviews', uid).then((c) => c >= 1),
    review_silver: (s, uid) => countTable(s, 'social_reviews', uid).then((c) => c >= 10),
    review_gold: (s, uid) => countTable(s, 'social_reviews', uid).then((c) => c >= 50),
    review_platinum: (s, uid) => countTable(s, 'social_reviews', uid).then((c) => c >= 200),

    rating_bronze: (s, uid) => countTable(s, 'ratings', uid).then((c) => c >= 1),
    rating_silver: (s, uid) => countTable(s, 'ratings', uid).then((c) => c >= 25),
    rating_gold: (s, uid) => countTable(s, 'ratings', uid).then((c) => c >= 100),

    social_bronze: async (s, uid) => {
        const { count } = await s.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid);
        return (count || 0) >= 1;
    },
    social_silver: async (s, uid) => {
        const { count } = await s.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid);
        return (count || 0) >= 10;
    },
    social_gold: async (s, uid) => {
        const { count } = await s.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', uid);
        return (count || 0) >= 100;
    },
    social_platinum: async (s, uid) => {
        const { count } = await s.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', uid);
        return (count || 0) >= 1000;
    },

    collection_bronze: async (s, uid) => {
        const { count } = await s.from('user_collections').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('is_public', true);
        return (count || 0) >= 1;
    },
    collection_silver: async (s, uid) => {
        const { count } = await s.from('user_collections').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('is_public', true);
        return (count || 0) >= 5;
    },
    collection_gold: async (s, uid) => {
        const { count } = await s.from('user_collections').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('is_public', true);
        return (count || 0) >= 25;
    },
    collection_platinum: async (s, uid) => {
        const { count } = await s.from('user_collections').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('is_public', true);
        return (count || 0) >= 100;
    },

    streak_bronze: async (s, uid) => {
        const { data } = await s.from('user_streaks').select('longest_streak').eq('user_id', uid).maybeSingle();
        return (data?.longest_streak || 0) >= 7;
    },
    streak_silver: async (s, uid) => {
        const { data } = await s.from('user_streaks').select('longest_streak').eq('user_id', uid).maybeSingle();
        return (data?.longest_streak || 0) >= 30;
    },
    streak_gold: async (s, uid) => {
        const { data } = await s.from('user_streaks').select('longest_streak').eq('user_id', uid).maybeSingle();
        return (data?.longest_streak || 0) >= 90;
    },
    streak_platinum: async (s, uid) => {
        const { data } = await s.from('user_streaks').select('longest_streak').eq('user_id', uid).maybeSingle();
        return (data?.longest_streak || 0) >= 365;
    },

    theater_bronze: (s, uid) => countTable(s, 'movie_logs', uid, (q) => q.eq('watched_in_theater', true)).then((c) => c >= 5),
    theater_silver: (s, uid) => countTable(s, 'movie_logs', uid, (q) => q.eq('watched_in_theater', true)).then((c) => c >= 25),
    theater_gold: (s, uid) => countTable(s, 'movie_logs', uid, (q) => q.eq('watched_in_theater', true)).then((c) => c >= 100),
    theater_buff: (s, uid) => countTable(s, 'movie_logs', uid, (q) => q.eq('watched_in_theater', true)).then((c) => c >= 10),

    family_night_hero: async (s, uid) => {
        const { count } = await s.from('movie_logs').select('*', { count: 'exact', head: true }).eq('user_id', uid).contains('watched_with', ['family']);
        return (count || 0) >= 10;
    },

    platform_explorer: async (s, uid) => {
        const { data: logs } = await s.from('movie_logs').select('tmdb_id').eq('user_id', uid);
        if (!logs?.length) return false;
        const tmdbIds = [...new Set(logs.map((l) => l.tmdb_id))];
        const { data: movies } = await s.from('movies_library').select('tmdb_id, streaming_platforms').in('tmdb_id', tmdbIds.slice(0, 200));
        const platforms = new Set();
        (movies || []).forEach((m) => {
            (m.streaming_platforms || []).forEach((p) => {
                const name = String(p?.name || '').toLowerCase();
                if (name) platforms.add(name.split(' ')[0]);
            });
        });
        return platforms.size >= 5;
    },

    taste_maker: async (s, uid) => {
        const { data: reviews } = await s.from('reviews').select('upvotes, downvotes').eq('user_id', uid);
        const qualifying = (reviews || []).filter((r) => (r.upvotes || 0) - (r.downvotes || 0) >= 5);
        const { data: social } = await s.from('social_reviews').select('likes_count').eq('user_id', uid);
        const socialQual = (social || []).filter((r) => (r.likes_count || 0) >= 5);
        return qualifying.length + socialQual.length >= 10;
    },

    community_bronze: async (s, uid) => {
        const { data: legacy } = await s.from('reviews').select('upvotes').eq('user_id', uid);
        const { data: social } = await s.from('social_reviews').select('likes_count').eq('user_id', uid);
        const total = (legacy || []).reduce((a, r) => a + (r.upvotes || 0), 0)
            + (social || []).reduce((a, r) => a + (r.likes_count || 0), 0);
        return total >= 10;
    },
    community_silver: async (s, uid) => {
        const { data: legacy } = await s.from('reviews').select('upvotes').eq('user_id', uid);
        const { data: social } = await s.from('social_reviews').select('likes_count').eq('user_id', uid);
        const total = (legacy || []).reduce((a, r) => a + (r.upvotes || 0), 0)
            + (social || []).reduce((a, r) => a + (r.likes_count || 0), 0);
        return total >= 100;
    },
    community_gold: async (s, uid) => {
        const { data: legacy } = await s.from('reviews').select('upvotes').eq('user_id', uid);
        const { data: social } = await s.from('social_reviews').select('likes_count').eq('user_id', uid);
        const total = (legacy || []).reduce((a, r) => a + (r.upvotes || 0), 0)
            + (social || []).reduce((a, r) => a + (r.likes_count || 0), 0);
        return total >= 1000;
    },

    decisive: async (s, uid) => {
        const { count } = await s.from('activity_feed').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('event_type', 'decision_pick');
        return (count || 0) >= 20;
    },

    genre_bronze: (s, uid) => countDistinctGenres(s, uid, 5),
    genre_silver: (s, uid) => countDistinctGenres(s, uid, 10),
    genre_gold: (s, uid) => countDistinctGenres(s, uid, 15),
    genre_platinum: (s, uid) => countDistinctGenres(s, uid, 20),

    decade_bronze: (s, uid) => countDistinctDecades(s, uid, 5),
    decade_silver: (s, uid) => countDistinctDecades(s, uid, 8),
};

async function countDistinctGenres(supabase, userId, min) {
    const { data: logs } = await supabase.from('movie_logs').select('tmdb_id').eq('user_id', userId);
    if (!logs?.length) return false;
    const ids = [...new Set(logs.map((l) => l.tmdb_id))].slice(0, 300);
    const { data: movies } = await supabase.from('movies_library').select('genres').in('tmdb_id', ids);
    const genres = new Set();
    (movies || []).forEach((m) => {
        (m.genres || []).forEach((g) => genres.add(String(g?.id || g?.name || g)));
    });
    return genres.size >= min;
}

async function countDistinctDecades(supabase, userId, min) {
    const { data: logs } = await supabase.from('movie_logs').select('tmdb_id').eq('user_id', userId);
    if (!logs?.length) return false;
    const ids = [...new Set(logs.map((l) => l.tmdb_id))].slice(0, 300);
    const { data: movies } = await supabase.from('movies_library').select('release_date').in('tmdb_id', ids);
    const decades = new Set();
    (movies || []).forEach((m) => {
        const y = m.release_date ? parseInt(String(m.release_date).slice(0, 4), 10) : null;
        if (y && y > 1880) decades.add(Math.floor(y / 10) * 10);
    });
    return decades.size >= min;
}

async function getEarnedBadgeIds(supabase, userId) {
    const { data } = await supabase.from('user_badges').select('badge_id').eq('user_id', userId);
    return new Set((data || []).map((r) => r.badge_id));
}

async function awardBadge(supabase, userId, badgeId) {
    const { data: def } = await supabase.from('badge_definitions').select('*').eq('id', badgeId).maybeSingle();
    if (!def) return null;

    const { error } = await supabase.from('user_badges').insert({ user_id: userId, badge_id: badgeId });
    if (error) {
        if (error.code === '23505') return null;
        throw new Error(error.message);
    }

    await supabase.from('activity_feed').insert({
        user_id: userId,
        event_type: 'badge',
        payload: { badge_id: badgeId, name: def.name, icon: def.icon, tier: def.tier },
        visibility: 'public',
        engagement_score: 10,
    });

    return def;
}

export async function checkAndAwardBadges(userId) {
    const supabase = getSupabaseAdmin();
    const earned = await getEarnedBadgeIds(supabase, userId);
    const newlyAwarded = [];

    for (const [badgeId, checkFn] of Object.entries(BADGE_CHECKS)) {
        if (earned.has(badgeId)) continue;
        try {
            const qualifies = await checkFn(supabase, userId);
            if (!qualifies) continue;
            const def = await awardBadge(supabase, userId, badgeId);
            if (def) newlyAwarded.push(def);
        } catch (err) {
            console.warn(`badge check ${badgeId} failed:`, err.message);
        }
    }

    return { awarded: newlyAwarded };
}

export async function recordDecisionPick(userId, movie) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('activity_feed').insert({
        user_id: userId,
        event_type: 'decision_pick',
        target_tmdb_id: String(movie.tmdb_id),
        target_movie_title: movie.title,
        target_poster_path: movie.poster_path,
        media_type: movie.media_type || 'movie',
        payload: {},
        visibility: 'public',
        engagement_score: 3,
    });
    if (error) throw new Error(error.message);
    await updateUserStreak(userId);
    return checkAndAwardBadges(userId);
}

export async function createSocialReview(userId, body) {
    const supabase = getSupabaseAdmin();
    const row = {
        user_id: userId,
        tmdb_id: String(body.tmdb_id),
        media_type: body.media_type || 'movie',
        movie_title: body.movie_title,
        poster_path: body.poster_path || null,
        title: body.title,
        content: body.content,
        spoiler: !!body.spoiler,
        rating_id: body.rating_id || null,
        visibility: body.visibility || 'public',
    };

    const { data, error } = await supabase.from('social_reviews').insert(row).select().single();
    if (error) throw new Error(error.message);

    try {
        await supabase.rpc('sync_content_hashtags', {
            p_content: `${row.title || ''} ${row.content || ''}`,
            p_content_type: 'review',
            p_content_id: data.id,
            p_user_id: userId,
        });
    } catch (err) {
        console.warn('[createSocialReview] hashtag sync', err.message);
    }

    await supabase.from('activity_feed').insert({
        user_id: userId,
        event_type: 'review',
        target_tmdb_id: row.tmdb_id,
        target_movie_title: row.movie_title,
        target_poster_path: row.poster_path,
        media_type: row.media_type,
        payload: { review_id: data.id, title: row.title, excerpt: row.content.slice(0, 120) },
        visibility: row.visibility,
        engagement_score: 5,
    });

    await updateUserStreak(userId);
    const badges = await checkAndAwardBadges(userId);
    return { review: data, ...badges };
}

export async function toggleReviewLike(userId, reviewId) {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
        .from('review_likes')
        .select('review_id')
        .eq('user_id', userId)
        .eq('review_id', reviewId)
        .maybeSingle();

    if (existing) {
        await supabase.from('review_likes').delete().eq('user_id', userId).eq('review_id', reviewId);
        return { liked: false };
    }

    await supabase.from('review_likes').insert({ user_id: userId, review_id: reviewId });
    return { liked: true };
}

export async function addReviewComment(userId, reviewId, content, parentId = null) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from('review_comments')
        .insert({ user_id: userId, review_id: reviewId, content, parent_id: parentId })
        .select()
        .single();
    if (error) throw new Error(error.message);

    try {
        await supabase.rpc('sync_content_hashtags', {
            p_content: content || '',
            p_content_type: 'comment',
            p_content_id: data.id,
            p_user_id: userId,
        });
    } catch (err) {
        console.warn('[addReviewComment] hashtag sync', err.message);
    }

    return data;
}

export async function toggleCollectionLike(userId, collectionId) {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
        .from('collection_likes')
        .select('collection_id')
        .eq('user_id', userId)
        .eq('collection_id', collectionId)
        .maybeSingle();

    if (existing) {
        await supabase.from('collection_likes').delete().eq('user_id', userId).eq('collection_id', collectionId);
        return { liked: false };
    }

    await supabase.from('collection_likes').insert({ user_id: userId, collection_id: collectionId });
    return { liked: true };
}
