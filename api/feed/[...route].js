import { requireUser } from '../_lib/user-auth.js';
import { getGlobalFeed, getForYouFeed, getUserSuggestions } from '../_lib/feed-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 30,
};

function getRoute(req) {
    if (req.query?.route) {
        const r = req.query.route;
        return Array.isArray(r) ? r.join('/') : String(r);
    }
    const path = String(req.url || '').split('?')[0];
    const parts = path.split('/').filter(Boolean);
    const idx = parts.indexOf('feed');
    return parts.slice(idx + 1).join('/') || '';
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await requireUser(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.message });
    }

    const route = getRoute(req);
    const limit = Math.min(parseInt(req.query?.limit, 10) || 30, 50);
    const offset = parseInt(req.query?.offset, 10) || 0;
    const mode = req.query?.mode || 'recent';

    try {
        if (route === 'global' || route === '') {
            const items = await getGlobalFeed({
                mode,
                userId: auth.user.id,
                limit,
                offset,
            });
            return res.status(200).json({ ok: true, items, mode });
        }

        if (route === 'for-you') {
            const items = await getForYouFeed(auth.user.id, { limit, offset });
            return res.status(200).json({ ok: true, items });
        }

        if (route === 'suggestions') {
            const users = await getUserSuggestions(auth.user.id, limit);
            return res.status(200).json({ ok: true, users });
        }

        return res.status(404).json({
            error: 'Unknown feed route',
            allowed: ['global', 'for-you', 'suggestions'],
        });
    } catch (error) {
        console.error('feed handler failed:', route, error);
        return res.status(500).json({ error: error.message || 'Feed request failed' });
    }
}
