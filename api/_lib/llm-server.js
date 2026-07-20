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

/**
 * Classify a free-text watch question into a stable intent id.
 * @param {string} question
 * @returns {Promise<string|null>}
 */
export async function classifyChatIntent(question) {
    if (!isLlmEnabled()) return null;
    const q = String(question || '').trim().slice(0, 400);
    if (!q) return null;

    const prompt = [
        'Classify this movie/TV watch question into ONE intent id.',
        'Allowed ids only: tonight | feel_good | comedy | binge_series | action | dark_thriller | horror | romance | mind_bending | for_you',
        '',
        'tonight = what to watch tonight / this evening',
        'feel_good = sad, need comfort / uplift / feel-good',
        'comedy = bored, want funny / comedy',
        'binge_series = limited series / bingeable show / finish in one go',
        'action = action / adrenaline / fight',
        'dark_thriller = dark / thriller / suspense',
        'horror = scary / horror / spooky',
        'romance = romance / date night / love story',
        'mind_bending = mind-bending / twisty / complex',
        'for_you = general personalized pick',
        '',
        `Question: ${q}`,
        '',
        'Return ONLY JSON: {"intent":"<id>"}',
    ].join('\n');

    const text = await callLlm(prompt, { json: true, temperature: 0, maxOutputTokens: 60 });
    const parsed = safeParseJson(text);
    const intent = parsed?.intent ? String(parsed.intent) : null;
    const allowed = new Set([
        'tonight', 'feel_good', 'comedy', 'binge_series',
        'action', 'dark_thriller', 'horror', 'romance', 'mind_bending', 'for_you',
    ]);
    return intent && allowed.has(intent) ? intent : null;
}

/**
 * Friend-style multi-turn watch chat.
 * Decides whether to ask another question or recommend titles.
 *
 * @param {{ history: Array<{ role: string, text: string }>, tasteSummary?: string,
 *           topGenres?: string[], userMessage: string }} input
 * @returns {Promise<{ mode: 'ask'|'suggest', reply: string, intent: string, moodSummary: string|null, provider: string } | null>}
 */
