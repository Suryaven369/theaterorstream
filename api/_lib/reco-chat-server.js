/**
 * Reco chat — multi-turn friend chat about mood, then catalog picks (never invents titles).
 */

import {
    getTonightRecommendations,
    getForYouRecommendations,
    getMoodRecommendations,
    getRecommendations,
    RECO_MOVIE_SELECT,
} from './recommendation-server.js';
import { getSupabaseAdmin } from './supabase-admin.js';
import { getTastePreferences, TASTE_GENRES } from './taste-preferences-server.js';
import { isLlmEnabled, answerRecoChat, generateChatReply, runFriendChatTurn, generateJson } from './llm-server.js';
import { fetchTmdbApi } from './tmdb-server.js';

/** @deprecated Presets removed — conversational friend chat only. Kept for API compat. */
export const RECO_CHAT_PRESETS = [];

const INTENT_FALLBACK_MESSAGES = {
    tonight: "Here's a solid pick for tonight, tuned to what you've been into lately.",
    feel_good: 'When you need a lift, these feel-good titles fit your taste.',
    comedy: 'Something funny to shake off the boredom — picked for you.',
    binge_series: 'Limited series you can knock out in one sitting — TV only, matched to your taste.',
    action: 'Action picks matched to your taste.',
    dark_thriller: 'Dark, suspenseful picks for you.',
    horror: 'Scary picks tuned to what you like.',
    romance: 'Romantic picks for your mood.',
    steamy: 'Steamy, sensual picks matched to what you asked for.',
    mind_bending: 'Twisty, mind-bending picks for you.',
    for_you: 'Based on your taste, start with these.',
};

const INTENT_TO_MOOD = {
    feel_good: 'feel_good',
    comedy: 'comedy_night',
    action: 'action_packed',
    dark_thriller: 'dark_thriller',
    horror: 'horror_night',
    romance: 'date_night',
    steamy: 'date_night',
    mind_bending: 'mind_bending',
};

const GENRE_LABEL_BY_ID = Object.fromEntries(TASTE_GENRES.map((g) => [String(g.id), g.label]));

/**
 * Heuristic intent from free text (no LLM required).
 * @param {string} text
 * @returns {string}
 */
export function classifyIntentHeuristic(text) {
    const t = String(text || '').toLowerCase();
    if (!t.trim()) return 'for_you';

    // Steamy / sensual / lusty — must beat vague "bold/spicy → thriller" mistakes.
    if (/\b(soft\s*porn|porn|lusty|steamy|erotic|sensual|sexy|sexual|nsfw|racy|horny|seductive|intimate|adult\s*romance|bedroom|make\s*out|netflix\s*and\s*chill)\b/.test(t)
        || /\bspicy\b/.test(t) && /\b(movie|film|watch|mood|vibe|kind|type)\b/.test(t)) {
        return 'steamy';
    }

    // Limited series / miniseries / bingeable short shows — before generic moods.
    if (/\b(limited\s*series|mini[- ]?series|miniseries|anthology\s*series)\b/.test(t)) {
        return 'binge_series';
    }
    if (/\b(series|show|binge|one go|one sitting|weekend binge|finish in)\b/.test(t)
        && !/\b(movie|film)\b/.test(t)) {
        return 'binge_series';
    }

    if (/\b(sad|down|depress|heartbreak|cry|uplift|cheer|feel[- ]?good|comfort)\b/.test(t)) {
        return 'feel_good';
    }
    if (/\b(comed(y|ies)|funny|laugh|humor|humour|bored)\b/.test(t)) {
        return 'comedy';
    }
    if (/\b(horror|scary|spooky|terror|fright)\b/.test(t)) {
        return 'horror';
    }
    if (/\b(thriller|suspense|dark mystery|noir)\b/.test(t)
        && !/\b(romance|romantic|steamy|sexy|erotic)\b/.test(t)) {
        return 'dark_thriller';
    }
    if (/\b(action|adrenaline|fight|explosion)\b/.test(t)) {
        return 'action';
    }
    if (/\b(romance|romantic|date night|love story|passion(ate)?)\b/.test(t)) {
        return 'romance';
    }
    if (/\b(mind[- ]?bend|twist(y|ed)?|inception|complex plot)\b/.test(t)) {
        return 'mind_bending';
    }
    if (/\b(tonight|this evening|after work|watch tonight)\b/.test(t)) {
        return 'tonight';
    }
    return 'for_you';
}

