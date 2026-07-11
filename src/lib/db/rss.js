import { supabase } from '../supabaseClient.js';

// =============================================
// RSS ARTICLES (admin-curated news articles, sourced from RSS feeds)
// =============================================

export const getRssSources = async () => {
    const { data, error } = await supabase
        .from('rss_sources')
        .select('*')
        .order('name', { ascending: true });

    if (error) {
        console.error('Error fetching RSS sources:', error);
        return [];
    }
    return data || [];
};

// Google's favicon service gives a reliable small site icon for almost any domain
// without us having to scrape the page ourselves.
const deriveFaviconUrl = (url) => {
    try {
        const { hostname } = new URL(url);
        return `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
    } catch {
        return null;
    }
};

export const createRssSource = async (source) => {
    const { data, error } = await supabase
        .from('rss_sources')
        .insert({
            name: source.name,
            feed_url: source.feed_url,
            site_url: source.site_url || null,
            logo_url: source.logo_url || deriveFaviconUrl(source.site_url || source.feed_url),
            is_active: source.is_active ?? true,
            include_keywords: source.include_keywords || [],
            exclude_keywords: source.exclude_keywords || [],
            source_kind: source.source_kind || 'article',
        })
        .select();

    if (error) {
        console.error('Error creating RSS source:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Global keyword filters (set once, applied to every source of that kind).
// Stored in app_settings under the 'rss_filters' key.
export const RSS_FILTER_DEFAULTS = {
    trailer: { include: ['trailer', 'teaser'], exclude: [] },
    article: { include: [], exclude: [] },
};

export const getRssGlobalFilters = async () => {
    const { data } = await supabase
        .from('app_settings').select('value').eq('key', 'rss_filters').maybeSingle();
    const v = data?.value || {};
    return {
        trailer: {
            include: v.trailer?.include || RSS_FILTER_DEFAULTS.trailer.include,
            exclude: v.trailer?.exclude || [],
        },
        article: {
            include: v.article?.include || [],
            exclude: v.article?.exclude || [],
        },
    };
};

export const setRssGlobalFilters = async (filters) => {
    const { error } = await supabase
        .from('app_settings')
        .upsert({ key: 'rss_filters', value: filters, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) {
        console.error('Error saving RSS filters:', error);
        return { success: false, error };
    }
    return { success: true };
};

export const updateRssSource = async (id, fields) => {
    const patch = { updated_at: new Date().toISOString() };
    ['name', 'feed_url', 'site_url', 'logo_url', 'include_keywords', 'exclude_keywords', 'source_kind'].forEach((k) => {
        if (fields[k] !== undefined) patch[k] = fields[k];
    });

    const { data, error } = await supabase
        .from('rss_sources')
        .update(patch)
        .eq('id', id)
        .select();

    if (error) {
        console.error('Error updating RSS source:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

export const toggleRssSourceActive = async (id) => {
    const { data: source } = await supabase
        .from('rss_sources')
        .select('is_active')
        .eq('id', id)
        .single();

    if (!source) return { success: false, error: 'Source not found' };

    const { error } = await supabase
        .from('rss_sources')
        .update({ is_active: !source.is_active, updated_at: new Date().toISOString() })
        .eq('id', id);

    if (error) return { success: false, error };
    return { success: true };
};

export const deleteRssSource = async (id) => {
    const { error } = await supabase.from('rss_sources').delete().eq('id', id);
    if (error) {
        console.error('Error deleting RSS source:', error);
        return { success: false, error };
    }
    return { success: true };
};

// status: 'pending' | 'approved' | 'rejected'
export const getFeedArticles = async (status = 'pending', limit = 50, sourceId = null, daysBack = 0, sortOrder = 'desc') => {
    let query = supabase
        .from('feed_articles')
        .select('*')
        .eq('status', status)
        .order('published_at', { ascending: sortOrder === 'asc' })
        .limit(limit);

    // sourceId may be a single id (specific source) or an array (e.g. all sources
    // of one kind). An empty array means "no matching sources" → return nothing.
    if (Array.isArray(sourceId)) {
        if (!sourceId.length) return [];
        query = query.in('source_id', sourceId);
    } else if (sourceId) {
        query = query.eq('source_id', sourceId);
    }

    if (daysBack > 0) {
        const since = new Date();
        since.setDate(since.getDate() - daysBack);
        query = query.gte('published_at', since.toISOString());
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching feed articles:', error);
        return [];
    }
    return data || [];
};

// Counts of pending/approved/rejected articles per source, for the admin sidebar badges.
export const getFeedArticleCountsBySource = async () => {
    const { data, error } = await supabase
        .from('feed_articles')
        .select('source_id, status');

    if (error) {
        console.error('Error fetching feed article counts:', error);
        return {};
    }

    const counts = {};
    for (const row of data || []) {
        if (!row.source_id) continue;
        counts[row.source_id] = counts[row.source_id] || { pending: 0, approved: 0, rejected: 0 };
        counts[row.source_id][row.status] = (counts[row.source_id][row.status] || 0) + 1;
    }
    return counts;
};

export const updateFeedArticleStatus = async (id, status) => {
    // Fetch the row first so we can sync its trailer post (if it's a verified trailer).
    const { data: article } = await supabase
        .from('feed_articles')
        .select('tmdb_id, media_type')
        .eq('id', id)
        .maybeSingle();

    const { error } = await supabase
        .from('feed_articles')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);

    if (error) {
        console.error('Error updating feed article status:', error);
        return { success: false, error };
    }

    // Approving/rejecting a verified trailer flips its trailer_post live/hidden —
    // this is how an admin publishes RSS-polled (pending) trailers.
    if (article?.tmdb_id) {
        await supabase
            .from('trailer_posts')
            .update({ is_active: status === 'approved' })
            .eq('tmdb_id', String(article.tmdb_id))
            .eq('media_type', article.media_type || 'movie')
            .then(() => {}, () => {});
    }
    return { success: true };
};

export const toggleFeedArticleActive = async (id) => {
    const { data: article } = await supabase
        .from('feed_articles')
        .select('is_active')
        .eq('id', id)
        .single();

    if (!article) return { success: false, error: 'Article not found' };

    const { error } = await supabase
        .from('feed_articles')
        .update({ is_active: !article.is_active, updated_at: new Date().toISOString() })
        .eq('id', id);

    if (error) return { success: false, error };
    return { success: true };
};

export const deleteFeedArticle = async (id) => {
    const { error } = await supabase.from('feed_articles').delete().eq('id', id);
    if (error) {
        console.error('Error deleting feed article:', error);
        return { success: false, error };
    }
    return { success: true };
};
