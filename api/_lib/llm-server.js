/**
 * LLM layer — optional polish on top of the rule + vector engine.
 *
 * Providers: Google Gemini (preferred) with Mistral as an automatic fallback.
 * If Gemini is missing / rate-limited / errors, the call retries on Mistral;
 * if both fail (or neither key is set), every function degrades gracefully
 * (returns null / the original order) so the deterministic engine keeps serving.
 * The LLM only ever *re-orders a shortlist* and *writes prose* — it never invents
 * titles or drops candidates the engine already vetted.
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// gemini-2.0-flash: fast, cheap, no "thinking" tokens (so short token budgets
// aren't swallowed by reasoning). Override via GEMINI_MODEL if you want 2.5.
const DEFAULT_MODEL = 'gemini-2.0-flash';
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_DEFAULT_MODEL = 'mistral-small-latest';
const REQUEST_TIMEOUT_MS = 9000;

function getMistralKey() {
    return process.env.MIST_API_KEY || process.env.MISTRAL_API_KEY;
}

export function isLlmEnabled() {
    return !!(process.env.GEMINI_API_KEY || getMistralKey());
}

function getModel() {
    return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/**
 * Low-level Gemini call. Returns the model's text output, or null on any failure.
 * @param {string} prompt
 * @param {{ json?: boolean, temperature?: number, maxOutputTokens?: number }} [opts]
 */
