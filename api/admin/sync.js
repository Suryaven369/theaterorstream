import { requireAdmin } from '../_lib/admin-auth.js';
import { runSyncJob, SYNC_JOBS } from '../_lib/tmdb-sync-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 60,
};

async function readBody(req) {
    if (req.body && typeof req.body === 'object') {
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
        const jobName = body.jobName;

        if (!jobName || !SYNC_JOBS[jobName]) {
            return res.status(400).json({
                error: 'Invalid jobName',
                allowed: Object.keys(SYNC_JOBS),
            });
        }

        const result = await runSyncJob(jobName);
        return res.status(200).json(result);
    } catch (error) {
        console.error('admin sync trigger failed:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Sync failed',
        });
    }
}
