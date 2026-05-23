import { requireUser } from './user-auth.js';

function getRequestQuery(request) {
    if (request?.query && typeof request.query === 'object' && !Array.isArray(request.query)) {
        const params = new URLSearchParams();
        Object.entries(request.query).forEach(([key, value]) => {
            if (value != null) params.set(key, String(value));
        });
        return params;
    }
    if (request?.url) {
        const path = String(request.url);
        const queryStart = path.indexOf('?');
        if (queryStart >= 0) {
            return new URLSearchParams(path.slice(queryStart + 1));
        }
    }
    return new URLSearchParams();
}

export function parseRecommendationQuery(request) {
    const params = getRequestQuery(request);

    return {
        limit: Math.min(48, Math.max(1, Number(params.get('limit')) || 24)),
        mediaType: params.get('mediaType') || null,
        refresh: params.get('refresh') === 'true',
        ottMode: params.get('ottMode') !== 'false',
    };
}

export async function handleRecommendationRequest(request, res, loadFn) {
    if (request.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await requireUser(request);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.message });
    }

    try {
        const query = parseRecommendationQuery(request);
        const result = await loadFn(auth.user.id, query);

        return res.status(200).json({
            ok: true,
            data: result.items,
            meta: result.meta,
            generatedAt: result.generatedAt,
            fromCache: result.fromCache ?? false,
        });
    } catch (error) {
        console.error('recommendation handler error:', error);
        return res.status(500).json({
            error: error.message || 'Failed to load recommendations',
        });
    }
}
