import { requireUser } from '../_lib/user-auth.js';
import { verifyCronRequest } from '../_lib/cron-auth.js';
import { rebuildUserTasteProfile } from '../_lib/taste-profile-server.js';
import { isEmbeddingConfigured } from '../_lib/embedding-server.js';
import { getSupabaseAdmin } from '../_lib/supabase-admin.js';

// User-triggered rebuilds (e.g. rating bursts) collapse to one within this window.
const REBUILD_DEBOUNCE_SECONDS = 60;

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

        // Debounce user-triggered rebuilds so rating several movies in a row
        // doesn't fire a full embedding rebuild each time. Cron / force bypass it.
        if (!cronAuth.ok && !body.force) {
            const supabase = getSupabaseAdmin();
            const { data: existing } = await supabase
                .from('user_taste_profiles')
                .select('last_computed_at')
                .eq('user_id', userId)
                .maybeSingle();

            if (existing?.last_computed_at) {
                const secsSince = (Date.now() - new Date(existing.last_computed_at).getTime()) / 1000;
                if (secsSince < REBUILD_DEBOUNCE_SECONDS) {
                    return res.status(200).json({ ok: true, skipped: true, debounced: true });
                }
            }
        }

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
