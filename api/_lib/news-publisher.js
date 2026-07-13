/**
 * News Publishing Decision Engine
 * 
 * Evaluates clusters for publishing eligibility and handles:
 * - Auto-publish for high-quality trending stories
 * - Review queue for medium-score stories
 * - Archive for low-score or stale stories
 * - Original headline generation to avoid plagiarism
 */

import { getSupabaseAdmin } from './supabase-admin.js';
import { getTrendScoreBreakdown, getPublishReadyClusters, getReviewQueueClusters } from './news-trending.js';

// Publishing thresholds
const THRESHOLDS = {
    autoPublish: {
        minTrendScore: 72,
        minRelevanceScore: 70,
        minQualityScore: 65,
        maxGossipProbability: 0.10,
        maxRumourProbability: 0.20,
    },
    review: {
        minTrendScore: 45,
        maxTrendScore: 71,
    },
    archive: {
        maxTrendScore: 44,
        maxAgeHours: 168, // 7 days
    },
};

// LLM configuration for headline generation (Mistral primary, Gemini fallback)
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
const GEMINI_MODEL = 'gemini-2.0-flash';
const MISTRAL_MODEL = 'mistral-small-latest';
const REQUEST_TIMEOUT_MS = 15000;

function getMistralKey() {
    return process.env.MIST_API_KEY || process.env.MISTRAL_API_KEY;
}

function getGeminiKey() {
    return process.env.GEMINI_API_KEY;
}

/**
 * Generate an original headline for a cluster (to avoid plagiarism)
 * Uses Mistral as primary, Gemini as fallback
 */
async function generateOriginalHeadline(cluster, primaryArticle) {
    const mistralKey = getMistralKey();
    const geminiKey = getGeminiKey();
    
    if (!mistralKey && !geminiKey) {
        return primaryArticle?.title || cluster.canonical_title;
    }

    const prompt = `You are rewriting a news headline for a movie/entertainment news site.

Original headline: "${primaryArticle?.title || cluster.canonical_title}"

Main event: ${cluster.main_event || 'Not specified'}

Requirements:
- Create a NEW headline that conveys the same news but uses different wording
- Keep it concise (max 80 characters)
- Professional tone, no clickbait
- Focus on the key facts
- Output ONLY the headline, no quotes or explanation

New headline:`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        // Try Mistral first
        if (mistralKey) {
            const res = await fetch(MISTRAL_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${mistralKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: MISTRAL_MODEL,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                    max_tokens: 100,
                }),
                signal: controller.signal,
            });

            if (res.ok) {
                const data = await res.json();
                const text = data?.choices?.[0]?.message?.content || '';
                const headline = text.trim().replace(/^["']|["']$/g, '').slice(0, 120);
                if (headline) {
                    clearTimeout(timer);
                    return headline;
                }
            }
        }

        // Fallback to Gemini
        if (geminiKey) {
            const model = process.env.NEWS_CLASSIFICATION_MODEL_GEMINI || GEMINI_MODEL;
            const url = `${GEMINI_BASE}/${model}:generateContent?key=${geminiKey}`;

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 100,
                    },
                }),
                signal: controller.signal,
            });

            if (res.ok) {
                const data = await res.json();
                const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
                const headline = text.trim().replace(/^["']|["']$/g, '').slice(0, 120);
                if (headline) return headline;
            }
        }

        return primaryArticle?.title || cluster.canonical_title;
    } catch (err) {
        console.warn('[news-publisher] Headline generation error:', err.message);
        return primaryArticle?.title || cluster.canonical_title;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Generate a summary for a published cluster
 * Uses Mistral as primary, Gemini as fallback
 */
async function generateClusterSummary(cluster, primaryArticle) {
    const mistralKey = getMistralKey();
    const geminiKey = getGeminiKey();
    
    if (!mistralKey && !geminiKey) {
        return primaryArticle?.ai_summary || primaryArticle?.summary || cluster.main_event;
    }

    const prompt = `Summarize this entertainment news story in 2-3 sentences for a movie news site.

Headline: "${primaryArticle?.title || cluster.canonical_title}"
Main event: ${cluster.main_event || 'Not specified'}
Why it matters: ${primaryArticle?.ai_why_it_matters || 'Not specified'}
Sources: ${cluster.article_count} news sources reporting

Requirements:
- Factual and professional tone
- Include the key facts
- Max 200 words
- No speculation or opinions

Summary:`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        // Try Mistral first
        if (mistralKey) {
            const res = await fetch(MISTRAL_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${mistralKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: MISTRAL_MODEL,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.5,
                    max_tokens: 300,
                }),
                signal: controller.signal,
            });

            if (res.ok) {
                const data = await res.json();
                const text = data?.choices?.[0]?.message?.content || '';
                if (text.trim()) {
                    clearTimeout(timer);
                    return text.trim().slice(0, 800);
                }
            }
        }

        // Fallback to Gemini
        if (geminiKey) {
            const model = process.env.NEWS_CLASSIFICATION_MODEL_GEMINI || GEMINI_MODEL;
            const url = `${GEMINI_BASE}/${model}:generateContent?key=${geminiKey}`;

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.5,
                        maxOutputTokens: 300,
                    },
                }),
                signal: controller.signal,
            });

            if (res.ok) {
                const data = await res.json();
                const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
                if (text.trim()) return text.trim().slice(0, 800);
            }
        }

        return primaryArticle?.ai_summary || primaryArticle?.summary || cluster.main_event;
    } catch (err) {
        console.warn('[news-publisher] Summary generation error:', err.message);
        return primaryArticle?.ai_summary || primaryArticle?.summary || cluster.main_event;
    } finally {
        clearTimeout(timer);
    }
}


