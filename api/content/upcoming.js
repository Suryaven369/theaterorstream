import { fetchUpcoming, jsonResponse, errorResponse } from '../_lib/content-server.js';

export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    if (request.method !== 'GET') {
        return errorResponse('Method not allowed', 405);
    }

    try {
        const url = new URL(request.url);
        const yearFrom = url.searchParams.get('yearFrom');
        const yearTo = url.searchParams.get('yearTo');
        const minReleaseDate = url.searchParams.get('minReleaseDate');
        const mediaType = url.searchParams.get('mediaType');
        const limit = parseInt(url.searchParams.get('limit') || '24', 10);
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        const fetchAll = url.searchParams.get('fetchAll') === 'true';

        const result = await fetchUpcoming({
            yearFrom: yearFrom ? parseInt(yearFrom, 10) : null,
            yearTo: yearTo ? parseInt(yearTo, 10) : null,
            minReleaseDate: minReleaseDate || null,
            mediaType: mediaType || null,
            limit,
            offset,
            fetchAll,
        });

        return jsonResponse(
            result,
            'public, s-maxage=600, stale-while-revalidate=1200'
        );
    } catch (error) {
        console.error('upcoming edge error:', error);
        return errorResponse(error.message || 'Failed to load upcoming content');
    }
}
