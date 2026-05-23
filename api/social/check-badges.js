import { requireUser } from '../_lib/user-auth.js';
import { checkAndAwardBadges } from '../_lib/social-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 30,
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await requireUser(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.message });
    }

    try {
        const result = await checkAndAwardBadges(auth.user.id);
        return res.status(200).json({ ok: true, ...result });
    } catch (error) {
        console.error('check-badges failed:', error);
        return res.status(500).json({ error: error.message || 'Badge check failed' });
    }
}
