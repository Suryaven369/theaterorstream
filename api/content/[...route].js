import {
    fetchTrendingContent,
    fetchExploreContent,
    fetchHomepageSections,
    fetchTVSections,
    fetchUpcoming,
    searchContent,
    jsonResponse,
    errorResponse,
} from '../_lib/content-server.js';

export const config = {
    runtime: 'edge',
};

function getRouteSegments(request) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('content');
    return idx >= 0 ? parts.slice(idx + 1) : [];
}

export default async function handler(request) {
    if (request.method !== 'GET') {
        return errorResponse('Method not allowed', 405);
    }

    const route = getRouteSegments(request);
    const segment = route[0];

    try {
        const url = new URL(request.url);

        if (segment === 'trending') {
            const mediaType = url.searchParams.get('mediaType');
            const limit = parseInt(url.searchParams.get('limit') || '24', 10);
            const data = await fetchTrendingContent(mediaType || null, limit);
            return jsonResponse(
                { data, total: data.length },
                'public, s-maxage=120, stale-while-revalidate=300',
            );
        }

        if (segment === 'explore') {
            const result = await fetchExploreContent({
                mediaType: url.searchParams.get('mediaType') || 'movie',
                category: url.searchParams.get('category') || 'popular',
                genreId: url.searchParams.get('genreId') ? Number(url.searchParams.get('genreId')) : null,
                limit: parseInt(url.searchParams.get('limit') || '24', 10),
                offset: parseInt(url.searchParams.get('offset') || '0', 10),
            });
            return jsonResponse(result, 'public, s-maxage=120, stale-while-revalidate=300');
        }

        if (segment === 'homepage') {
            const activeOnly = url.searchParams.get('activeOnly') !== 'false';
            const sections = await fetchHomepageSections(activeOnly);
            return jsonResponse(
                { data: sections },
                'public, s-maxage=300, stale-while-revalidate=600',
            );
        }

        if (segment === 'tv-sections') {
            const activeOnly = url.searchParams.get('activeOnly') !== 'false';
            const sections = await fetchTVSections(activeOnly);
            return jsonResponse(
                { data: sections },
                'public, s-maxage=300, stale-while-revalidate=600',
            );
        }

        if (segment === 'search') {
            const query = url.searchParams.get('q') || url.searchParams.get('query') || '';
            const result = await searchContent(query, {
                mediaType: url.searchParams.get('mediaType') || null,
                limit: parseInt(url.searchParams.get('limit') || '20', 10),
                offset: parseInt(url.searchParams.get('offset') || '0', 10),
            });
            return jsonResponse(result, 'public, s-maxage=120, stale-while-revalidate=300');
        }

        if (segment === 'upcoming') {
            const result = await fetchUpcoming({
                yearFrom: url.searchParams.get('yearFrom') ? parseInt(url.searchParams.get('yearFrom'), 10) : null,
                yearTo: url.searchParams.get('yearTo') ? parseInt(url.searchParams.get('yearTo'), 10) : null,
                minReleaseDate: url.searchParams.get('minReleaseDate') || null,
                mediaType: url.searchParams.get('mediaType') || null,
                limit: parseInt(url.searchParams.get('limit') || '24', 10),
                offset: parseInt(url.searchParams.get('offset') || '0', 10),
                fetchAll: url.searchParams.get('fetchAll') === 'true',
            });
            return jsonResponse(result, 'public, s-maxage=600, stale-while-revalidate=1200');
        }

        return errorResponse('Unknown content route', 404);
    } catch (error) {
        console.error('content edge error:', segment, error);
        return errorResponse(error.message || 'Content request failed');
    }
}
