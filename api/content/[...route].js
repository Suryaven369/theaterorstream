import {
    fetchTrendingContent,
    fetchExploreContent,
    fetchHomepageSections,
    fetchTVSections,
    fetchUpcoming,
    searchContent,
    searchPeople,
    fetchTrailers,
    fetchShowcaseTrailers,
    fetchArticles,
    fetchComingSoon,
    fetchNewReleases,
    fetchPopularByPeriod,
    fetchNowPlaying,
    fetchAdminStats,
    fetchWatchProviders,
    fetchTitlePosters,
    fetchSimilarTitles,
    fetchTitleAnalysis,
    fetchRssTrailers,
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

        if (segment === 'browse-themes') {
            const { loadBrowseThemes } = await import('../_lib/theme-browse-server.js');
            const themes = await loadBrowseThemes({ activeOnly: true });
            return jsonResponse(
                { themes },
                'public, s-maxage=60, stale-while-revalidate=120',
            );
        }

        if (segment === 'explore') {
            const theme = url.searchParams.get('theme');
            const genreId = url.searchParams.get('genreId')
                ? Number(url.searchParams.get('genreId'))
                : null;
            const exploreOpts = {
                mediaType: url.searchParams.get('mediaType') || 'movie',
                category: url.searchParams.get('category') || 'popular',
                genreId,
                sort: url.searchParams.get('sort') || 'popular',
                providerId: url.searchParams.get('providerId') || null,
                region: url.searchParams.get('region') || 'US',
                familyFriendly: url.searchParams.get('familyFriendly') === '1'
                    || url.searchParams.get('familyFriendly') === 'true',
                limit: parseInt(url.searchParams.get('limit') || '24', 10),
                offset: parseInt(url.searchParams.get('offset') || '0', 10),
            };
            if (theme) {
                const { fetchExploreByTheme } = await import('../_lib/theme-browse-server.js');
                const result = await fetchExploreByTheme(theme, exploreOpts);
                return jsonResponse(result, 'public, s-maxage=120, stale-while-revalidate=300');
            }
            // Category browse page uses TMDB discover (sort / OTT / family filters)
            if (genreId && url.searchParams.get('browse') === '1') {
                const { fetchExploreByGenre } = await import('../_lib/theme-browse-server.js');
                const result = await fetchExploreByGenre(genreId, exploreOpts);
                return jsonResponse(result, 'public, s-maxage=120, stale-while-revalidate=300');
            }
            const result = await fetchExploreContent(exploreOpts);
            return jsonResponse(result, 'public, s-maxage=120, stale-while-revalidate=300');
        }

        if (segment === 'homepage') {
            const activeOnly = url.searchParams.get('activeOnly') !== 'false';
            const fresh = url.searchParams.has('_') || url.searchParams.get('fresh') === '1';
            const sections = await fetchHomepageSections(activeOnly);
            return jsonResponse(
                { data: sections },
                fresh
                    ? 'private, no-store'
                    : 'public, s-maxage=60, stale-while-revalidate=120',
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

        if (segment === 'people') {
            const query = url.searchParams.get('q') || url.searchParams.get('query') || '';
            const people = await searchPeople(query, parseInt(url.searchParams.get('limit') || '20', 10));
            return jsonResponse({ data: people }, 'public, s-maxage=300, stale-while-revalidate=600');
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

        // === NEW ENDPOINTS ===

        // Trailers - candidate trailers scanned live from TMDB-derived library data.
        // Used by the admin Showcase Trailers panel to browse what to feature — the
        // public Home feed no longer reads this directly, see 'showcase-trailers' below.
        if (segment === 'trailers') {
            const result = await fetchTrailers({
                mediaType: url.searchParams.get('mediaType') || null,
                limit: parseInt(url.searchParams.get('limit') || '20', 10),
                offset: parseInt(url.searchParams.get('offset') || '0', 10),
                daysBack: parseInt(url.searchParams.get('daysBack') || '90', 10),
                trailerType: url.searchParams.get('type') || 'Trailer',
                sortBy: url.searchParams.get('sortBy') || 'recent',
            });
            return jsonResponse(result, 'public, s-maxage=300, stale-while-revalidate=600');
        }

        // RSS trailers — verified-against-TMDB YouTube trailers for the Home feed
        if (segment === 'rss-trailers') {
            const result = await fetchRssTrailers({
                limit: parseInt(url.searchParams.get('limit') || '15', 10),
                daysBack: parseInt(url.searchParams.get('daysBack') || '21', 10),
            });
            // CDN-friendly: Home no longer cache-busts; admin publish can wait ~2 min.
            return jsonResponse(result, 'public, s-maxage=120, stale-while-revalidate=300');
        }

        // Showcase trailers - admin-curated, DB-backed trailers for the public Home feed
        if (segment === 'showcase-trailers') {
            const activeOnly = url.searchParams.get('activeOnly') !== 'false';
            const data = await fetchShowcaseTrailers(activeOnly);
            return jsonResponse(
                { data, total: data.length },
                'public, s-maxage=300, stale-while-revalidate=600',
            );
        }

        // Articles - admin-curated RSS news articles for the public Home feed
        if (segment === 'articles') {
            const result = await fetchArticles({
                limit: parseInt(url.searchParams.get('limit') || '20', 10),
                offset: parseInt(url.searchParams.get('offset') || '0', 10),
            });
            // CDN-friendly: Home no longer cache-busts; admin publish can wait ~2 min.
            return jsonResponse(result, 'public, s-maxage=120, stale-while-revalidate=300');
        }

        // Coming soon - not yet released
        if (segment === 'coming-soon') {
            const result = await fetchComingSoon({
                mediaType: url.searchParams.get('mediaType') || 'movie',
                limit: parseInt(url.searchParams.get('limit') || '20', 10),
                offset: parseInt(url.searchParams.get('offset') || '0', 10),
                daysAhead: parseInt(url.searchParams.get('daysAhead') || '90', 10),
            });
            return jsonResponse(result, 'public, s-maxage=600, stale-while-revalidate=1200');
        }

        // New releases - recently released
        if (segment === 'new-releases') {
            const result = await fetchNewReleases({
                mediaType: url.searchParams.get('mediaType') || null,
                limit: parseInt(url.searchParams.get('limit') || '20', 10),
                offset: parseInt(url.searchParams.get('offset') || '0', 10),
                daysBack: parseInt(url.searchParams.get('daysBack') || '30', 10),
            });
            return jsonResponse(result, 'public, s-maxage=300, stale-while-revalidate=600');
        }

        // Popular by period
        if (segment === 'popular') {
            const result = await fetchPopularByPeriod({
                mediaType: url.searchParams.get('mediaType') || null,
                period: url.searchParams.get('period') || 'week',
                limit: parseInt(url.searchParams.get('limit') || '20', 10),
                offset: parseInt(url.searchParams.get('offset') || '0', 10),
            });
            return jsonResponse(result, 'public, s-maxage=300, stale-while-revalidate=600');
        }

        // Now playing - in theaters
        if (segment === 'now-playing') {
            const result = await fetchNowPlaying({
                limit: parseInt(url.searchParams.get('limit') || '20', 10),
                offset: parseInt(url.searchParams.get('offset') || '0', 10),
            });
            return jsonResponse(result, 'public, s-maxage=300, stale-while-revalidate=600');
        }

        // More like this — content-based similar titles (NOT personalised)
        // /similar/:mediaType/:id
        if (segment === 'similar') {
            const mediaType = route[1] || url.searchParams.get('mediaType') || 'movie';
            const tmdbId = route[2] || url.searchParams.get('id');
            if (!tmdbId) return errorResponse('Missing title id', 400);
            const limit = parseInt(url.searchParams.get('limit') || '18', 10);
            const data = await fetchSimilarTitles(tmdbId, mediaType, limit);
            return jsonResponse(
                { data, total: data.length },
                'public, s-maxage=3600, stale-while-revalidate=86400',
            );
        }

        // Accurate Parent Guide + Movie Vibes — /analysis/:mediaType/:id
        if (segment === 'analysis') {
            const mediaType = route[1] || url.searchParams.get('mediaType') || 'movie';
            const tmdbId = route[2] || url.searchParams.get('id');
            if (!tmdbId) return errorResponse('Missing title id', 400);
            const region = url.searchParams.get('region') || 'IN';
            const data = await fetchTitleAnalysis(tmdbId, mediaType, region);
            return jsonResponse(
                { data },
                'public, s-maxage=86400, stale-while-revalidate=604800',
            );
        }

        // Where-to-watch (OTT) availability — /watch-providers/:mediaType/:id
        if (segment === 'watch-providers') {
            const mediaType = route[1] || url.searchParams.get('mediaType') || 'movie';
            const tmdbId = route[2] || url.searchParams.get('id');
            if (!tmdbId) return errorResponse('Missing title id', 400);
            const region = url.searchParams.get('region') || 'IN';
            const data = await fetchWatchProviders(tmdbId, mediaType, region);
            return jsonResponse(
                { data },
                'public, s-maxage=3600, stale-while-revalidate=86400',
            );
        }

        // Alternate posters — /posters?tmdbId=&mediaType=
        if (segment === 'posters') {
            const tmdbId = url.searchParams.get('tmdbId') || url.searchParams.get('id');
            if (!tmdbId) return errorResponse('Missing title id', 400);
            const mediaType = url.searchParams.get('mediaType') || 'movie';
            const data = await fetchTitlePosters(tmdbId, mediaType);
            return jsonResponse(
                { data },
                'public, s-maxage=3600, stale-while-revalidate=86400',
            );
        }

        // Proxy remote image bytes (for board drag/paste from Google etc.)
        if (segment === 'fetch-image') {
            const target = url.searchParams.get('url');
            if (!target || !/^https?:\/\//i.test(target)) {
                return errorResponse('Missing or invalid url', 400);
            }
            let parsed;
            try {
                parsed = new URL(target);
            } catch {
                return errorResponse('Invalid url', 400);
            }
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return errorResponse('Invalid protocol', 400);
            }
            const upstream = await fetch(target, {
                headers: {
                    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                    'User-Agent': 'TheaterOrStream/1.0 (image import)',
                },
                redirect: 'follow',
            });
            if (!upstream.ok) {
                return errorResponse(`Upstream ${upstream.status}`, upstream.status === 404 ? 404 : 502);
            }
            const contentType = upstream.headers.get('content-type') || 'image/jpeg';
            if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
                return errorResponse('URL did not return an image', 415);
            }
            const buf = await upstream.arrayBuffer();
            if (!buf.byteLength || buf.byteLength > 8 * 1024 * 1024) {
                return errorResponse('Image empty or too large', 413);
            }
            return new Response(buf, {
                status: 200,
                headers: {
                    'Content-Type': contentType.startsWith('image/') ? contentType : 'image/jpeg',
                    'Cache-Control': 'private, max-age=300',
                },
            });
        }

        // Admin stats (public read, sensitive data filtered)
        if (segment === 'stats') {
            const stats = await fetchAdminStats();
            return jsonResponse({ data: stats }, 'public, s-maxage=60, stale-while-revalidate=120');
        }

        return errorResponse('Unknown content route', 404);
    } catch (error) {
        console.error('content edge error:', segment, error);
        return errorResponse(error.message || 'Content request failed');
    }
}