/**
 * Check if a cluster meets auto-publish criteria
 */
export async function evaluateForAutoPublish(cluster) {
    const breakdown = await getTrendScoreBreakdown(cluster.id);
    if (!breakdown) {
        return { eligible: false, reason: 'Could not calculate trend score' };
    }

    const checks = [];

    // Trend score check
    if (breakdown.score < THRESHOLDS.autoPublish.minTrendScore) {
        checks.push(`Trend score ${breakdown.score} < ${THRESHOLDS.autoPublish.minTrendScore}`);
    }

    // Relevance check
    if (breakdown.metrics.avgRelevance < THRESHOLDS.autoPublish.minRelevanceScore) {
        checks.push(`Relevance ${breakdown.metrics.avgRelevance.toFixed(0)} < ${THRESHOLDS.autoPublish.minRelevanceScore}`);
    }

    // Quality check
    if (breakdown.metrics.avgQuality < THRESHOLDS.autoPublish.minQualityScore) {
        checks.push(`Quality ${breakdown.metrics.avgQuality.toFixed(0)} < ${THRESHOLDS.autoPublish.minQualityScore}`);
    }

    // Gossip check
    if (breakdown.metrics.avgGossip > THRESHOLDS.autoPublish.maxGossipProbability) {
        checks.push(`Gossip ${(breakdown.metrics.avgGossip * 100).toFixed(0)}% > ${THRESHOLDS.autoPublish.maxGossipProbability * 100}%`);
    }

    // Rumour check
    if (breakdown.metrics.avgRumour > THRESHOLDS.autoPublish.maxRumourProbability) {
        checks.push(`Rumour ${(breakdown.metrics.avgRumour * 100).toFixed(0)}% > ${THRESHOLDS.autoPublish.maxRumourProbability * 100}%`);
    }

    if (checks.length > 0) {
        return {
            eligible: false,
            reason: checks.join('; '),
            breakdown,
        };
    }

    return {
        eligible: true,
        reason: 'All criteria met',
        breakdown,
    };
}

/**
 * Auto-publish a cluster as a feed article
 */
