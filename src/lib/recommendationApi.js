import { supabase } from './supabase';
import { resolveApiBase } from './apiBase';
import { getUserRegionCode } from './userRegion';

async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;

    // Session can lag AuthContext briefly after refresh / tab focus.
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed?.session?.access_token || null;
}

function buildQuery(params) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value != null && value !== '') search.set(key, String(value));
    });
    const qs = search.toString();
    return qs ? `?${qs}` : '';
}

async function fetchRecommendations(path, options = {}) {
    const token = await getAccessToken();
    if (!token) {
        return { data: [], meta: {}, error: 'not_signed_in' };
    }

    const query = buildQuery({
        limit: options.limit,
        mediaType: options.mediaType,
        refresh: options.refresh ? 'true' : undefined,
        ottMode: options.ottMode === false ? 'false' : (options.ottMode === true ? 'true' : undefined),
        providerId: options.providerId || undefined,
        watchRegion: options.watchRegion || undefined,
        // Default country for users without saved streaming services.
        regionHint: getUserRegionCode(),
    });

    const url = `${resolveApiBase()}${path}${query}`;

    try {
        const response = await fetch(url, {
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
            },
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            if (response.status === 404 && import.meta.env.DEV) {
                throw new Error(
                    'Recommendations API unavailable in Vite-only mode. Use `npm run dev:api` or deploy to Vercel.',
                );
            }
            throw new Error(payload.error || `Recommendations failed (${response.status})`);
        }

        return {
            data: payload.data || [],
            meta: payload.meta || {},
            generatedAt: payload.generatedAt,
            fromCache: payload.fromCache,
            ok: true,
        };
    } catch (error) {
        if (import.meta.env.DEV) {
            console.warn('[recommendationApi]', path, error.message);
        }
        return { data: [], meta: {}, error: error.message, ok: false };
    }
}

export function getForYouRecommendations(options = {}) {
    return fetchRecommendations('/api/recommendations/for-you', options);
}

export function getTonightRecommendations(options = {}) {
    return fetchRecommendations('/api/recommendations/tonight', options);
}

export function getFamilyRecommendations(options = {}) {
    return fetchRecommendations('/api/recommendations/family', options);
}

export function getTrendingPersonalized(options = {}) {
    return fetchRecommendations('/api/recommendations/trending-personalized', options);
}

