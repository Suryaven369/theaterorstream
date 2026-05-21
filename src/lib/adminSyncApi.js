import { supabase } from './supabase';

async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
}

export async function triggerSyncJob(jobName) {
    const token = await getAccessToken();
    if (!token) {
        throw new Error('You must be signed in as admin to run sync jobs.');
    }

    const response = await fetch('/api/admin/sync', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jobName }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload.error || `Sync failed (${response.status})`);
    }

    return payload;
}
