import { requireUser } from '../_lib/user-auth.js';
import { checkAndAwardBadges, recordDecisionPick } from '../_lib/social-server.js';
import { readJsonBody } from '../_lib/read-body.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 30,
};

function getAction(req) {
    if (req.query?.action) return String(req.query.action);
    const path = String(req.url || '').split('?')[0];
    const parts = path.split('/').filter(Boolean);
    const idx = parts.indexOf('social');
    return idx >= 0 ? parts[idx + 1] : null;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await requireUser(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.message });
    }

    const action = getAction(req);

    try {
        if (action === 'check-badges') {
            const result = await checkAndAwardBadges(auth.user.id);
            return res.status(200).json({ ok: true, ...result });
        }

        if (action === 'decision-pick') {
            const body = await readJsonBody(req);
            if (!body.tmdb_id || !body.title) {
                return res.status(400).json({ error: 'tmdb_id and title required' });
            }
            const result = await recordDecisionPick(auth.user.id, body);
            return res.status(200).json({ ok: true, ...result });
        }

        return res.status(404).json({
            error: 'Unknown social action',
            allowed: ['check-badges', 'decision-pick'],
        });
    } catch (error) {
        console.error('social handler failed:', action, error);
        return res.status(500).json({ error: error.message || 'Social request failed' });
    }
}
