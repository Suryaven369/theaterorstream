import { supabase } from './supabase';

async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
}

function resolveApiBase() {
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (configured) return configured.replace(/\/$/, '');
    return '';
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
        ottMode: options.ottMode === false ? 'false' : undefined,
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
        };
    } catch (error) {
        if (import.meta.env.DEV) {
            console.warn('[recommendationApi]', path, error.message);
        }
        return { data: [], meta: {}, error: error.message };
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

async function sendJson(path, method, body) {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: 'not_signed_in' };

    try {
        const response = await fetch(`${resolveApiBase()}${path}`, {
            method,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: body != null ? JSON.stringify(body) : undefined,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `Request failed (${response.status})`);
        }
        return { ok: true, ...payload };
    } catch (error) {
        if (import.meta.env.DEV) console.warn('[recommendationApi]', path, error.message);
        return { ok: false, error: error.message };
    }
}

/** Mood-based discovery row (mind_bending, dark_thriller, feel_good, …). */
export function getMoodRecommendations(moodId, options = {}) {
    return fetchRecommendations(`/api/recommendations/mood/${encodeURIComponent(moodId)}`, options);
}

/** A discovery feed section: because-you-loved | hidden-gems | underrated | outside-comfort-zone. */
export function getDiscoverySection(section, options = {}) {
    return fetchRecommendations(`/api/recommendations/discovery/${section}`, options);
}

/** One Perfect Movie Tonight — single daily pick. Returns { movie, message, day }. */
export async function getOnePerfectMovie() {
    const res = await sendJson('/api/recommendations/perfect-tonight', 'GET');
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
