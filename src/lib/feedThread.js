import { supabase } from './supabase';
import { toPublicStorageUrl } from './storagePublicUrl';
import { getFeedPostById, getPostComments, addComment } from './socialFeedApi';
import { isTwitterRssUrl } from './twitterRss';
import { generateThreadSlug, parseThreadSlug } from './slugUtils';

/**
 * Parse Home feed composite IDs / shareable slugs into a thread subject.
 * Supports:
 * - Shareable: "{short-title}-{8hex}" (article/post), "{title}-t{tmdbId}" (trailer)
 * - Legacy: full 32hex suffix, article-{uuid}, trailer-{tmdbId}, bare UUID post
 */
export function parseFeedThreadId(feedId = '') {
    const parsed = parseThreadSlug(feedId);
    if (!parsed) return null;
    return {
        kind: parsed.kind,
        id: parsed.id || null,
        shortId: parsed.shortId || null,
        feedId: String(feedId || '').trim(),
        legacy: !!parsed.legacy,
    };
}

/** Canonical shareable path for a feed item. */
export function threadPathForItem(item) {
    if (!item?.id) return '/';

    if (item.type === 'blog' && item.blogId) {
        return `/blog/${item.blogId}`;
    }

    if (item.type === 'article' || item.type === 'tweet') {
        const uuid = String(item.id).startsWith('article-')
            ? String(item.id).slice('article-'.length)
            : String(item.id);
        const title = item.title || 'article';
        return `/thread/${generateThreadSlug(title, { kind: 'article', id: uuid })}`;
    }

    if (item.type === 'trailer') {
        const tmdb = item.tmdb_id != null ? item.tmdb_id : String(item.id).replace(/^trailer-/, '');
        const title = item.title || item.trailerName || 'trailer';
        return `/thread/${generateThreadSlug(title, { kind: 'trailer', id: tmdb })}`;
    }

    // User posts / activity — slug from content snippet + post uuid
    const title = item.movieTitle || item.content || item.action || 'post';
    return `/thread/${generateThreadSlug(title, { kind: 'post', id: item.id })}`;
}

function formatTimeAgo(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(iso).toLocaleDateString();
}

async function mapCommentAuthors(rows) {
    const userIds = [...new Set((rows || []).map((r) => r.user_id).filter(Boolean))];
    let profilesById = {};
    if (userIds.length) {
        const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, display_name, username, avatar_url, is_verified')
            .in('id', userIds);
        profilesById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    }
    return (rows || []).map((c) => {
        const p = profilesById[c.user_id];
        return {
            id: c.id,
            content: c.content,
            time: formatTimeAgo(c.created_at),
            createdAt: c.created_at,
            parentId: c.parent_id || null,
            likesCount: 0,
            user: {
                id: c.user_id,
                name: p?.display_name || p?.username || 'User',
                username: p?.username || 'user',
                avatar: '👤',
                avatarUrl: toPublicStorageUrl(p?.avatar_url) || null,
                isVerified: !!p?.is_verified,
            },
        };
    });
}

/** Load the original feed item for a thread page. */
export async function getThreadItem(feedId, userId = null) {
    const parsed = parseFeedThreadId(feedId);
    if (!parsed) return { ok: false, item: null };

    if (parsed.kind === 'post') {
        return getFeedPostById(parsed.id, userId);
    }

    if (parsed.kind === 'article_or_post') {
        let uuid = parsed.id;
        if (!uuid && parsed.shortId) {
            uuid = await resolveUuidByShortId(parsed.shortId);
        }
        if (!uuid) return { ok: false, item: null };
        // Prefer article, then fall back to user post (same UUID space)
        const articleRes = await loadArticleThread(uuid);
        if (articleRes.ok) return articleRes;
        return getFeedPostById(uuid, userId);
    }

    if (parsed.kind === 'article') {
        return loadArticleThread(parsed.id);
    }

    if (parsed.kind === 'trailer') {
        return loadTrailerThread(parsed.id);
    }

    return { ok: false, item: null };
}

/**
 * Resolve an 8-hex short id to a full UUID via range scan on uuid columns.
 * UUID first segment is unique enough for this product scale.
 */
