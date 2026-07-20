import { supabase } from './supabase';

// Twitter-style hard limits: long-form, but capped so it stays readable and quick to write.
export const BLOG_TITLE_MAX = 100;
export const BLOG_CONTENT_MAX = 3000;

// Create a blog post. Posts to activity_feed too (if public) so it shows up in the social feed,
// the same way list creation does — keeps both features on one lightweight feed mechanism instead
// of building a second parallel feed pipeline.
// Content is rich HTML; allow generous room for markup beyond the plain-text cap.
const HTML_CONTENT_MAX = BLOG_CONTENT_MAX * 8;
const stripHtml = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * @param {'public'|'private'|'draft'} visibility
 */
export const createBlogPost = async (userId, { title, content, coverImage = null, isPublic = true, visibility = null }) => {
    if (!userId) {
        return { success: false, error: new Error('sign in required') };
    }

    const vis = visibility || (isPublic ? 'public' : 'private');
    const isDraft = vis === 'draft';

    // Drafts can be sparse; published posts need title + body.
    if (!isDraft && (!title?.trim() || !content?.trim())) {
        return { success: false, error: new Error('title and content are required') };
    }

    const cleanTitle = (title || '').trim().slice(0, BLOG_TITLE_MAX) || (isDraft ? 'Untitled draft' : '');
    const cleanContent = (content || '').trim().slice(0, HTML_CONTENT_MAX);

    const { data, error } = await supabase
        .from('blog_posts')
        .insert({
            user_id: userId,
            title: cleanTitle,
            content: cleanContent || '<p></p>',
            cover_image: coverImage || null,
            visibility: vis,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating blog post:', error);
        return { success: false, error };
    }

    if (!isDraft) {
        try {
            const { ensureHashtagsFromContent } = await import('./hashtagApi.js');
            const plain = `${cleanTitle} ${stripHtml(cleanContent)}`;
            await ensureHashtagsFromContent(plain, {
                contentType: 'blog',
                contentId: data.id,
                userId,
            });
        } catch { /* non-fatal */ }

        if (vis === 'public') {
            await syncBlogToHomeFeed(data);
        }
    }

    return { success: true, data };
};

/** Most recently updated draft for this user (one active draft). */
export const getLatestBlogDraft = async (userId) => {
    if (!userId) return null;
    const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('user_id', userId)
        .eq('visibility', 'draft')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) {
        console.error('Error fetching latest blog draft:', error);
        return null;
    }
    return data || null;
};

/** Delete extra drafts so the user only keeps one (keeps `keepId`). */
export const consolidateBlogDrafts = async (userId, keepId) => {
    if (!userId || !keepId) return;
    const { data: extras } = await supabase
        .from('blog_posts')
        .select('id')
        .eq('user_id', userId)
        .eq('visibility', 'draft')
        .neq('id', keepId);
    const ids = (extras || []).map((r) => r.id).filter(Boolean);
    if (!ids.length) return;
    await supabase.from('blog_posts').delete().in('id', ids);
};

/** After publish — remove every leftover draft so it doesn't twin the public post. */
export const deleteAllBlogDrafts = async (userId) => {
    if (!userId) return;
    await supabase
        .from('blog_posts')
        .delete()
        .eq('user_id', userId)
        .eq('visibility', 'draft');
};

/**
 * Remove draft rows that duplicate an already-published/private post (same title + body).
 * Keeps a single card per piece of writing.
 */
export const dedupeDraftsMatchingPublished = async (userId) => {
    if (!userId) return;
    const { data: rows } = await supabase
        .from('blog_posts')
        .select('id, title, content, visibility')
        .eq('user_id', userId);
    if (!rows?.length) return;

    const keyOf = (row) => {
        const title = String(row.title || '').trim().toLowerCase();
        const body = stripHtml(row.content).toLowerCase().slice(0, 240);
        return `${title}||${body}`;
    };

    const publishedKeys = new Set(
        rows.filter((r) => r.visibility !== 'draft').map(keyOf),
    );
    const draftDupes = rows
        .filter((r) => r.visibility === 'draft' && publishedKeys.has(keyOf(r)))
        .map((r) => r.id);

    if (draftDupes.length) {
        await supabase.from('blog_posts').delete().in('id', draftDupes);
    }
};

