import { fetchMovieDetail, jsonResponse, errorResponse } from '../../_lib/content-server.js';

export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    if (request.method !== 'GET') {
        return errorResponse('Method not allowed', 405);
    }

    try {
        const url = new URL(request.url);
        const parts = url.pathname.split('/').filter(Boolean);
        const tmdbId = parts[parts.length - 1];

        if (!tmdbId) {
            return errorResponse('Missing movie id', 400);
        }

        const data = await fetchMovieDetail(tmdbId);

        if (!data) {
            return errorResponse('Movie not found', 404);
        }

        return jsonResponse(
            { success: true, data },
            'public, s-maxage=3600, stale-while-revalidate=7200'
        );
    } catch (error) {
        console.error('movie detail edge error:', error);
        return errorResponse(error.message || 'Failed to load movie details');
    }
}