async function resolveUuidByShortId(shortId) {
    const prefix = String(shortId || '').toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(prefix)) return null;

    const lo = `${prefix}-0000-0000-0000-000000000000`;
    const hi = `${prefix}-ffff-ffff-ffff-ffffffffffff`;

    const [articles, posts] = await Promise.all([
        supabase
            .from('feed_articles')
            .select('id')
            .gte('id', lo)
            .lte('id', hi)
            .limit(2),
        supabase
            .from('feed_posts')
            .select('id')
            .gte('id', lo)
            .lte('id', hi)
            .limit(2),
    ]);

    if (articles.error) console.warn('[resolveUuidByShortId articles]', articles.error.message);
    if (posts.error) console.warn('[resolveUuidByShortId posts]', posts.error.message);

    const articleRows = articles.data || [];
    if (articleRows.length === 1) return articleRows[0].id;
    if (articleRows.length > 1) {
        // Extremely rare prefix collision — prefer approved active article
        const { data: preferred } = await supabase
            .from('feed_articles')
            .select('id')
            .gte('id', lo)
            .lte('id', hi)
            .eq('status', 'approved')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
        if (preferred?.id) return preferred.id;
        return articleRows[0].id;
    }

    const postRows = posts.data || [];
    if (postRows.length) return postRows[0].id;
    return null;
}

async function loadArticleThread(articleId) {
    const { data: a, error } = await supabase
        .from('feed_articles')
        .select('id, source_name, source_logo_url, title, link, author, summary, summary_items, image_url, published_at, status, is_active')
        .eq('id', articleId)
        .eq('status', 'approved')
        .eq('is_active', true)
        .maybeSingle();
    if (error || !a) {
        if (error) console.error('[getThreadItem article]', error);
        return { ok: false, item: null };
    }
    const twitter = isTwitterRssUrl(a.link || '');
    return {
        ok: true,
        item: {
            id: `article-${a.id}`,
            type: twitter ? 'tweet' : 'article',
            title: a.title,
            sourceName: a.source_name,
            sourceLogo: a.source_logo_url,
            imageUrl: a.image_url,
            summary: a.summary,
            summaryItems: Array.isArray(a.summary_items) ? a.summary_items : null,
            publishedAt: a.published_at,
            createdAt: a.published_at,
            link: a.link,
            user: null,
            likes: 0,
            isLiked: false,
            comments: 0,
        },
    };
}

async function loadTrailerThread(tmdbId) {
    const id = String(tmdbId).replace(/^(movie|tv):/, '');
    const { data: rows, error } = await supabase
        .from('trailer_posts')
        .select(`
            tmdb_id, media_type, title, poster_path, backdrop_path, release_date,
            youtube_key, trailer_url, trailer_name, published_at, source_name, source_logo
        `)
        .eq('tmdb_id', String(id))
        .eq('is_active', true)
        .order('published_at', { ascending: false })
        .limit(5);
    if (error) console.error('[getThreadItem trailer]', error);
    const m = (rows || [])[0];
    if (!m) return { ok: false, item: null };
    return {
        ok: true,
        item: {
            id: `trailer-${m.tmdb_id}`,
            type: 'trailer',
            tmdb_id: m.tmdb_id,
            title: m.title,
            mediaType: m.media_type,
            releaseDate: m.release_date || null,
            thumbnail: m.youtube_key ? `https://i.ytimg.com/vi/${m.youtube_key}/hqdefault.jpg` : null,
            thumbnailFallback: m.backdrop_path
                ? `https://image.tmdb.org/t/p/w780${m.backdrop_path}`
                : (m.poster_path ? `https://image.tmdb.org/t/p/w780${m.poster_path}` : null),
            trailerUrl: m.trailer_url || (m.youtube_key ? `https://www.youtube.com/watch?v=${m.youtube_key}` : null),
            trailerName: m.trailer_name || 'Official Trailer',
            youtubeKey: m.youtube_key || null,
            publishedAt: m.published_at,
            createdAt: m.published_at,
            sourceName: m.source_name || null,
            sourceLogo: m.source_logo || null,
            user: null,
            likes: 0,
            isLiked: false,
            comments: 0,
        },
    };
}

function threadSubjectFromItem(item) {
    if (!item) return null;
    if (item.type === 'post' || item.type === 'activity') {
        return { kind: 'post', id: String(item.id) };
    }
    if (item.type === 'article' || item.type === 'tweet') {
        const id = String(item.id).startsWith('article-')
            ? String(item.id).slice('article-'.length)
            : String(item.id);
        // Always store/read as article so tweet vs article UI type can't desync comments
        return { kind: 'article', id };
    }
    if (item.type === 'trailer') {
        const tmdb = item.tmdb_id != null
            ? String(item.tmdb_id)
            : String(item.id).replace(/^trailer-/, '');
        return { kind: 'trailer', id: String(tmdb) };
    }
    return null;
}

