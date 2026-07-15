import { supabase } from '../supabaseClient.js';
import { approveFeedArticleViaApi } from '../adminSyncApi.js';

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
export const getFeedArticles = async (
    status = 'pending',
    limit = 50,
    sourceId = null,
    daysBack = 0,
    sortOrder = 'desc',
    offset = 0,
) => {
    const safeLimit = Math.max(1, Number(limit) || 50);
    const safeOffset = Math.max(0, Number(offset) || 0);

    let query = supabase
        .from('feed_articles')
        .select('*')
        .eq('status', status)
        .order('published_at', { ascending: sortOrder === 'asc' })
        .range(safeOffset, safeOffset + safeLimit - 1);

    // sourceId may be a single id (specific source) or an array (e.g. all sources
    // of one kind). An empty array means "no matching sources" → return nothing.
    if (Array.isArray(sourceId)) {
        if (!sourceId.length) return [];
        query = query.in('source_id', sourceId);
    } else if (sourceId) {
        query = query.eq('source_id', sourceId);
    }

    if (daysBack > 0) {
        // Exact rolling window (1 = last 24 hours, 3 = last 72 hours, …)
        const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
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

export const updateFeedArticleStatus = async (idOrArticle, status) => {
    // Approving goes through the admin API so we can fetch the full article page
    // (RSS excerpts lack Collider h2 list titles) before minting the feed summary.
    if (status === 'approved') {
        try {
            const payload = (idOrArticle && typeof idOrArticle === 'object' && idOrArticle._candidate)
                ? idOrArticle
                : (typeof idOrArticle === 'object' ? idOrArticle.id : idOrArticle);
            return await approveFeedArticleViaApi(payload, { regenerateOnly: false });
        } catch (err) {
            console.error('Error approving feed article via API:', err);
            return { success: false, error: { message: err.message || 'Approve failed' } };
        }
    }

    const id = typeof idOrArticle === 'object' ? idOrArticle?.id : idOrArticle;
    if (typeof id === 'string' && String(id).startsWith('candidate:')) {
        // Unsaved RSS candidate — reject is local-only (no DB row).
        return { success: true, localOnly: true };
    }

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

    if (article?.tmdb_id) {
        const now = new Date().toISOString();
        await supabase
            .from('trailer_posts')
            .update({
                is_active: status === 'approved',
                ...(status === 'approved' ? { updated_at: now } : {}),
            })
            .eq('tmdb_id', String(article.tmdb_id))
            .eq('media_type', article.media_type || 'movie')
            .then(() => {}, () => {});
    }
    return { success: true };
};

export const regenerateFeedArticleSummary = async (id) => {
    try {
        return await approveFeedArticleViaApi(id, { regenerateOnly: true });
    } catch (err) {
        console.error('Error regenerating article summary:', err);
        return { success: false, error: { message: err.message || 'Regenerate failed' } };
    }
};

export const toggleFeedArticleActive = async (id) => {
    const { data: article } = await supabase
        .from('feed_articles')
        .select('is_active, tmdb_id, media_type')
        .eq('id', id)
        .single();

    if (!article) return { success: false, error: 'Article not found' };

    const nextActive = !article.is_active;
    const now = new Date().toISOString();
    const { error } = await supabase
        .from('feed_articles')
        .update({ is_active: nextActive, updated_at: now })
        .eq('id', id);

    if (error) return { success: false, error };

    if (article.tmdb_id) {
        await supabase
            .from('trailer_posts')
            .update({
                is_active: nextActive,
                ...(nextActive ? { updated_at: now } : {}),
            })
            .eq('tmdb_id', String(article.tmdb_id))
            .eq('media_type', article.media_type || 'movie')
            .then(() => {}, () => {});
    }
    return { success: true };
};

export const deleteFeedArticle = async (id) => {
    if (typeof id === 'string' && id.startsWith('candidate:')) {
        return { success: true, localOnly: true };
    }
    const { error } = await supabase.from('feed_articles').delete().eq('id', id);
    if (error) {
        console.error('Error deleting feed article:', error);
        return { success: false, error };
    }
    return { success: true };
};

// =============================================
// NEWS INTELLIGENCE SYSTEM
// =============================================

// --- RSS Source Intelligence Fields ---

export const updateRssSourceIntelligence = async (id, fields) => {
    const allowed = ['source_type', 'trust_score', 'region', 'language', 'auto_publish_allowed', 'default_category', 'failure_count'];
    const patch = { updated_at: new Date().toISOString() };
    allowed.forEach((k) => {
        if (fields[k] !== undefined) patch[k] = fields[k];
    });

    const { data, error } = await supabase
        .from('rss_sources')
        .update(patch)
        .eq('id', id)
        .select();

    if (error) {
        console.error('Error updating RSS source intelligence fields:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// --- Article Classification ---

export const getArticlesPendingClassification = async (limit = 50) => {
    const { data, error } = await supabase
        .from('feed_articles')
        .select('*, rss_sources(name, source_type, trust_score)')
        .eq('classification_status', 'pending')
        .eq('status', 'pending')
        .is('rejection_reason', null)
        .order('published_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching articles pending classification:', error);
        return [];
    }
    return data || [];
};

export const updateArticleClassification = async (id, classification) => {
    const patch = {
        classification_status: 'completed',
        classified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    // Map classification result fields
    const fields = [
        'relevant', 'relevance_score', 'primary_category', 'secondary_categories',
        'professional_focus_score', 'gossip_probability', 'lifestyle_probability',
        'controversy_probability', 'rumour_probability', 'clickbait_probability',
        'article_quality_score', 'verification_level', 'entities_json',
        'ai_summary', 'ai_main_event', 'ai_why_it_matters', 'model_version'
    ];

    fields.forEach((k) => {
        if (classification[k] !== undefined) patch[k] = classification[k];
    });

    // Handle entities object → entities_json
    if (classification.entities && !classification.entities_json) {
        patch.entities_json = classification.entities;
    }

    const { data, error } = await supabase
        .from('feed_articles')
        .update(patch)
        .eq('id', id)
        .select();

    if (error) {
        console.error('Error updating article classification:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

export const updateArticleKeywordScores = async (id, positiveScore, negativeScore, rejectionReason = null) => {
    const patch = {
        positive_keyword_score: positiveScore,
        negative_keyword_score: negativeScore,
        updated_at: new Date().toISOString(),
    };

    if (rejectionReason) {
        patch.rejection_reason = rejectionReason;
        patch.classification_status = 'skipped';
    }

    const { error } = await supabase
        .from('feed_articles')
        .update(patch)
        .eq('id', id);

    if (error) {
        console.error('Error updating article keyword scores:', error);
        return { success: false, error };
    }
    return { success: true };
};

export const getClassifiedArticles = async (filters = {}, limit = 50) => {
    let query = supabase
        .from('feed_articles')
        .select('*, rss_sources(name, logo_url, source_type, trust_score)')
        .eq('classification_status', 'completed')
        .order('classified_at', { ascending: false })
        .limit(limit);

    if (filters.minRelevance) {
        query = query.gte('relevance_score', filters.minRelevance);
    }
    if (filters.maxGossip) {
        query = query.lte('gossip_probability', filters.maxGossip);
    }
    if (filters.category) {
        query = query.eq('primary_category', filters.category);
    }
    if (filters.clusterId) {
        query = query.eq('cluster_id', filters.clusterId);
    }
    if (filters.unclustered) {
        query = query.is('cluster_id', null);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching classified articles:', error);
        return [];
    }
    return data || [];
};

// --- Story Clusters ---

export const getStoryClusters = async (status = 'active', limit = 50) => {
    const { data, error } = await supabase
        .from('news_story_clusters')
        .select('*')
        .eq('status', status)
        .order('trend_score', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching story clusters:', error);
        return [];
    }
    return data || [];
};

export const getClusterWithArticles = async (clusterId) => {
    const { data: cluster, error: clusterError } = await supabase
        .from('news_story_clusters')
        .select('*')
        .eq('id', clusterId)
        .single();

    if (clusterError) {
        console.error('Error fetching cluster:', clusterError);
        return null;
    }

    const { data: articles, error: articlesError } = await supabase
        .from('feed_articles')
        .select('*, rss_sources(name, logo_url, trust_score)')
        .eq('cluster_id', clusterId)
        .order('is_primary_source', { ascending: false })
        .order('published_at', { ascending: false });

    if (articlesError) {
        console.error('Error fetching cluster articles:', articlesError);
    }

    return { ...cluster, articles: articles || [] };
};

export const createStoryCluster = async (cluster) => {
    const { data, error } = await supabase
        .from('news_story_clusters')
        .insert({
            canonical_title: cluster.canonical_title,
            main_event: cluster.main_event,
            primary_category: cluster.primary_category,
            event_type: cluster.event_type,
            entities_json: cluster.entities_json || {},
            first_seen_at: cluster.first_seen_at || new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            article_count: cluster.article_count || 1,
            trusted_source_count: cluster.trusted_source_count || 0,
            official_source_count: cluster.official_source_count || 0,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating story cluster:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

export const updateStoryCluster = async (id, fields) => {
    const allowed = [
        'canonical_title', 'main_event', 'primary_category', 'event_type',
        'entities_json', 'last_seen_at', 'article_count', 'trusted_source_count',
        'official_source_count', 'verification_level', 'trend_score', 'trend_velocity',
        'peak_trend_score', 'status', 'published_post_id'
    ];
    const patch = { updated_at: new Date().toISOString() };
    allowed.forEach((k) => {
        if (fields[k] !== undefined) patch[k] = fields[k];
    });

    const { data, error } = await supabase
        .from('news_story_clusters')
        .update(patch)
        .eq('id', id)
        .select();

    if (error) {
        console.error('Error updating story cluster:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

export const assignArticleToCluster = async (articleId, clusterId, isPrimary = false) => {
    const { error } = await supabase
        .from('feed_articles')
        .update({
            cluster_id: clusterId,
            is_primary_source: isPrimary,
            updated_at: new Date().toISOString(),
        })
        .eq('id', articleId);

    if (error) {
        console.error('Error assigning article to cluster:', error);
        return { success: false, error };
    }

    // Update cluster stats via RPC
    await supabase.rpc('update_cluster_stats', { p_cluster_id: clusterId });

    return { success: true };
};

export const getTrendingClusters = async (minScore = 45, limit = 20) => {
    const { data, error } = await supabase
        .from('news_story_clusters')
        .select('*')
        .eq('status', 'active')
        .gte('trend_score', minScore)
        .order('trend_score', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching trending clusters:', error);
        return [];
    }
    return data || [];
};

// --- Keyword Dictionaries ---

export const getKeywordDictionaries = async (category = null) => {
    let query = supabase
        .from('news_keyword_dictionaries')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('subcategory')
        .order('term');

    if (category) {
        query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching keyword dictionaries:', error);
        return [];
    }
    return data || [];
};

export const createKeyword = async (keyword) => {
    const { data, error } = await supabase
        .from('news_keyword_dictionaries')
        .insert({
            category: keyword.category,
            subcategory: keyword.subcategory || null,
            term: keyword.term.toLowerCase().trim(),
            weight: keyword.weight || 1,
            is_phrase: keyword.is_phrase || keyword.term.includes(' '),
            is_active: true,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating keyword:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

export const updateKeyword = async (id, fields) => {
    const allowed = ['category', 'subcategory', 'term', 'weight', 'is_phrase', 'is_active'];
    const patch = { updated_at: new Date().toISOString() };
    allowed.forEach((k) => {
        if (fields[k] !== undefined) {
            patch[k] = k === 'term' ? fields[k].toLowerCase().trim() : fields[k];
        }
    });

    const { data, error } = await supabase
        .from('news_keyword_dictionaries')
        .update(patch)
        .eq('id', id)
        .select();

    if (error) {
        console.error('Error updating keyword:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

export const deleteKeyword = async (id) => {
    const { error } = await supabase
        .from('news_keyword_dictionaries')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting keyword:', error);
        return { success: false, error };
    }
    return { success: true };
};

export const bulkCreateKeywords = async (keywords) => {
    const rows = keywords.map((kw) => ({
        category: kw.category,
        subcategory: kw.subcategory || null,
        term: kw.term.toLowerCase().trim(),
        weight: kw.weight || 1,
        is_phrase: kw.is_phrase || kw.term.includes(' '),
        is_active: true,
    }));

    const { data, error } = await supabase
        .from('news_keyword_dictionaries')
        .upsert(rows, { onConflict: 'category,subcategory,term', ignoreDuplicates: true })
        .select();

    if (error) {
        console.error('Error bulk creating keywords:', error);
        return { success: false, error };
    }
    return { success: true, data, count: data?.length || 0 };
};

// --- Processing Logs ---

export const logProcessingStep = async (log) => {
    const { error } = await supabase
        .from('news_processing_logs')
        .insert({
            article_id: log.article_id || null,
            cluster_id: log.cluster_id || null,
            step: log.step,
            status: log.status,
            message: log.message || null,
            metadata_json: log.metadata || null,
            duration_ms: log.duration_ms || null,
        });

    if (error) {
        console.error('Error logging processing step:', error);
    }
    return !error;
};

export const getProcessingLogs = async (filters = {}, limit = 100) => {
    let query = supabase
        .from('news_processing_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (filters.articleId) {
        query = query.eq('article_id', filters.articleId);
    }
    if (filters.clusterId) {
        query = query.eq('cluster_id', filters.clusterId);
    }
    if (filters.step) {
        query = query.eq('step', filters.step);
    }
    if (filters.status) {
        query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching processing logs:', error);
        return [];
    }
    return data || [];
};
