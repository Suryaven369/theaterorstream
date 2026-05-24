import { handleRecommendationRequest } from '../_lib/recommendation-handler.js';
import {
    getForYouRecommendations,
    getTonightRecommendations,
    getFamilyRecommendations,
    getTrendingPersonalized,
    getSimilarRecommendations,
} from '../_lib/recommendation-server.js';
import { requireUser } from '../_lib/user-auth.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 60,
};

function getRouteSegments(req) {
    if (req.query?.route) {
        const route = req.query.route;
        return Array.isArray(route) ? route : [route];
    }
    const path = String(req.url || '').split('?')[0];
    const parts = path.split('/').filter(Boolean);
    const idx = parts.indexOf('recommendations');
    return idx >= 0 ? parts.slice(idx + 1) : [];
}

function getRequestQuery(request) {
    if (request?.url) {
        const url = new URL(request.url, 'http://localhost');
        return url.searchParams;
    }
    return new URLSearchParams(request?.query || {});
}

export default async function handler(req, res) {
    const route = getRouteSegments(req);
    const segment = route[0];

    if (segment === 'for-you') {
        return handleRecommendationRequest(req, res, (userId, query) =>
            getForYouRecommendations(userId, query));
    }

    if (segment === 'tonight') {
        return handleRecommendationRequest(req, res, (userId, query) =>
            getTonightRecommendations(userId, query));
    }

    if (segment === 'family') {
        return handleRecommendationRequest(req, res, (userId, query) =>
            getFamilyRecommendations(userId, query));
    }

    if (segment === 'trending-personalized') {
        return handleRecommendationRequest(req, res, (userId, query) =>
            getTrendingPersonalized(userId, query));
    }

    if (segment === 'similar' && route[1]) {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const auth = await requireUser(req);
        if (!auth.ok) {
            return res.status(auth.status).json({ error: auth.message });
        }

        const tmdbId = route[1];

        try {
            const params = getRequestQuery(req);
            const result = await getSimilarRecommendations(auth.user.id, String(tmdbId), {
                limit: Math.min(48, Math.max(1, Number(params.get('limit')) || 24)),
                mediaType: params.get('mediaType') || null,
                refresh: params.get('refresh') === 'true',
                ottMode: params.get('ottMode') === 'true',
            });

            return res.status(200).json({
                ok: true,
                data: result.items,
                meta: { ...result.meta, seedTmdbId: String(tmdbId) },
                generatedAt: result.generatedAt,
                fromCache: result.fromCache ?? false,
            });
        } catch (error) {
            console.error('similar recommendations error:', error);
            return res.status(500).json({
                error: error.message || 'Failed to load similar recommendations',
            });
        }
    }

    return res.status(404).json({
        error: 'Unknown recommendation route',
        allowed: ['for-you', 'tonight', 'family', 'trending-personalized', 'similar/:tmdbId'],
    });
}
