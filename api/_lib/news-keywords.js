/**
 * News Keyword Filtering Service (Server-side)
 * 
 * Pre-AI filtering layer that analyzes article text against keyword dictionaries
 * to quickly reject obvious gossip/lifestyle content before expensive AI classification.
 */

import { getSupabaseAdmin } from './supabase-admin.js';

// Cache for keyword dictionaries (refreshed periodically)
let keywordCache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load keyword dictionaries from database with caching
 */
export async function loadKeywords(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && keywordCache && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return keywordCache;
    }

    const supabase = getSupabaseAdmin();
    const { data: keywords, error } = await supabase
        .from('news_keyword_dictionaries')
        .select('*')
        .eq('is_active', true);

    if (error) {
        console.error('[news-keywords] Failed to load dictionaries:', error.message);
        // Return empty cache if load fails
        return {
            rejection: { all: [], relationship: [], lifestyle: [], gossip: [], controversy: [], clickbait: [], personal: [] },
            positive: { all: [], movie_term: [], announcement: [], casting: [], production: [], release: [], industry: [], awards: [] },
            category_indicator: {},
        };
    }

    // Organize by category and subcategory
    const organized = {
        rejection: {
            all: [],
            relationship: [],
            lifestyle: [],
            gossip: [],
            controversy: [],
            clickbait: [],
            personal: [],
        },
        positive: {
            all: [],
            movie_term: [],
            announcement: [],
            casting: [],
            production: [],
            release: [],
            industry: [],
            awards: [],
        },
        category_indicator: {},
    };

    for (const kw of keywords || []) {
        const cat = kw.category;
        const subcat = kw.subcategory || 'all';
        const entry = {
            term: kw.term.toLowerCase(),
            weight: kw.weight || 1,
            isPhrase: kw.is_phrase || kw.term.includes(' '),
        };

        if (cat === 'rejection') {
            organized.rejection.all.push(entry);
            if (organized.rejection[subcat]) {
                organized.rejection[subcat].push(entry);
            }
        } else if (cat === 'positive') {
            organized.positive.all.push(entry);
            if (organized.positive[subcat]) {
                organized.positive[subcat].push(entry);
            }
        } else if (cat === 'category_indicator') {
            if (!organized.category_indicator[subcat]) {
                organized.category_indicator[subcat] = [];
            }
            organized.category_indicator[subcat].push(entry);
        }
    }

    keywordCache = organized;
    cacheTimestamp = now;
    
    const totalRejection = organized.rejection.all.length;
    const totalPositive = organized.positive.all.length;
    console.log(`[news-keywords] Loaded ${totalRejection} rejection + ${totalPositive} positive keywords`);
    
    return organized;
}

/**
 * Normalize text for keyword matching
 */