/**
 * Short, finishable TV — limited series / mini-series / short season.
 * Not long-running shows (3+ seasons or 17+ episodes).
 */
function isBingeableLimitedSeries(m) {
    if ((m?.media_type || '') !== 'tv') return false;
    const seasons = Number(m.number_of_seasons);
    const eps = Number(m.number_of_episodes);

    if (Number.isFinite(seasons) && seasons >= 3) return false;
    if (Number.isFinite(eps) && eps > 16) return false;

    if (Number.isFinite(seasons) && seasons >= 1 && seasons <= 2) {
        return !Number.isFinite(eps) || eps <= 16;
    }
    if (Number.isFinite(eps) && eps >= 3 && eps <= 10) return true;
    return false;
}

async function fetchLimitedSeriesBackfill(limit = 40) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from('movies_library')
        .select(RECO_MOVIE_SELECT)
        .eq('is_active', true)
        .eq('media_type', 'tv')
        .lte('number_of_seasons', 2)
        .gte('vote_average', 6.8)
        .gte('vote_count', 30)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(Math.min(100, Math.max(limit * 2, 40)));

    if (error) {
        console.warn('[reco-chat] limited series backfill failed:', error.message);
        return [];
    }

    return (data || []).filter(isBingeableLimitedSeries).slice(0, limit);
}

function genreIdSet(m) {
    const ids = Array.isArray(m.genre_ids) ? m.genre_ids.map(Number) : [];
    if (ids.length) return new Set(ids);
    const genres = Array.isArray(m.genres) ? m.genres : [];
    const fromNames = genres
        .map((g) => {
            if (typeof g === 'number') return g;
            const name = String(typeof g === 'string' ? g : g?.name || '').toLowerCase();
            if (name.includes('romance')) return 10749;
            if (name.includes('horror')) return 27;
            if (name.includes('thriller')) return 53;
            if (name.includes('drama')) return 18;
            return null;
        })
        .filter(Boolean);
    return new Set(fromNames);
}

/** Romance / sensual titles — never horror. */
function isSteamyCandidate(m) {
    const genres = genreIdSet(m);
    if (genres.has(27)) return false; // horror
    if (genres.has(10749)) return true; // romance
    const blob = [
        m.title,
        m.name,
        m.overview,
        ...(Array.isArray(m.mood_tags) ? m.mood_tags : []),
        ...(Array.isArray(m.custom_vibes) ? Object.keys(m.custom_vibes || {}) : []),
    ].filter(Boolean).join(' ').toLowerCase();
    return /\b(erotic|sensual|steamy|seductive|passionate|romance|romantic|intimate)\b/.test(blob);
}

async function fetchSteamyTitles(limit = 30) {
    const supabase = getSupabaseAdmin();
    // Romance-heavy library rows; filter out horror after fetch.
    const { data, error } = await supabase
        .from('movies_library')
        .select(RECO_MOVIE_SELECT)
        .eq('is_active', true)
        .contains('genre_ids', [10749])
        .gte('vote_average', 5.8)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(80);

    if (error) {
        console.warn('[reco-chat] steamy pool failed:', error.message);
        // Fallback: text filter on a broader romance-ish pull
        const { data: loose } = await supabase
            .from('movies_library')
            .select(RECO_MOVIE_SELECT)
            .eq('is_active', true)
            .gte('vote_average', 6)
            .order('popularity', { ascending: false, nullsFirst: false })
            .limit(120);
        return (loose || []).filter(isSteamyCandidate).slice(0, limit);
    }

    return (data || []).filter(isSteamyCandidate).slice(0, limit);
}

async function resolveIntent({ message, hintIntent }) {
    if (hintIntent && INTENT_FALLBACK_MESSAGES[hintIntent]) return hintIntent;
    return classifyIntentHeuristic(String(message || '').trim());
}

function wantsImmediateSuggest(text) {
    const t = String(text || '').toLowerCase();
    return /\b(just (pick|suggest|recommend)|surprise me|suggest already|pick for me|recommend something|give me (a |some )?pick)\b/.test(t);
}

