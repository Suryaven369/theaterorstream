/**
 * News Story Clustering Service
 * 
 * Groups related news articles about the same story/event:
 * - Duplicate detection (exact and near-duplicate)
 * - Story clustering by entity overlap and title similarity
 * - Cluster management and stats
 */

import { getSupabaseAdmin } from './supabase-admin.js';
import { calculateEntityOverlap, extractClusteringEntities } from './news-entities.js';

// Configuration
const CLUSTER_TIME_WINDOW_HOURS = 72; // Articles within this window can cluster
const ENTITY_OVERLAP_THRESHOLD = 0.4; // Minimum entity overlap to cluster
const TITLE_SIMILARITY_THRESHOLD = 0.5; // Minimum title similarity to cluster
const MAX_CLUSTER_CANDIDATES = 20; // Max clusters to check for matching

/**
 * Normalize text for comparison
 */
function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extract words from text
 */
function extractWords(text) {
    return normalizeText(text).split(' ').filter(w => w.length > 2);
}

/**
 * Calculate Jaccard similarity between two word sets
 */
function jaccardSimilarity(set1, set2) {
    if (!set1.length || !set2.length) return 0;
    
    const s1 = new Set(set1);
    const s2 = new Set(set2);
    
    const intersection = [...s1].filter(x => s2.has(x)).length;
    const union = new Set([...s1, ...s2]).size;
    
    return union > 0 ? intersection / union : 0;
}

/**
 * Calculate title similarity between two articles
 */
export function calculateTitleSimilarity(title1, title2) {
    const words1 = extractWords(title1);
    const words2 = extractWords(title2);
    return jaccardSimilarity(words1, words2);
}

/**
 * Generate a hash for normalized title (for exact duplicate detection)
 */
export function hashTitle(title) {
    const normalized = normalizeText(title);
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
}

/**
 * Check for exact duplicates
 */
export async function findExactDuplicate(article) {
    const supabase = getSupabaseAdmin();
    
    // Check by URL
    if (article.link) {
        const { data: byUrl } = await supabase
            .from('feed_articles')
            .select('id, title, source_name')
            .eq('link', article.link)
            .neq('id', article.id || '')
            .limit(1)
            .maybeSingle();
        
        if (byUrl) {
            return { isDuplicate: true, type: 'url', originalId: byUrl.id, original: byUrl };
        }
    }
    
    // Check by normalized title hash (same title from different source)
    const titleHash = hashTitle(article.title);
    const { data: existing } = await supabase
        .from('feed_articles')
        .select('id, title, source_name, published_at')
        .neq('id', article.id || '')
        .gte('published_at', new Date(Date.now() - CLUSTER_TIME_WINDOW_HOURS * 60 * 60 * 1000).toISOString())
        .limit(100);
    
    if (existing?.length) {
        for (const ex of existing) {
            if (hashTitle(ex.title) === titleHash) {
                return { isDuplicate: true, type: 'title_hash', originalId: ex.id, original: ex };
            }
        }
    }
    
    return { isDuplicate: false };
}

/**
 * Find candidate clusters for an article
 */
async function findClusterCandidates(article) {
    const supabase = getSupabaseAdmin();
    
    // Get active clusters from the time window
    const cutoffDate = new Date(Date.now() - CLUSTER_TIME_WINDOW_HOURS * 60 * 60 * 1000);
    
    const { data: clusters, error } = await supabase
        .from('news_story_clusters')
        .select('*')
        .eq('status', 'active')
        .gte('last_seen_at', cutoffDate.toISOString())
        .order('last_seen_at', { ascending: false })
        .limit(MAX_CLUSTER_CANDIDATES);
    
    if (error) {
        console.error('[news-clustering] Failed to fetch clusters:', error.message);
        return [];
    }
    
    return clusters || [];
}

/**
 * Score a cluster match for an article
 */