export function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .replace(/[^\w\s']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extract words from normalized text
 */
export function extractWords(text) {
    const normalized = normalizeText(text);
    return normalized.split(' ').filter(w => w.length > 1);
}

/**
 * Check if text contains a phrase
 */
function containsPhrase(normalizedText, phrase) {
    return normalizedText.includes(phrase);
}

/**
 * Calculate keyword score for a category
 */
function calculateCategoryScore(normalizedText, words, keywordList) {
    let score = 0;
    const matchedTerms = [];

    for (const kw of keywordList) {
        let matched = false;

        if (kw.isPhrase) {
            if (containsPhrase(normalizedText, kw.term)) {
                matched = true;
            }
        } else {
            if (words.includes(kw.term)) {
                matched = true;
            }
        }

        if (matched) {
            score += kw.weight;
            matchedTerms.push({ term: kw.term, weight: kw.weight });
        }
    }

    return { score, matchedTerms };
}

/**
 * Analyze article text and return keyword scores
 */
export async function analyzeArticle(title, body, keywords = null) {
    if (!keywords) {
        keywords = await loadKeywords();
    }

    const fullText = `${title || ''} ${body || ''}`;
    const normalizedText = normalizeText(fullText);
    const words = extractWords(fullText);

    const normalizedTitle = normalizeText(title || '');
    const titleWords = extractWords(title || '');

    // Calculate scores
    const rejectionResult = calculateCategoryScore(normalizedText, words, keywords.rejection.all);
    const titleRejectionResult = calculateCategoryScore(normalizedTitle, titleWords, keywords.rejection.all);
    const positiveResult = calculateCategoryScore(normalizedText, words, keywords.positive.all);
    const titlePositiveResult = calculateCategoryScore(normalizedTitle, titleWords, keywords.positive.all);

    // Title matches count double
    const negativeScore = rejectionResult.score + (titleRejectionResult.score * 2);
    const positiveScore = positiveResult.score + (titlePositiveResult.score * 2);

    // Detailed breakdown
    const breakdown = { rejection: {}, positive: {} };

    for (const subcat of Object.keys(keywords.rejection)) {
        if (subcat === 'all') continue;
        const result = calculateCategoryScore(normalizedText, words, keywords.rejection[subcat]);
        if (result.score > 0) {
            breakdown.rejection[subcat] = result;
        }
    }

    for (const subcat of Object.keys(keywords.positive)) {
        if (subcat === 'all') continue;
        const result = calculateCategoryScore(normalizedText, words, keywords.positive[subcat]);
        if (result.score > 0) {
            breakdown.positive[subcat] = result;
        }
    }

    const recommendation = determineRecommendation(negativeScore, positiveScore, breakdown);

    return {
        negativeScore,
        positiveScore,
        netScore: positiveScore - negativeScore,
        matchedNegative: rejectionResult.matchedTerms,
        matchedPositive: positiveResult.matchedTerms,
        breakdown,
        recommendation,
    };
}

/**
 * Determine recommendation based on scores
 */
function determineRecommendation(negativeScore, positiveScore, breakdown) {
    // Rule 1: Very high negative with low positive
    if (negativeScore > 15 && positiveScore < 5) {
        return {
            action: 'reject',
            reason: 'High gossip/lifestyle content, low movie relevance',
            confidence: 'high',
        };
    }

    // Rule 2: Heavy relationship/personal content
    const relationshipScore = breakdown.rejection.relationship?.score || 0;
    const personalScore = breakdown.rejection.personal?.score || 0;
    if ((relationshipScore + personalScore) > 10 && positiveScore < 8) {
        return {
            action: 'reject',
            reason: 'Celebrity personal life focus',
            confidence: 'high',
        };
    }

    // Rule 3: Clickbait heavy
    const clickbaitScore = breakdown.rejection.clickbait?.score || 0;
    if (clickbaitScore > 8) {
        return {
            action: 'reject',
            reason: 'Clickbait content pattern',
            confidence: 'medium',
        };
    }

    // Rule 4: Gossip + lifestyle combined
    const gossipScore = breakdown.rejection.gossip?.score || 0;
    const lifestyleScore = breakdown.rejection.lifestyle?.score || 0;
    if (gossipScore > 5 && lifestyleScore > 5) {
        return {
            action: 'reject',
            reason: 'Gossip and lifestyle content',
            confidence: 'medium',
        };
    }

    // Rule 5: Strong positive signals
    if (positiveScore > 15 && negativeScore < 5) {
        return {
            action: 'classify',
            reason: 'Strong movie industry signals',
            confidence: 'high',
        };
    }

    // Rule 6: Moderate positive, low negative
    if (positiveScore > 8 && negativeScore < 8) {
        return {
            action: 'classify',
            reason: 'Likely movie-related content',
            confidence: 'medium',
        };
    }

    // Rule 7: Mixed signals
    if (negativeScore > 8 && positiveScore > 8) {
        return {
            action: 'classify',
            reason: 'Mixed signals - requires AI review',
            confidence: 'low',
        };
    }

    // Default: Send to AI
    return {
        action: 'classify',
        reason: 'Needs AI classification',
        confidence: 'low',
    };
}

/**
 * Run keyword analysis on an article and update its record
 */
export async function analyzeAndUpdateArticle(articleId, title, body) {
    const startTime = Date.now();
    const supabase = getSupabaseAdmin();
    
    try {
        const analysis = await analyzeArticle(title, body);
        
        const updates = {
            positive_keyword_score: analysis.positiveScore,
            negative_keyword_score: analysis.negativeScore,
            updated_at: new Date().toISOString(),
        };

        // If keyword analysis triggers hard rejection
        if (analysis.recommendation.action === 'reject') {
            updates.rejection_reason = analysis.recommendation.reason;
            updates.classification_status = 'skipped';
            updates.status = 'rejected';
        }

        const { error } = await supabase
            .from('feed_articles')
            .update(updates)
            .eq('id', articleId);

        if (error) {
            console.error('[news-keywords] Update failed:', error.message);
            return { success: false, error: error.message };
        }

        // Log the processing step
        await supabase.from('news_processing_logs').insert({
            article_id: articleId,
            step: 'keyword_filter',
            status: analysis.recommendation.action === 'reject' ? 'success' : 'success',
            message: analysis.recommendation.reason,
            metadata_json: {
                positive_score: analysis.positiveScore,
                negative_score: analysis.negativeScore,
                action: analysis.recommendation.action,
                matched_negative: analysis.matchedNegative.slice(0, 10),
                matched_positive: analysis.matchedPositive.slice(0, 10),
            },
            duration_ms: Date.now() - startTime,
        });

        return {
            success: true,
            analysis,
            rejected: analysis.recommendation.action === 'reject',
        };
    } catch (err) {
        console.error('[news-keywords] Analysis failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Batch analyze multiple articles
 */
export async function batchAnalyzeArticles(articles) {
    const keywords = await loadKeywords();
    const results = [];

    for (const article of articles) {
        const analysis = await analyzeArticle(article.title, article.summary || article.body_html, keywords);
        results.push({
            id: article.id,
            title: article.title,
            ...analysis,
        });
    }

    return results;
}

/**
 * Get keyword statistics
 */
export async function getKeywordStats() {
    const keywords = await loadKeywords(true);
    
    return {
        rejection: {
            total: keywords.rejection.all.length,
            relationship: keywords.rejection.relationship.length,
            lifestyle: keywords.rejection.lifestyle.length,
            gossip: keywords.rejection.gossip.length,
            controversy: keywords.rejection.controversy.length,
            clickbait: keywords.rejection.clickbait.length,
            personal: keywords.rejection.personal.length,
        },
        positive: {
            total: keywords.positive.all.length,
            movie_term: keywords.positive.movie_term.length,
            announcement: keywords.positive.announcement.length,
            casting: keywords.positive.casting.length,
            production: keywords.positive.production.length,
            release: keywords.positive.release.length,
            industry: keywords.positive.industry.length,
            awards: keywords.positive.awards.length,
        },
        cacheAge: Date.now() - cacheTimestamp,
    };
}
