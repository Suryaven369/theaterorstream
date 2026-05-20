import { searchContent, jsonResponse, errorResponse } from '../_lib/content-server.js';

export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    if (request.method !== 'GET') {
        return errorResponse('Method not allowed', 405);
    }

    try {
        const url = new URL(request.url);
        const query = url.searchParams.get('q') || url.searchParams.get('query') || '';
        const mediaType = url.searchParams.get('mediaType');
        const limit = parseInt(url.searchParams.get('limit') || '20', 10);
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);

        const result = await searchContent(query, {
            mediaType: mediaType || null,
            limit,
            offset,
        });

        return jsonResponse(
            result,
            'public, s-maxage=120, stale-while-revalidate=300'
        );
    } catch (error) {
        console.error('search edge error:', error);
        return errorResponse(error.message || 'Failed to search content');
    }
}