export async function runFriendChatTurn(input) {
    if (!isLlmEnabled()) return null;

    const {
        history = [],
        tasteSummary,
        tasteProfileText,
        topGenres = [],
        topMoods = [],
        userMessage,
        userTurns = 1,
    } = input;

    const recent = history
        .slice(-10)
        .map((m) => `${m.role === 'user' ? 'User' : 'You'}: ${String(m.text || '').slice(0, 280)}`)
        .join('\n');

    const prompt = [
        'You are a warm, chatty movie buddy on TheaterOrStream — talk like a real friend texting.',
        'You already know this user\'s taste profile. Use it. Do not ignore it.',
        'React to what they said. Be curious. Keep it conversational.',
        '',
        'FLOW:',
        '- Prefer mode=ask for the first 2 user turns unless they clearly want picks NOW or name an actor/director.',
        '- On ask: 1–2 short sentences (max 45 words). Acknowledge their mood, optionally nod to their taste, then ask ONE follow-up.',
        '- On suggest: only when you know their mood/ask well enough OR they say "just pick / surprise me" OR they name an actor/director.',
        '- On suggest: short bridge only (max 28 words). NEVER invent movie/TV titles — cards are attached separately.',
        '- Set moodSummary to a clear note of what they want (e.g. "tired, want light comedy under 2 hours").',
        '- Set intent to match THEIR mood/request (feel_good, comedy, steamy, dark_thriller, etc.) — not random for_you if mood is clear.',
        '- steamy = lusty / soft-porn / erotic / sensual / spicy sexy — NEVER horror or thriller for this.',
        '- If they ask for steamy/lusty/soft-porn content → intent=steamy, mode=suggest.',
        '- If they name a person, set personQuery to the corrected name (e.g. "Adam Sandler").',
        '- If they are just chatting (hi, how are you), stay in ask mode and steer gently toward what to watch.',
        '',
        `User messages so far this chat: ${userTurns}`,
        '',
        'USER TASTE PROFILE (use this):',
        tasteProfileText || tasteSummary || 'No profile yet — lean on what they say in chat.',
        topGenres.length ? `Top genres: ${topGenres.join(', ')}` : '',
        topMoods.length ? `Top moods: ${topMoods.join(', ')}` : '',
        '',
        'Return ONLY JSON:',
        '{"mode":"ask"|"suggest","reply":"<chat text>","intent":"<id>","moodSummary":"<short note or null>","personQuery":"<name or null>"}',
        '',
        'intent must be one of: tonight | feel_good | comedy | binge_series | action | dark_thriller | horror | romance | steamy | mind_bending | for_you',
        '',
        recent ? `Conversation so far:\n${recent}` : 'Conversation just started.',
        `Latest user message: ${String(userMessage || '').slice(0, 400)}`,
    ].filter(Boolean).join('\n');

    const text = await callLlm(prompt, { json: true, temperature: 0.55, maxOutputTokens: 340 });
    const parsed = safeParseJson(text);
    if (!parsed || !parsed.reply) return null;

    const allowedIntents = new Set([
        'tonight', 'feel_good', 'comedy', 'binge_series',
        'action', 'dark_thriller', 'horror', 'romance', 'steamy', 'mind_bending', 'for_you',
    ]);
    let mode = parsed.mode === 'suggest' ? 'suggest' : 'ask';
    // Keep early turns chatty unless they force picks / name a person.
    if (
        userTurns < 3
        && mode === 'suggest'
        && !parsed.personQuery
        && !/\b(just (pick|suggest|recommend)|surprise me|recommend something|pick for me)\b/i.test(userMessage || '')
        && !/\b(soft\s*porn|porn|lusty|steamy|erotic|sensual|sexy)\b/i.test(userMessage || '')
    ) {
        mode = 'ask';
    }
    let intent = allowedIntents.has(String(parsed.intent)) ? String(parsed.intent) : 'for_you';
    // Never map lusty asks to horror/thriller.
    if (/\b(soft\s*porn|porn|lusty|steamy|erotic|sensual|sexy|nsfw|racy)\b/i.test(userMessage || '')) {
        intent = 'steamy';
        mode = 'suggest';
    }
    const reply = String(parsed.reply).trim().replace(/^["']|["']$/g, '').slice(0, 420);
    const moodSummary = parsed.moodSummary
        ? String(parsed.moodSummary).trim().slice(0, 160)
        : null;
    const personQuery = parsed.personQuery
        ? String(parsed.personQuery).trim().replace(/^["']|["']$/g, '').slice(0, 80)
        : null;

    if (!reply) return null;

    return {
        mode,
        reply,
        intent,
        moodSummary,
        personQuery: personQuery && personQuery.toLowerCase() !== 'null' ? personQuery : null,
        provider: getMistralKey() ? 'mistral' : 'gemini',
    };
}

/**
 * Chat answer: Mistral (primary) picks the best catalog titles for THIS question
 * and writes a short reply. Never invents ids — only chooses from candidates.
 *
 * @param {{ question: string, intent?: string, tasteSummary?: string,
 *           topGenres?: string[], limit?: number,
 *           candidates: Array<{ id: string, title: string, year?: string|number,
 *             genres?: string[], mediaType?: string, score?: number, reason?: string }> }} input
 * @returns {Promise<{ reply: string, order: string[], reasons: Record<string,string>, provider: string } | null>}
 */
export async function answerRecoChat(input) {
    if (!isLlmEnabled()) return null;
    const {
        question,
        intent,
        tasteSummary,
        tasteProfileText,
        topGenres = [],
        topMoods = [],
        moodSummary = null,
        candidates = [],
        limit = 3,
    } = input;
    if (!candidates.length) return null;

    const take = Math.min(Math.max(1, limit), 5);
    const compact = candidates.slice(0, 24).map((c) => ({
        id: String(c.id),
        title: c.title,
        year: c.year || '',
        type: c.mediaType === 'tv' ? 'tv' : 'movie',
        seasons: c.seasons || undefined,
        episodes: c.episodes || undefined,
        genres: (c.genres || []).slice(0, 3),
        moods: (c.moods || []).slice(0, 3),
        engineScore: Math.round((Number(c.score) || 0) * 100),
        hint: c.reason ? String(c.reason).slice(0, 60) : undefined,
    }));

    const prompt = [
        'You are TheaterOrStream\'s personal movie & TV chat assistant.',
        'A retrieval engine shortlisted catalog titles. Your job: pick ONLY titles that fit THIS user\'s mood + ask + taste profile.',
        'Do NOT pick random popular titles. Fit matters more than engineScore.',
        'STRICT RULES:',
        '- Only use candidate ids from the list. Never invent titles or ids.',
        `- Return exactly ${take} picks (or fewer only if the list is shorter).`,
        '- Rank best-first for: (1) stated mood/request, (2) taste profile, (3) quality.',
        '- Drop candidates that clash with the mood (e.g. no grim horror if they want feel-good or steamy).',
        '- If intent is steamy or the ask is lusty/erotic/soft-porn: ONLY romance/sensual titles. NEVER horror, supernatural, or thrillers.',
        '- Reasons max 12 words; tie each pick to their mood or taste. Use only candidate JSON fields.',
        '- Reply: 2 short chatty sentences (max 55 words). Mention the top pick by name.',
        '- ONLY mention titles in your picks list.',
        intent === 'steamy' || intent === 'romance'
            ? '- This ask is sensual/romantic. Prefer romance. Ban horror.'
            : '',
        intent === 'binge_series'
            ? '- LIMITED SERIES / short TV only. Prefer type "tv".'
            : '',
        '',
        'USER TASTE PROFILE:',
        tasteProfileText || tasteSummary || 'Unknown — rely on the chat request.',
        topGenres.length ? `Favourite genres: ${topGenres.join(', ')}` : '',
        topMoods.length ? `Preferred moods: ${topMoods.join(', ')}` : '',
        moodSummary ? `Tonight's mood from chat: ${moodSummary}` : '',
        '',
        `User request / chat: ${question || 'Suggest something for me'}`,
        intent ? `Intent: ${intent}` : '',
        '',
        `Candidates (JSON): ${JSON.stringify(compact)}`,
        '',
        'Return ONLY JSON:',
        `{"reply":"<chat text>","picks":[{"id":"<id>","reason":"<why this fits their mood/taste>"}]}`,
        `Include exactly ${take} picks when possible. Every pick.id must be from candidates.`,
        'The reply field is required.',
    ].filter(Boolean).join('\n');

    const text = await callLlm(prompt, { json: true, temperature: 0.2, maxOutputTokens: 700 });
    const parsed = safeParseJson(text);
    if (!parsed || !Array.isArray(parsed.picks) || !parsed.picks.length) return null;

    const sentIds = new Set(compact.map((c) => c.id));
    const order = [];
    const reasons = {};
    for (const p of parsed.picks) {
        const id = String(p?.id || '');
        if (!id || !sentIds.has(id) || order.includes(id)) continue;
        order.push(id);
        if (p.reason) reasons[id] = String(p.reason).slice(0, 100);
        if (order.length >= take) break;
    }
    if (!order.length) return null;

    const reply = typeof parsed.reply === 'string'
        ? parsed.reply.trim().replace(/^["']|["']$/g, '').slice(0, 320)
        : '';

    return {
        reply: reply || null,
        order,
        reasons,
        provider: getMistralKey() ? 'mistral' : 'gemini',
    };
}

/**
 * Short chat reply introducing personalized picks (titles already chosen by the engine).
 * @deprecated Prefer answerRecoChat for question-aware picks + reply.
 */
export async function generateChatReply(input) {
    if (!isLlmEnabled()) return null;
    const { question, intent, tasteSummary, topGenres = [], picks = [] } = input;
    if (!picks.length) return null;

    const pickLine = picks
        .slice(0, 3)
        .map((p) => `${p.title}${p.year ? ` (${p.year})` : ''}${p.reason ? ` — ${p.reason}` : ''}`)
        .join('; ');

    const prompt = [
        'You are TheaterOrStream\'s movie buddy in a chat bubble.',
        'Write 2 short chatty sentences (max 55 words) answering their question.',
        'Second person, warm, specific. Do NOT invent titles — only talk about the picks given.',
        'Sound like a real chat reply, not a list intro. No markdown, no surrounding quotes.',
        '',
        question ? `User asked: ${question}` : '',
        intent ? `Intent: ${intent}` : '',
        tasteSummary ? `Their taste: ${tasteSummary}` : '',
        topGenres.length ? `Genres they like: ${topGenres.join(', ')}` : '',
        `Picks: ${pickLine}`,
    ].filter(Boolean).join('\n');

    const text = await callLlm(prompt, { temperature: 0.7, maxOutputTokens: 200 });
    if (!text) return null;
    return text.trim().replace(/^["']|["']$/g, '').slice(0, 400);
}
