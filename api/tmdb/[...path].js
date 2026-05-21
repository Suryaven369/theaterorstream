import { requireAdmin } from '../_lib/admin-auth.js';
import { fetchTmdbApi, jsonResponse, errorResponse } from '../_lib/tmdb-server.js';

export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    if (request.method !== 'GET') {
        return errorResponse('Method not allowed', 405);
    }

    const auth = await requireAdmin(request);
    if (!auth.ok) {
        return errorResponse(auth.message, auth.status);
    }

    try {
        const url = new URL(request.url);
        const prefix = '/api/tmdb';
        const pathname = url.pathname;

        if (!pathname.startsWith(prefix)) {
            return errorResponse('Invalid TMDB proxy path', 400);
        }

        const tmdbPath = pathname.slice(prefix.length) || '/';
        const params = Object.fromEntries(url.searchParams.entries());

        const data = await fetchTmdbApi(tmdbPath, params);
        return jsonResponse(data);
    } catch (error) {
        console.error('tmdb proxy error:', error);
        return errorResponse(error.message || 'TMDB proxy failed', error.status || 502);
    }
}
