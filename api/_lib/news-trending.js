/**
 * News Trend Scoring Service
 * 
 * Calculates trending scores for story clusters based on:
 * - Source coverage (number of sources reporting)
 * - Velocity (how fast the story is growing)
 * - Source authority (trust scores of reporting sources)
 * - Official confirmation (studio/network confirmation)
 * - Editorial importance (relevance scores)
 * - Freshness (recency of articles)
 * - Penalties (gossip, rumour content)
 */

import { getSupabaseAdmin } from './supabase-admin.js';

// Scoring weights (sum = 1.0)
const WEIGHTS = {
    sourceCount: 0.25,      // More sources = bigger story
    velocity: 0.20,         // Articles per hour
    sourceAuthority: 0.15,  // Average trust_score of sources
    officialConfirm: 0.15,  // Has official studio source?
    editorialImportance: 0.15, // Avg relevance_score
    freshness: 0.10,        // How recent
};

// Thresholds
const MAX_SOURCE_COUNT = 10;  // 10+ sources = max score
const VELOCITY_WINDOW_HOURS = 6; // Calculate velocity over this period
const FRESHNESS_DECAY_HOURS = 48; // Story starts decaying after this

/**
 * Calculate velocity score (articles per hour in recent window)
 */
async function calculateVelocity(clusterId, articleCount) {
    const supabase = getSupabaseAdmin();
    
    // Get articles from the velocity window
    const cutoff = new Date(Date.now() - VELOCITY_WINDOW_HOURS * 60 * 60 * 1000);
    
    const { data: recentArticles, error } = await supabase
        .from('feed_articles')
        .select('id, published_at')
        .eq('cluster_id', clusterId)
        .gte('published_at', cutoff.toISOString());
    
    if (error || !recentArticles) {
        return 0;
    }
    
    // Articles per hour in the window
    const articlesPerHour = recentArticles.length / VELOCITY_WINDOW_HOURS;
    
    // Normalize to 0-1 (3+ articles/hour = max velocity)
    return Math.min(articlesPerHour / 3, 1);
}

/**
 * Calculate freshness score (decays over time)
 */
function calculateFreshness(lastSeenAt) {
    if (!lastSeenAt) return 0;
    
    const lastSeen = new Date(lastSeenAt);
    const hoursAgo = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60);
    
    if (hoursAgo <= 2) return 1.0;  // Very fresh
    if (hoursAgo <= 6) return 0.9;  // Fresh
    if (hoursAgo <= 12) return 0.75;
    if (hoursAgo <= 24) return 0.5;
    if (hoursAgo <= 48) return 0.3;
    if (hoursAgo <= 72) return 0.15;
    
    return 0.05; // Old but not zero
}

/**
 * Get average metrics from cluster articles
 */
async function getClusterArticleMetrics(clusterId) {
    const supabase = getSupabaseAdmin();
    
    const { data: articles, error } = await supabase
        .from('feed_articles')
        .select(`
            relevance_score,
            gossip_probability,
            rumour_probability,
            article_quality_score,
            rss_sources(trust_score, source_type)
        `)
        .eq('cluster_id', clusterId);
    
    if (error || !articles?.length) {
        return {
            avgRelevance: 50,
            avgGossip: 0,
            avgRumour: 0,
            avgQuality: 50,
            avgTrustScore: 0.5,
            hasOfficialSource: false,
            uniqueSourceCount: 0,
        };
    }
    
    let totalRelevance = 0;
    let totalGossip = 0;
    let totalRumour = 0;
    let totalQuality = 0;
    let totalTrust = 0;
    let hasOfficial = false;
    const sourceIds = new Set();
    let countWithRelevance = 0;
    let countWithGossip = 0;
    let countWithQuality = 0;
    let countWithTrust = 0;
    
    for (const article of articles) {
        if (article.relevance_score != null) {
            totalRelevance += article.relevance_score;
            countWithRelevance++;
        }
        if (article.gossip_probability != null) {
            totalGossip += article.gossip_probability;
            countWithGossip++;
        }
        if (article.rumour_probability != null) {
            totalRumour += article.rumour_probability;
        }
        if (article.article_quality_score != null) {
            totalQuality += article.article_quality_score;
            countWithQuality++;
        }
        
        const source = article.rss_sources;
        if (source) {
            if (source.trust_score != null) {
                totalTrust += source.trust_score;
                countWithTrust++;
            }
            if (source.source_type === 'official_studio') {
                hasOfficial = true;
            }
        }
    }
    
    return {
        avgRelevance: countWithRelevance > 0 ? totalRelevance / countWithRelevance : 50,
        avgGossip: countWithGossip > 0 ? totalGossip / countWithGossip : 0,
        avgRumour: countWithGossip > 0 ? totalRumour / countWithGossip : 0,
        avgQuality: countWithQuality > 0 ? totalQuality / countWithQuality : 50,
        avgTrustScore: countWithTrust > 0 ? totalTrust / countWithTrust : 0.5,
        hasOfficialSource: hasOfficial,
        uniqueSourceCount: articles.length, // Each article is from a different source in practice
    };
}