function trailerSubjectIdVariants(tmdbId) {
    const id = String(tmdbId).replace(/^(movie|tv):/, '');
    return [id, `movie:${id}`, `tv:${id}`];
}

function resolveApiBase() {
    const configured = import.meta.env?.VITE_API_BASE_URL;
    if (configured) return String(configured).replace(/\/$/, '');
    return '';
}

async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
}

export async function getThreadComments(item) {
    const subject = threadSubjectFromItem(item);
    if (!subject) return [];

    if (subject.kind === 'post') {
        return getPostComments(subject.id);
    }

    const kinds = subject.kind === 'article' ? ['article', 'tweet'] : [subject.kind];
    const ids = subject.kind === 'trailer'
        ? trailerSubjectIdVariants(subject.id)
        : [subject.id];

    const { data, error } = await supabase
        .from('feed_thread_comments')
        .select('id, user_id, content, parent_id, created_at, subject_kind, subject_id')
        .in('subject_kind', kinds)
        .in('subject_id', ids)
        .order('created_at', { ascending: true })
        .limit(100);

    if (error) {
        console.error('[getThreadComments]', error);
        return [];
    }
    return mapCommentAuthors(data);
}

/**
 * Attach total comment counts for feed cards (articles/tweets/trailers + posts).
 * Posts already carry comments_count from getFeedPosts; this refreshes non-posts
 * from feed_thread_comments and can refresh posts from post_comments when needed.
 */
export async function attachFeedItemCommentCounts(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return list;

    const posts = [];
    const feedTargets = [];
    for (const item of list) {
        const subject = threadSubjectFromItem(item);
        if (!subject) continue;
        if (subject.kind === 'post') posts.push({ item, subject });
        else feedTargets.push({ item, subject });
    }

    const countByItemId = new Map();

    if (posts.length) {
        const postIds = [...new Set(posts.map((p) => p.subject.id))];
        const { data: rows, error } = await supabase
            .from('post_comments')
            .select('post_id')
            .in('post_id', postIds);
        if (error) {
            console.warn('[attachFeedItemCommentCounts posts]', error.message);
            for (const { item } of posts) {
                countByItemId.set(item.id, item.comments ?? 0);
            }
        } else {
            const map = new Map();
            for (const row of rows || []) {
                const pid = String(row.post_id);
                map.set(pid, (map.get(pid) || 0) + 1);
            }
            for (const { item, subject } of posts) {
                countByItemId.set(item.id, map.get(subject.id) || 0);
            }
        }
    }

    if (feedTargets.length) {
        const kinds = ['article', 'tweet', 'trailer'];
        const ids = new Set();
        for (const { subject } of feedTargets) {
            if (subject.kind === 'trailer') {
                trailerSubjectIdVariants(subject.id).forEach((v) => ids.add(v));
            } else {
                ids.add(subject.id);
            }
        }

        const { data: rows, error } = await supabase
            .from('feed_thread_comments')
            .select('subject_kind, subject_id')
            .in('subject_kind', kinds)
            .in('subject_id', [...ids]);

        if (error) {
            console.warn('[attachFeedItemCommentCounts]', error.message);
            for (const { item } of feedTargets) {
                countByItemId.set(item.id, item.comments ?? 0);
            }
        } else {
            const normKey = (kind, sid) => {
                if (kind === 'trailer') {
                    return `trailer:${String(sid).replace(/^(movie|tv):/, '')}`;
                }
                if (kind === 'tweet' || kind === 'article') return `article:${sid}`;
                return `${kind}:${sid}`;
            };
            const map = new Map();
            for (const row of rows || []) {
                const key = normKey(row.subject_kind, row.subject_id);
                map.set(key, (map.get(key) || 0) + 1);
            }
            for (const { item, subject } of feedTargets) {
                const key = subject.kind === 'trailer'
                    ? `trailer:${subject.id}`
                    : `article:${subject.id}`;
                countByItemId.set(item.id, map.get(key) || 0);
            }
        }
    }

    return list.map((item) => {
        if (!countByItemId.has(item.id)) return item;
        return { ...item, comments: countByItemId.get(item.id) || 0 };
    });
}

/** Count comments for a single thread item (including replies). */
export async function getThreadCommentCount(item) {
    const [hydrated] = await attachFeedItemCommentCounts([item]);
    return hydrated?.comments || 0;
}

