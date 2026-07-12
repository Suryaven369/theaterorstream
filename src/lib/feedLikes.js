import { supabase } from './supabase';
import { likePost, unlikePost } from './socialFeedApi';

/** Session cache for "my likes" — avoids re-fetching the full like history on every page. */
const MY_LIKES_TTL_MS = 60_000;
let myLikesCache = { userId: null, ts: 0, feedKeys: [], postIds: [] };

export function invalidateMyLikesCache() {
    myLikesCache = { userId: null, ts: 0, feedKeys: [], postIds: [] };
}

/**
 * Resolve a feed card to a like subject.
 * Posts/activity → post_likes (UUID).
 * article/tweet → feed_item_likes kind=article.
 * trailer → feed_item_likes kind=trailer (tmdb id).
 * comment → feed_item_likes kind=article, subject_id=comment:{uuid}
 *   (avoids needing a DB check-constraint migration for 'comment')
 */
export function feedLikeSubject(item) {
    if (!item?.id) return null;
    const type = item.type || 'post';

    if (type === 'post' || type === 'activity') {
        return { kind: 'post', id: String(item.id) };
    }

    if (type === 'comment') {
        return { kind: 'comment', id: String(item.id) };
    }

    if (type === 'article' || type === 'tweet') {
        const id = String(item.id).startsWith('article-')
            ? String(item.id).slice('article-'.length)
            : String(item.id);
        return { kind: 'article', id };
    }

    if (type === 'trailer') {
        const tmdb = item.tmdb_id != null
            ? String(item.tmdb_id)
            : String(item.id).replace(/^trailer-/, '');
        return { kind: 'trailer', id: String(tmdb) };
    }

    return null;
}

/** DB row shape for feed_item_likes (comment uses article + comment: prefix). */
function toDbSubject(subject) {
    if (!subject) return null;
    if (subject.kind === 'comment') {
        return { subject_kind: 'article', subject_id: `comment:${subject.id}` };
    }
    if (subject.kind === 'tweet') {
        return { subject_kind: 'article', subject_id: subject.id };
    }
    return { subject_kind: subject.kind, subject_id: subject.id };
}

function trailerSubjectIdVariants(tmdbId) {
    const id = String(tmdbId);
    return [id, `movie:${id}`, `tv:${id}`];
}

function subjectStorageKey(subject) {
    return `${subject.kind}:${subject.id}`;
}

function userLikesKey(userId) {
    return `tos_feed_upvotes_v2:${userId}`;
}

function deviceLikesKey() {
    return 'tos_feed_upvotes_device_v2';
}

function readJsonMap(key) {
    if (typeof localStorage === 'undefined') return {};
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeJsonMap(key, map) {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(key, JSON.stringify(map));
    } catch {
        /* ignore quota */
    }
}

export function readLocalFeedLikes(userId) {
    const device = readJsonMap(deviceLikesKey());
    const user = userId ? readJsonMap(userLikesKey(userId)) : {};
    return { ...device, ...user };
}

export function setLocalFeedLike(userId, subject, liked) {
    if (!subject) return;
    const key = subjectStorageKey(subject);

    const device = readJsonMap(deviceLikesKey());
    if (liked) device[key] = Date.now();
    else delete device[key];
    writeJsonMap(deviceLikesKey(), device);

    if (userId) {
        const user = readJsonMap(userLikesKey(userId));
        if (liked) user[key] = Date.now();
        else delete user[key];
        writeJsonMap(userLikesKey(userId), user);
    }
}

function resolveApiBase() {
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (configured) return configured.replace(/\/$/, '');
    return '';
}

async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
}

/**
 * Toggle upvote and persist (localStorage first, then server).
 */
export async function toggleFeedUpvote(item, userId) {
    if (!userId) throw new Error('Sign in to upvote');
    const subject = feedLikeSubject(item);
    if (!subject) throw new Error('Cannot upvote this item');

    const currentlyLiked = !!item.isLiked;
    const nextLiked = !currentlyLiked;

    setLocalFeedLike(userId, subject, nextLiked);
    invalidateMyLikesCache();

    const token = await getAccessToken();
    if (!token) {
        console.warn('[toggleFeedUpvote] No session token — saved locally only');
        return { liked: nextLiked, localOnly: true };
    }

    const apiKind = subject.kind === 'comment' ? 'comment' : subject.kind;
    const apiId = subject.id;

    try {
        const response = await fetch(`${resolveApiBase()}/api/social/feed-upvote`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                kind: apiKind,
                id: apiId,
                currentlyLiked,
            }),
        });
        const payload = await response.json().catch(() => ({}));

        if (response.ok && payload?.ok) {
            setLocalFeedLike(userId, subject, !!payload.liked);
            return { liked: !!payload.liked };
        }

        if (response.status === 404) {
            const direct = await toggleFeedUpvoteDirect(userId, subject, currentlyLiked);
            setLocalFeedLike(userId, subject, direct.liked);
            return direct;
        }

        setLocalFeedLike(userId, subject, currentlyLiked);
        throw new Error(payload.error || `Upvote failed (${response.status})`);
    } catch (err) {
        const msg = String(err?.message || '');
        if (/upvote failed \(|migration|permissions|blocked|did not/i.test(msg)) {
            setLocalFeedLike(userId, subject, currentlyLiked);
            throw err;
        }
        console.warn('[toggleFeedUpvote] API error, trying direct:', msg);
        try {
            const direct = await toggleFeedUpvoteDirect(userId, subject, currentlyLiked);
            setLocalFeedLike(userId, subject, direct.liked);
            return direct;
        } catch (directErr) {
            console.error('[toggleFeedUpvote] direct write failed; kept local vote', directErr);
            return { liked: nextLiked, localOnly: true };
        }
    }
}