/** Pull an actor/director name from free text like "adam sandler movies". */
export function extractPersonQuery(text) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return null;

    const ADJECTIVES = new Set([
        'sad', 'funny', 'scary', 'action', 'comedy', 'horror', 'thriller', 'romance',
        'chill', 'bored', 'good', 'great', 'best', 'new', 'old', 'dark', 'light',
        'fun', 'cool', 'nice', 'awesome', 'random', 'another', 'some', 'any', 'more',
        'few', 'latest', 'classic', 'indian', 'korean', 'tamil', 'hindi', 'happy',
        'emotional', 'intense', 'quiet', 'loud', 'short', 'long', 'feel', 'feel-good',
        'mind', 'bending', 'something', 'anything', 'movie', 'film', 'show',
    ]);

    const patterns = [
        /\b(?:movies?|films?|shows?|series)\s+(?:by|with|starring|from)\s+([a-z][\w.'\-]+(?:\s+[a-z][\w.'\-]+){1,3})(?:[.!?,]|$)/i,
        /\b(?:by|with|starring)\s+([a-z][\w.'\-]+(?:\s+[a-z][\w.'\-]+){1,3})\b/i,
        /\b([a-z][\w.'\-]+(?:\s+[a-z][\w.'\-]+){1,2})\s+(?:movies?|films?|filmography)\b/i,
        /\bi\s+need\s+(?:an?\s+)?([a-z][\w.'\-]+(?:\s+[a-z][\w.'\-]+){1,2})\s+movies?\b/i,
        /\b(?:want|looking for|show me|give me)\s+(?:an?\s+|some\s+)?([a-z][\w.'\-]+(?:\s+[a-z][\w.'\-]+){1,2})\s+movies?\b/i,
    ];

    for (const re of patterns) {
        const m = raw.match(re);
        if (!m?.[1]) continue;
        let name = m[1]
            .trim()
            .replace(/^(an?\s+|some\s+|any\s+|more\s+)/i, '')
            .replace(/\s+(movies?|films?|shows?|series)$/i, '')
            .replace(/[^a-zA-Z0-9\s.'\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const words = name.split(/\s+/).filter(Boolean);
        // Require first + last name style — blocks "good movie", "dark movie"
        if (words.length < 2 || words.length > 4) continue;
        if (words.every((w) => ADJECTIVES.has(w.toLowerCase()))) continue;
        if (ADJECTIVES.has(words[0].toLowerCase())) continue;
        return name.slice(0, 60);
    }
    return null;
}

/**
 * Load catalog titles for a person (cast/crew) via TMDB → library rows.
 */
async function searchTmdbPerson(query) {
    const q = String(query || '').trim();
    if (q.length < 2) return null;
    try {
        const res = await fetchTmdbApi('/search/person', { query: q, include_adult: 'false' });
        return (res?.results || [])[0] || null;
    } catch (err) {
        console.warn('[reco-chat] person search failed:', err.message);
        return null;
    }
}

/** Resolve typos like "adam sandles" → Adam Sandler. */
async function resolveTmdbPerson(personQuery) {
    const query = String(personQuery || '').trim();
    if (query.length < 2) return null;

    let person = await searchTmdbPerson(query);
    if (person) return person;

    const parts = query.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        const last = parts[parts.length - 1];
        for (let drop = 1; drop <= 2 && last.length - drop >= 3; drop += 1) {
            const alt = [...parts.slice(0, -1), last.slice(0, -drop)].join(' ');
            person = await searchTmdbPerson(alt);
            if (person) return person;
        }
        if (last.length >= 5) {
            person = await searchTmdbPerson(last);
            if (person) return person;
        }
    }

    if (isLlmEnabled()) {
        try {
            const fixed = await generateJson([
                'Correct this actor/director name for a movie database search.',
                'Fix obvious typos. Return the best-known celebrity spelling.',
                'Return ONLY JSON: {"name":"<corrected full name>"}',
                `Input: ${query}`,
            ].join('\n'), { temperature: 0, maxOutputTokens: 40 });
            const name = fixed?.name ? String(fixed.name).trim() : '';
            if (name && name.toLowerCase() !== query.toLowerCase()) {
                person = await searchTmdbPerson(name);
                if (person) return person;
            }
        } catch {
            /* ignore */
        }
    }

    return null;
}

