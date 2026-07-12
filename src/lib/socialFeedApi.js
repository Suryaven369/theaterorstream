import { supabase } from './supabase';
import { publicUrlForStorageObject, toPublicStorageUrl } from './storagePublicUrl.js';

async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
}

function resolveApiBase() {
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (configured) return configured.replace(/\/$/, '');
    return '';
}

async function getFeed(path, params = {}) {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: 'not_signed_in', items: [] };

    const qs = new URLSearchParams(params).toString();
    const url = `${resolveApiBase()}/api/feed/${path}${qs ? `?${qs}` : ''}`;

    try {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
        return { ok: true, ...payload };
    } catch (error) {
        if (import.meta.env.DEV) console.warn('[socialFeedApi]', path, error.message);
        return { ok: false, error: error.message, items: [], users: [] };
    }
}

export function fetchGlobalFeed({ mode = 'recent', limit = 30, offset = 0 } = {}) {
    return getFeed('global', { mode, limit, offset });
}

export function fetchForYouFeed({ limit = 30, offset = 0 } = {}) {
    return getFeed('for-you', { limit, offset });
}

export function fetchUserSuggestions(limit = 8) {
    return getFeed('suggestions', { limit });
}

// ---------------------------------------------------------------------------
// Post Likes
// ---------------------------------------------------------------------------
export async function likePost(postId, userId) {
    if (!userId) return { ok: false, error: 'not_signed_in' };
    
    const { error } = await supabase
        .from('post_likes')
        .insert({ post_id: postId, user_id: userId });
    
    if (error && error.code !== '23505') { // Ignore duplicate key error
        console.error('[likePost]', error);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

export async function unlikePost(postId, userId) {
    if (!userId) return { ok: false, error: 'not_signed_in' };
    
    const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);
    
    if (error) {
        console.error('[unlikePost]', error);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

export async function isPostLiked(postId, userId) {
    if (!userId) return false;
    
    const { data } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .single();
    
    return !!data;
}

// ---------------------------------------------------------------------------
// Saved Posts (Bookmarks)
// ---------------------------------------------------------------------------
export async function savePost(postId, userId) {
    if (!userId) return { ok: false, error: 'not_signed_in' };
    
    const { error } = await supabase
        .from('saved_posts')
        .insert({ post_id: postId, user_id: userId });
    
    if (error && error.code !== '23505') {
        console.error('[savePost]', error);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

export async function unsavePost(postId, userId) {
    if (!userId) return { ok: false, error: 'not_signed_in' };
    
    const { error } = await supabase
        .from('saved_posts')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);
    
    if (error) {
        console.error('[unsavePost]', error);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

export async function isPostSaved(postId, userId) {
    if (!userId) return false;
    
    const { data } = await supabase
        .from('saved_posts')
        .select('post_id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .single();
    
    return !!data;
}

export async function getSavedPosts(userId, { limit = 20, offset = 0 } = {}) {
    if (!userId) return { ok: false, items: [] };
    
    const { data, error } = await supabase
        .from('saved_posts')
        .select(`
            post_id,
            created_at,
            feed_posts (*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('post_id', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        console.error('[getSavedPosts]', error);
        return { ok: false, items: [] };
    }
    
    return { ok: true, items: data?.map(d => d.feed_posts) || [] };
}

// ---------------------------------------------------------------------------
// Post Shares
// ---------------------------------------------------------------------------
export async function sharePost(postId, userId, shareType = 'link') {
    const { error } = await supabase
        .from('post_shares')
        .insert({ 
            post_id: postId, 
            user_id: userId || null,
            share_type: shareType 
        });
    
    if (error) {
        console.error('[sharePost]', error);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

// ---------------------------------------------------------------------------
// Post Comments
// ---------------------------------------------------------------------------
export async function addComment(postId, userId, content, parentId = null) {
    if (!userId) return { ok: false, error: 'not_signed_in' };
    if (!content?.trim()) return { ok: false, error: 'empty_content' };
    
    const { data, error } = await supabase
        .from('post_comments')
        .insert({ 
            post_id: postId, 
            user_id: userId,
            content: content.trim(),
            parent_id: parentId
        })
        .select()
        .single();
    
    if (error) {
        console.error('[addComment]', error);
        return { ok: false, error: error.message };
    }

    try {
        const { ensureHashtagsFromContent } = await import('./hashtagApi.js');
        await ensureHashtagsFromContent(data.content, {
            contentType: 'comment',
            contentId: data.id,
            userId,
        });
    } catch { /* non-fatal */ }

    return { ok: true, comment: data };
}

export async function getPostComments(postId, { limit = 50, offset = 0 } = {}) {
    const { data, error } = await supabase
        .from('post_comments')
        .select('id, content, created_at, parent_id, likes_count, user_id')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);

    if (error) {
        console.error('[getPostComments]', error);
        return [];
    }
    if (!data?.length) return [];

    // post_comments.user_id -> auth.users (no FK to user_profiles), so fetch authors separately.
    const authorIds = [...new Set(data.map((c) => c.user_id).filter(Boolean))];
    const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', authorIds);
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    return data.map((comment) => {
        const author = profileMap.get(comment.user_id);
        return {
            id: comment.id,
            content: comment.content,
            time: formatTimeAgo(comment.created_at),
            parentId: comment.parent_id,
            likesCount: comment.likes_count,
            user: {
                id: comment.user_id,
                name: author?.display_name || author?.username || 'User',
                username: author?.username,
                avatar: '🎬',
                avatarUrl: toPublicStorageUrl(author?.avatar_url) || null,
            },
        };
    });
}

export async function deleteComment(commentId, userId) {
    if (!userId) return { ok: false, error: 'not_signed_in' };
    
    const { error } = await supabase
        .from('post_comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', userId);
    
    if (error) {
        console.error('[deleteComment]', error);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

// ---------------------------------------------------------------------------
// Upload a post image to the public 'post-images' bucket. Files go under the
// user's own folder (<uid>/...) which the storage RLS policy requires.
// ---------------------------------------------------------------------------
export const POST_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const POST_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function uploadPostImage(file, userId) {
    if (!userId) return { ok: false, error: 'not_signed_in' };
    if (!file) return { ok: false, error: 'no_file' };
    if (!POST_IMAGE_TYPES.includes(file.type)) {
        return { ok: false, error: 'Unsupported image type. Use JPG, PNG, WEBP or GIF.' };
    }
    if (file.size > POST_IMAGE_MAX_BYTES) {
        return { ok: false, error: 'Image too large (max 5MB).' };
    }

    const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
        .from('post-images')
        .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
        console.error('[uploadPostImage]', error);
        return { ok: false, error: error.message };
    }

    const url = publicUrlForStorageObject('post-images', path);
    if (!url) return { ok: false, error: 'Could not build public image URL' };
    return { ok: true, url };
}

// ---------------------------------------------------------------------------
// Create Post
// ---------------------------------------------------------------------------
export async function createPost({
    userId,
    content,
    tmdbId,
    mediaType,
    movieTitle,
    moviePoster,
    movieBackdrop,
    movieYear,
    movieRating,
    postType = 'post',
    imageUrl = null
}) {
    if (!userId) return { ok: false, error: 'not_signed_in' };
    if (!content?.trim() && !imageUrl) return { ok: false, error: 'empty_content' };

    const { data, error } = await supabase
        .from('feed_posts')
        .insert({
            user_id: userId,
            content: (content || '').trim(),
            tmdb_id: tmdbId,
            media_type: mediaType,
            movie_title: movieTitle,
            movie_poster: moviePoster,
            movie_backdrop: movieBackdrop,
            movie_year: movieYear,
            movie_rating: movieRating,
            post_type: postType,
            has_image: !!imageUrl,
            image_url: imageUrl,
        })
        .select()
        .single();

    if (error) {
        console.error('[createPost]', error);
        return { ok: false, error: error.message };
    }

    // Link #hashtags (DB trigger also does this when migration is applied)
    try {
        const { ensureHashtagsFromContent } = await import('./hashtagApi.js');
        await ensureHashtagsFromContent(data.content, {
            contentType: 'post',
            contentId: data.id,
            userId,
        });
    } catch { /* non-fatal */ }

    return { ok: true, post: data };
}

// ---------------------------------------------------------------------------
// Edit / Delete a post (RLS already restricts these to the owner)
// ---------------------------------------------------------------------------
export async function updatePost(postId, userId, { content }) {
    if (!userId) return { ok: false, error: 'not_signed_in' };
    if (!content?.trim()) return { ok: false, error: 'empty_content' };

    const { data, error } = await supabase
        .from('feed_posts')
        .update({ content: content.trim(), updated_at: new Date().toISOString() })
        .eq('id', postId)
        .eq('user_id', userId)
        .select()
        .single();

    if (error) {
        console.error('[updatePost]', error);
        return { ok: false, error: error.message };
    }

    try {
        const { ensureHashtagsFromContent } = await import('./hashtagApi.js');
        await ensureHashtagsFromContent(data.content, {
            contentType: 'post',
            contentId: data.id,
            userId,
        });
    } catch { /* non-fatal */ }

    return { ok: true, post: data };
}

export async function deletePost(postId, userId) {
    if (!userId) return { ok: false, error: 'not_signed_in' };

    const { error } = await supabase
        .from('feed_posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', userId);

    if (error) {
        console.error('[deletePost]', error);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

/** Single public post for /post/:id share pages. */
export async function getFeedPostById(postId, userId = null) {
    if (!postId) return { ok: false, item: null };

    const { data: post, error } = await supabase
        .from('feed_posts')
        .select('*')
        .eq('id', postId)
        .eq('visibility', 'public')
        .maybeSingle();

    if (error || !post) {
        if (error) console.error('[getFeedPostById]', error);
        return { ok: false, item: null };
    }

    const [profileRes, likeRes, saveRes] = await Promise.all([
        supabase
            .from('user_profiles')
            .select('id, display_name, username, avatar_id, avatar_url, is_verified')
            .eq('id', post.user_id)
            .maybeSingle(),
        userId
            ? supabase.from('post_likes').select('post_id').eq('user_id', userId).eq('post_id', post.id).maybeSingle()
            : Promise.resolve({ data: null }),
        userId
            ? supabase.from('saved_posts').select('post_id').eq('user_id', userId).eq('post_id', post.id).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);

    const author = profileRes.data;
    return {
        ok: true,
        item: {
            id: post.id,
            type: post.post_type === 'activity' ? 'activity' : 'post',
            postType: post.post_type || 'post',
            content: post.content,
            movieTitle: post.movie_title || null,
            image: toPublicStorageUrl(post.image_url) || null,
            likes: post.likes_count || 0,
            comments: post.comments_count || 0,
            shares: post.shares_count || 0,
            time: formatTimeAgo(post.created_at),
            createdAt: post.created_at,
            hasImage: !!post.has_image,
            isLiked: !!likeRes.data,
            isSaved: !!saveRes.data,
            user: {
                id: post.user_id,
                name: author?.display_name || author?.username || 'User',
                username: author?.username || 'user',
                avatar: '🎬',
                avatarUrl: toPublicStorageUrl(author?.avatar_url) || null,
                isVerified: !!author?.is_verified,
            },
            movie: post.tmdb_id
                ? {
                    title: post.movie_title,
                    poster: post.movie_poster,
                    backdrop: post.movie_backdrop,
                    year: post.movie_year,
                }
                : null,
            rating: post.movie_rating,
        },
    };
}

// ---------------------------------------------------------------------------
// Get Feed Posts
// ---------------------------------------------------------------------------
export async function getFeedPosts({ limit = 20, offset = 0, userId = null, mode = 'all' } = {}) {
    // feed_posts.user_id references auth.users (not user_profiles), so PostgREST can't embed
    // the profile — fetch posts, then batch-fetch the authors' profiles separately.
    let query = supabase
        .from('feed_posts')
        .select('*')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

    // "Following" = people you follow + your own + posts tagged with hashtags you follow
    let followedTagPostIds = [];
    if (mode === 'following' && userId) {
        const { data: follows } = await supabase
            .from('user_follows').select('following_id').eq('follower_id', userId);
        const ids = [...new Set([userId, ...(follows || []).map((f) => f.following_id)])];

        try {
            const { getFollowedHashtagPostIds } = await import('./hashtagApi.js');
            followedTagPostIds = await getFollowedHashtagPostIds(userId, { limit: 60 });
        } catch { /* hashtag tables may not exist yet */ }

        if (followedTagPostIds.length) {
            // Fetch a wider window then filter — PostgREST can't OR user_id IN + id IN cleanly
            // without an RPC, so we pull recent public posts and keep matching ones.
            query = query.or(`user_id.in.(${ids.join(',')}),id.in.(${followedTagPostIds.join(',')})`);
        } else {
            query = query.in('user_id', ids);
        }
    }

    // Over-fetch slightly when personalizing so we can boost tag-matched posts into the page
    const fetchLimit = (mode === 'all' && userId) ? limit + 15 : limit;
    const { data, error } = await query.range(offset, offset + fetchLimit - 1);

    if (error) {
        console.error('[getFeedPosts]', error);
        return { ok: false, items: [] };
    }
    if (!data?.length) return { ok: true, items: [] };

    let rows = data;

    // Home "All": soft-boost posts that use hashtags the user follows (still chronological-ish)
    if (mode === 'all' && userId && offset === 0) {
        try {
            const { getFollowedHashtagPostIds } = await import('./hashtagApi.js');
            const tagPostIds = new Set(await getFollowedHashtagPostIds(userId, { limit: 40 }));
            if (tagPostIds.size) {
                const boosted = [];
                const rest = [];
                for (const post of rows) {
                    if (tagPostIds.has(post.id)) boosted.push(post);
                    else rest.push(post);
                }
                // Interleave: every other slot prefers a followed-tag post when available
                const merged = [];
                let bi = 0;
                let ri = 0;
                while (merged.length < limit && (bi < boosted.length || ri < rest.length)) {
                    if (bi < boosted.length && (merged.length % 2 === 0 || ri >= rest.length)) {
                        merged.push(boosted[bi++]);
                    } else if (ri < rest.length) {
                        merged.push(rest[ri++]);
                    } else {
                        merged.push(boosted[bi++]);
                    }
                }
                rows = merged;
            } else {
                rows = rows.slice(0, limit);
            }
        } catch {
            rows = rows.slice(0, limit);
        }
    } else {
        rows = rows.slice(0, limit);
    }

    const postIds = rows.map((p) => p.id);
    const authorIds = [...new Set(rows.map((p) => p.user_id).filter(Boolean))];

    const [profilesRes, likesRes, savesRes] = await Promise.all([
        supabase.from('user_profiles').select('id, display_name, username, avatar_id, avatar_url, is_verified').in('id', authorIds),
        userId
            ? supabase.from('post_likes').select('post_id').eq('user_id', userId).in('post_id', postIds)
            : Promise.resolve({ data: [] }),
        userId
            ? supabase.from('saved_posts').select('post_id').eq('user_id', userId).in('post_id', postIds)
            : Promise.resolve({ data: [] }),
    ]);

    const profileMap = new Map((profilesRes.data || []).map((p) => [p.id, p]));
    const userLikes = new Set((likesRes.data || []).map((l) => l.post_id));
    const userSaves = new Set((savesRes.data || []).map((s) => s.post_id));

    const items = rows.map((post) => {
        const author = profileMap.get(post.user_id);
        return {
            id: post.id,
            type: post.post_type === 'activity' ? 'activity' : 'post',
            postType: post.post_type || 'post',
            content: post.content,
            movieTitle: post.movie_title || null,
            image: toPublicStorageUrl(post.image_url) || null,
            likes: post.likes_count || 0,
            comments: post.comments_count || 0,
            shares: post.shares_count || 0,
            time: formatTimeAgo(post.created_at),
            createdAt: post.created_at,
            hasImage: !!post.has_image,
            isLiked: userLikes.has(post.id),
            isSaved: userSaves.has(post.id),
            user: {
                id: post.user_id,
                name: author?.display_name || author?.username || 'User',
                username: author?.username || 'user',
                avatar: '🎬',
                avatarUrl: toPublicStorageUrl(author?.avatar_url) || null,
                isVerified: !!author?.is_verified,
            },
            movie: post.tmdb_id ? {
                title: post.movie_title,
                poster: post.movie_poster,
                backdrop: post.movie_backdrop,
                year: post.movie_year,
            } : null,
            rating: post.movie_rating,
        };
    });

    return { ok: true, items };
}

// ---------------------------------------------------------------------------
// Helper: Format time ago
// ---------------------------------------------------------------------------
function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Public posts by a specific author — used on profile pages (works for guests). */
export async function getFeedPostsByAuthor(authorId, { limit = 20, viewerId = null } = {}) {
    if (!authorId) return { ok: false, items: [] };

    const { data, error } = await supabase
        .from('feed_posts')
        .select('*')
        .eq('user_id', authorId)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[getFeedPostsByAuthor]', error);
        return { ok: false, items: [] };
    }
    if (!data?.length) return { ok: true, items: [] };

    const postIds = data.map((p) => p.id);
    const [profileRes, likesRes] = await Promise.all([
        supabase
            .from('user_profiles')
            .select('id, display_name, username, avatar_id, avatar_url, is_verified')
            .eq('id', authorId)
            .maybeSingle(),
        viewerId
            ? supabase.from('post_likes').select('post_id').eq('user_id', viewerId).in('post_id', postIds)
            : Promise.resolve({ data: [] }),
    ]);

    const author = profileRes.data;
    const liked = new Set((likesRes.data || []).map((r) => r.post_id));

    return {
        ok: true,
        items: data.map((post) => ({
            id: post.id,
            type: post.post_type === 'activity' ? 'activity' : 'post',
            postType: post.post_type || 'post',
            content: post.content,
            movieTitle: post.movie_title || null,
            image: toPublicStorageUrl(post.image_url) || null,
            likes: post.likes_count || 0,
            comments: post.comments_count || 0,
            time: formatTimeAgo(post.created_at),
            createdAt: post.created_at,
            hasImage: !!post.has_image,
            isLiked: liked.has(post.id),
            user: {
                id: authorId,
                name: author?.display_name || author?.username || 'User',
                username: author?.username || null,
                avatar: author?.avatar_id || 'avatar_1',
                avatarUrl: toPublicStorageUrl(author?.avatar_url) || null,
                isVerified: !!author?.is_verified,
            },
            movie: post.tmdb_id
                ? {
                    id: post.tmdb_id,
                    title: post.movie_title,
                    poster: post.movie_poster,
                    year: post.movie_year,
                    rating: post.movie_rating,
                }
                : null,
        })),
    };
}

