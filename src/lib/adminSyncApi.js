import { supabase } from './supabase';

async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
}

function resolveApiBase() {
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (configured) return configured.replace(/\/$/, '');
    return '';
}

export async function triggerSyncJob(jobName) {
    const token = await getAccessToken();
    if (!token) {
        throw new Error('You must be signed in as admin to run sync jobs.');
    }

    const url = `${resolveApiBase()}/api/admin/sync`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jobName }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (response.status === 404 && import.meta.env.DEV) {
            throw new Error(
                'Sync API is unavailable in Vite-only mode. Run `npm run dev:api` (vercel dev) or test on your Vercel deployment.',
            );
        }
        throw new Error(payload.error || `Sync failed (${response.status})`);
    }

    return payload;
}
