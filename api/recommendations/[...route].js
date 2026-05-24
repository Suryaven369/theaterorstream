import { handleRecommendationRequest } from '../_lib/recommendation-handler.js';
import {
    getForYouRecommendations,
    getTonightRecommendations,
    getFamilyRecommendations,
    getTrendingPersonalized,
} from '../_lib/recommendation-server.js';

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

    return res.status(404).json({
        error: 'Unknown recommendation route',
        allowed: ['for-you', 'tonight', 'family', 'trending-personalized', 'similar/:tmdbId'],
    });
}
