import { verifyCronRequest } from '../_lib/cron-auth.js';
import { backfillMovieEmbeddings } from '../_lib/taste-profile-server.js';
import { isEmbeddingConfigured } from '../_lib/embedding-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 300,
};

export default async function handler(req, res) {
    const auth = verifyCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.message });
    }

    if (!isEmbeddingConfigured()) {
        return res.status(503).json({
            error: 'Set VOYAGE_API_KEY or OPENAI_API_KEY to run embedding backfill',
        });
    }

    try {
        const limit = Number(req.query?.limit) || 25;
        const result = await backfillMovieEmbeddings({ limit });
        return res.status(200).json({ ok: true, ...result });
    } catch (error) {
        console.error('embedding-backfill cron failed:', error);
        return res.status(500).json({
            error: error.message || 'Embedding backfill failed',
        });
    }
}