/** Toggle a post between draft and public (one row — no copy). */
export const setBlogVisibility = async (blogId, visibility) => {
    if (!blogId || !['draft', 'public', 'private'].includes(visibility)) {
        return { success: false, error: new Error('invalid visibility') };
    }
    return updateBlogPost(blogId, { visibility });
};

/**
 * Create or update a draft (autosave).
 * Only updates rows that are already drafts — never flips a published post back to draft.
 */
export const upsertBlogDraft = async (userId, { draftId = null, title, content, coverImage = null }) => {
    if (!userId) return { success: false, error: new Error('sign in required') };

    const cleanTitle = (title || '').trim().slice(0, BLOG_TITLE_MAX) || 'Untitled draft';
    const cleanContent = (content || '').trim().slice(0, HTML_CONTENT_MAX) || '<p></p>';
    const patch = {
        title: cleanTitle,
        content: cleanContent,
        cover_image: coverImage || null,
        visibility: 'draft',
        updated_at: new Date().toISOString(),
    };

    let targetId = draftId || null;
    if (targetId) {
        // Stale id after publish must not convert the public post back into a draft
        const { data: existing } = await supabase
            .from('blog_posts')
            .select('id, visibility')
            .eq('id', targetId)
            .eq('user_id', userId)
            .maybeSingle();
        if (!existing || existing.visibility !== 'draft') {
            targetId = null;
        }
    }
    if (!targetId) {
        const latest = await getLatestBlogDraft(userId);
        if (latest?.id) targetId = latest.id;
    }

    if (targetId) {
        const { data, error } = await supabase
            .from('blog_posts')
            .update(patch)
            .eq('id', targetId)
            .eq('user_id', userId)
            .eq('visibility', 'draft')
            .select()
            .maybeSingle();
        if (error) {
            console.error('Error updating blog draft:', error);
            return { success: false, error };
        }
        if (data) {
            await consolidateBlogDrafts(userId, data.id);
            return { success: true, data };
        }
    }

    const { data, error } = await supabase
        .from('blog_posts')
        .insert({
            user_id: userId,
            ...patch,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating blog draft:', error);
        return { success: false, error };
    }

    await consolidateBlogDrafts(userId, data.id);
    return { success: true, data };
};

export const getBlogPost = async (id) => {
    const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) {
        console.error('Error fetching blog post:', error);
        return null;
    }
    if (!data) return null;

    if (data.user_id) {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('username, avatar_id, display_name')
            .eq('id', data.user_id)
            .single();
        data.user_profiles = profile;
    }

    return data;
};

export const getUserBlogPosts = async (userId) => {
    if (!userId) return [];
    const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching user blog posts:', error);
        return [];
    }
    return data || [];
};

/** Recent public blogs for Explore / Home fill — no full HTML body. */
export const getRecentPublicBlogs = async (limit = 5) => {
    const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, cover_image, user_id, created_at, updated_at')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('getRecentPublicBlogs:', error);
        return [];
    }
    if (!data?.length) return [];

    const userIds = [...new Set(data.map((b) => b.user_id).filter(Boolean))];
    const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_url, is_verified')
        .in('id', userIds);
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    return data.map((b) => ({
        ...b,
        user_profiles: profileMap.get(b.user_id) || null,
    }));
};

/** Remove home-feed card(s) for a blog (when unpublished / deleted). */
export const removeBlogFromHomeFeed = async (blogId) => {
    if (!blogId) return;
    try {
        const { data } = await supabase
            .from('feed_posts')
            .select('id')
            .eq('post_type', 'blog')
            .filter('media_items->>blogId', 'eq', String(blogId));
        const ids = (data || []).map((r) => r.id).filter(Boolean);
        if (ids.length) {
            await supabase.from('feed_posts').delete().in('id', ids);
        }
        try {
            const { invalidateFeedCaches } = await import('./feedSessionCache.js');
            invalidateFeedCaches();
        } catch { /* non-fatal */ }
    } catch (err) {
        console.warn('removeBlogFromHomeFeed:', err?.message || err);
    }
};

