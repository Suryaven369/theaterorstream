import { verifyCronRequest } from '../_lib/cron-auth.js';
import { createCronHandler, SYNC_JOBS } from '../_lib/tmdb-sync-server.js';
import {
    rebuildStaleTasteProfiles,
    backfillMovieEmbeddings,
} from '../_lib/taste-profile-server.js';
import { isEmbeddingConfigured } from '../_lib/embedding-server.js';
import { refreshAllRssSources, subscribeYouTubeSources } from '../_lib/rss-server.js';
import { captureAllTasteSnapshots } from '../_lib/events-server.js';

// News Intelligence imports (lazy-loaded to avoid slowing down other crons)
async function getNewsClassifier() {
    const mod = await import('../_lib/news-classifier.js');
    return mod;
}
async function getNewsClustering() {
    const mod = await import('../_lib/news-clustering.js');
    return mod;
}
async function getNewsTrending() {
    const mod = await import('../_lib/news-trending.js');
    return mod;
}
async function getNewsPublisher() {
    const mod = await import('../_lib/news-publisher.js');
    return mod;
}

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

        // ============================================================
        // NEWS INTELLIGENCE CRON JOBS
        // ============================================================

        // Classify pending articles through AI (runs every 5 minutes)
        if (job === 'news-classify') {
            const { getArticlesPendingClassification, batchClassifyArticles, isClassifierEnabled } = await getNewsClassifier();
            
            if (!isClassifierEnabled()) {
                return res.status(503).json({ error: 'AI classifier not configured (need GEMINI_API_KEY or MISTRAL_API_KEY)' });
            }

            const limit = Number(req.query?.limit) || 10;
            const pending = await getArticlesPendingClassification(limit);
            
            if (!pending.length) {
                return res.status(200).json({ ok: true, message: 'No articles pending classification', processed: 0 });
            }

            const ids = pending.map(a => a.id);
            const result = await batchClassifyArticles(ids, { concurrency: 2 });
            
            return res.status(200).json({
                ok: true,
                ...result,
                message: `Classified ${result.successful}/${result.total} articles`,
            });
        }

        // Cluster classified articles (runs every 10 minutes)
        if (job === 'news-cluster') {
            const { getUnclusteredArticles, batchClusterArticles } = await getNewsClustering();
            
            const limit = Number(req.query?.limit) || 20;
            const unclustered = await getUnclusteredArticles(limit);
            
            if (!unclustered.length) {
                return res.status(200).json({ ok: true, message: 'No unclustered articles', processed: 0 });
            }

            const ids = unclustered.map(a => a.id);
            const result = await batchClusterArticles(ids);
            
            return res.status(200).json({
                ok: true,
                ...result,
                message: `Clustered ${result.successful} articles, created ${result.newClusters} new clusters`,
            });
        }

        // Recalculate trend scores (runs every 20 minutes)
        if (job === 'news-trend') {
            const { recalculateAllTrendScores } = await getNewsTrending();
            
            const result = await recalculateAllTrendScores();
            
            return res.status(200).json({
                ok: true,
                ...result,
                message: `Recalculated ${result.updated} cluster trend scores`,
            });
        }

        // Auto-publish eligible clusters (runs every 30 minutes)
        if (job === 'news-publish') {
            const { processPublishReadyClusters, archiveLowScoreClusters } = await getNewsPublisher();
            
            // Process publish-ready clusters
            const publishResult = await processPublishReadyClusters();
            
            // Also archive stale low-score clusters
            const archiveResult = await archiveLowScoreClusters();
            
            return res.status(200).json({
                ok: true,
                published: publishResult.published,
                skipped: publishResult.skipped,
                archived: archiveResult.archived,
                message: `Published ${publishResult.published} clusters, archived ${archiveResult.archived} stale`,
            });
        }

        // Full news pipeline run (manual trigger for testing)
        if (job === 'news-pipeline') {
            const { getArticlesPendingClassification, batchClassifyArticles, isClassifierEnabled } = await getNewsClassifier();
            const { getUnclusteredArticles, batchClusterArticles } = await getNewsClustering();
            const { recalculateAllTrendScores } = await getNewsTrending();
            const { processPublishReadyClusters, archiveLowScoreClusters } = await getNewsPublisher();
            
            const results = {
                classify: { skipped: true },
                cluster: { skipped: true },
                trend: { skipped: true },
                publish: { skipped: true },
            };

            // Step 1: Classify
            if (isClassifierEnabled()) {
                const pending = await getArticlesPendingClassification(10);
                if (pending.length) {
                    results.classify = await batchClassifyArticles(pending.map(a => a.id), { concurrency: 2 });
                    results.classify.skipped = false;
                }
            }

            // Step 2: Cluster
            const unclustered = await getUnclusteredArticles(20);
            if (unclustered.length) {
                results.cluster = await batchClusterArticles(unclustered.map(a => a.id));
                results.cluster.skipped = false;
            }

            // Step 3: Recalculate trends
            results.trend = await recalculateAllTrendScores();
            results.trend.skipped = false;

            // Step 4: Publish & archive
            results.publish = {
                ...(await processPublishReadyClusters()),
                archived: (await archiveLowScoreClusters()).archived,
                skipped: false,
            };

            return res.status(200).json({
                ok: true,
                results,
                message: 'Full news pipeline completed',
            });
        }

        return res.status(404).json({
            error: 'Unknown cron job',
            allowed: [
                ...TMDB_SYNC_JOBS,
                'taste-profile-weekly',
                'embedding-backfill',
                'rss-refresh',
                'websub-renew',
                'news-classify',
                'news-cluster',
                'news-trend',
                'news-publish',
                'news-pipeline',
            ],
        });
    } catch (error) {
        console.error('cron handler failed:', job, error);
        return res.status(500).json({
            error: error.message || 'Cron job failed',
        });
    }
}
