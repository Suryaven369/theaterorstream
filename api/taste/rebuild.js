import { requireUser } from '../_lib/user-auth.js';
import { verifyCronRequest } from '../_lib/cron-auth.js';
import { rebuildUserTasteProfile } from '../_lib/taste-profile-server.js';
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

    try {
        const body = await readBody(req);
        const cronAuth = verifyCronRequest(req);
        let userId = body.userId;

        if (cronAuth.ok && userId) {
            // Cron / server batch may rebuild a specific user
        } else {
            const auth = await requireUser(req);
            if (!auth.ok) {
                return res.status(auth.status).json({ error: auth.message });
            }
            userId = auth.user.id;
        }

        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }

        const includeEmbedding = !!body.includeEmbedding && isEmbeddingConfigured();

        const result = await rebuildUserTasteProfile(userId, {
            includeEmbedding,
            lookbackDays: body.lookbackDays || 90,
        });

        return res.status(200).json({
            ok: true,
            ...result,
            embeddingConfigured: isEmbeddingConfigured(),
        });
    } catch (error) {
        console.error('taste rebuild failed:', error);
        return res.status(500).json({
            error: error.message || 'Taste profile rebuild failed',
        });
    }
}