async function toggleFeedUpvoteDirect(userId, subject, currentlyLiked) {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const uid = authUser?.id || userId;
    if (!uid) throw new Error('Sign in to upvote');

    if (subject.kind === 'post') {
        const res = currentlyLiked
            ? await unlikePost(subject.id, uid)
            : await likePost(subject.id, uid);
        if (!res?.ok) throw new Error(res?.error || 'Upvote failed');
        return { liked: !currentlyLiked };
    }

    const db = toDbSubject(subject);

    if (currentlyLiked) {
        let query = supabase.from('feed_item_likes').delete().eq('user_id', uid);
        if (subject.kind === 'trailer') {
            query = query.eq('subject_kind', 'trailer').in('subject_id', trailerSubjectIdVariants(subject.id));
        } else if (subject.kind === 'comment') {
            query = query.eq('subject_kind', 'article').eq('subject_id', db.subject_id);
        } else {
            query = query.in('subject_kind', ['article', 'tweet']).eq('subject_id', subject.id);
        }
        const { error } = await query;
        if (error) throw error;
        return { liked: false };
    }

    const { error } = await supabase.from('feed_item_likes').insert({
        subject_kind: db.subject_kind,
        subject_id: db.subject_id,
        user_id: uid,
    });
    if (error && error.code !== '23505') throw error;

    const { data: row, error: readErr } = await supabase
        .from('feed_item_likes')
        .select('id')
        .eq('subject_kind', db.subject_kind)
        .eq('subject_id', db.subject_id)
        .eq('user_id', uid)
        .maybeSingle();
    if (readErr) throw readErr;
    if (!row) throw new Error('Upvote did not save');
    return { liked: true };
}

/**
 * Re-push local-only upvotes to the server.
 */
export async function syncLocalFeedLikesToServer(userId) {
    if (!userId) return;
    const local = readLocalFeedLikes(userId);
    const keys = Object.keys(local);
    if (!keys.length) return;

    const token = await getAccessToken();
    if (!token) return;

    await Promise.allSettled(keys.map(async (key) => {
        const [kind, ...rest] = key.split(':');
        const id = rest.join(':');
        if (!kind || !id) return;
        try {
            await fetch(`${resolveApiBase()}/api/social/feed-upvote`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ kind, id, currentlyLiked: false }),
            });
        } catch (err) {
            console.warn('[syncLocalFeedLikes]', key, err?.message || err);
        }
    }));
}

/**
 * Attach likes from DB (by user_id — reliable) + localStorage.
 * My-likes query is session-cached so Home↔Thread navigations stay fast.
 */
