import { handleRecommendationRequest } from '../_lib/recommendation-handler.js';
import { getTrendingPersonalized } from '../_lib/recommendation-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 60,
};

export default async function handler(req, res) {
    return handleRecommendationRequest(req, res, (userId, query) =>
        getTrendingPersonalized(userId, query));
}
