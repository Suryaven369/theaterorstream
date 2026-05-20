import { fetchTVSections, jsonResponse, errorResponse } from '../_lib/content-server.js';

export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    if (request.method !== 'GET') {
        return errorResponse('Method not allowed', 405);
    }

    try {
        const url = new URL(request.url);
        const activeOnly = url.searchParams.get('activeOnly') !== 'false';
        const sections = await fetchTVSections(activeOnly);

        return jsonResponse(
            { data: sections },
            'public, s-maxage=300, stale-while-revalidate=600'
        );
    } catch (error) {
        console.error('tv-sections edge error:', error);
        return errorResponse(error.message || 'Failed to load TV sections');
    }
}