/**
 * Publish a public blog into the Home social feed (feed_posts + activity_feed)
 * so everyone can discover and open /blog/:id.
 */
export const syncBlogToHomeFeed = async (blog) => {
    if (!blog?.id || !blog.user_id) return { ok: false };

    if (blog.visibility !== 'public') {
        await removeBlogFromHomeFeed(blog.id);
        return { ok: true, removed: true };
    }

    const excerpt = stripHtml(blog.content).slice(0, 280);
    const cover = blog.cover_image || null;
    const feedRow = {
        user_id: blog.user_id,
        content: excerpt || blog.title || '',
        post_type: 'blog',
        visibility: 'public',
        has_image: !!cover,
        image_url: cover,
        movie_title: blog.title || 'Blog',
        media_items: {
            kind: 'blog',
            blogId: blog.id,
            title: blog.title || 'Blog',
            coverImage: cover,
        },
        updated_at: new Date().toISOString(),
    };

    try {
        // Replace any prior feed card (avoids single-edit trigger on content updates)
        await removeBlogFromHomeFeed(blog.id);
        const { error: feedErr } = await supabase.from('feed_posts').insert({
            ...feedRow,
            created_at: blog.updated_at || blog.created_at || new Date().toISOString(),
        });
        if (feedErr) console.warn('syncBlogToHomeFeed feed_posts:', feedErr.message);

        const { data: existing } = await supabase
            .from('activity_feed')
            .select('id')
            .eq('user_id', blog.user_id)
            .eq('event_type', 'blog_post')
            .contains('payload', { blog_id: blog.id })
            .maybeSingle();
        if (!existing) {
            await supabase.from('activity_feed').insert({
                user_id: blog.user_id,
                event_type: 'blog_post',
                payload: {
                    blog_id: blog.id,
                    title: blog.title,
                    excerpt,
                },
                visibility: 'public',
                engagement_score: 5,
            });
        }

        try {
            const { ensureHashtagsFromContent } = await import('./hashtagApi.js');
            await ensureHashtagsFromContent(`${blog.title || ''} ${excerpt}`, {
                contentType: 'blog',
                contentId: blog.id,
                userId: blog.user_id,
            });
        } catch { /* non-fatal */ }

        try {
            const { invalidateFeedCaches } = await import('./feedSessionCache.js');
            invalidateFeedCaches();
        } catch { /* non-fatal */ }

        return { ok: true };
    } catch (err) {
        console.warn('syncBlogToHomeFeed:', err?.message || err);
        return { ok: false, error: err };
    }
};

export const updateBlogPost = async (blogId, { title, content, coverImage, isPublic, visibility = null }) => {
    const patch = {};
    if (title != null) patch.title = title.trim().slice(0, BLOG_TITLE_MAX);
    if (content != null) patch.content = content.trim().slice(0, HTML_CONTENT_MAX);
    if (coverImage !== undefined) patch.cover_image = coverImage || null;
    if (visibility != null) patch.visibility = visibility;
    else if (isPublic != null) patch.visibility = isPublic ? 'public' : 'private';
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
        .from('blog_posts')
        .update(patch)
        .eq('id', blogId)
        .select()
        .single();

    if (error) {
        console.error('Error updating blog post:', error);
        return { success: false, error };
    }

    await syncBlogToHomeFeed(data);

    return { success: true, data };
};

export const deleteBlogPost = async (blogId) => {
    await removeBlogFromHomeFeed(blogId);
    const { error } = await supabase.from('blog_posts').delete().eq('id', blogId);
    return { success: !error, error };
};

export const toggleBlogLike = async (userId, blogId) => {
    if (!userId) return { success: false, liked: false };

    const { data: existing } = await supabase
        .from('blog_likes')
        .select('blog_id')
        .eq('user_id', userId)
        .eq('blog_id', blogId)
        .maybeSingle();

    if (existing) {
        const { error } = await supabase
            .from('blog_likes')
            .delete()
            .eq('user_id', userId)
            .eq('blog_id', blogId);
        return { success: !error, liked: false };
    }

    const { error } = await supabase.from('blog_likes').insert({ user_id: userId, blog_id: blogId });
    return { success: !error, liked: true };
};
