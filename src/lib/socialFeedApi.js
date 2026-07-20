import { supabase } from './supabase';
import { publicUrlForStorageObject, toPublicStorageUrl } from './storagePublicUrl.js';
import { getPlainTextLength } from './movieMentions.js';

/** Explicit columns — avoid select('*') so we don't pull unused / future fat fields. */
const FEED_POST_SELECT = [
    'id',
    'user_id',
    'content',
    'post_type',
    'visibility',
    'created_at',
    'updated_at',
    'likes_count',
    'comments_count',
    'shares_count',
    'edit_count',
    'image_url',
    'has_image',
    'movie_title',
    'movie_poster',
    'movie_backdrop',
    'movie_year',
    'movie_rating',
    'tmdb_id',
    'media_items',
    'poll_data',
].join(',');

function hasPostContent(content) {
    if (!content?.trim()) return false;
    if (getPlainTextLength(content) > 0) return true;
    return /\[\[(movie|user|person)\|/.test(content);
}

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
export const POST_IMAGE_MAX_COUNT = 10;
const POST_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function parseMediaCarousel(raw) {
    if (!raw) return { items: [], caption: '' };

    if (raw.slides && Array.isArray(raw.slides)) {
        const items = raw.slides
            .filter((slide) => slide?.url)
            .map((slide) => ({ url: toPublicStorageUrl(slide.url) || slide.url }));
        return { items, caption: (raw.caption || '').trim() };
    }

    if (Array.isArray(raw)) {
        const items = raw
            .filter((item) => item?.url)
            .map((item) => ({ url: toPublicStorageUrl(item.url) || item.url }));
        const caption = raw.map((item) => (item.caption || '').trim()).find(Boolean) || '';
        return { items, caption };
    }

    return { items: [], caption: '' };
}

export function parseMediaCarouselForFeed(raw) {
    return parseMediaCarousel(raw);
}

function buildCarouselDbPayload(slides, caption = '') {
    return {
        slides: slides.map((slide) => ({ url: slide.url })),
        caption: (caption || '').trim(),
    };
}

function normalizeCarouselInput(mediaItems, imageUrl = null) {
    if (mediaItems?.slides && Array.isArray(mediaItems.slides)) {
        const slides = mediaItems.slides.filter((slide) => slide?.url);
        const caption = (mediaItems.caption || '').trim();
        return {
            isCarousel: slides.length >= 2,
            primaryImage: imageUrl || slides[0]?.url || null,
            dbPayload: slides.length >= 2 ? buildCarouselDbPayload(slides, caption) : null,
        };
    }

    if (Array.isArray(mediaItems)) {
        const slides = mediaItems.filter((item) => item?.url);
        const caption = slides.map((item) => (item.caption || '').trim()).find(Boolean) || '';
        return {
            isCarousel: slides.length >= 2,
            primaryImage: imageUrl || slides[0]?.url || null,
            dbPayload: slides.length >= 2 ? buildCarouselDbPayload(slides, caption) : null,
        };
    }

    return {
        isCarousel: false,
        primaryImage: imageUrl || null,
        dbPayload: null,
    };
}

function mapPollData(raw) {
    if (!raw?.options || !Array.isArray(raw.options)) return null;
    const options = raw.options
        .slice(0, 2)
        .map((o) => ({ text: o.text || '', votes: Number(o.votes) || 0 }));
    return options.length === 2 ? { options } : null;
}

function mapFeedPostRow(post, { author, isLiked = false, isSaved = false, userPollVote = null } = {}) {
    const rawMedia = post.media_items;
    const isBlog = post.post_type === 'blog'
        || (rawMedia && typeof rawMedia === 'object' && !Array.isArray(rawMedia) && rawMedia.kind === 'blog');

    if (isBlog) {
        const blogId = rawMedia?.blogId || null;
        const title = rawMedia?.title || post.movie_title || 'Blog';
        const cover = toPublicStorageUrl(rawMedia?.coverImage || post.image_url) || null;
        return {
            id: post.id,
            type: 'blog',
            postType: 'blog',
            blogId,
            title,
            content: post.content,
            excerpt: post.content,
            image: cover,
            imageUrl: cover,
            likes: post.likes_count || 0,
            comments: post.comments_count || 0,
            shares: post.shares_count || 0,
            time: formatTimeAgo(post.created_at),
            createdAt: post.created_at,
            publishedAt: post.created_at,
            isLiked,
            isSaved,
            user: {
                id: post.user_id,
                name: author?.display_name || author?.username || 'User',
                username: author?.username || 'user',
                avatar: '🎬',
                avatarUrl: toPublicStorageUrl(author?.avatar_url) || null,
                isVerified: !!author?.is_verified,
            },
        };
    }

    const isList = post.post_type === 'list'
        || (rawMedia && typeof rawMedia === 'object' && !Array.isArray(rawMedia) && rawMedia.kind === 'list');

    if (isList) {
        const collectionId = rawMedia?.collectionId || null;
        const title = rawMedia?.name || post.movie_title || 'List';
        const cover = toPublicStorageUrl(rawMedia?.coverImage || post.image_url) || null;
        const body = post.content || '';
        // content is often "Name\nDescription" — show description under the title card
        const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
        const excerpt = lines.length > 1 && lines[0] === title
            ? lines.slice(1).join(' ')
            : (lines[0] === title ? '' : body);

        return {
            id: post.id,
            type: 'post',
            postType: 'list',
            collectionId,
            movieTitle: title,
            content: excerpt || title,
            listTitle: title,
            image: cover,
            imageUrl: cover,
            hasImage: !!cover,
            likes: post.likes_count || 0,
            comments: post.comments_count || 0,
            shares: post.shares_count || 0,
            time: formatTimeAgo(post.created_at),
            createdAt: post.created_at,
            publishedAt: post.created_at,
            isLiked,
            isSaved,
            mediaItems: [],
            carouselCaption: null,
            isCarousel: false,
            pollData: null,
            userPollVote: null,
            movie: null,
            rating: null,
            editCount: Number(post.edit_count) || 0,
            canEdit: false,
            user: {
                id: post.user_id,
                name: author?.display_name || author?.username || 'User',
                username: author?.username || 'user',
                avatar: '🎬',
                avatarUrl: toPublicStorageUrl(author?.avatar_url) || null,
                isVerified: !!author?.is_verified,
            },
        };
    }

    const { items: mediaItems, caption: carouselCaption } = parseMediaCarousel(post.media_items);
    const primaryImage = toPublicStorageUrl(post.image_url) || mediaItems[0]?.url || null;
    const pollData = post.post_type === 'poll' ? mapPollData(post.poll_data) : null;

    return {
        id: post.id,
        type: post.post_type === 'activity' ? 'activity' : 'post',
        postType: post.post_type || 'post',
        content: post.content,
        movieTitle: post.movie_title || null,
        image: primaryImage,
        mediaItems,
        carouselCaption,
        isCarousel: mediaItems.length >= 2,
        pollData,
        userPollVote,
        likes: post.likes_count || 0,
        comments: post.comments_count || 0,
        shares: post.shares_count || 0,
        time: formatTimeAgo(post.created_at),
        createdAt: post.created_at,
        publishedAt: post.created_at,
        hasImage: !!post.has_image || mediaItems.length > 0 || !!primaryImage,
        isLiked,
        isSaved,
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
        editCount: Number(post.edit_count) || 0,
        canEdit: (Number(post.edit_count) || 0) < 1,
    };
}

function posterPathToUrl(path) {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const p = String(path).startsWith('/') ? path : `/${path}`;
    return `https://image.tmdb.org/t/p/w780${p}`;
}

function coverFromCollectionRow(collection, posters = []) {
    const cover = collection?.cover_image || collection?.banner_image || null;
    if (cover) {
        if (/^https?:\/\//i.test(cover)) return cover;
        if (String(cover).startsWith('/')) return `https://image.tmdb.org/t/p/w780${cover}`;
        return cover;
    }
    const first = posters.find(Boolean) || (collection?.collection_movies || [])
        .map((m) => m.poster_path)
        .find(Boolean);
    return posterPathToUrl(first);
}

/**
 * Fill missing list covers from user_collections + collection_movies,
 * and persist image_url onto feed_posts so the next load (and cache) has it.
 */
async function enrichListPostCovers(items) {
    const need = (items || []).filter((i) => i.postType === 'list' && !i.image && !i.imageUrl);
    if (!need.length) return items;

    try {
        const userIds = [...new Set(need.map((i) => i.user?.id).filter(Boolean))];
        if (!userIds.length) return items;

        const { data: cols, error: colErr } = await supabase
            .from('user_collections')
            .select('id, name, user_id, cover_image, banner_image')
            .in('user_id', userIds)
            .eq('is_public', true);

        if (colErr) {
            console.warn('[enrichListPostCovers] collections:', colErr.message);
            return items;
        }

        const colIds = (cols || []).map((c) => c.id);
        const postersByCol = new Map();
        if (colIds.length) {
            const { data: movies } = await supabase
                .from('collection_movies')
                .select('collection_id, poster_path')
                .in('collection_id', colIds)
                .not('poster_path', 'is', null);

            for (const m of movies || []) {
                if (!m.poster_path) continue;
                const list = postersByCol.get(m.collection_id) || [];
                if (list.length < 4) list.push(m.poster_path);
                postersByCol.set(m.collection_id, list);
            }
        }

        const byId = new Map();
        const byUserName = new Map();
        for (const c of cols || []) {
            const cover = coverFromCollectionRow(c, postersByCol.get(c.id) || []);
            if (!cover) continue;
            const meta = { cover, id: c.id, name: c.name };
            byId.set(c.id, meta);
            byUserName.set(`${c.user_id}:${String(c.name || '').trim().toLowerCase()}`, meta);
        }

        const patched = [];
        const next = items.map((item) => {
            if (item.postType !== 'list' || item.image || item.imageUrl) return item;
            const key = `${item.user?.id}:${String(item.movieTitle || item.listTitle || '').trim().toLowerCase()}`;
            const hit = (item.collectionId && byId.get(item.collectionId)) || byUserName.get(key);
            if (!hit) return item;
            patched.push({ postId: item.id, cover: hit.cover, collectionId: hit.id, name: hit.name });
            return {
                ...item,
                image: hit.cover,
                imageUrl: hit.cover,
                hasImage: true,
                collectionId: item.collectionId || hit.id,
            };
        });

        // Persist so feed cache / next visit don't stay blank
        if (patched.length) {
            Promise.all(patched.map((p) => supabase
                .from('feed_posts')
                .update({
                    has_image: true,
                    image_url: p.cover,
                    media_items: {
                        kind: 'list',
                        collectionId: p.collectionId,
                        name: p.name,
                        coverImage: p.cover,
                    },
                    updated_at: new Date().toISOString(),
                })
                .eq('id', p.postId))).catch((err) => {
                console.warn('[enrichListPostCovers] persist failed:', err?.message || err);
            });
        }

        return next;
    } catch (err) {
        console.warn('[enrichListPostCovers]', err.message);
        return items;
    }
}

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
    imageUrl = null,
    mediaItems = null,
    pollData = null,
}) {
    if (!userId) return { ok: false, error: 'not_signed_in' };

    const carousel = normalizeCarouselInput(mediaItems, imageUrl);
    const isCarousel = carousel.isCarousel;
    const isPoll = pollData?.options?.length === 2
        && pollData.options.every((o) => (o.text || '').trim());
    const hasMedia = !!carousel.primaryImage;

    if (!hasPostContent(content) && !hasMedia && !isPoll) return { ok: false, error: 'empty_content' };
    if (isPoll && !hasPostContent(content)) return { ok: false, error: 'poll_needs_question' };

    const primaryImage = carousel.primaryImage;
    const resolvedPostType = isPoll ? 'poll' : postType;

    const insertPayload = {
        user_id: userId,
        content: (content || '').trim(),
        tmdb_id: tmdbId,
        media_type: mediaType,
        movie_title: movieTitle,
        movie_poster: moviePoster,
        movie_backdrop: movieBackdrop,
        movie_year: movieYear,
        movie_rating: movieRating,
        post_type: resolvedPostType,
        has_image: !!primaryImage,
        image_url: primaryImage,
    };

    if (isCarousel && carousel.dbPayload) insertPayload.media_items = carousel.dbPayload;
    if (isPoll) {
        insertPayload.poll_data = {
            options: pollData.options.map((o) => ({
                text: o.text.trim(),
                votes: 0,
            })),
        };
    }

    const { data, error } = await supabase
        .from('feed_posts')
        .insert(insertPayload)
        .select()
        .single();

    if (error) {
        const msg = (error.message || '').toLowerCase();
        const missingMedia = msg.includes('media_items');
        const missingPoll = msg.includes('poll_data');

        if (missingMedia && isCarousel && primaryImage) {
            const fallback = { ...insertPayload };
            delete fallback.media_items;
            fallback.post_type = 'post';
            const retry = await supabase.from('feed_posts').insert(fallback).select().single();
            if (!retry.error) {
                try {
                    const { ensureHashtagsFromContent } = await import('./hashtagApi.js');
                    await ensureHashtagsFromContent(retry.data.content, {
                        contentType: 'post',
                        contentId: retry.data.id,
                        userId,
                    });
                } catch { /* non-fatal */ }
                return {
                    ok: true,
                    post: retry.data,
                    warning: 'Carousel saved as a single image. Apply the latest Supabase migration for multi-image posts.',
                };
            }
        }

        if (missingPoll && isPoll) {
            return {
                ok: false,
                error: 'Polls need the latest database migration. Run supabase/migrations/20260725000000_feed_post_carousel_polls.sql',
            };
        }

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
// Vote on a 2-option poll (one vote per user)
// ---------------------------------------------------------------------------
export async function votePoll(postId, userId, optionIndex) {
    if (!userId) return { ok: false, error: 'not_signed_in' };
    if (!postId) return { ok: false, error: 'missing_post' };
    if (optionIndex !== 0 && optionIndex !== 1) return { ok: false, error: 'invalid_option' };

    const { error } = await supabase
        .from('post_poll_votes')
        .upsert(
            { post_id: postId, user_id: userId, option_index: optionIndex },
            { onConflict: 'post_id,user_id' }
        );

    if (error) {
        console.error('[votePoll]', error);
        return { ok: false, error: error.message };
    }
    return { ok: true, optionIndex };
}

// ---------------------------------------------------------------------------
// Edit / Delete a post (RLS already restricts these to the owner)
// ---------------------------------------------------------------------------
export async function updatePost(postId, userId, { content }) {
    if (!userId) return { ok: false, error: 'not_signed_in' };
    if (!content?.trim()) return { ok: false, error: 'empty_content' };

    const { data: existing, error: fetchError } = await supabase
        .from('feed_posts')
        .select('id, edit_count, content')
        .eq('id', postId)
        .eq('user_id', userId)
        .maybeSingle();

    if (fetchError) {
        console.error('[updatePost] fetch', fetchError);
        return { ok: false, error: fetchError.message };
    }
    if (!existing) return { ok: false, error: 'post_not_found' };
    if ((existing.edit_count || 0) >= 1) {
        return { ok: false, error: 'You can only edit a post once.' };
    }
    if (existing.content?.trim() === content.trim()) {
        return { ok: true, post: existing };
    }

    const { data, error } = await supabase
        .from('feed_posts')
        .update({ content: content.trim(), updated_at: new Date().toISOString() })
        .eq('id', postId)
        .eq('user_id', userId)
        .select()
        .single();

    if (error) {
        console.error('[updatePost]', error);
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('post_already_edited')) {
            return { ok: false, error: 'You can only edit a post once.' };
        }
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
        .select(FEED_POST_SELECT)
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
    let userPollVote = null;
    if (userId && post.post_type === 'poll') {
        const { data: voteRow } = await supabase
            .from('post_poll_votes')
            .select('option_index')
            .eq('post_id', post.id)
            .eq('user_id', userId)
            .maybeSingle();
        if (voteRow) userPollVote = voteRow.option_index;
    }

    const mapped = mapFeedPostRow(post, {
        author,
        isLiked: !!likeRes.data,
        isSaved: !!saveRes.data,
        userPollVote,
    });
    const [enriched] = await enrichListPostCovers([mapped]);
    return { ok: true, item: enriched };
}

// ---------------------------------------------------------------------------
// Get Feed Posts
// ---------------------------------------------------------------------------
export async function getFeedPosts({ limit = 20, offset = 0, userId = null, mode = 'all' } = {}) {
    // feed_posts.user_id references auth.users (not user_profiles), so PostgREST can't embed
    // the profile — fetch posts, then batch-fetch the authors' profiles separately.
    let query = supabase
        .from('feed_posts')
        .select(FEED_POST_SELECT)
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

    const pollPostIds = rows.filter((p) => p.post_type === 'poll').map((p) => p.id);
    const pollVoteMap = new Map();
    if (userId && pollPostIds.length) {
        const { data: pollVotes } = await supabase
            .from('post_poll_votes')
            .select('post_id, option_index')
            .eq('user_id', userId)
            .in('post_id', pollPostIds);
        for (const row of pollVotes || []) {
            pollVoteMap.set(row.post_id, row.option_index);
        }
    }

    const items = rows.map((post) => {
        const author = profileMap.get(post.user_id);
        return mapFeedPostRow(post, {
            author,
            isLiked: userLikes.has(post.id),
            isSaved: userSaves.has(post.id),
            userPollVote: pollVoteMap.get(post.id) ?? null,
        });
    });

    const enriched = await enrichListPostCovers(items);
    return { ok: true, items: enriched };
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
        .select(FEED_POST_SELECT)
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

    const pollPostIds = data.filter((p) => p.post_type === 'poll').map((p) => p.id);
    const pollVoteMap = new Map();
    if (viewerId && pollPostIds.length) {
        const { data: pollVotes } = await supabase
            .from('post_poll_votes')
            .select('post_id, option_index')
            .eq('user_id', viewerId)
            .in('post_id', pollPostIds);
        for (const row of pollVotes || []) {
            pollVoteMap.set(row.post_id, row.option_index);
        }
    }

    return {
        ok: true,
        items: data.map((post) => mapFeedPostRow(post, {
            author,
            isLiked: liked.has(post.id),
            userPollVote: pollVoteMap.get(post.id) ?? null,
        })),
    };
}

