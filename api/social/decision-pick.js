import { requireUser } from '../_lib/user-auth.js';
import { recordDecisionPick } from '../_lib/social-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 30,
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

    const auth = await requireUser(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.message });
    }

    try {
        const body = await readBody(req);
        if (!body.tmdb_id || !body.title) {
            return res.status(400).json({ error: 'tmdb_id and title required' });
        }

        const result = await recordDecisionPick(auth.user.id, body);
        return res.status(200).json({ ok: true, ...result });
    } catch (error) {
        console.error('decision-pick failed:', error);
        return res.status(500).json({ error: error.message || 'Failed to record decision' });
    }
}
