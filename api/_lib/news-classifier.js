/**
 * News Article Classification Service
 * 
 * AI-powered editorial classification for entertainment news articles.
 * Returns structured JSON with relevance scores, categories, probabilities, and entities.
 */

import { getSupabaseAdmin } from './supabase-admin.js';
import { normalizeEntities } from './news-entities.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 25000; // Longer timeout for detailed classification

// Classification model (Mistral primary, Gemini fallback)
const GEMINI_MODEL = 'gemini-2.0-flash';
const MISTRAL_MODEL = 'mistral-small-latest';

function getMistralKey() {
    return process.env.MIST_API_KEY || process.env.MISTRAL_API_KEY;
}

function getGeminiKey() {
    return process.env.GEMINI_API_KEY;
}

export function isClassifierEnabled() {
    return !!(getMistralKey() || getGeminiKey());
}

// System prompt for editorial classification
const CLASSIFICATION_SYSTEM_PROMPT = `You are an editorial intelligence system for a movie/TV news platform called TheaterOrStream.
Your job is to classify entertainment news articles with extreme precision to filter out gossip and lifestyle content.

## ACCEPTANCE CRITERIA (require ALL):
- Primary focus must be: movie/TV industry, professional filmmaking, business decisions
- Content types we want: casting announcements, production updates, release news, box office reports, awards coverage, studio deals, streaming acquisitions, director/writer attachments
- Tone must be: professional, factual, industry-focused

## REJECTION CRITERIA (ANY ONE triggers rejection):
- Celebrity personal life, relationships, dating, marriage, divorce, pregnancy
- Fashion, lifestyle, health, fitness, diet content
- Gossip, rumors without official studio/network confirmation
- Social media drama, feuds between celebrities
- Tabloid-style speculation or clickbait
- Content primarily about a celebrity's appearance, outfit, or personal events

## CATEGORIES:
- casting_news: Actor/director/writer attached to project
- production_update: Filming starts/wraps, production news
- release_announcement: Premiere dates, trailer drops, streaming dates
- box_office: Weekend numbers, financial performance
- awards_coverage: Nominations, wins, festival selections
- studio_business: Acquisitions, deals, partnerships, greenlights
- industry_news: General entertainment industry news
- review: Film/TV criticism and reviews
- interview: Professional interviews about craft/projects (NOT personal life)
- behind_the_scenes: Making-of, technical details
- other_relevant: Entertainment news that doesn't fit above but is professional

## OUTPUT FORMAT:
Return ONLY valid JSON matching this exact schema:
{
  "relevant": boolean,
  "relevance_score": 0-100,
  "primary_category": "category_name",
  "secondary_categories": ["cat1", "cat2"],
  "professional_focus_score": 0-100,
  "gossip_probability": 0.00-1.00,
  "lifestyle_probability": 0.00-1.00,
  "controversy_probability": 0.00-1.00,
  "rumour_probability": 0.00-1.00,
  "clickbait_probability": 0.00-1.00,
  "article_quality_score": 0-100,
  "verification_level": "studio_confirmed|multiple_sources|single_source|rumour|unverified",
  "entities": {
    "movies": [{"title": "...", "year": 2024}],
    "series": [{"title": "...", "year": 2024}],
    "people": [{"name": "...", "role": "actor|director|writer|producer|executive"}],
    "studios": ["Studio Name"],
    "franchises": ["Franchise Name"],
    "streamers": ["Netflix", "etc"],
    "awards": ["Oscar", "etc"]
  },
  "main_event": "One sentence describing the main news event",
  "why_it_matters": "One sentence on editorial significance",
  "recommended_action": "approve|review|reject",
  "rejection_reason": "Only if recommended_action is reject"
}`;

/**
 * Call Gemini for classification
 */