export async function addThreadComment(item, userId, content, parentId = null) {
    const subject = threadSubjectFromItem(item);
    if (!subject || !userId || !String(content || '').trim()) {
        throw new Error('Invalid comment');
    }

    const token = await getAccessToken();
    if (token) {
        try {
            const response = await fetch(`${resolveApiBase()}/api/social/feed-comment`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    kind: subject.kind,
                    id: subject.id,
                    content: String(content).trim().slice(0, 2000),
                    parentId: parentId || null,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (response.ok && payload?.ok && payload.comment) {
                return payload.comment;
            }
            if (response.status !== 404) {
                throw new Error(payload.error || `Comment failed (${response.status})`);
            }
        } catch (err) {
            const msg = String(err?.message || '');
            if (/comment failed|sign in|migration|invalid|empty/i.test(msg)) throw err;
            console.warn('[addThreadComment] API unreachable, trying direct:', msg);
        }
    }

    // Direct client fallback
    if (subject.kind === 'post') {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const uid = authUser?.id || userId;
        const res = await addComment(subject.id, uid, content, parentId);
        if (!res?.ok) throw new Error(res?.error || 'Comment failed');
        return res.comment;
    }

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const uid = authUser?.id || userId;

    const { data, error } = await supabase
        .from('feed_thread_comments')
        .insert({
            subject_kind: subject.kind,
            subject_id: subject.id,
            user_id: uid,
            content: String(content).trim().slice(0, 2000),
            parent_id: parentId || null,
        })
        .select('id, user_id, content, parent_id, created_at')
        .single();

    if (error) {
        console.error('[addThreadComment]', error);
        if (/feed_thread_comments/i.test(error.message || '') || error.code === '42501') {
            throw new Error(
                error.code === '42501'
                    ? 'Comment blocked. Sign out and back in, then try again.'
                    : 'Run feed_thread_comments migration in Supabase SQL Editor',
            );
        }
        throw error;
    }
    return data;
}

/**
 * Delete own comment (and cascaded replies) from post_comments or feed_thread_comments.
 */
export async function deleteThreadComment(item, commentId, userId) {
    if (!commentId || !userId) return { ok: false, error: 'invalid' };

    const subject = threadSubjectFromItem(item);
    const table = subject?.kind === 'post' || !subject
        ? 'post_comments'
        : 'feed_thread_comments';

    // Prefer the subject table; if that misses (legacy / wrong kind), try the other.
    const tryDelete = async (fromTable) => {
        const { data, error } = await supabase
            .from(fromTable)
            .delete()
            .eq('id', commentId)
            .eq('user_id', userId)
            .select('id');
        if (error) return { ok: false, error: error.message };
        if (data?.length) return { ok: true };
        return { ok: false, error: 'not_found' };
    };

    let result = await tryDelete(table);
    if (!result.ok && result.error === 'not_found') {
        const other = table === 'post_comments' ? 'feed_thread_comments' : 'post_comments';
        result = await tryDelete(other);
    }
    if (!result.ok && result.error === 'not_found') {
        return { ok: false, error: 'Comment not found or already deleted.' };
    }
    return result;
}

/**
 * Edit own comment content.
 */
export async function updateThreadComment(item, commentId, userId, content) {
    const text = String(content || '').trim().slice(0, 2000);
    if (!commentId || !userId || !text) return { ok: false, error: 'invalid' };

    const subject = threadSubjectFromItem(item);
    const table = subject?.kind === 'post' || !subject
        ? 'post_comments'
        : 'feed_thread_comments';

    const tryUpdate = async (fromTable) => {
        const { data, error } = await supabase
            .from(fromTable)
            .update({ content: text })
            .eq('id', commentId)
            .eq('user_id', userId)
            .select('id, content')
            .maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (data?.id) return { ok: true, comment: data };
        return { ok: false, error: 'not_found' };
    };

    let result = await tryUpdate(table);
    if (!result.ok && result.error === 'not_found') {
        const other = table === 'post_comments' ? 'feed_thread_comments' : 'post_comments';
        result = await tryUpdate(other);
    }
    return result;
}

/** Nest flat comments by parentId for Reddit-style threads. */
export function nestComments(flat = []) {
    const byId = new Map();
    const roots = [];
    for (const c of flat) {
        byId.set(c.id, { ...c, replies: [] });
    }
    for (const c of flat) {
        const node = byId.get(c.id);
        if (c.parentId && byId.has(c.parentId)) {
            byId.get(c.parentId).replies.push(node);
        } else {
            roots.push(node);
        }
    }
    return roots;
}