async function fetchPersonTitles(personQuery, limit = 24) {
    const query = String(personQuery || '').trim();
    if (query.length < 2) return { personName: null, items: [] };

    const person = await resolveTmdbPerson(query);
    if (!person?.id) return { personName: null, items: [] };

    let cast = [];
    try {
        const credits = await fetchTmdbApi(`/person/${person.id}/combined_credits`, {});
        cast = (credits?.cast || [])
            .filter((c) => c?.id && (c.media_type === 'movie' || c.media_type === 'tv' || !c.media_type))
            .map((c) => ({
                ...c,
                media_type: c.media_type === 'tv' ? 'tv' : 'movie',
            }))
            .sort((a, b) => (
                (Number(b.vote_count) || 0) - (Number(a.vote_count) || 0)
                || (Number(b.popularity) || 0) - (Number(a.popularity) || 0)
            ))
            .slice(0, 50);
    } catch (err) {
        console.warn('[reco-chat] person credits failed:', err.message);
        return { personName: person.name || query, items: [] };
    }

    if (!cast.length) return { personName: person.name || query, items: [] };

    const ids = cast.map((c) => String(c.id));
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from('movies_library')
        .select(RECO_MOVIE_SELECT)
        .in('tmdb_id', ids)
        .eq('is_active', true);

    if (error) {
        console.warn('[reco-chat] person library hydrate failed:', error.message);
    }

    const byId = new Map((data || []).map((m) => [String(m.tmdb_id), m]));
    const personName = person.name || query;
    const items = [];

    for (const c of cast) {
        const row = byId.get(String(c.id));
        if (row) {
            items.push({
                ...row,
                id: row.tmdb_id,
                reason: `With ${personName}`,
                score: Math.min(0.95, 0.55 + (Number(c.vote_average) || 0) / 40),
            });
        } else {
            items.push({
                tmdb_id: String(c.id),
                id: String(c.id),
                title: c.title || c.name || 'Untitled',
                media_type: c.media_type === 'tv' ? 'tv' : 'movie',
                poster_path: c.poster_path || null,
                backdrop_path: c.backdrop_path || null,
                release_date: c.release_date || null,
                first_air_date: c.first_air_date || null,
                vote_average: c.vote_average || 0,
                popularity: c.popularity || 0,
                reason: `With ${personName}`,
                score: Math.min(0.9, 0.5 + (Number(c.vote_average) || 0) / 40),
            });
        }
        if (items.length >= limit) break;
    }

    return { personName, items };
}

function normalizeHistory(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .slice(-12)
        .map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            text: String(m.text || m.reply || m.content || '').trim().slice(0, 400),
        }))
        .filter((m) => m.text);
}