export async function autoPublishCluster(clusterId) {
    const startTime = Date.now();
    const supabase = getSupabaseAdmin();

    // Fetch cluster
    const { data: cluster, error: clusterErr } = await supabase
        .from('news_story_clusters')
        .select('*')
        .eq('id', clusterId)
        .single();

    if (clusterErr || !cluster) {
        return { success: false, error: 'Cluster not found' };
    }

    // Check if already published
    if (cluster.published_post_id) {
        return { success: false, error: 'Cluster already published' };
    }

    // Evaluate eligibility
    const evaluation = await evaluateForAutoPublish(cluster);
    if (!evaluation.eligible) {
        return { success: false, error: `Not eligible: ${evaluation.reason}` };
    }

    // Get primary article
    const { data: primaryArticle } = await supabase
        .from('feed_articles')
        .select('*')
        .eq('cluster_id', clusterId)
        .eq('is_primary_source', true)
        .maybeSingle();

    // Fallback to highest relevance article
    const { data: fallbackArticle } = !primaryArticle ? await supabase
        .from('feed_articles')
        .select('*')
        .eq('cluster_id', clusterId)
        .order('relevance_score', { ascending: false })
        .limit(1)
        .maybeSingle() : { data: null };

    const sourceArticle = primaryArticle || fallbackArticle;
    if (!sourceArticle) {
        return { success: false, error: 'No source article found' };
    }

    // Generate original headline and summary
    const headline = await generateOriginalHeadline(cluster, sourceArticle);
    const summary = await generateClusterSummary(cluster, sourceArticle);

    // Update source article as the published article
    const { error: updateErr } = await supabase
        .from('feed_articles')
        .update({
            status: 'approved',
            title: headline,
            summary: summary,
            is_primary_source: true,
            updated_at: new Date().toISOString(),
        })
        .eq('id', sourceArticle.id);

    if (updateErr) {
        return { success: false, error: updateErr.message };
    }

    // Update cluster as published
    const { error: clusterUpdateErr } = await supabase
        .from('news_story_clusters')
        .update({
            status: 'published',
            published_post_id: sourceArticle.id,
            updated_at: new Date().toISOString(),
        })
        .eq('id', clusterId);

    if (clusterUpdateErr) {
        console.error('[news-publisher] Failed to update cluster status:', clusterUpdateErr.message);
    }

    // Log the publishing action
    await supabase.from('news_processing_logs').insert({
        article_id: sourceArticle.id,
        cluster_id: clusterId,
        step: 'publish_decision',
        status: 'success',
        message: `Auto-published: ${headline}`,
        metadata_json: {
            original_title: sourceArticle.title,
            generated_title: headline,
            trend_score: cluster.trend_score,
            article_count: cluster.article_count,
        },
        duration_ms: Date.now() - startTime,
    });

    return {
        success: true,
        clusterId,
        articleId: sourceArticle.id,
        headline,
        summary,
        trendScore: cluster.trend_score,
    };
}

/**
 * Process all publish-ready clusters
 */
export async function processPublishReadyClusters() {
    const clusters = await getPublishReadyClusters(THRESHOLDS.autoPublish.minTrendScore);
    const results = [];

    for (const cluster of clusters) {
        // Check source auto_publish_allowed
        const supabase = getSupabaseAdmin();
        const { data: articles } = await supabase
            .from('feed_articles')
            .select('source_id, rss_sources(auto_publish_allowed)')
            .eq('cluster_id', cluster.id)
            .eq('is_primary_source', true)
            .limit(1);

        const sourceAllowsAutoPublish = articles?.[0]?.rss_sources?.auto_publish_allowed !== false;

        if (!sourceAllowsAutoPublish) {
            results.push({
                clusterId: cluster.id,
                success: false,
                reason: 'Source does not allow auto-publish',
            });
            continue;
        }

        const result = await autoPublishCluster(cluster.id);
        results.push({
            clusterId: cluster.id,
            ...result,
        });
    }

    return {
        total: clusters.length,
        published: results.filter(r => r.success).length,
        skipped: results.filter(r => !r.success).length,
        results,
    };
}

/**
 * Manually approve a cluster for publishing
 */