function scoreClusterMatch(article, cluster) {
    let score = 0;
    const reasons = [];
    
    // Entity overlap (most important)
    const entityOverlap = calculateEntityOverlap(
        article.entities_json || {},
        cluster.entities_json || {}
    );
    
    if (entityOverlap >= ENTITY_OVERLAP_THRESHOLD) {
        score += entityOverlap * 60; // Up to 60 points
        reasons.push(`entity_overlap:${(entityOverlap * 100).toFixed(0)}%`);
    }
    
    // Title similarity
    const titleSim = calculateTitleSimilarity(article.title, cluster.canonical_title);
    if (titleSim >= TITLE_SIMILARITY_THRESHOLD) {
        score += titleSim * 30; // Up to 30 points
        reasons.push(`title_sim:${(titleSim * 100).toFixed(0)}%`);
    }
    
    // Category match
    if (article.primary_category && article.primary_category === cluster.primary_category) {
        score += 10;
        reasons.push('category_match');
    }
    
    // Recency bonus (newer clusters preferred)
    const clusterAge = Date.now() - new Date(cluster.last_seen_at).getTime();
    const ageHours = clusterAge / (1000 * 60 * 60);
    if (ageHours < 6) {
        score += 5;
        reasons.push('recent');
    }
    
    return { score, reasons, entityOverlap, titleSimilarity: titleSim };
}

/**
 * Find the best matching cluster for an article
 */
export async function findMatchingCluster(article) {
    const candidates = await findClusterCandidates(article);
    
    if (!candidates.length) {
        return null;
    }
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const cluster of candidates) {
        const { score, reasons, entityOverlap, titleSimilarity } = scoreClusterMatch(article, cluster);
        
        // Require minimum entity overlap OR high title similarity
        const meetsThreshold = entityOverlap >= ENTITY_OVERLAP_THRESHOLD || 
                               titleSimilarity >= TITLE_SIMILARITY_THRESHOLD;
        
        if (meetsThreshold && score > bestScore) {
            bestScore = score;
            bestMatch = {
                cluster,
                score,
                reasons,
                entityOverlap,
                titleSimilarity,
            };
        }
    }
    
    return bestMatch;
}

/**
 * Create a new cluster from an article
 */
export async function createClusterFromArticle(article) {
    const supabase = getSupabaseAdmin();
    
    // Determine if this is from a trusted/official source
    const { data: source } = await supabase
        .from('rss_sources')
        .select('trust_score, source_type')
        .eq('id', article.source_id)
        .maybeSingle();
    
    const isTrusted = (source?.trust_score || 0) >= 0.7;
    const isOfficial = source?.source_type === 'official_studio';
    
    const cluster = {
        canonical_title: article.title,
        main_event: article.ai_main_event || null,
        primary_category: article.primary_category || null,
        event_type: article.primary_category || null,
        entities_json: article.entities_json || {},
        first_seen_at: article.published_at || new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        article_count: 1,
        trusted_source_count: isTrusted ? 1 : 0,
        official_source_count: isOfficial ? 1 : 0,
        verification_level: isOfficial ? 'studio_confirmed' : (isTrusted ? 'trusted_source' : 'unconfirmed'),
        status: 'active',
    };
    
    const { data, error } = await supabase
        .from('news_story_clusters')
        .insert(cluster)
        .select()
        .single();
    
    if (error) {
        console.error('[news-clustering] Failed to create cluster:', error.message);
        return null;
    }
    
    return data;
}

/**
 * Add an article to an existing cluster
 */
export async function addArticleToCluster(articleId, clusterId, isPrimary = false) {
    const supabase = getSupabaseAdmin();
    
    // Update article with cluster assignment
    const { error: articleErr } = await supabase
        .from('feed_articles')
        .update({
            cluster_id: clusterId,
            is_primary_source: isPrimary,
            updated_at: new Date().toISOString(),
        })
        .eq('id', articleId);
    
    if (articleErr) {
        console.error('[news-clustering] Failed to assign article to cluster:', articleErr.message);
        return { success: false, error: articleErr.message };
    }
    
    // Update cluster stats
    await updateClusterStats(clusterId);
    
    return { success: true };
}

/**
 * Update cluster statistics based on its articles
 */