/**
 * Calculate trend score for a cluster
 */
export async function calculateTrendScore(cluster) {
    const metrics = await getClusterArticleMetrics(cluster.id);
    const velocity = await calculateVelocity(cluster.id, cluster.article_count);
    const freshness = calculateFreshness(cluster.last_seen_at);
    
    // Component scores (all normalized to 0-100)
    const sourceCountScore = Math.min(cluster.article_count / MAX_SOURCE_COUNT, 1) * 100;
    const velocityScore = velocity * 100;
    const authorityScore = metrics.avgTrustScore * 100;
    const officialScore = metrics.hasOfficialSource ? 100 : (cluster.official_source_count > 0 ? 100 : 0);
    const importanceScore = metrics.avgRelevance;
    const freshnessScore = freshness * 100;
    
    // Calculate weighted base score
    let score = (
        sourceCountScore * WEIGHTS.sourceCount +
        velocityScore * WEIGHTS.velocity +
        authorityScore * WEIGHTS.sourceAuthority +
        officialScore * WEIGHTS.officialConfirm +
        importanceScore * WEIGHTS.editorialImportance +
        freshnessScore * WEIGHTS.freshness
    );
    
    // Apply penalties
    const gossipPenalty = metrics.avgGossip * 25; // Up to -25 for pure gossip
    const rumourPenalty = metrics.avgRumour * 15; // Up to -15 for rumours
    
    score -= gossipPenalty;
    score -= rumourPenalty;
    
    // Quality bonus for high-quality clusters
    if (metrics.avgQuality > 75) {
        score += 5;
    }
    
    // Official source bonus
    if (metrics.hasOfficialSource) {
        score += 10;
    }
    
    // Multiple trusted sources bonus
    if (cluster.trusted_source_count >= 3) {
        score += 5;
    }
    
    // Clamp to valid range
    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    
    return {
        score: finalScore,
        components: {
            sourceCount: Math.round(sourceCountScore),
            velocity: Math.round(velocityScore),
            authority: Math.round(authorityScore),
            official: Math.round(officialScore),
            importance: Math.round(importanceScore),
            freshness: Math.round(freshnessScore),
        },
        penalties: {
            gossip: Math.round(gossipPenalty),
            rumour: Math.round(rumourPenalty),
        },
        bonuses: {
            quality: metrics.avgQuality > 75 ? 5 : 0,
            official: metrics.hasOfficialSource ? 10 : 0,
            trustedSources: cluster.trusted_source_count >= 3 ? 5 : 0,
        },
        metrics,
    };
}

/**
 * Update trend score for a single cluster
 */
export async function updateClusterTrendScore(clusterId) {
    const startTime = Date.now();
    const supabase = getSupabaseAdmin();
    
    // Fetch cluster
    const { data: cluster, error: fetchErr } = await supabase
        .from('news_story_clusters')
        .select('*')
        .eq('id', clusterId)
        .single();
    
    if (fetchErr || !cluster) {
        return { success: false, error: 'Cluster not found' };
    }
    
    // Calculate new score
    const result = await calculateTrendScore(cluster);
    
    // Track peak score
    const peakScore = Math.max(cluster.peak_trend_score || 0, result.score);
    
    // Calculate velocity direction
    const previousScore = cluster.trend_score || 0;
    const velocityDirection = result.score - previousScore;
    
    // Update cluster
    const { error: updateErr } = await supabase
        .from('news_story_clusters')
        .update({
            trend_score: result.score,
            peak_trend_score: peakScore,
            trend_velocity: velocityDirection,
            updated_at: new Date().toISOString(),
        })
        .eq('id', clusterId);
    
    if (updateErr) {
        console.error('[news-trending] Update failed:', updateErr.message);
        return { success: false, error: updateErr.message };
    }
    
    // Log the calculation
    await supabase.from('news_processing_logs').insert({
        cluster_id: clusterId,
        step: 'trend_scoring',
        status: 'success',
        message: `Score: ${result.score} (was ${previousScore})`,
        metadata_json: {
            score: result.score,
            previous_score: previousScore,
            components: result.components,
            penalties: result.penalties,
            bonuses: result.bonuses,
        },
        duration_ms: Date.now() - startTime,
    });
    
    return {
        success: true,
        clusterId,
        score: result.score,
        previousScore,
        change: velocityDirection,
        ...result,
    };
}