export async function attachFeedItemLikes(items, userId = null) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return list;

    const local = readLocalFeedLikes(userId);

    // --- My likes (authoritative isLiked) ---
    const myFeedLiked = new Set(); // keys: article:uuid | trailer:tmdb | comment:uuid
    const myPostLiked = new Set();

    if (userId) {
        const cacheHit = myLikesCache.userId === userId
            && (Date.now() - myLikesCache.ts) < MY_LIKES_TTL_MS;

        if (cacheHit) {
            for (const k of myLikesCache.feedKeys) myFeedLiked.add(k);
            for (const id of myLikesCache.postIds) myPostLiked.add(id);
        } else {
            const [feedRes, postRes] = await Promise.all([
                supabase
                    .from('feed_item_likes')
                    .select('subject_kind, subject_id')
                    .eq('user_id', userId),
                supabase
                    .from('post_likes')
                    .select('post_id')
                    .eq('user_id', userId),
            ]);

            if (feedRes.error) console.warn('[attachFeedItemLikes my]', feedRes.error.message);
            for (const row of feedRes.data || []) {
                if (row.subject_kind === 'trailer') {
                    myFeedLiked.add(`trailer:${String(row.subject_id).replace(/^(movie|tv):/, '')}`);
                } else if (String(row.subject_id).startsWith('comment:')) {
                    myFeedLiked.add(`comment:${String(row.subject_id).slice('comment:'.length)}`);
                } else {
                    myFeedLiked.add(`article:${row.subject_id}`);
                }
            }

            if (postRes.error) console.warn('[attachFeedItemLikes my posts]', postRes.error.message);
            for (const row of postRes.data || []) {
                myPostLiked.add(String(row.post_id));
            }

            myLikesCache = {
                userId,
                ts: Date.now(),
                feedKeys: [...myFeedLiked],
                postIds: [...myPostLiked],
            };
        }
    }

    // --- Counts for items on screen ---
    const posts = [];
    const feedTargets = [];
    for (const item of list) {
        const subject = feedLikeSubject(item);
        if (!subject) continue;
        if (subject.kind === 'post') posts.push({ item, subject });
        else feedTargets.push({ item, subject });
    }

    const countByItemId = new Map();

    if (posts.length) {
        const postIds = [...new Set(posts.map((p) => p.subject.id))];
        const { data: rows, error } = await supabase
            .from('post_likes')
            .select('post_id')
            .in('post_id', postIds);
        if (error) {
            console.warn('[attachFeedItemLikes post counts]', error.message);
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
        const ids = new Set();
        for (const { subject } of feedTargets) {
            if (subject.kind === 'trailer') {
                trailerSubjectIdVariants(subject.id).forEach((v) => ids.add(v));
            } else if (subject.kind === 'comment') {
                ids.add(`comment:${subject.id}`);
            } else {
                ids.add(subject.id);
            }
        }

        const { data: rows, error } = await supabase
            .from('feed_item_likes')
            .select('subject_kind, subject_id')
            .in('subject_kind', ['article', 'tweet', 'trailer'])
            .in('subject_id', [...ids]);

        if (error) {
            console.warn('[attachFeedItemLikes counts]', error.message);
        } else {
            const map = new Map();
            for (const row of rows || []) {
                let key;
                if (row.subject_kind === 'trailer') {
                    key = `trailer:${String(row.subject_id).replace(/^(movie|tv):/, '')}`;
                } else if (String(row.subject_id).startsWith('comment:')) {
                    key = `comment:${String(row.subject_id).slice('comment:'.length)}`;
                } else {
                    key = `article:${row.subject_id}`;
                }
                map.set(key, (map.get(key) || 0) + 1);
            }
            for (const { item, subject } of feedTargets) {
                const key = subjectStorageKey(subject);
                countByItemId.set(item.id, map.get(key) || 0);
            }
        }
    }

    return list.map((item) => {
        const subject = feedLikeSubject(item);
        if (!subject) return item;

        const storageKey = subjectStorageKey(subject);
        const fromLocal = !!local[storageKey];
        let fromDb = false;
        if (subject.kind === 'post') fromDb = myPostLiked.has(subject.id);
        else fromDb = myFeedLiked.has(storageKey);

        const isLiked = fromDb || fromLocal;
        if (userId && fromDb) setLocalFeedLike(userId, subject, true);

        const count = countByItemId.has(item.id)
            ? countByItemId.get(item.id)
            : (item.likes || 0);

        return {
            ...item,
            likes: Math.max(count || 0, isLiked ? 1 : 0),
            isLiked,
        };
    });
}

/** Prefer a just-tapped upvote from feed navigation — never clear a DB like. */
export function mergeFeedLikeState(item, seed) {
    if (!item) return item;
    if (!seed || seed.id !== item.id) return item;
    if (seed.isLiked) {
        return {
            ...item,
            isLiked: true,
            likes: Math.max(Number(item.likes) || 0, Number(seed.likes) || 0),
        };
    }
    return item;
}

/** Toggle upvote on a thread comment. */
export async function toggleCommentUpvote(comment, userId, currentlyLiked) {
    return toggleFeedUpvote(
        { id: comment.id, type: 'comment', isLiked: currentlyLiked },
        userId,
    );
}

/** Attach isLiked + likes onto flat comment list. */
export async function attachCommentLikes(comments, userId = null) {
    const list = Array.isArray(comments) ? comments : [];
    if (!list.length) return list;
    const asItems = list.map((c) => ({ ...c, type: 'comment', likes: c.likesCount || 0 }));
    const hydrated = await attachFeedItemLikes(asItems, userId);
    return hydrated.map((c) => {
        const { type, likes, ...rest } = c;
        return {
            ...rest,
            likesCount: likes ?? rest.likesCount ?? 0,
            isLiked: !!rest.isLiked,
        };
    });
}