export async function updateClusterStats(clusterId) {
    const supabase = getSupabaseAdmin();
    
    // Get all articles in the cluster with source info
    const { data: articles, error } = await supabase
        .from('feed_articles')
        .select('id, source_id, published_at, entities_json, rss_sources(trust_score, source_type)')
        .eq('cluster_id', clusterId);
    
    if (error || !articles?.length) {
        return;
    }
    
    // Calculate stats
    let trustedCount = 0;
    let officialCount = 0;
    let latestDate = null;
    const mergedEntities = { movies: [], series: [], people: [], studios: [], franchises: [] };
    
    for (const article of articles) {
        const source = article.rss_sources;
        if (source?.trust_score >= 0.7) trustedCount++;
        if (source?.source_type === 'official_studio') officialCount++;
        
        const pubDate = new Date(article.published_at);
        if (!latestDate || pubDate > latestDate) latestDate = pubDate;
        
        // Merge entities
        const entities = article.entities_json || {};
        for (const key of Object.keys(mergedEntities)) {
            if (entities[key]?.length) {
                mergedEntities[key].push(...entities[key]);
            }
        }
    }
    
    // Deduplicate entities
    for (const key of Object.keys(mergedEntities)) {
        const unique = [];
        const seen = new Set();
        for (const e of mergedEntities[key]) {
            const id = e.tmdb_id || e.name || e.title || JSON.stringify(e);
            if (!seen.has(id)) {
                seen.add(id);
                unique.push(e);
            }
        }
        mergedEntities[key] = unique;
    }
    
    // Determine verification level
    let verificationLevel = 'unconfirmed';
    if (officialCount > 0) verificationLevel = 'studio_confirmed';
    else if (trustedCount >= 2) verificationLevel = 'multiple_sources';
    else if (trustedCount === 1) verificationLevel = 'trusted_source';
    
    // Update cluster
    const { error: updateErr } = await supabase
        .from('news_story_clusters')
        .update({
            article_count: articles.length,
            trusted_source_count: trustedCount,
            official_source_count: officialCount,
            verification_level: verificationLevel,
            last_seen_at: latestDate?.toISOString() || new Date().toISOString(),
            entities_json: mergedEntities,
            updated_at: new Date().toISOString(),
        })
        .eq('id', clusterId);
    
    if (updateErr) {
        console.error('[news-clustering] Failed to update cluster stats:', updateErr.message);
    }
}

/**
 * Main clustering function: cluster an article
 */
export async function clusterArticle(articleId) {
    const startTime = Date.now();
    const supabase = getSupabaseAdmin();
    
    // Fetch the article
    const { data: article, error: fetchErr } = await supabase
        .from('feed_articles')
        .select('id, title, source_id, published_at, primary_category, entities_json, ai_main_event, cluster_id')
        .eq('id', articleId)
        .single();
    
    if (fetchErr || !article) {
        return { success: false, error: 'Article not found' };
    }
    
    // Skip if already clustered
    if (article.cluster_id) {
        return { success: true, skipped: true, reason: 'Already clustered', clusterId: article.cluster_id };
    }
    
    // Check for exact duplicates
    const dupCheck = await findExactDuplicate(article);
    if (dupCheck.isDuplicate) {
        // Log and potentially mark as duplicate
        await supabase.from('news_processing_logs').insert({
            article_id: articleId,
            step: 'clustering',
            status: 'skipped',
            message: `Duplicate detected (${dupCheck.type})`,
            metadata_json: { duplicate_of: dupCheck.originalId, type: dupCheck.type },
            duration_ms: Date.now() - startTime,
        });
        
        // Assign to same cluster as original if it has one
        const { data: original } = await supabase
            .from('feed_articles')
            .select('cluster_id')
            .eq('id', dupCheck.originalId)
            .maybeSingle();
        
        if (original?.cluster_id) {
            await addArticleToCluster(articleId, original.cluster_id, false);
            return { success: true, clusterId: original.cluster_id, isDuplicate: true };
        }
        
        return { success: true, isDuplicate: true, duplicateOf: dupCheck.originalId };
    }
    
    // Find matching cluster
    const match = await findMatchingCluster(article);
    
    let clusterId;
    let isNewCluster = false;
    
    if (match && match.score >= 30) {
        // Add to existing cluster
        clusterId = match.cluster.id;
        await addArticleToCluster(articleId, clusterId, false);
    } else {
        // Create new cluster
        const newCluster = await createClusterFromArticle(article);
        if (newCluster) {
            clusterId = newCluster.id;
            isNewCluster = true;
            await addArticleToCluster(articleId, clusterId, true); // First article is primary
        }
    }
    
    // Log the result
    await supabase.from('news_processing_logs').insert({
        article_id: articleId,
        cluster_id: clusterId,
        step: 'clustering',
        status: 'success',
        message: isNewCluster ? 'Created new cluster' : `Joined cluster (score: ${match?.score?.toFixed(0)})`,
        metadata_json: {
            is_new_cluster: isNewCluster,
            match_score: match?.score,
            match_reasons: match?.reasons,
            entity_overlap: match?.entityOverlap,
            title_similarity: match?.titleSimilarity,
        },
        duration_ms: Date.now() - startTime,
    });
    
    return {
        success: true,
        clusterId,
        isNewCluster,
        matchScore: match?.score,
        matchReasons: match?.reasons,
    };
}