async function pickTitlesForChat({
    userId,
    intent,
    question,
    tasteSummary,
    tasteProfileText,
    topGenres,
    topMoods = [],
    moodSummary = null,
    limit,
    introReply,
    poolOverride = null,
    personName = null,
}) {
    const pool = poolOverride?.length
        ? { items: poolOverride, meta: { personName, personSearch: true } }
        : await fetchCandidatePool(userId, intent);
    let items = pool.items || [];

    if (!items.length && !poolOverride?.length && intent !== 'for_you' && intent !== 'binge_series') {
        const fallback = await getForYouRecommendations(userId, {
            limit: 12,
            ottMode: false,
            refresh: false,
            useLlm: false,
        });
        items = fallback.items || [];
    }

    if (intent === 'binge_series' && !poolOverride?.length) {
        items = (items || []).filter((m) => (m.media_type || '') === 'tv');
    }

    if ((intent === 'steamy' || intent === 'romance') && !personName) {
        items = (items || []).filter(isSteamyCandidate);
        if (items.length < 3) {
            const steamy = await fetchSteamyTitles(24);
            items = mergeUnique([items, steamy], 24);
        }
        items = items.filter((m) => !genreIdSet(m).has(27));
    }

    // Prefer rewriting the chat line from real picks so we never advertise titles we don't show.
    let reply = personName
        ? `Here are some solid ${personName} picks for you.`
        : (introReply
            || INTENT_FALLBACK_MESSAGES[intent]
            || INTENT_FALLBACK_MESSAGES.for_you);
    let llmUsed = false;
    let llmProvider = null;

    const rankingQuestion = [
        question,
        moodSummary ? `Tonight's mood: ${moodSummary}` : '',
        personName ? `Focus on titles with ${personName}` : '',
    ].filter(Boolean).join('. ');

    if (isLlmEnabled() && items.length) {
        try {
            const answered = await answerRecoChat({
                question: rankingQuestion,
                intent: personName ? 'for_you' : intent,
                tasteSummary,
                tasteProfileText,
                topGenres,
                topMoods,
                moodSummary,
                limit,
                candidates: items.map(toCandidate),
            });

            if (answered?.order?.length) {
                llmUsed = true;
                llmProvider = answered.provider || 'mistral';
                const byId = new Map(items.map((m) => [String(m.tmdb_id ?? m.id), m]));
                const picked = [];
                for (const id of answered.order) {
                    const movie = byId.get(id);
                    if (!movie) continue;
                    if (intent === 'binge_series' && !personName && (movie.media_type || '') !== 'tv') continue;
                    const reason = answered.reasons?.[id] || movie.reason;
                    picked.push(reason ? { ...movie, reason, llmRanked: true } : { ...movie, llmRanked: true });
                    byId.delete(id);
                    if (picked.length >= limit) break;
                }
                if (picked.length < limit) {
                    for (const m of items) {
                        const id = String(m.tmdb_id ?? m.id);
                        if (!byId.has(id)) continue;
                        if (intent === 'binge_series' && !personName && (m.media_type || '') !== 'tv') continue;
                        picked.push(m);
                        byId.delete(id);
                        if (picked.length >= limit) break;
                    }
                }
                items = picked;
                if (answered.reply) reply = answered.reply;
            }
        } catch (err) {
            console.warn('[reco-chat] LLM answer failed:', err.message);
        }
    }

    if (isLlmEnabled() && items.length && (!llmUsed || !reply)) {
        try {
            const prose = await generateChatReply({
                question: rankingQuestion,
                intent,
                tasteSummary,
                topGenres,
                picks: items.slice(0, limit).map((m) => ({
                    title: m.title || m.name,
                    year: (m.release_date || m.first_air_date || '').slice(0, 4),
                    reason: m.reason,
                })),
            });
            if (prose) {
                reply = prose;
                llmUsed = true;
                llmProvider = llmProvider || 'mistral';
            }
        } catch (err) {
            console.warn('[reco-chat] LLM reply failed:', err.message);
        }
    }

    items = items.slice(0, limit);

    if (!items.length) {
        reply = personName
            ? `I couldn't find ${personName} titles in the catalog yet — try another name or a mood?`
            : intent === 'binge_series'
                ? "Hmm, I couldn't find a strong limited-series match yet — tell me a vibe and I'll dig again."
                : "I couldn't land a strong match yet — tell me a bit more about your mood?";
    }

    return {
        reply,
        items,
        meta: {
            ...(pool.meta || {}),
            intent,
            count: items.length,
            llmUsed,
            llmProvider,
            mode: 'suggest',
            personName: personName || null,
            moodSummary: moodSummary || null,
        },
    };
}

/**
 * Multi-turn friend chat → ask about mood, then suggest catalog titles.
 * @param {string} userId
 * @param {{ message?: string, history?: array, limit?: number }} input
 */
