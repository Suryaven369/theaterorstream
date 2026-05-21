import { fetchExploreContent, jsonResponse, errorResponse } from '../_lib/content-server.js';

export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    if (request.method !== 'GET') {
        return errorResponse('Method not allowed', 405);
    }

    try {
        const url = new URL(request.url);
        const mediaType = url.searchParams.get('mediaType') || 'movie';
        const category = url.searchParams.get('category') || 'popular';
        const genreId = url.searchParams.get('genreId');
        const limit = parseInt(url.searchParams.get('limit') || '24', 10);
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);

        const result = await fetchExploreContent({
            mediaType,
            category,
            genreId: genreId ? Number(genreId) : null,
            limit,
            offset,
        });

        return jsonResponse(
            result,
            'public, s-maxage=120, stale-while-revalidate=300',
        );
    } catch (error) {
        console.error('explore edge error:', error);
        return errorResponse(error.message || 'Failed to fetch explore content');
    }
}