/**
 * Batch cluster multiple articles
 */
export async function batchClusterArticles(articleIds) {
    const results = [];
    
    for (const id of articleIds) {
        try {
            const result = await clusterArticle(id);
            results.push({ articleId: id, ...result });
        } catch (err) {
            results.push({ articleId: id, success: false, error: err.message });
        }
    }
    
    return {
        total: articleIds.length,
        successful: results.filter(r => r.success).length,
        newClusters: results.filter(r => r.isNewCluster).length,
        joinedClusters: results.filter(r => r.success && !r.isNewCluster && r.clusterId).length,
        results,
    };
}

/**
 * Get unclustered articles
 */
export async function getUnclusteredArticles(limit = 50) {
    const supabase = getSupabaseAdmin();
    
    const { data, error } = await supabase
        .from('feed_articles')
        .select('id, title, source_name, published_at, primary_category')
        .eq('classification_status', 'completed')
        .is('cluster_id', null)
        .order('published_at', { ascending: false })
        .limit(limit);
    
    if (error) {
        console.error('[news-clustering] Failed to fetch unclustered articles:', error.message);
        return [];
    }
    
    return data || [];
}

/**
 * Merge two clusters
 */
export async function mergeClusters(sourceClusterId, targetClusterId) {
    const supabase = getSupabaseAdmin();
    
    // Move all articles from source to target
    const { error: moveErr } = await supabase
        .from('feed_articles')
        .update({
            cluster_id: targetClusterId,
            updated_at: new Date().toISOString(),
        })
        .eq('cluster_id', sourceClusterId);
    
    if (moveErr) {
        return { success: false, error: moveErr.message };
    }
    
    // Mark source cluster as merged
    await supabase
        .from('news_story_clusters')
        .update({
            status: 'merged',
            updated_at: new Date().toISOString(),
        })
        .eq('id', sourceClusterId);
    
    // Update target cluster stats
    await updateClusterStats(targetClusterId);
    
    return { success: true };
}

/**
 * Get cluster with its articles
 */
export async function getClusterWithArticles(clusterId) {
    const supabase = getSupabaseAdmin();
    
    const { data: cluster, error: clusterErr } = await supabase
        .from('news_story_clusters')
        .select('*')
        .eq('id', clusterId)
        .single();
    
    if (clusterErr || !cluster) {
        return null;
    }
    
    const { data: articles } = await supabase
        .from('feed_articles')
        .select('id, title, source_name, source_logo_url, published_at, link, relevance_score, is_primary_source')
        .eq('cluster_id', clusterId)
        .order('is_primary_source', { ascending: false })
        .order('published_at', { ascending: false });
    
    return {
        ...cluster,
        articles: articles || [],
    };
}
