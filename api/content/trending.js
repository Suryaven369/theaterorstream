import { fetchTrendingContent, jsonResponse, errorResponse } from '../_lib/content-server.js';

export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    if (request.method !== 'GET') {
        return errorResponse('Method not allowed', 405);
    }

    try {
        const url = new URL(request.url);
        const mediaType = url.searchParams.get('mediaType');
        const limit = parseInt(url.searchParams.get('limit') || '24', 10);

        const data = await fetchTrendingContent(mediaType || null, limit);

        return jsonResponse(
            { data, total: data.length },
            'public, s-maxage=120, stale-while-revalidate=300',
        );
    } catch (error) {
        console.error('trending edge error:', error);
        return errorResponse(error.message || 'Failed to fetch trending content');
    }
}
