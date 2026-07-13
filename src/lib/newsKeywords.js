/**
 * News Keyword Filtering Service
 * 
 * Pre-AI filtering layer that analyzes article text against keyword dictionaries
 * to quickly reject obvious gossip/lifestyle content before expensive AI classification.
 */

import { getKeywordDictionaries } from './supabase.js';

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

    const keywords = await getKeywordDictionaries();
    
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

    for (const kw of keywords) {
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
    return organized;
}

/**
 * Normalize text for keyword matching
 * - Lowercase
 * - Remove punctuation except apostrophes in words
 * - Collapse multiple spaces
 */
export function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .replace(/[^\w\s']/g, ' ')  // Remove punctuation except apostrophe
        .replace(/\s+/g, ' ')        // Collapse spaces
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
 * Check if text contains a phrase (multi-word match)
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
            // Phrase matching (e.g., "sources say", "you won't believe")
            if (containsPhrase(normalizedText, kw.term)) {
                matched = true;
            }
        } else {
            // Single word matching
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
 * 
 * @param {string} title - Article title
 * @param {string} body - Article body/summary text
 * @param {object} keywords - Loaded keyword dictionaries (optional, will load if not provided)
 * @returns {object} Analysis result with scores and recommendation
 */
export async function analyzeArticle(title, body, keywords = null) {
    if (!keywords) {
        keywords = await loadKeywords();
    }

    // Combine and normalize text
    const fullText = `${title || ''} ${body || ''}`;
    const normalizedText = normalizeText(fullText);
    const words = extractWords(fullText);

    // Title has higher weight - analyze separately
    const normalizedTitle = normalizeText(title || '');
    const titleWords = extractWords(title || '');

    // Calculate rejection scores
    const rejectionResult = calculateCategoryScore(normalizedText, words, keywords.rejection.all);
    const titleRejectionResult = calculateCategoryScore(normalizedTitle, titleWords, keywords.rejection.all);

    // Calculate positive scores
    const positiveResult = calculateCategoryScore(normalizedText, words, keywords.positive.all);
    const titlePositiveResult = calculateCategoryScore(normalizedTitle, titleWords, keywords.positive.all);

    // Title matches count double
    const negativeScore = rejectionResult.score + (titleRejectionResult.score * 2);
    const positiveScore = positiveResult.score + (titlePositiveResult.score * 2);

    // Detailed breakdown by subcategory
    const breakdown = {
        rejection: {},
        positive: {},
    };

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

    // Determine recommendation
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
 * Determine recommendation based on scores and breakdown
 */
function determineRecommendation(negativeScore, positiveScore, breakdown) {
    // Hard rejection rules
    
    // Rule 1: Very high negative with low positive = reject
    if (negativeScore > 15 && positiveScore < 5) {
        return {
            action: 'reject',
            reason: 'High gossip/lifestyle content, low movie relevance',
            confidence: 'high',
        };
    }

    // Rule 2: Heavy relationship/personal content = reject
    const relationshipScore = breakdown.rejection.relationship?.score || 0;
    const personalScore = breakdown.rejection.personal?.score || 0;
    if ((relationshipScore + personalScore) > 10 && positiveScore < 8) {
        return {
            action: 'reject',
            reason: 'Celebrity personal life focus',
            confidence: 'high',
        };
    }

    // Rule 3: Clickbait heavy = reject
    const clickbaitScore = breakdown.rejection.clickbait?.score || 0;
    if (clickbaitScore > 8) {
        return {
            action: 'reject',
            reason: 'Clickbait content pattern',
            confidence: 'medium',
        };
    }

    // Rule 4: Gossip heavy with multiple categories = reject
    const gossipScore = breakdown.rejection.gossip?.score || 0;
    const lifestyleScore = breakdown.rejection.lifestyle?.score || 0;
    if (gossipScore > 5 && lifestyleScore > 5) {
        return {
            action: 'reject',
            reason: 'Gossip and lifestyle content',
            confidence: 'medium',
        };
    }

    // Rule 5: Strong positive signals = approve for classification
    if (positiveScore > 15 && negativeScore < 5) {
        return {
            action: 'classify',
            reason: 'Strong movie industry signals',
            confidence: 'high',
        };
    }

    // Rule 6: Moderate positive, low negative = classify
    if (positiveScore > 8 && negativeScore < 8) {
        return {
            action: 'classify',
            reason: 'Likely movie-related content',
            confidence: 'medium',
        };
    }

    // Rule 7: Mixed signals = needs AI classification
    if (negativeScore > 8 && positiveScore > 8) {
        return {
            action: 'classify',
            reason: 'Mixed signals - requires AI review',
            confidence: 'low',
        };
    }

    // Rule 8: Low scores both ways = classify (probably neutral news)
    if (negativeScore < 5 && positiveScore < 5) {
        return {
            action: 'classify',
            reason: 'Insufficient keyword signals',
            confidence: 'low',
        };
    }

    // Default: Send to AI classification
    return {
        action: 'classify',
        reason: 'Needs AI classification',
        confidence: 'low',
    };
}

/**
 * Quick check if article should be hard-rejected before full analysis
 * More efficient for batch processing
 */
export async function quickRejectCheck(title, keywords = null) {
    if (!keywords) {
        keywords = await loadKeywords();
    }

    const normalizedTitle = normalizeText(title || '');
    const titleWords = extractWords(title || '');

    // Check for strong rejection signals in title only
    const strongRejectionTerms = [
        'dating', 'engaged', 'married', 'divorce', 'boyfriend', 'girlfriend',
        'pregnant', 'baby', 'wedding', 'affair', 'split', 'romance',
        'bikini', 'shirtless', 'outfit', 'fashion', 'diet', 'weight loss',
    ];

    for (const term of strongRejectionTerms) {
        if (term.includes(' ')) {
            if (containsPhrase(normalizedTitle, term)) {
                return { reject: true, reason: `Title contains "${term}"` };
            }
        } else {
            if (titleWords.includes(term)) {
                return { reject: true, reason: `Title contains "${term}"` };
            }
        }
    }

    return { reject: false };
}

/**
 * Test keyword analysis on sample text (for admin UI)
 */
export async function testKeywordAnalysis(text) {
    const result = await analyzeArticle(text, '');
    return {
        ...result,
        inputText: text,
        normalizedText: normalizeText(text),
    };
}

/**
 * Get statistics about loaded keywords
 */
export async function getKeywordStats() {
    const keywords = await loadKeywords(true); // Force refresh
    
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
