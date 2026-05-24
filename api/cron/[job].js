import { verifyCronRequest } from '../_lib/cron-auth.js';
import { createCronHandler, SYNC_JOBS } from '../_lib/tmdb-sync-server.js';
import {
    rebuildStaleTasteProfiles,
    backfillMovieEmbeddings,
} from '../_lib/taste-profile-server.js';
import { isEmbeddingConfigured } from '../_lib/embedding-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 60,
};

const TMDB_SYNC_JOBS = new Set(Object.keys(SYNC_JOBS));

function getJob(req) {
    if (req.query?.job) return String(req.query.job);
    const path = String(req.url || '').split('?')[0];
    const parts = path.split('/').filter(Boolean);
    const idx = parts.indexOf('cron');
    return idx >= 0 ? parts[idx + 1] : null;
}

export default async function handler(req, res) {
    const job = getJob(req);

    if (TMDB_SYNC_JOBS.has(job)) {
        return createCronHandler(job)(req, res);
    }

    const auth = verifyCronRequest(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.message });
    }

    try {
        if (job === 'taste-profile-weekly') {
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
        }

        if (job === 'embedding-backfill') {
            if (!isEmbeddingConfigured()) {
                return res.status(503).json({
                    error: 'Set VOYAGE_API_KEY or OPENAI_API_KEY to run embedding backfill',
                });
            }
            const limit = Number(req.query?.limit) || 10;
            const result = await backfillMovieEmbeddings({ limit });
            return res.status(200).json({ ok: true, ...result });
        }

        return res.status(404).json({
            error: 'Unknown cron job',
            allowed: [
                ...TMDB_SYNC_JOBS,
                'taste-profile-weekly',
                'embedding-backfill',
            ],
        });
    } catch (error) {
        console.error('cron handler failed:', job, error);
        return res.status(500).json({
            error: error.message || 'Cron job failed',
        });
    }
}
