import { supabase } from './supabase';

// notifications.actor_id / post rows aren't FK'd to user_profiles (same reason
// post_comments.user_id isn't, per socialFeedApi.js), so actor profiles and post
// previews are fetched separately and stitched together here.
export async function getNotifications(userId, { limit = 30, offset = 0 } = {}) {
    if (!userId) return [];

    const { data, error } = await supabase
        .from('notifications')
        .select('id, type, actor_id, post_id, comment_id, is_read, created_at')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        console.error('[getNotifications]', error);
        return [];
    }
    if (!data?.length) return [];

    const actorIds = [...new Set(data.map((n) => n.actor_id).filter(Boolean))];
    const postIds = [...new Set(data.map((n) => n.post_id).filter(Boolean))];
    const commentIds = [...new Set(data.map((n) => n.comment_id).filter(Boolean))];

    const [{ data: actors }, { data: posts }, { data: comments }] = await Promise.all([
        actorIds.length
            ? supabase.from('user_profiles').select('id, display_name, username, avatar_id').in('id', actorIds)
            : Promise.resolve({ data: [] }),
        postIds.length
            ? supabase.from('feed_posts').select('id, content, movie_poster, movie_title').in('id', postIds)
            : Promise.resolve({ data: [] }),
        commentIds.length
            ? supabase.from('post_comments').select('id, content').in('id', commentIds)
            : Promise.resolve({ data: [] }),
    ]);

    const actorMap = new Map((actors || []).map((a) => [a.id, a]));
    const postMap = new Map((posts || []).map((p) => [p.id, p]));
    const commentMap = new Map((comments || []).map((c) => [c.id, c]));

    return data.map((n) => ({
        id: n.id,
        type: n.type,
        isRead: n.is_read,
        createdAt: n.created_at,
        postId: n.post_id,
        actor: actorMap.get(n.actor_id) || null,
        post: postMap.get(n.post_id) || null,
        comment: commentMap.get(n.comment_id) || null,
    }));
}

export async function getUnreadNotificationCount(userId) {
    if (!userId) return 0;

    const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .eq('is_read', false);

    if (error) {
        console.error('[getUnreadNotificationCount]', error);
        return 0;
    }
    return count || 0;
}

export async function markNotificationsRead(userId, ids) {
    if (!userId || !ids?.length) return { ok: false };

    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', userId)
        .in('id', ids);

    if (error) {
        console.error('[markNotificationsRead]', error);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

export async function markAllNotificationsRead(userId) {
    if (!userId) return { ok: false };

    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', userId)
        .eq('is_read', false);

    if (error) {
        console.error('[markAllNotificationsRead]', error);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}