export async function manualPublishCluster(clusterId, options = {}) {
    const { customHeadline, customSummary } = options;
    const startTime = Date.now();
    const supabase = getSupabaseAdmin();

    // Fetch cluster
    const { data: cluster, error: clusterErr } = await supabase
        .from('news_story_clusters')
        .select('*')
        .eq('id', clusterId)
        .single();

    if (clusterErr || !cluster) {
        return { success: false, error: 'Cluster not found' };
    }

    if (cluster.published_post_id) {
        return { success: false, error: 'Cluster already published' };
    }

    // Get primary article
    const { data: sourceArticle } = await supabase
        .from('feed_articles')
        .select('*')
        .eq('cluster_id', clusterId)
        .order('is_primary_source', { ascending: false })
        .order('relevance_score', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!sourceArticle) {
        return { success: false, error: 'No source article found' };
    }

    // Use custom or generate headline/summary
    const headline = customHeadline || await generateOriginalHeadline(cluster, sourceArticle);
    const summary = customSummary || await generateClusterSummary(cluster, sourceArticle);

    // Update source article
    const { error: updateErr } = await supabase
        .from('feed_articles')
        .update({
            status: 'approved',
            title: headline,
            summary: summary,
            is_primary_source: true,
            updated_at: new Date().toISOString(),
        })
        .eq('id', sourceArticle.id);

    if (updateErr) {
        return { success: false, error: updateErr.message };
    }

    // Update cluster
    await supabase
        .from('news_story_clusters')
        .update({
            status: 'published',
            published_post_id: sourceArticle.id,
            updated_at: new Date().toISOString(),
        })
        .eq('id', clusterId);

    // Log
    await supabase.from('news_processing_logs').insert({
        article_id: sourceArticle.id,
        cluster_id: clusterId,
        step: 'publish_decision',
        status: 'success',
        message: `Manual publish: ${headline}`,
        metadata_json: {
            manual: true,
            original_title: sourceArticle.title,
            trend_score: cluster.trend_score,
        },
        duration_ms: Date.now() - startTime,
    });

    return {
        success: true,
        clusterId,
        articleId: sourceArticle.id,
        headline,
        summary,
    };
}

/**
 * Reject a cluster (move to rejected status)
 */
export async function rejectCluster(clusterId, reason = 'Manual rejection') {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
        .from('news_story_clusters')
        .update({
            status: 'rejected',
            updated_at: new Date().toISOString(),
        })
        .eq('id', clusterId);

    if (error) {
        return { success: false, error: error.message };
    }

    // Log
    await supabase.from('news_processing_logs').insert({
        cluster_id: clusterId,
        step: 'publish_decision',
        status: 'success',
        message: `Rejected: ${reason}`,
        metadata_json: { reason },
    });

    return { success: true, clusterId };
}

/**
 * Archive low-score clusters
 */
export async function archiveLowScoreClusters() {
    const supabase = getSupabaseAdmin();

    const cutoff = new Date(Date.now() - THRESHOLDS.archive.maxAgeHours * 60 * 60 * 1000);

    const { data, error } = await supabase
        .from('news_story_clusters')
        .update({
            status: 'archived',
            updated_at: new Date().toISOString(),
        })
        .eq('status', 'active')
        .lt('trend_score', THRESHOLDS.archive.maxTrendScore)
        .lt('last_seen_at', cutoff.toISOString())
        .select('id');

    if (error) {
        return { success: false, error: error.message };
    }

    return {
        success: true,
        archived: data?.length || 0,
    };
}

/**
 * Get publishing decision summary for a cluster
 */
export async function getPublishingDecision(clusterId) {
    const evaluation = await evaluateForAutoPublish({ id: clusterId });
    const supabase = getSupabaseAdmin();

    const { data: cluster } = await supabase
        .from('news_story_clusters')
        .select('*')
        .eq('id', clusterId)
        .single();

    if (!cluster) {
        return null;
    }

    let decision;
    if (cluster.trend_score >= THRESHOLDS.autoPublish.minTrendScore && evaluation.eligible) {
        decision = 'auto_publish';
    } else if (cluster.trend_score >= THRESHOLDS.review.minTrendScore) {
        decision = 'review';
    } else {
        decision = 'archive';
    }

    return {
        clusterId,
        decision,
        trendScore: cluster.trend_score,
        evaluation,
        thresholds: THRESHOLDS,
    };
}

/**
 * Get full review queue with evaluations
 */
export async function getReviewQueueWithEvaluations() {
    const clusters = await getReviewQueueClusters();
    const results = [];

    for (const cluster of clusters) {
        const evaluation = await evaluateForAutoPublish(cluster);
        results.push({
            ...cluster,
            evaluation,
        });
    }

    return results;
}
