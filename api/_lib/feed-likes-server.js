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
            if (error) throw error;
            return { liked: false };
        }
        const { error } = await supabase
            .from('post_likes')
            .insert({ post_id: subjectId, user_id: userId });
        if (error && error.code !== '23505') throw error;
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
            if (error) throw error;
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
            if (/feed_item_likes/i.test(error.message || '')) {
                throw new Error('Run feed_item_likes migration in Supabase SQL Editor');
            }
            throw error;
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
