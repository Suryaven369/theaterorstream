import { requireUser } from '../../_lib/user-auth.js';
import { getSimilarRecommendations } from '../../_lib/recommendation-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 60,
};

function getRequestQuery(request) {
    if (request?.url) {
        const url = new URL(request.url, 'http://localhost');
        return url.searchParams;
    }
    return new URLSearchParams(request?.query || {});
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await requireUser(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.message });
    }

    const tmdbId = req.query?.tmdbId;
    if (!tmdbId) {
        return res.status(400).json({ error: 'tmdbId required' });
    }

    try {
        const params = getRequestQuery(req);
        const result = await getSimilarRecommendations(auth.user.id, String(tmdbId), {
            limit: Math.min(48, Math.max(1, Number(params.get('limit')) || 24)),
            mediaType: params.get('mediaType') || null,
            refresh: params.get('refresh') === 'true',
            ottMode: params.get('ottMode') === 'true',
        });

        return res.status(200).json({
            ok: true,
            data: result.items,
            meta: { ...result.meta, seedTmdbId: String(tmdbId) },
            generatedAt: result.generatedAt,
            fromCache: result.fromCache ?? false,
        });
    } catch (error) {
        console.error('similar recommendations error:', error);
        return res.status(500).json({
            error: error.message || 'Failed to load similar recommendations',
        });
    }
}