export async function handleRecoChat(userId, input = {}) {
    const limit = Math.min(6, Math.max(1, Number(input.limit) || 3));
    const message = String(input.message || '').trim().slice(0, 500);
    const history = normalizeHistory(input.history);

    if (!message) {
        const err = new Error('Send a message');
        err.statusCode = 400;
        throw err;
    }

    const taste = await loadTasteContext(userId);
    const {
        tasteSummary,
        tasteProfileText,
        topGenres,
        topMoods,
    } = taste;
    const userTurns = history.filter((m) => m.role === 'user').length + 1;
    // Only the latest message — scanning history re-triggers actor mode and kills chat.
    const earlyPersonQuery = extractPersonQuery(message);

    // Actor/director ask → pull filmography (still LLM-written reply about real titles).
    if (earlyPersonQuery) {
        const { personName, items: personItems } = await fetchPersonTitles(earlyPersonQuery, 24);
        if (personName && personItems.length) {
            const picked = await pickTitlesForChat({
                userId,
                intent: 'for_you',
                question: message,
                tasteSummary,
                tasteProfileText,
                topGenres,
                topMoods,
                limit,
                introReply: null,
                poolOverride: personItems,
                personName,
            });
            return {
                reply: picked.reply,
                intent: 'for_you',
                question: message,
                items: picked.items,
                mode: 'suggest',
                meta: picked.meta,
                generatedAt: new Date().toISOString(),
            };
        }
        // Don't dead-end — fall through to friend chat instead of a canned error.
    }

    // Friend turn: ask more OR suggest.
    let turn = null;
    if (isLlmEnabled()) {
        try {
            turn = await runFriendChatTurn({
                history: [...history, { role: 'user', text: message }],
                tasteSummary,
                tasteProfileText,
                topGenres,
                topMoods,
                userMessage: message,
                userTurns,
            });
        } catch (err) {
            console.warn('[reco-chat] friend turn failed:', err.message);
        }
    }

    // Heuristic fallback when LLM unavailable.
    if (!turn) {
        const forceSuggest = wantsImmediateSuggest(message) || userTurns >= 3;
        if (!forceSuggest) {
            const askReply = userTurns <= 1
                ? "Hey! What's your mood tonight — chill, pumped, emotional, or need a laugh?"
                : userTurns === 2
                    ? 'Got it. Movie or a short series — and how much time do you have?'
                    : 'Any vibe you want to lean into, or should I just pick for you?';
            return {
                reply: askReply,
                intent: classifyIntentHeuristic(message),
                question: message,
                items: [],
                mode: 'ask',
                meta: {
                    intent: classifyIntentHeuristic(message),
                    count: 0,
                    llmUsed: false,
                    mode: 'ask',
                },
                generatedAt: new Date().toISOString(),
            };
        }
        turn = {
            mode: 'suggest',
            reply: null,
            intent: classifyIntentHeuristic(
                [...history.map((h) => h.text), message].join(' '),
            ),
            moodSummary: null,
            personQuery: null,
            provider: null,
        };
    }

    const conversationBlob = [...history.map((h) => h.text), message, turn.moodSummary || '']
        .filter(Boolean)
        .join(' ');

    const personQuery = extractPersonQuery(message) || turn.personQuery || null;

    // LLM detected a person name on THIS turn only.
    if (personQuery && turn.mode === 'suggest') {
        const { personName, items: personItems } = await fetchPersonTitles(personQuery, 24);
        if (personName && personItems.length) {
            const picked = await pickTitlesForChat({
                userId,
                intent: 'for_you',
                question: message,
                tasteSummary,
                tasteProfileText,
                topGenres,
                topMoods,
                moodSummary: turn.moodSummary,
                limit,
                introReply: null,
                poolOverride: personItems,
                personName,
            });
            return {
                reply: picked.reply,
                intent: 'for_you',
                question: message,
                items: picked.items,
                mode: 'suggest',
                meta: picked.meta,
                generatedAt: new Date().toISOString(),
            };
        }
    }

    // Still gathering mood — chat only, no titles yet.
    if (turn.mode === 'ask' && !wantsImmediateSuggest(message)) {
        return {
            reply: turn.reply,
            intent: turn.intent || 'for_you',
            question: message,
            items: [],
            mode: 'ask',
            meta: {
                intent: turn.intent || 'for_you',
                count: 0,
                llmUsed: true,
                llmProvider: turn.provider,
                mode: 'ask',
                moodSummary: turn.moodSummary,
            },
            generatedAt: new Date().toISOString(),
        };
    }

    // Resolve intent from chat mood first — avoid dumping random For You titles.
    // Explicit lusty/steamy heuristics always win over a confused LLM intent.
    const moodFromChat = classifyIntentHeuristic(
        [turn.moodSummary, conversationBlob, message].filter(Boolean).join(' '),
    );
    let intent = await resolveIntent({
        message: conversationBlob,
        hintIntent: turn.intent,
    });
    if (moodFromChat === 'steamy' || moodFromChat === 'romance') {
        intent = moodFromChat;
    } else if (intent === 'for_you' && moodFromChat !== 'for_you') {
        intent = moodFromChat;
    }

    const question = [
        `User asked: ${message}`,
        turn.moodSummary ? `Stated mood/vibe: ${turn.moodSummary}` : '',
        `Full chat context: ${conversationBlob.slice(0, 320)}`,
    ].filter(Boolean).join('\n');

    const picked = await pickTitlesForChat({
        userId,
        intent,
        question,
        tasteSummary,
        tasteProfileText,
        topGenres,
        topMoods,
        moodSummary: turn.moodSummary || moodFromChat,
        limit,
        // Don't reuse friend-turn copy that may invent titles — rewrite from real picks.
        introReply: null,
    });

    return {
        reply: picked.reply,
        intent,
        question,
        items: picked.items,
        mode: 'suggest',
        meta: picked.meta,
        generatedAt: new Date().toISOString(),
    };
}

