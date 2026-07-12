import { getSupabaseAdmin } from './supabase-admin.js';

function trailerSubjectIdVariants(tmdbId) {
    const id = String(tmdbId).replace(/^(movie|tv):/, '');
    return [id, `movie:${id}`, `tv:${id}`];
}

/** Normalize subject the same way as feed likes. */
export function normalizeThreadSubject(kind, id) {
    const k = String(kind || '');
    let sid = String(id || '');
    if (k === 'tweet' || k === 'article') {
        return { kind: 'article', id: sid.replace(/^article-/, '') };
    }
    if (k === 'trailer') {
        return { kind: 'trailer', id: sid.replace(/^(movie|tv):/, '').replace(/^trailer-/, '') };
    }
    if (k === 'post') {
        return { kind: 'post', id: sid };
    }
    return null;
}

export async function addFeedThreadComment(userId, { kind, id, content, parentId = null }) {
    if (!userId) throw new Error('Sign in to comment');
    const text = String(content || '').trim().slice(0, 2000);
    if (!text) throw new Error('Comment cannot be empty');

    const subject = normalizeThreadSubject(kind, id);
    if (!subject) throw new Error('Invalid comment subject');

    const supabase = getSupabaseAdmin();

    if (subject.kind === 'post') {
        const row = {
            post_id: subject.id,
            user_id: userId,
            content: text,
            parent_id: parentId || null,
        };
        const { data, error } = await supabase
            .from('post_comments')
            .insert(row)
            .select('id, user_id, content, parent_id, created_at, likes_count')
            .single();
        if (error) throw error;
        return data;
    }

    const { data, error } = await supabase
        .from('feed_thread_comments')
        .insert({
            subject_kind: subject.kind,
            subject_id: subject.id,
            user_id: userId,
            content: text,
            parent_id: parentId || null,
        })
        .select('id, user_id, content, parent_id, created_at, subject_kind, subject_id')
        .single();

    if (error) {
        if (/feed_thread_comments/i.test(error.message || '')) {
            throw new Error('Run feed_thread_comments migration in Supabase SQL Editor');
        }
        throw error;
    }
    return data;
}

export async function listFeedThreadComments({ kind, id }) {
    const subject = normalizeThreadSubject(kind, id);
    if (!subject) return [];

    const supabase = getSupabaseAdmin();

    if (subject.kind === 'post') {
        const { data, error } = await supabase
            .from('post_comments')
            .select('id, user_id, content, parent_id, created_at, likes_count')
            .eq('post_id', subject.id)
            .order('created_at', { ascending: true })
            .limit(100);
        if (error) throw error;
        return data || [];
    }

    const ids = subject.kind === 'trailer'
        ? trailerSubjectIdVariants(subject.id)
        : [subject.id];
    const kinds = subject.kind === 'article'
        ? ['article', 'tweet']
        : [subject.kind];

    const { data, error } = await supabase
        .from('feed_thread_comments')
        .select('id, user_id, content, parent_id, created_at, subject_kind, subject_id')
        .in('subject_kind', kinds)
        .in('subject_id', ids)
        .order('created_at', { ascending: true })
        .limit(100);

    if (error) {
        if (/feed_thread_comments/i.test(error.message || '')) return [];
        throw error;
    }
    return data || [];
}