async function sendJson(path, method, body, options = {}) {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: 'not_signed_in' };

    const timeoutMs = options.timeoutMs ?? 55000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${resolveApiBase()}${path}`, {
            method,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: body != null ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const msg = payload.error || `Request failed (${response.status})`;
            if (response.status === 401) {
                return { ok: false, error: 'not_signed_in', detail: msg };
            }
            throw new Error(msg);
        }
        return { ok: true, ...payload };
    } catch (error) {
        if (error?.name === 'AbortError') {
            return { ok: false, error: 'That took too long — try again, or pick a shorter prompt.' };
        }
        if (import.meta.env.DEV) console.warn('[recommendationApi]', path, error.message);
        return { ok: false, error: error.message };
    } finally {
        clearTimeout(timer);
    }
}

/** Mood-based discovery row (mind_bending, dark_thriller, feel_good, …). */
export function getMoodRecommendations(moodId, options = {}) {
    return fetchRecommendations(`/api/recommendations/mood/${encodeURIComponent(moodId)}`, options);
}

export function getDiscoverySection(section, options = {}) {
    return fetchRecommendations(`/api/recommendations/discovery/${section}`, options);
}

/** Personalized similar titles (auth) — taste + TMDB neighbors. */
export async function getPersonalizedSimilar(tmdbId, options = {}) {
    if (!tmdbId) return { data: [], meta: {}, error: 'missing_id' };
    const res = await fetchRecommendations(
        `/api/recommendations/similar/${encodeURIComponent(String(tmdbId))}`,
        options,
    );
    return {
        ...res,
        // Route returns { data: items } via handler — also accept nested items.
        data: res.data?.length ? res.data : (res.items || []),
    };
}

/** One Perfect Movie Tonight — single daily pick. Returns { movie, message, day }. */
export async function getOnePerfectMovie() {
    const res = await sendJson(`/api/recommendations/perfect-tonight?regionHint=${getUserRegionCode()}`, 'GET');
    return res.ok ? res : null;
}

/** Read manual + learned taste preferences for the Settings editor. */
export async function getTastePreferences() {
    const res = await sendJson('/api/recommendations/taste-profile', 'GET');
    return res.ok ? res.data : null;
}

/** Persist manual taste preferences from the Settings editor. */
export async function updateTastePreferences(prefs) {
    return sendJson('/api/recommendations/taste-profile', 'PUT', prefs);
}

/** Skip the signup taste questionnaire without wiping prefs. */
export async function skipTasteQuestionnaire() {
    return sendJson('/api/recommendations/taste-profile', 'PUT', { questionnaireStatus: 'skipped' });
}

/** TOS verdict for a title (personal fit when signed in). Returns data or null. */
export async function getTosVerdict(tmdbId, mediaType = 'movie') {
    let token = null;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token || null;
    } catch { /* guest */ }
    try {
        const q = new URLSearchParams({ mediaType, regionHint: getUserRegionCode() });
        const res = await fetch(`${resolveApiBase()}/api/recommendations/tos-verdict/${encodeURIComponent(String(tmdbId))}?${q}`, {
            headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        const payload = await res.json().catch(() => ({}));
        return res.ok ? payload.data : null;
    } catch {
        return null;
    }
}

/** Your watchlist ordered by fit for tonight → { items, meta }. */
export async function getQueueByFit({ minutes = null } = {}) {
    const q = new URLSearchParams({ regionHint: getUserRegionCode() });
    if (minutes) q.set('minutes', String(minutes));
    return sendJson(`/api/recommendations/queue?${q.toString()}`, 'GET', null, { timeoutMs: 45000 });
}

/** Tonight: mood + minutes + company → { picks: [3], meta }. */
export async function getTonightPicks({ mood = 'any', minutes = null, company = 'solo' } = {}) {
    const q = new URLSearchParams({ mood, company, regionHint: getUserRegionCode() });
    if (minutes) q.set('minutes', String(minutes));
    return sendJson(`/api/recommendations/tonight-picks?${q.toString()}`, 'GET', null, { timeoutMs: 45000 });
}

/** Taste quiz: search TMDB movies (server-side). Returns [{ id, title, year, lang, poster }]. */
export async function searchQuizMovies(query, { signal } = {}) {
    const q = String(query || '').trim();
    if (q.length < 2) return [];
    try {
        const res = await fetch(`${resolveApiBase()}/api/recommendations/movie-search?q=${encodeURIComponent(q)}`, {
            headers: { Accept: 'application/json' },
            signal,
        });
        const payload = await res.json().catch(() => ({}));
        return res.ok ? (payload.data || []) : [];
    } catch {
        return [];
    }
}

/**
 * The user's streaming services + home region.
 * @returns {Promise<{ region: string, providerIds: number[], services: {id,name,logo}[], hasServices: boolean } | null>}
 */
export async function getStreamingServices() {
    const res = await sendJson('/api/recommendations/streaming-services', 'GET');
    return res.ok ? res.data : null;
}

/** Replace the user's streaming services. providers: [{ id, name, logo }] */
export async function saveStreamingServices({ region, providers }) {
    return sendJson('/api/recommendations/streaming-services', 'PUT', { region, providers });
}

/** Streaming services available in a region, most prominent first. Public. */
export async function getRegionProviders(region) {
    try {
        const response = await fetch(
            `${resolveApiBase()}/api/recommendations/providers?region=${encodeURIComponent(region || 'IN')}`,
            { headers: { Accept: 'application/json' } },
        );
        const payload = await response.json().catch(() => ({}));
        return response.ok ? (payload.data || []) : [];
    } catch {
        return [];
    }
}

/**
 * Feed tab: friends' films, popular new trailers, latest news.
 * Works signed out (community row instead of friends).
 */
export async function getHomeFeed() {
    let token = null;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token || null;
    } catch { /* guest */ }
    try {
        const response = await fetch(`${resolveApiBase()}/api/recommendations/home?regionHint=${getUserRegionCode()}`, {
            headers: {
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Feed failed (${response.status})`);
        return { ok: true, ...payload };
    } catch (error) {
        return { ok: false, error: error.message, friends: { mode: 'community', items: [] }, trailers: [], news: [] };
    }
}

/** Taste dashboard rollup (favorite genres/moods, evolving interests, accuracy). */
export async function getTasteDashboard() {
    const res = await sendJson('/api/recommendations/dashboard', 'GET');
    return res.ok ? res.data : null;
}

/** New & upcoming content from the directors/genres/franchises the user follows. */
export async function getFollowingFeed(limit = 30) {
    const res = await sendJson(`/api/recommendations/following?limit=${limit}`, 'GET');
    return res.ok ? res : { items: [], followCount: 0, boardUpdates: [] };
}

/** Fire-and-forget behavioural event(s). Never throws. */
export function sendEvents(events) {
    const list = Array.isArray(events) ? events : [events];
    return sendJson('/api/recommendations/events', 'POST', { events: list });
}

/**
 * Friend-style multi-turn watch chat.
 * Pass prior turns so the AI can ask about mood, then suggest titles.
 * @returns {Promise<{ ok: boolean, reply?: string, items?: array, mode?: string, error?: string }>}
 */
export async function askRecoChat({ message, history = [], limit = 3 } = {}) {
    return sendJson('/api/recommendations/chat', 'POST', {
        message: message || undefined,
        history: Array.isArray(history) ? history.slice(-12) : [],
        limit,
    }, { timeoutMs: 55000 });
}
