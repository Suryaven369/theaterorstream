/**
 * Edge-cached content API client.
 * Uses Vercel Edge routes in production; falls back to direct Supabase on local Vite dev.
 */

const API_BASE = '/api/content';

async function fetchFromEdge(path, fallbackFn, { fresh = false } = {}) {
    try {
        const response = await fetch(path, {
            headers: { Accept: 'application/json' },
            cache: fresh ? 'no-store' : 'default',
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

export async function getHomepageSectionsFromEdge(activeOnly = true, { fresh = false } = {}) {
    const bust = fresh ? `&_=${Date.now()}` : '';
    const payload = await fetchFromEdge(
        `${API_BASE}/homepage?activeOnly=${activeOnly}${bust}`,
        async () => {
            const { getHomepageSections } = await import('./supabase.js');
            const data = await getHomepageSections(activeOnly);
            return { data };
        },
        { fresh },
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

export async function searchPeopleFromEdge(query, limit = 20) {
    const params = new URLSearchParams();
    params.set('q', query);
    params.set('limit', String(limit));

    const payload = await fetchFromEdge(
        `${API_BASE}/people?${params.toString()}`,
        async () => {
            const { searchCastCrewFromDb } = await import('./contentApi.js');
            const data = await searchCastCrewFromDb(query);
            return { data };
        }
    );
    return payload.data || [];
}

export async function getMovieDetailFromEdge(tmdbId, mediaType = null) {
    // tmdb_id alone isn't unique — movie IDs and TV IDs are separate numbering
    // spaces, so the same id can match a movie AND a show. mediaType disambiguates.
    const query = mediaType ? `?mediaType=${encodeURIComponent(mediaType)}` : '';
    return fetchFromEdge(
        `${API_BASE}/movie/${encodeURIComponent(tmdbId)}${query}`,
        async () => {
            const { getContentByTmdbId } = await import('./contentApi.js');
            const data = await getContentByTmdbId(tmdbId, mediaType);
            return data ? { success: true, data } : { success: false, error: 'Not found' };
        }
    );
}

export async function getExploreContentFromEdge(options = {}) {
    const params = new URLSearchParams();
    if (options.mediaType) params.set('mediaType', options.mediaType);
    if (options.category) params.set('category', options.category);
    if (options.genreId != null) params.set('genreId', String(options.genreId));
    if (options.theme) params.set('theme', String(options.theme));
    if (options.sort) params.set('sort', String(options.sort));
    if (options.providerId) params.set('providerId', String(options.providerId));
    if (options.region) params.set('region', String(options.region));
    if (options.familyFriendly) params.set('familyFriendly', '1');
    if (options.browse) params.set('browse', '1');
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

// =============================================
// NEW CONTENT ENDPOINTS
// =============================================

/**
 * Get movies with trailers
 */
/**
 * Verified RSS trailers (YouTube channels matched to TMDB) for the Home feed.
 */
export async function getRssTrailersFromEdge(options = {}) {
    const params = new URLSearchParams();
    if (options.limit != null) params.set('limit', String(options.limit));
    if (options.daysBack != null) params.set('daysBack', String(options.daysBack));
    if (options.fresh) params.set('_', String(Date.now()));
    return fetchFromEdge(
        `${API_BASE}/rss-trailers?${params.toString()}`,
        async () => ({ data: [], total: 0 }),
        { fresh: !!options.fresh },
    );
}

export async function getTrailersFromEdge(options = {}) {
    const params = new URLSearchParams();
    if (options.mediaType) params.set('mediaType', options.mediaType);
    if (options.limit != null) params.set('limit', String(options.limit));
    if (options.offset != null) params.set('offset', String(options.offset));
    if (options.daysBack != null) params.set('daysBack', String(options.daysBack));
    if (options.type) params.set('type', options.type);
    if (options.sortBy) params.set('sortBy', options.sortBy);

    return fetchFromEdge(
        `${API_BASE}/trailers?${params.toString()}`,
        async () => ({ data: [], total: 0 }),
    );
}

/**
 * Get admin-curated news articles (DB-backed, sourced from RSS feeds) for the
 * public Home feed.
 */
export async function getArticlesFromEdge(options = {}) {
    const params = new URLSearchParams();
    if (options.limit != null) params.set('limit', String(options.limit));
    if (options.offset != null) params.set('offset', String(options.offset));
    if (options.fresh) params.set('_', String(Date.now()));

    const payload = await fetchFromEdge(
        `${API_BASE}/articles?${params.toString()}`,
        async () => ({ data: [], total: 0 }),
        { fresh: !!options.fresh },
    );

    return payload.data || [];
}

/**
 * Accurate Parent Guide + Movie Vibes (TMDB certification + LLM analysis).
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 */
export async function getTitleAnalysisFromEdge(tmdbId, mediaType = 'movie', region = 'IN') {
    const params = new URLSearchParams({ region });
    return fetchFromEdge(
        `${API_BASE}/analysis/${mediaType}/${tmdbId}?${params.toString()}`,
        async () => ({ data: { certification: null, parentGuide: null, vibes: null } }),
    );
}

/**
 * "More like this" — content-based similar titles (NOT personalised to the user).
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 */
export async function getSimilarTitlesFromEdge(tmdbId, mediaType = 'movie', limit = 18) {
    const params = new URLSearchParams({ limit: String(limit) });
    return fetchFromEdge(
        `${API_BASE}/similar/${mediaType}/${tmdbId}?${params.toString()}`,
        async () => ({ data: [], total: 0 }),
    );
}

/**
 * Where-to-watch (OTT) availability for a title.
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 * @param {string} region ISO country code (default IN)
 */
export async function getWatchProvidersFromEdge(tmdbId, mediaType = 'movie', region = 'IN') {
    const params = new URLSearchParams({ region });
    return fetchFromEdge(
        `${API_BASE}/watch-providers/${mediaType}/${tmdbId}?${params.toString()}`,
        async () => ({ data: { region: null, link: null, flatrate: [], rent: [], buy: [] } }),
    );
}

/**
 * Alternate TMDB poster + still (backdrop) art for a movie or TV title.
 * @returns {Promise<{ posters: Array, backdrops: Array, default_poster: string|null, default_backdrop: string|null }>}
 */
export async function getTitlePostersFromEdge(tmdbId, mediaType = 'movie') {
    const params = new URLSearchParams({
        tmdbId: String(tmdbId),
        mediaType: mediaType === 'tv' ? 'tv' : 'movie',
    });
    const payload = await fetchFromEdge(
        `${API_BASE}/posters?${params.toString()}`,
        async () => ({ data: { posters: [], backdrops: [], default_poster: null, default_backdrop: null } }),
    );
    return payload.data || { posters: [], backdrops: [], default_poster: null, default_backdrop: null };
}