/**
 * Recalculate trend scores for all active clusters
 */
export async function recalculateAllTrendScores() {
    const supabase = getSupabaseAdmin();
    
    // Get active clusters
    const { data: clusters, error } = await supabase
        .from('news_story_clusters')
        .select('id')
        .eq('status', 'active')
        .gte('last_seen_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Last 7 days
    
    if (error) {
        console.error('[news-trending] Failed to fetch clusters:', error.message);
        return { success: false, error: error.message };
    }
    
    const results = [];
    
    for (const cluster of clusters || []) {
        const result = await updateClusterTrendScore(cluster.id);
        results.push({
            clusterId: cluster.id,
            success: result.success,
            score: result.score,
            change: result.change,
        });
    }
    
    return {
        success: true,
        total: results.length,
        updated: results.filter(r => r.success).length,
        results,
    };
}

/**
 * Get trending clusters sorted by score
 */
export async function getTrendingClusters(options = {}) {
    const { minScore = 0, limit = 20, includeArticles = false } = options;
    const supabase = getSupabaseAdmin();
    
    let query = supabase
        .from('news_story_clusters')
        .select('*')
        .eq('status', 'active')
        .gte('trend_score', minScore)
        .order('trend_score', { ascending: false })
        .limit(limit);
    
    const { data: clusters, error } = await query;
    
    if (error) {
        console.error('[news-trending] Failed to fetch trending:', error.message);
        return [];
    }
    
    if (!includeArticles) {
        return clusters || [];
    }
    
    // Fetch articles for each cluster
    const enriched = [];
    for (const cluster of clusters || []) {
        const { data: articles } = await supabase
            .from('feed_articles')
            .select('id, title, source_name, source_logo_url, published_at, link, is_primary_source')
            .eq('cluster_id', cluster.id)
            .order('is_primary_source', { ascending: false })
            .order('published_at', { ascending: false })
            .limit(5);
        
        enriched.push({
            ...cluster,
            articles: articles || [],
        });
    }
    
    return enriched;
}

/**
 * Get clusters ready for auto-publish (high trend score)
 */
export async function getPublishReadyClusters(minScore = 72) {
    const supabase = getSupabaseAdmin();
    
    const { data, error } = await supabase
        .from('news_story_clusters')
        .select('*')
        .eq('status', 'active')
        .is('published_post_id', null)
        .gte('trend_score', minScore)
        .order('trend_score', { ascending: false });
    
    if (error) {
        console.error('[news-trending] Failed to fetch publish-ready:', error.message);
        return [];
    }
    
    return data || [];
}

/**
 * Get clusters needing review (medium trend score)
 */
export async function getReviewQueueClusters(minScore = 45, maxScore = 71) {
    const supabase = getSupabaseAdmin();
    
    const { data, error } = await supabase
        .from('news_story_clusters')
        .select('*')
        .eq('status', 'active')
        .is('published_post_id', null)
        .gte('trend_score', minScore)
        .lte('trend_score', maxScore)
        .order('trend_score', { ascending: false });
    
    if (error) {
        console.error('[news-trending] Failed to fetch review queue:', error.message);
        return [];
    }
    
    return data || [];
}

/**
 * Get trend score breakdown for a cluster (for debugging/admin UI)
 */
export async function getTrendScoreBreakdown(clusterId) {
    const supabase = getSupabaseAdmin();
    
    const { data: cluster, error } = await supabase
        .from('news_story_clusters')
        .select('*')
        .eq('id', clusterId)
        .single();
    
    if (error || !cluster) {
        return null;
    }
    
    return calculateTrendScore(cluster);
}

/**
 * Archive stale clusters (no activity, low score)
 */
export async function archiveStaleClusters(maxAgeHours = 168, maxScore = 20) {
    const supabase = getSupabaseAdmin();
    
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    
    const { data, error } = await supabase
        .from('news_story_clusters')
        .update({
            status: 'archived',
            updated_at: new Date().toISOString(),
        })
        .eq('status', 'active')
        .lt('last_seen_at', cutoff.toISOString())
        .lt('trend_score', maxScore)
        .select('id');
    
    if (error) {
        console.error('[news-trending] Archive failed:', error.message);
        return { success: false, error: error.message };
    }
    
    return {
        success: true,
        archived: data?.length || 0,
    };
}
