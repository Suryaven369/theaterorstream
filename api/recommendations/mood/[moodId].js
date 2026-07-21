import { handleRecommendationRequest } from '../../_lib/recommendation-handler.js';
import { getMoodRecommendations } from '../../_lib/recommendation-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 60,
};

export default async function handler(req, res) {
    const moodId = req.query?.moodId;
    if (!moodId) {
        return res.status(400).json({ error: 'Missing mood id' });
    }

    return handleRecommendationRequest(req, res, (userId, query) =>
        getMoodRecommendations(userId, String(moodId), query));
}