function genreLabelsFromMovie(m) {
    const ids = Array.isArray(m.genre_ids) ? m.genre_ids : [];
    const fromIds = ids.map((id) => GENRE_LABEL_BY_ID[String(id)]).filter(Boolean);
    if (fromIds.length) return fromIds;
    const genres = Array.isArray(m.genres) ? m.genres : [];
    return genres.map((g) => (typeof g === 'string' ? g : g?.name)).filter(Boolean).slice(0, 3);
}

function toCandidate(m) {
    const moods = Array.isArray(m.mood_tags)
        ? m.mood_tags.map((t) => (typeof t === 'string' ? t : t?.id || t?.label)).filter(Boolean).slice(0, 4)
        : [];
    return {
        id: String(m.tmdb_id ?? m.id),
        title: m.title || m.name || '',
        year: (m.release_date || m.first_air_date || '').slice(0, 4),
        genres: genreLabelsFromMovie(m),
        moods,
        mediaType: m.media_type === 'tv' ? 'tv' : 'movie',
        seasons: m.number_of_seasons != null ? Number(m.number_of_seasons) : undefined,
        episodes: m.number_of_episodes != null ? Number(m.number_of_episodes) : undefined,
        score: m.score,
        reason: m.reason || null,
    };
}

function mergeUnique(pools, limit = 24) {
    const seen = new Set();
    const out = [];
    for (const pool of pools) {
        for (const m of pool || []) {
            const id = String(m.tmdb_id ?? m.id);
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push(m);
            if (out.length >= limit) return out;
        }
    }
    return out;
}

/**
 * Build a rich shortlist for the intent, then let Mistral pick for the question.
 */
async function fetchCandidatePool(userId, intent) {
    const base = { limit: 12, refresh: false };

    if (intent === 'tonight') {
        const [tonight, forYou] = await Promise.all([
            getTonightRecommendations(userId, {
                ...base,
                ottMode: true,
                limit: 10,
                useLlm: false,
            }),
            getForYouRecommendations(userId, {
                ...base,
                ottMode: true,
                limit: 10,
                useLlm: false,
            }),
        ]);
        return {
            items: mergeUnique([tonight.items, forYou.items], 20),
            meta: tonight.meta || forYou.meta || {},
        };
    }

    const moodId = INTENT_TO_MOOD[intent];
    if (intent === 'steamy' || intent === 'romance') {
        const [mood, steamy] = await Promise.all([
            getMoodRecommendations(userId, 'date_night', {
                ...base,
                ottMode: false,
                refresh: false,
                limit: 16,
                useLlm: false,
            }),
            fetchSteamyTitles(28),
        ]);
        let items = mergeUnique([
            (mood.items || []).filter(isSteamyCandidate),
            steamy,
        ], 24);
        // Absolute block: no horror in lusty/romance asks.
        items = items.filter((m) => !genreIdSet(m).has(27));
        return {
            items,
            meta: { intent, steamy: intent === 'steamy', moodId: 'date_night' },
        };
    }

    if (moodId) {
        // Mood pool first — only a small For You blend so picks stay on-vibe.
        const [mood, forYou] = await Promise.all([
            getMoodRecommendations(userId, moodId, {
                ...base,
                ottMode: false,
                refresh: false,
                limit: 16,
                useLlm: false,
            }),
            getForYouRecommendations(userId, {
                ...base,
                ottMode: false,
                limit: 4,
                useLlm: false,
            }),
        ]);
        return {
            items: mergeUnique([mood.items, forYou.items], 20),
            meta: { ...(mood.meta || {}), moodId, intent },
        };
    }

    if (intent === 'binge_series') {
        // Personalized TV pool (refresh busts any old cache that mixed movies).
        const loose = await getRecommendations(userId, 'chat_limited_series_v3', {
            mediaType: 'tv',
            requireOtt: false,
            excludeRated: true,
            useLlm: false,
            limit: 24,
            refresh: true,
        });

        const tvOnly = (loose.items || []).filter((m) => (m.media_type || '') === 'tv');
        const limitedPreferred = tvOnly.filter(isBingeableLimitedSeries);
        let items = limitedPreferred.length >= 3
            ? limitedPreferred
            : mergeUnique([limitedPreferred, tvOnly], 18);

        if (items.filter(isBingeableLimitedSeries).length < 4) {
            const backfill = await fetchLimitedSeriesBackfill(40);
            items = mergeUnique([
                items.filter(isBingeableLimitedSeries),
                backfill,
                items,
            ], 22);
        }

        // Never return movies for a limited-series ask.
        items = items.filter((m) => (m.media_type || '') === 'tv');
        const strictlyLimited = items.filter(isBingeableLimitedSeries);
        if (strictlyLimited.length >= 3) items = strictlyLimited;

        return {
            items,
            meta: { ...(loose.meta || {}), limitedSeries: true, mediaType: 'tv' },
        };
    }

    // for_you / default — personalized pool; answerRecoChat matches free-text to titles
    const forYou = await getForYouRecommendations(userId, {
        ...base,
        ottMode: false,
        limit: 16,
        useLlm: false,
        refresh: false,
    });
    return { items: forYou.items || [], meta: forYou.meta || {} };
}

