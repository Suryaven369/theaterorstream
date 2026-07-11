import { verifyCronRequest } from '../_lib/cron-auth.js';
import { createCronHandler, SYNC_JOBS } from '../_lib/tmdb-sync-server.js';
import {
    rebuildStaleTasteProfiles,
    backfillMovieEmbeddings,
} from '../_lib/taste-profile-server.js';
import { isEmbeddingConfigured } from '../_lib/embedding-server.js';
import { refreshAllRssSources, subscribeYouTubeSources } from '../_lib/rss-server.js';
import { captureAllTasteSnapshots } from '../_lib/events-server.js';

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

            // Weekly taste snapshot for the evolution dashboard.
            let snapshotResult = { processed: 0, captured: 0 };
            try {
                snapshotResult = await captureAllTasteSnapshots();
            } catch (err) {
                snapshotResult = { error: err.message };
            }

            return res.status(200).json({
                ok: true,
                profiles: rebuildResult,
                embeddings: embedResult,
                snapshots: snapshotResult,
                embeddingConfigured: isEmbeddingConfigured(),
            });
        }

        if (job === 'rss-refresh') {
            const result = await refreshAllRssSources();
            return res.status(200).json({ ok: true, ...result });
        }

        // Renews the WebSub push subscriptions (leases expire ~10 days). This does
        // NOT poll for uploads — it only keeps the real-time push alive.
        if (job === 'websub-renew') {
            const base = process.env.PUBLIC_BASE_URL
                || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
            if (!base) {
                return res.status(503).json({ error: 'Set PUBLIC_BASE_URL to your deployed site URL' });
            }
            const result = await subscribeYouTubeSources({ callbackUrl: `${base}/api/websub` });
            return res.status(200).json({ ok: true, ...result });
        }

        if (job === 'embedding-backfill') {
            if (!isEmbeddingConfigured()) {
                return res.status(503).json({
                    error: 'Set GEMINI_API_KEY (free), VOYAGE_API_KEY, HF_API_KEY, or OPENAI_API_KEY to run embedding backfill',
                });
            }
            // Keeps newly-synced movies embedded; ~40 fits inside the 60s budget.
            const limit = Number(req.query?.limit) || 40;
            const result = await backfillMovieEmbeddings({ limit });
            return res.status(200).json({ ok: true, ...result });
        }

        return res.status(404).json({
            error: 'Unknown cron job',
            allowed: [
                ...TMDB_SYNC_JOBS,
                'taste-profile-weekly',
                'embedding-backfill',
                'rss-refresh',
                'websub-renew',
            ],
        });
    } catch (error) {
        console.error('cron handler failed:', job, error);
        return res.status(500).json({
            error: error.message || 'Cron job failed',
        });
    }
}
