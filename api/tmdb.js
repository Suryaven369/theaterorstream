import { requireAdmin } from './_lib/admin-auth.js';
import { fetchTmdbApi, jsonResponse, errorResponse } from './_lib/tmdb-server.js';

export const config = {
    runtime: 'edge',
};

function getTmdbPath(url) {
    const prefix = '/api/tmdb';
    const { pathname } = url;

    if (pathname.startsWith(prefix) && pathname.length > prefix.length) {
        return pathname.slice(prefix.length) || '/';
    }

    const pathParam = url.searchParams.get('path');
    if (pathParam) {
        return pathParam.startsWith('/') ? pathParam : `/${pathParam}`;
    }

    return '/';
}

function getTmdbParams(url) {
    const params = Object.fromEntries(url.searchParams.entries());
    delete params.path;
    return params;
}

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
        const tmdbPath = getTmdbPath(url);
        const params = getTmdbParams(url);

        if (tmdbPath === '/') {
            return errorResponse('Missing TMDB path', 400);
        }

        const data = await fetchTmdbApi(tmdbPath, params);
        return jsonResponse(data);
    } catch (error) {
        console.error('tmdb proxy error:', error);
        return errorResponse(error.message || 'TMDB proxy failed', error.status || 502);
    }
}
