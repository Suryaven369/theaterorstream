import { requireAdmin } from '../_lib/admin-auth.js';
import {
    rebuildUserTasteProfile,
    rebuildStaleTasteProfiles,
    backfillMovieEmbeddings,
} from '../_lib/taste-profile-server.js';
import { isEmbeddingConfigured } from '../_lib/embedding-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 60,
};

async function readBody(req) {
    if (req.body && typeof req.body === 'object' && !(req.body instanceof Buffer)) {
        return req.body;
    }
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => {
            if (!data) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await requireAdmin(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.message });
    }

    try {
        const body = await readBody(req);
        const job = body.job;

        if (job === 'rebuild-user') {
            if (!body.userId) {
                return res.status(400).json({ error: 'userId required for rebuild-user' });
            }
            const result = await rebuildUserTasteProfile(body.userId, {
                includeEmbedding: !!body.includeEmbedding && isEmbeddingConfigured(),
            });
            return res.status(200).json({ ok: true, result });
        }

        if (job === 'rebuild-stale') {
            const result = await rebuildStaleTasteProfiles({
                limit: body.limit || 10,
                includeEmbedding: !!body.includeEmbedding && isEmbeddingConfigured(),
            });
            return res.status(200).json({ ok: true, ...result });
        }

        if (job === 'embed-movies') {
            if (!isEmbeddingConfigured()) {
                return res.status(503).json({
                    error: 'Set VOYAGE_API_KEY or OPENAI_API_KEY',
                });
            }
            const result = await backfillMovieEmbeddings({ limit: body.limit || 10 });
            return res.status(200).json({ ok: true, ...result });
        }

        return res.status(400).json({
            error: 'Invalid job',
            allowed: ['rebuild-user', 'rebuild-stale', 'embed-movies'],
        });
    } catch (error) {
        console.error('admin taste job failed:', error);
        return res.status(500).json({
            error: error.message || 'Taste admin job failed',
        });
    }
}
