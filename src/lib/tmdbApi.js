/**
 * Admin-only TMDB client.
 * Routes requests through /api/tmdb/* so the API key stays server-side.
 */

import { supabase } from './supabase';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
}

async function devDirectTmdbFetch(path, params = {}) {
    const apiKey = import.meta.env.VITE_MOVIE_API_KEY;
    if (!apiKey) {
        throw new Error('TMDB proxy unavailable. Use `vercel dev` or set VITE_MOVIE_API_KEY for local admin testing.');
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${TMDB_BASE_URL}${normalizedPath.replace(/^\//, '')}`);

    Object.entries(params).forEach(([key, value]) => {
        if (value != null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`TMDB request failed (${response.status})`);
    }

    return response.json();
}

export async function tmdbFetch(path, params = {}) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value != null && value !== '') {
            query.set(key, String(value));
        }
    });

    const queryString = query.toString();
    const url = `/api/tmdb${normalizedPath}${queryString ? `?${queryString}` : ''}`;
    const token = await getAccessToken();

    const response = await fetch(url, {
        headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    if (!response.ok) {
        if (import.meta.env.DEV) {
            console.warn('[tmdbApi] Proxy unavailable, using local dev fallback');
            return devDirectTmdbFetch(normalizedPath, params);
        }

        let message = `TMDB proxy failed (${response.status})`;
        try {
            const payload = await response.json();
            if (payload?.error) message = payload.error;
        } catch {
            // ignore parse errors
        }
        throw new Error(message);
    }

    return response.json();
}

export const tmdbApi = {
    async get(path, config = {}) {
        const data = await tmdbFetch(path, config.params || {});
        return { data };
    },
};

export default tmdbApi;
