import { handleRecommendationRequest } from '../../_lib/recommendation-handler.js';
import {
    getBecauseYouLoved,
    getHiddenGems,
    getUnderratedMasterpieces,
    getOutsideComfortZone,
} from '../../_lib/recommendation-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 60,
};

const BUILDERS = {
    'because-you-loved': getBecauseYouLoved,
    'hidden-gems': getHiddenGems,
    underrated: getUnderratedMasterpieces,
    'outside-comfort-zone': getOutsideComfortZone,
};

export default async function handler(req, res) {
    const section = req.query?.section;
    const builder = BUILDERS[section];
    if (!builder) {
        return res.status(404).json({
            error: 'Unknown discovery section',
            allowed: Object.keys(BUILDERS),
        });
    }

    return handleRecommendationRequest(req, res, async (userId, query) => {
        const result = await builder(userId, query);
        if (!result) {
            return { items: [], meta: { count: 0 }, generatedAt: new Date().toISOString() };
        }
        return { ...result, meta: { ...(result.meta || {}), heading: result.heading } };
    });
}
