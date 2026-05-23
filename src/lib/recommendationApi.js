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

export async function getSimilarRecommendations(tmdbId, options = {}) {
    const token = await getAccessToken();
    if (!token) {
        return { data: [], meta: {}, error: 'not_signed_in' };
    }

    const query = buildQuery({
        limit: options.limit,
        mediaType: options.mediaType,
        refresh: options.refresh ? 'true' : undefined,
        ottMode: options.ottMode ? 'true' : undefined,
    });

    const url = `${resolveApiBase()}/api/recommendations/similar/${encodeURIComponent(tmdbId)}${query}`;

    try {
        const response = await fetch(url, {
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
            },
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `Similar recommendations failed (${response.status})`);
        }

        return {
            data: payload.data || [],
            meta: payload.meta || {},
            generatedAt: payload.generatedAt,
            fromCache: payload.fromCache,
        };
    } catch (error) {
        return { data: [], meta: {}, error: error.message };
    }
}
