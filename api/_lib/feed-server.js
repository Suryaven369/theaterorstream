import { getSupabaseAdmin } from './supabase-admin.js';
import { getUserFollowing } from './feed-follow-helper.js';

const FEED_SELECT = `
  id, user_id, event_type, target_tmdb_id, target_movie_title, target_poster_path,
  media_type, payload, visibility, engagement_score, created_at
`;

function engagementBoost(item) {
    const base = item.engagement_score || 0;
    const ageHours = (Date.now() - new Date(item.created_at).getTime()) / 3600000;
    const decay = Math.max(0.3, 1 - ageHours / 168);
    let boost = base * decay;
    if (item.event_type === 'badge') boost += 5;
    if (item.event_type === 'review') boost += 15;
    return boost;
}

async function hydrateProfiles(supabase, items) {
    const userIds = [...new Set(items.map((i) => i.user_id).filter(Boolean))];
    if (!userIds.length) return items;

    const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_id')
        .in('id', userIds);

    const byId = new Map((profiles || []).map((p) => [p.id, p]));
    return items.map((item) => ({
        ...item,
        profile: byId.get(item.user_id) || null,
    }));
}

async function fetchActivity(supabase, { filter, userId, limit = 40, offset = 0 }) {
    let query = supabase
        .from('activity_feed')
        .select(FEED_SELECT)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (filter === 'following' && userId) {
        const followingIds = await getUserFollowing(supabase, userId);
        const ids = [...new Set([userId, ...followingIds])];
        if (!ids.length) return [];
        query = query.in('user_id', ids);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
}

async function fetchSocialReviews(supabase, { limit = 20, offset = 0, userIds = null }) {
    let query = supabase
        .from('social_reviews')
        .select(`
      id, user_id, tmdb_id, media_type, movie_title, poster_path, title, content,
      spoiler, likes_count, comments_count, visibility, created_at
    `)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (userIds?.length) {
        query = query.in('user_id', userIds);
    }

    const { data, error } = await query;
    if (error) {
        if (error.code === '42P01') return [];
        throw new Error(error.message);
    }
    return data || [];
}

function mergeFeedItems(activity, reviews) {
    const activityItems = activity.map((a) => ({
        kind: 'activity',
        sortKey: a.created_at,
        engagement: engagementBoost(a),
        data: a,
    }));

    const reviewItems = reviews.map((r) => ({
        kind: 'review',
        sortKey: r.created_at,
        engagement: (r.likes_count || 0) * 2 + (r.comments_count || 0) * 3,
        data: { ...r, event_type: 'review' },
    }));

    return [...activityItems, ...reviewItems];
}

export async function getGlobalFeed({ mode = 'recent', userId, limit = 30, offset = 0 }) {
    const supabase = getSupabaseAdmin();
    const fetchLimit = Math.min(limit + offset + 20, 80);

    const activity = await fetchActivity(supabase, {
        filter: mode === 'following' ? 'following' : null,
        userId,
        limit: fetchLimit,
        offset: 0,
    });

    const reviews = await fetchSocialReviews(supabase, {
        limit: fetchLimit,
        offset: 0,
        userIds: mode === 'following' && userId
            ? [...new Set([userId, ...(await getUserFollowing(supabase, userId))])]
            : null,
    });

    let merged = mergeFeedItems(activity, reviews);

    if (mode === 'popular') {
        merged.sort((a, b) => b.engagement - a.engagement || new Date(b.sortKey) - new Date(a.sortKey));
    } else {
        merged.sort((a, b) => new Date(b.sortKey) - new Date(a.sortKey));
    }

    const sliced = merged.slice(offset, offset + limit);
    const userIds = [...new Set(sliced.map((i) => i.data.user_id).filter(Boolean))];

    const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_id')
        .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    return sliced.map((item) => ({
        kind: item.kind,
        engagement: item.engagement,
        ...item.data,
        profile: profileMap.get(item.data.user_id) || null,
    }));
}

export async function getForYouFeed(userId, { limit = 30, offset = 0 } = {}) {
    const supabase = getSupabaseAdmin();

    const { data: taste } = await supabase
        .from('user_taste_profiles')
        .select('genre_weights, mood_preferences')
        .eq('user_id', userId)
        .maybeSingle();

    const topGenres = Object.entries(taste?.genre_weights || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => String(id));

    const reviews = await fetchSocialReviews(supabase, { limit: 60, offset: 0 });
    const activity = await fetchActivity(supabase, { limit: 40, offset: 0 });

    let merged = mergeFeedItems(activity, reviews);

    if (topGenres.length) {
        merged = merged.map((item) => {
            const genres = item.data?.payload?.genres || item.data?.genre_ids || [];
            const match = Array.isArray(genres)
                ? genres.some((g) => topGenres.includes(String(g?.id || g)))
                : false;
            return { ...item, engagement: item.engagement + (match ? 20 : 0) };
        });
    }

    merged.sort((a, b) => b.engagement - a.engagement || new Date(b.sortKey) - new Date(a.sortKey));
    const sliced = merged.slice(offset, offset + limit);

    const userIds = [...new Set(sliced.map((i) => i.data.user_id).filter(Boolean))];
    const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_id')
        .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    return sliced.map((item) => ({
        kind: item.kind,
        ...item.data,
        profile: profileMap.get(item.data.user_id) || null,
    }));
}

export async function getUserSuggestions(userId, limit = 8) {
    const supabase = getSupabaseAdmin();

    const { data: myTaste } = await supabase
        .from('user_taste_profiles')
        .select('genre_weights')
        .eq('user_id', userId)
        .maybeSingle();

    const myGenres = new Set(
        Object.entries(myTaste?.genre_weights || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([id]) => String(id)),
    );

    const { data: following } = await supabase
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', userId);

    const excludeIds = new Set([userId, ...(following || []).map((f) => f.following_id)]);

    const { data: candidates } = await supabase
        .from('user_taste_profiles')
        .select('user_id, genre_weights, rating_count')
        .gt('rating_count', 3)
        .limit(50);

    const scored = (candidates || [])
        .filter((c) => !excludeIds.has(c.user_id))
        .map((c) => {
            const theirGenres = Object.keys(c.genre_weights || {});
            let overlap = 0;
            theirGenres.forEach((g) => {
                if (myGenres.has(String(g))) overlap += 1;
            });
            return { user_id: c.user_id, score: overlap + (c.rating_count || 0) * 0.01 };
        })
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    if (!scored.length) {
        const { data: active } = await supabase
            .from('user_profiles')
            .select('id, username, display_name, avatar_id')
            .neq('id', userId)
            .limit(limit);

        return (active || []).filter((p) => !excludeIds.has(p.id));
    }

    const ids = scored.map((s) => s.user_id);
    const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_id')
        .in('id', ids);

    return (profiles || []).map((p) => ({
        ...p,
        matchScore: scored.find((s) => s.user_id === p.id)?.score || 0,
    }));
}
