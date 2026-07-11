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

export const createBlogPost = async (userId, { title, content, coverImage = null, isPublic = true }) => {
    if (!userId || !title?.trim() || !content?.trim()) {
        return { success: false, error: new Error('title and content are required') };
    }

    const cleanTitle = title.trim().slice(0, BLOG_TITLE_MAX);
    const cleanContent = content.trim().slice(0, HTML_CONTENT_MAX);

    const { data, error } = await supabase
        .from('blog_posts')
        .insert({
            user_id: userId,
            title: cleanTitle,
            content: cleanContent,
            cover_image: coverImage || null,
            visibility: isPublic ? 'public' : 'private',
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating blog post:', error);
        return { success: false, error };
    }

    try {
        const { ensureHashtagsFromContent } = await import('./hashtagApi.js');
        const plain = `${cleanTitle} ${stripHtml(cleanContent)}`;
        await ensureHashtagsFromContent(plain, {
            contentType: 'blog',
            contentId: data.id,
            userId,
        });
    } catch { /* non-fatal */ }

    if (isPublic) {
        await supabase.from('activity_feed').insert({
            user_id: userId,
            event_type: 'blog_post',
            payload: {
                blog_id: data.id,
                title: cleanTitle,
                excerpt: stripHtml(cleanContent).slice(0, 200),
            },
            visibility: 'public',
            engagement_score: 5,
        });
    }

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

export const updateBlogPost = async (blogId, { title, content, isPublic }) => {
    const patch = {};
    if (title != null) patch.title = title.trim().slice(0, BLOG_TITLE_MAX);
    if (content != null) patch.content = content.trim().slice(0, BLOG_CONTENT_MAX);
    if (isPublic != null) patch.visibility = isPublic ? 'public' : 'private';
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
    return { success: true, data };
};

export const deleteBlogPost = async (blogId) => {
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