async function loadTasteContext(userId) {
    const empty = {
        tasteSummary: null,
        tasteProfileText: '',
        topGenres: [],
        topMoods: [],
        actors: [],
        directors: [],
        languages: [],
        decades: [],
    };

    try {
        const prefs = await getTastePreferences(userId);
        const supabase = getSupabaseAdmin();
        const { data: row } = await supabase
            .from('user_taste_profiles')
            .select('taste_summary')
            .eq('user_id', userId)
            .maybeSingle();

        const genreOpts = prefs?.options?.genres || TASTE_GENRES;
        const moodOpts = prefs?.options?.moods || [];
        const labelByGenre = Object.fromEntries(genreOpts.map((g) => [String(g.id), g.label]));
        const labelByMood = Object.fromEntries(moodOpts.map((m) => [String(m.id), m.label]));

        const learnedGenres = prefs?.learned?.genres || {};
        const manualGenres = (prefs?.manual?.genres || []).map(String);
        const genreScores = { ...Object.fromEntries(manualGenres.map((id) => [id, 0.5])) };
        Object.entries(learnedGenres).forEach(([id, w]) => {
            genreScores[id] = Math.max(Number(genreScores[id]) || 0, Number(w) || 0);
        });
        const topGenres = Object.entries(genreScores)
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .slice(0, 6)
            .map(([id]) => labelByGenre[String(id)] || id)
            .filter(Boolean);

        const learnedMoods = prefs?.learned?.moods || {};
        const manualMoods = prefs?.manual?.moods || [];
        const moodScores = { ...Object.fromEntries(manualMoods.map((id) => [id, 0.5])) };
        Object.entries(learnedMoods).forEach(([id, w]) => {
            moodScores[id] = Math.max(Number(moodScores[id]) || 0, Number(w) || 0);
        });
        const topMoods = Object.entries(moodScores)
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .slice(0, 5)
            .map(([id]) => labelByMood[String(id)] || id)
            .filter(Boolean);

        const actors = (prefs?.manual?.actors || [])
            .map((a) => (typeof a === 'string' ? a : a?.name))
            .filter(Boolean)
            .slice(0, 5);
        const directors = (prefs?.manual?.directors || [])
            .map((a) => (typeof a === 'string' ? a : a?.name))
            .filter(Boolean)
            .slice(0, 5);

        const languages = [
            ...(prefs?.manual?.languages || []),
            ...(prefs?.learned?.languages || []),
        ].filter(Boolean).slice(0, 5);

        const decades = [
            ...(prefs?.manual?.eras || []),
            ...(prefs?.learned?.decades || []),
        ].filter(Boolean).slice(0, 5);

        const tasteSummary = row?.taste_summary
            || [
                topGenres.length ? `Genres: ${topGenres.join(', ')}` : '',
                topMoods.length ? `Moods: ${topMoods.join(', ')}` : '',
                actors.length ? `Actors: ${actors.join(', ')}` : '',
            ].filter(Boolean).join('. ')
            || null;

        const tasteProfileText = [
            tasteSummary ? `Summary: ${tasteSummary}` : '',
            topGenres.length ? `Favourite genres: ${topGenres.join(', ')}` : '',
            topMoods.length ? `Preferred moods: ${topMoods.join(', ')}` : '',
            actors.length ? `Favourite actors: ${actors.join(', ')}` : '',
            directors.length ? `Favourite directors: ${directors.join(', ')}` : '',
            languages.length ? `Languages: ${languages.join(', ')}` : '',
            decades.length ? `Eras/decades: ${decades.join(', ')}` : '',
        ].filter(Boolean).join('\n');

        return {
            tasteSummary,
            tasteProfileText,
            topGenres,
            topMoods,
            actors,
            directors,
            languages,
            decades,
        };
    } catch {
        return empty;
    }
}
