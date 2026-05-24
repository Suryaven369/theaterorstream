import { verifyCronRequest } from '../_lib/cron-auth.js';
import {
    rebuildStaleTasteProfiles,
    backfillMovieEmbeddings,
} from '../_lib/taste-profile-server.js';
import { isEmbeddingConfigured } from '../_lib/embedding-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 60,
};

export default async function handler(req, res) {
    const auth = verifyCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.message });
    }

    try {
        const profileLimit = Number(req.query?.profileLimit) || 10;
        const embedLimit = Number(req.query?.embedLimit) || 5;

        const rebuildResult = await rebuildStaleTasteProfiles({
            limit: profileLimit,
            includeEmbedding: isEmbeddingConfigured(),
        });

        let embedResult = { processed: 0, results: [], skipped: true };
        if (isEmbeddingConfigured()) {
            embedResult = await backfillMovieEmbeddings({ limit: embedLimit });
            embedResult.skipped = false;
        }

        return res.status(200).json({
            ok: true,
            profiles: rebuildResult,
            embeddings: embedResult,
            embeddingConfigured: isEmbeddingConfigured(),
        });
    } catch (error) {
        console.error('taste-profile-weekly cron failed:', error);
        return res.status(500).json({
            error: error.message || 'Weekly taste cron failed',
        });
    }
}
