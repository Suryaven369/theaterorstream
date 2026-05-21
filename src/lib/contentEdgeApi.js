/**
 * Edge-cached content API client.
 * Uses Vercel Edge routes in production; falls back to direct Supabase on local Vite dev.
 */

const API_BASE = '/api/content';

async function fetchFromEdge(path, fallbackFn) {
    try {
        const response = await fetch(path, {
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Edge API ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.warn(`[contentEdgeApi] ${path} unavailable, using DB fallback`, error.message);
        return fallbackFn();
    }
}

export async function getHomepageSectionsFromEdge(activeOnly = true) {
    const payload = await fetchFromEdge(
        `${API_BASE}/homepage?activeOnly=${activeOnly}`,
        async () => {
            const { getHomepageSections } = await import('./supabase.js');
            const data = await getHomepageSections(activeOnly);
            return { data };
        }
    );

    return payload.data || [];
}

export async function getTVSectionsFromEdge(activeOnly = true) {
    const payload = await fetchFromEdge(
        `${API_BASE}/tv-sections?activeOnly=${activeOnly}`,
        async () => {
            const { getTVSections } = await import('./supabase.js');
            const data = await getTVSections(activeOnly);
            return { data };
        }
    );

    return payload.data || [];
}

export async function getUpcomingFromEdge(options = {}) {
    const params = new URLSearchParams();

    if (options.yearFrom != null) params.set('yearFrom', String(options.yearFrom));
    if (options.yearTo != null) params.set('yearTo', String(options.yearTo));
    if (options.minReleaseDate) params.set('minReleaseDate', options.minReleaseDate);
    if (options.mediaType) params.set('mediaType', options.mediaType);
    if (options.limit != null) params.set('limit', String(options.limit));
    if (options.offset != null) params.set('offset', String(options.offset));
    if (options.fetchAll) params.set('fetchAll', 'true');

    const query = params.toString();
    const path = query ? `${API_BASE}/upcoming?${query}` : `${API_BASE}/upcoming`;

    return fetchFromEdge(path, async () => {
        const { getUpcomingFromDb } = await import('./contentApi.js');
        return getUpcomingFromDb(options);
    });
}

export async function searchContentFromEdge(query, options = {}) {
    const params = new URLSearchParams();
    params.set('q', query);
    if (options.mediaType) params.set('mediaType', options.mediaType);
    if (options.limit != null) params.set('limit', String(options.limit));
    if (options.offset != null) params.set('offset', String(options.offset));

    return fetchFromEdge(
        `${API_BASE}/search?${params.toString()}`,
        async () => {
            const { searchContentFromDb } = await import('./contentApi.js');
            return searchContentFromDb(query, options);
        }
    );
}

export async function getMovieDetailFromEdge(tmdbId) {
    return fetchFromEdge(
        `${API_BASE}/movie/${encodeURIComponent(tmdbId)}`,
        async () => {
            const { getAdvancedMovieFromLibrary } = await import('./supabase.js');
            return getAdvancedMovieFromLibrary(tmdbId);
        }
    );
}

export async function getExploreContentFromEdge(options = {}) {
    const params = new URLSearchParams();
    if (options.mediaType) params.set('mediaType', options.mediaType);
    if (options.category) params.set('category', options.category);
    if (options.genreId != null) params.set('genreId', String(options.genreId));
    if (options.limit != null) params.set('limit', String(options.limit));
    if (options.offset != null) params.set('offset', String(options.offset));

    return fetchFromEdge(
        `${API_BASE}/explore?${params.toString()}`,
        async () => {
            const { getExploreContent } = await import('./contentApi.js');
            return getExploreContent(options);
        },
    );
}

export async function getTrendingContentFromEdge(mediaType = null, limit = 24) {
    const params = new URLSearchParams();
    if (mediaType) params.set('mediaType', mediaType);
    if (limit != null) params.set('limit', String(limit));

    const payload = await fetchFromEdge(
        `${API_BASE}/trending?${params.toString()}`,
        async () => {
            const { getTrendingContent } = await import('./contentApi.js');
            const data = await getTrendingContent(mediaType, limit);
            return { data, total: data.length };
        },
    );

    return payload.data || [];
}