async function callGemini(prompt, opts = {}) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;

    const { json = false, temperature = 0.4, maxOutputTokens = 1024 } = opts;
    const model = getModel();
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${key}`;

    // 2.5 / *-latest models default to "thinking" mode, which consumes the output
    // budget before any answer is produced. Disable it for these short tasks.
    const usesThinking = /2\.5|latest/i.test(model);

    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature,
            maxOutputTokens,
            ...(json ? { responseMimeType: 'application/json' } : {}),
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
            console.warn(`[llm] Gemini ${res.status}: ${errText.slice(0, 160)}`);
            return null;
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
        return text || null;
    } catch (err) {
        console.warn('[llm] Gemini call failed:', err.message);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Low-level Mistral call (OpenAI-style chat). Returns text output or null.
 * Used as the fallback when Gemini is unavailable or quota-limited.
 */
async function callMistral(prompt, opts = {}) {
    const key = getMistralKey();
    if (!key) return null;

    const { json = false, temperature = 0.4, maxOutputTokens = 1024 } = opts;
    const model = process.env.MISTRAL_MODEL || MISTRAL_DEFAULT_MODEL;

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
                messages: [{ role: 'user', content: prompt }],
                temperature,
                max_tokens: maxOutputTokens,
                ...(json ? { response_format: { type: 'json_object' } } : {}),
            }),
            signal: controller.signal,
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.warn(`[llm] Mistral ${res.status}: ${errText.slice(0, 160)}`);
            return null;
        }

        const data = await res.json();
        return data?.choices?.[0]?.message?.content || null;
    } catch (err) {
        console.warn('[llm] Mistral call failed:', err.message);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Provider-agnostic call: Mistral first (primary), Gemini as automatic fallback.
 * Returns the first non-null text output, or null if all providers fail.
 */
async function callLlm(prompt, opts = {}) {
    if (getMistralKey()) {
        const out = await callMistral(prompt, opts);
        if (out) return out;
        if (process.env.GEMINI_API_KEY) console.warn('[llm] Mistral unavailable, falling back to Gemini');
    }
    if (process.env.GEMINI_API_KEY) {
        return callGemini(prompt, opts);
    }
    return null;
}

function safeParseJson(text) {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        // Tolerate models that wrap JSON in prose / code fences.
        const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (!match) return null;
        try { return JSON.parse(match[0]); } catch { return null; }
    }
}

/**
 * Generic JSON generation: prompt -> parsed JSON object/array, or null.
 * Uses the Gemini→Mistral fallback chain. The prompt must ask for JSON.
 */
export async function generateJson(prompt, opts = {}) {
    if (!isLlmEnabled()) return null;
    const text = await callLlm(prompt, { json: true, temperature: 0.2, maxOutputTokens: 600, ...opts });
    return safeParseJson(text);
}

/**
 * Re-rank a shortlist of candidates against a taste profile.
 *
 * @param {{ tasteSummary?: string, topGenres?: string[],
 *           candidates: Array<{ id: string, title: string, year: string|number,
 *             genres: string[], score: number, mood_tags?: string[] }> }} input
 * @returns {Promise<{ order: string[], reasons: Record<string,string> } | null>}
 *   `order` is a re-ordered list of the SAME candidate ids; null = keep engine order.
 */
export async function rerankRecommendations(input) {
    if (!isLlmEnabled()) return null;
    const { tasteSummary, topGenres = [], candidates = [] } = input;
    if (candidates.length < 3) return null; // not worth a call

    const compact = candidates.slice(0, 25).map((c, i) => ({
        i,
        id: String(c.id),
        title: c.title,
        year: c.year || '',
        genres: (c.genres || []).slice(0, 3),
        engineScore: Math.round((c.score || 0) * 100),
    }));

    const prompt = [
        'You are a film recommendation re-ranker. A retrieval engine already selected',
        'these candidates for one user; your job is only to RE-ORDER them best-first for',
        'this specific person and give a short reason for each. Never add or remove titles.',
        '',
        `User taste summary: ${tasteSummary || 'unknown'}`,
        topGenres.length ? `Favourite genres: ${topGenres.join(', ')}` : '',
        '',
        `Candidates (JSON): ${JSON.stringify(compact)}`,
        '',
        'Return ONLY JSON of this exact shape:',
        '{"order":["<id>","<id>",...],"reasons":{"<id>":"<max 12 word reason>"}}',
        'Include every candidate id exactly once in "order".',
    ].filter(Boolean).join('\n');

    // temperature 0 = deterministic ordering, so the feed doesn't reshuffle.
    const text = await callLlm(prompt, { json: true, temperature: 0, maxOutputTokens: 1200 });
    const parsed = safeParseJson(text);
    if (!parsed || !Array.isArray(parsed.order)) return null;

    // Validate: order must be a permutation of the candidate ids we sent.
    const sentIds = new Set(compact.map((c) => c.id));
    const order = parsed.order.map(String).filter((id) => sentIds.has(id));
    if (order.length < Math.min(3, compact.length)) return null;

    return { order, reasons: parsed.reasons && typeof parsed.reasons === 'object' ? parsed.reasons : {} };
}

/**
 * Generate a one-paragraph natural-language taste summary.
 * @param {{ genres?: string[], moods?: string[], decades?: (string|number)[],
 *           lovedTitles?: string[] }} input
 * @returns {Promise<string|null>}
 */
export async function summarizeTaste(input) {
    if (!isLlmEnabled()) return null;
    const { genres = [], moods = [], decades = [], lovedTitles = [] } = input;
    if (!genres.length && !lovedTitles.length) return null;

    const prompt = [
        'Write a single vivid sentence (max 28 words) describing this movie lover\'s taste,',
        'in second person ("You gravitate toward..."). No preamble, no quotes, just the sentence.',
        '',
        genres.length ? `Top genres: ${genres.join(', ')}` : '',
        moods.length ? `Moods: ${moods.join(', ')}` : '',
        decades.length ? `Eras: ${decades.map((d) => `${d}s`).join(', ')}` : '',
        lovedTitles.length ? `Loved films: ${lovedTitles.slice(0, 6).join(', ')}` : '',
    ].filter(Boolean).join('\n');

    const text = await callLlm(prompt, { temperature: 0.7, maxOutputTokens: 200 });
    if (!text) return null;
    return text.trim().replace(/^["']|["']$/g, '').slice(0, 240);
}

/**
 * A warm, personalised one-liner introducing the user's recommendations.
 * @param {{ name?: string, tasteSummary?: string, topGenres?: string[],
 *           sampleTitles?: string[] }} input
 * @returns {Promise<string|null>}
 */
export async function generateRecoMessage(input) {
    if (!isLlmEnabled()) return null;
    const { name, tasteSummary, topGenres = [], sampleTitles = [] } = input;
    if (!tasteSummary && !topGenres.length && !sampleTitles.length) return null;

    const who = name ? name.split(' ')[0] : null;
    const prompt = [
        'Write ONE warm, friendly sentence (max 26 words) introducing tonight\'s movie',
        'recommendations to this person. Second person, specific to their taste, no quotes,',
        'no "Dear". You may open with their first name if given. Output only the sentence.',
        '',
        who ? `Name: ${who}` : '',
        tasteSummary ? `Their taste: ${tasteSummary}` : '',
        topGenres.length ? `Top genres: ${topGenres.join(', ')}` : '',
        sampleTitles.length ? `A few of tonight's picks: ${sampleTitles.slice(0, 3).join(', ')}` : '',
    ].filter(Boolean).join('\n');

    const text = await callLlm(prompt, { temperature: 0.75, maxOutputTokens: 120 });
    if (!text) return null;
    return text.trim().replace(/^["']|["']$/g, '').slice(0, 200);
}
