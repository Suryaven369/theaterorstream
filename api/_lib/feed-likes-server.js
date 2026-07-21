import { getSupabaseAdmin } from './supabase-admin.js';

function trailerSubjectIdVariants(tmdbId) {
    const id = String(tmdbId);
    return [id, `movie:${id}`, `tv:${id}`];
}

/**
 * Persist feed upvotes server-side (service role) after JWT auth.
 * Avoids browser/proxy RLS edge cases that leave optimistic UI without a DB row.
 */
export async function toggleFeedLikeForUser(userId, { kind, id, currentlyLiked }) {
    if (!userId) throw new Error('Sign in to upvote');
    if (!kind || id == null || id === '') throw new Error('Invalid upvote subject');

    const supabase = getSupabaseAdmin();
    const subjectId = String(id);
    const liked = !!currentlyLiked;

    if (kind === 'post') {
        if (liked) {
            const { error } = await supabase
                .from('post_likes')
                .delete()
                .eq('post_id', subjectId)
                .eq('user_id', userId);
            if (error) throw new Error(error.message || 'Failed to remove post upvote');
            return { liked: false };
        }
        const { error } = await supabase
            .from('post_likes')
            .insert({ post_id: subjectId, user_id: userId });
        if (error && error.code !== '23505') {
            throw new Error(error.message || 'Failed to save post upvote');
        }
        return { liked: true };
    }

    if (kind === 'article' || kind === 'tweet' || kind === 'trailer' || kind === 'comment') {
        // Comments stored as article + comment:{uuid} so we don't need a CHECK migration
        const storeKind = kind === 'tweet' || kind === 'comment' ? 'article' : kind;
        const storeId = kind === 'comment' ? `comment:${subjectId}` : subjectId;

        if (liked) {
            let query = supabase.from('feed_item_likes').delete().eq('user_id', userId);
            if (kind === 'trailer') {
                query = query
                    .eq('subject_kind', 'trailer')
                    .in('subject_id', trailerSubjectIdVariants(subjectId));
            } else if (kind === 'comment') {
                query = query.eq('subject_kind', 'article').eq('subject_id', storeId);
            } else {
                query = query
                    .in('subject_kind', ['article', 'tweet'])
                    .eq('subject_id', subjectId);
            }
            const { error } = await query;
            if (error) {
                throw new Error(error.message || error.details || 'Failed to remove upvote');
            }
            return { liked: false };
        }

        const { error } = await supabase
            .from('feed_item_likes')
            .insert({
                subject_kind: storeKind,
                subject_id: storeId,
                user_id: userId,
            });
        if (error && error.code !== '23505') {
            const msg = error.message || error.details || '';
            if (/feed_item_likes/i.test(msg) || error.code === '42P01') {
                throw new Error(
                    'Missing feed_item_likes table — run supabase/migrations/20260723100000_feed_item_likes.sql in Supabase SQL Editor',
                );
            }
            throw new Error(msg || 'Failed to save upvote');
        }

        const { data: row, error: readErr } = await supabase
            .from('feed_item_likes')
            .select('id')
            .eq('subject_kind', storeKind)
            .eq('subject_id', storeId)
            .eq('user_id', userId)
            .maybeSingle();
        if (readErr) throw readErr;
        if (!row) throw new Error('Upvote did not persist');

        return { liked: true };
    }

    throw new Error(`Unsupported upvote kind: ${kind}`);
}