async function callGeminiClassifier(prompt) {
    const key = getGeminiKey();
    if (!key) return null;

    const model = process.env.NEWS_CLASSIFICATION_MODEL_GEMINI || GEMINI_MODEL;
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${key}`;

    const usesThinking = /2\.5|latest/i.test(model);

    const body = {
        contents: [
            { role: 'user', parts: [{ text: CLASSIFICATION_SYSTEM_PROMPT }] },
            { role: 'model', parts: [{ text: 'I understand. I will classify news articles and return structured JSON following the exact schema.' }] },
            { role: 'user', parts: [{ text: prompt }] },
        ],
        generationConfig: {
            temperature: 0.1, // Low temperature for consistent classification
            maxOutputTokens: 1500,
            responseMimeType: 'application/json',
            ...(usesThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.warn(`[news-classifier] Gemini ${res.status}: ${errText.slice(0, 200)}`);
            return null;
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
        return text || null;
    } catch (err) {
        console.warn('[news-classifier] Gemini call failed:', err.message);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Call Mistral for classification (fallback)
 */
async function callMistralClassifier(prompt) {
    const key = getMistralKey();
    if (!key) return null;

    const model = process.env.NEWS_CLASSIFICATION_MODEL_MISTRAL || MISTRAL_MODEL;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const res = await fetch(MISTRAL_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: CLASSIFICATION_SYSTEM_PROMPT },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.1,
                max_tokens: 1500,
                response_format: { type: 'json_object' },
            }),
            signal: controller.signal,
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.warn(`[news-classifier] Mistral ${res.status}: ${errText.slice(0, 200)}`);
            return null;
        }

        const data = await res.json();
        return data?.choices?.[0]?.message?.content || null;
    } catch (err) {
        console.warn('[news-classifier] Mistral call failed:', err.message);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Safe JSON parsing with fallback extraction
 */
function safeParseJson(text) {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try { return JSON.parse(match[0]); } catch { return null; }
    }
}

/**
 * Validate classification result has required fields
 */
function validateClassification(result) {
    if (!result || typeof result !== 'object') return null;

    // Required fields
    const required = ['relevant', 'relevance_score', 'recommended_action'];
    for (const field of required) {
        if (result[field] === undefined) {
            console.warn(`[news-classifier] Missing required field: ${field}`);
            return null;
        }
    }

    // Normalize scores to valid ranges
    result.relevance_score = Math.max(0, Math.min(100, result.relevance_score || 0));
    result.professional_focus_score = Math.max(0, Math.min(100, result.professional_focus_score || 50));
    result.article_quality_score = Math.max(0, Math.min(100, result.article_quality_score || 50));

    // Normalize probabilities
    const probFields = ['gossip_probability', 'lifestyle_probability', 'controversy_probability', 'rumour_probability', 'clickbait_probability'];
    for (const field of probFields) {
        if (result[field] !== undefined) {
            result[field] = Math.max(0, Math.min(1, parseFloat(result[field]) || 0));
        }
    }

    // Ensure entities object exists
    if (!result.entities) {
        result.entities = {};
    }

    return result;
}

/**
 * Classify an article using AI
 * 
 * @param {object} article - Article to classify
 * @param {string} article.title - Article title
 * @param {string} article.summary - Article summary/excerpt
 * @param {string} article.body - Full article body (optional)
 * @param {string} article.source_name - Source publication name
 * @returns {Promise<object|null>} Classification result or null on failure
 */
export async function classifyArticle(article) {
    if (!isClassifierEnabled()) {
        console.warn('[news-classifier] No LLM API keys configured');
        return null;
    }

    const { title, summary, body, source_name } = article;

    // Build the classification prompt
    const contentText = body && body.length > 200 
        ? body.slice(0, 3000) 
        : (summary || '').slice(0, 1500);

    const prompt = `Classify this entertainment news article:

SOURCE: ${source_name || 'Unknown'}

TITLE: ${title || 'Untitled'}

CONTENT:
${contentText || 'No content available'}

Analyze and return the JSON classification.`;

    // Try Mistral first (primary), then Gemini fallback
    let text = await callMistralClassifier(prompt);
    let provider = 'mistral';

    if (!text && getGeminiKey()) {
        console.warn('[news-classifier] Mistral unavailable, trying Gemini');
        text = await callGeminiClassifier(prompt);
        provider = 'gemini';
    }

    if (!text) {
        console.error('[news-classifier] All providers failed');
        return null;
    }

    const parsed = safeParseJson(text);
    const validated = validateClassification(parsed);

    if (!validated) {
        console.error('[news-classifier] Invalid classification result');
        return null;
    }

    // Add metadata
    validated.model_version = provider === 'mistral' 
        ? (process.env.NEWS_CLASSIFICATION_MODEL_MISTRAL || MISTRAL_MODEL)
        : (process.env.NEWS_CLASSIFICATION_MODEL_GEMINI || GEMINI_MODEL);
    validated.classified_at = new Date().toISOString();

    return validated;
}

/**
 * Classify an article and update its database record
 */
export async function classifyAndUpdateArticle(articleId) {
    const startTime = Date.now();
    const supabase = getSupabaseAdmin();

    // Fetch the article
    const { data: article, error: fetchErr } = await supabase
        .from('feed_articles')
        .select('id, title, summary, body_html, source_name')
        .eq('id', articleId)
        .single();

    if (fetchErr || !article) {
        console.error('[news-classifier] Article not found:', articleId);
        return { success: false, error: 'Article not found' };
    }

    // Run classification
    const classification = await classifyArticle({
        title: article.title,
        summary: article.summary,
        body: article.body_html,
        source_name: article.source_name,
    });

    if (!classification) {
        // Log failure
        await supabase.from('news_processing_logs').insert({
            article_id: articleId,
            step: 'classification',
            status: 'failed',
            message: 'AI classification returned null',
            duration_ms: Date.now() - startTime,
        });
        return { success: false, error: 'Classification failed' };
    }

    // Normalize entities (enrich with TMDB IDs, canonical names)
    let normalizedEntities = classification.entities || {};
    try {
        normalizedEntities = await normalizeEntities(classification.entities || {});
    } catch (entErr) {
        console.warn('[news-classifier] Entity normalization failed (non-fatal):', entErr.message);
    }

    // Build update object
    const updates = {
        classification_status: 'completed',
        classified_at: classification.classified_at,
        model_version: classification.model_version,
        relevant: classification.relevant,
        relevance_score: classification.relevance_score,
        primary_category: classification.primary_category,
        secondary_categories: classification.secondary_categories || [],
        professional_focus_score: classification.professional_focus_score,
        gossip_probability: classification.gossip_probability,
        lifestyle_probability: classification.lifestyle_probability,
        controversy_probability: classification.controversy_probability,
        rumour_probability: classification.rumour_probability,
        clickbait_probability: classification.clickbait_probability,
        article_quality_score: classification.article_quality_score,
        verification_level: classification.verification_level,
        entities_json: normalizedEntities,
        ai_main_event: classification.main_event,
        ai_why_it_matters: classification.why_it_matters,
        updated_at: new Date().toISOString(),
    };

    // Update the article
    const { error: updateErr } = await supabase
        .from('feed_articles')
        .update(updates)
        .eq('id', articleId);

    if (updateErr) {
        console.error('[news-classifier] Update failed:', updateErr.message);
        return { success: false, error: updateErr.message };
    }

    // Log success
    await supabase.from('news_processing_logs').insert({
        article_id: articleId,
        step: 'classification',
        status: 'success',
        message: `${classification.recommended_action}: ${classification.main_event || 'No event summary'}`,
        metadata_json: {
            relevant: classification.relevant,
            relevance_score: classification.relevance_score,
            category: classification.primary_category,
            recommended_action: classification.recommended_action,
            gossip_probability: classification.gossip_probability,
            model: classification.model_version,
        },
        duration_ms: Date.now() - startTime,
    });

    return {
        success: true,
        classification,
        articleId,
    };
}

/**
 * Batch classify multiple articles
 */
export async function batchClassifyArticles(articleIds, options = {}) {
    const { concurrency = 3 } = options;
    const results = [];

    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < articleIds.length; i += concurrency) {
        const batch = articleIds.slice(i, i + concurrency);
        const batchResults = await Promise.all(
            batch.map(id => classifyAndUpdateArticle(id).catch(err => ({
                success: false,
                articleId: id,
                error: err.message,
            })))
        );
        results.push(...batchResults);

        // Small delay between batches
        if (i + concurrency < articleIds.length) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    return {
        total: articleIds.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
    };
}

/**
 * Get articles pending classification
 */
export async function getArticlesPendingClassification(limit = 50) {
    const supabase = getSupabaseAdmin();
    
    const { data, error } = await supabase
        .from('feed_articles')
        .select('id, title, summary, source_name, published_at, positive_keyword_score, negative_keyword_score')
        .eq('classification_status', 'pending')
        .eq('status', 'pending')
        .is('rejection_reason', null)
        .order('published_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[news-classifier] Failed to fetch pending articles:', error.message);
        return [];
    }

    return data || [];
}

/**
 * Check if classifier is available and return status
 */
export function getClassifierStatus() {
    return {
        enabled: isClassifierEnabled(),
        gemini: !!getGeminiKey(),
        mistral: !!getMistralKey(),
        defaultModel: process.env.NEWS_CLASSIFICATION_MODEL_MISTRAL || MISTRAL_MODEL,
        primaryProvider: 'mistral',
    };
}
