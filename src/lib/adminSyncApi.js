import { supabase } from './supabase';

async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;

    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed?.session?.access_token || null;
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

export async function triggerRssRefresh(sourceId = null) {
    const token = await getAccessToken();
    if (!token) {
        throw new Error('You must be signed in as admin to refresh RSS feeds.');
    }

    const url = `${resolveApiBase()}/api/admin/rss`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(sourceId ? { job: 'refresh-source', sourceId } : { job: 'refresh-all' }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (response.status === 404 && import.meta.env.DEV) {
            throw new Error(
                'RSS API is unavailable in Vite-only mode. Run `npm run dev:api` (vercel dev) or test on your Vercel deployment.',
            );
        }
        throw new Error(payload.error || `RSS refresh failed (${response.status})`);
    }

    return payload;
}

/** Approve (or regenerate) with full-page body fetch so listicles get real titles. */
export async function approveFeedArticleViaApi(articleIdOrCandidate, { regenerateOnly = false } = {}) {
    const token = await getAccessToken();
    if (!token) {
        throw new Error('You must be signed in as admin to approve articles.');
    }

    const isCandidate = articleIdOrCandidate && typeof articleIdOrCandidate === 'object';
    const url = `${resolveApiBase()}/api/admin/rss`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
            isCandidate
                ? { job: 'approve-article', candidate: articleIdOrCandidate }
                : {
                    job: regenerateOnly ? 'regenerate-summary' : 'approve-article',
                    articleId: articleIdOrCandidate,
                },
        ),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (response.status === 404 && import.meta.env.DEV) {
            throw new Error(
                'RSS API is unavailable in Vite-only mode. Run `npm run dev:api` (vercel dev) or test on your Vercel deployment.',
            );
        }
        throw new Error(payload.error || `Article approve failed (${response.status})`);
    }

    return {
        success: true,
        summary: payload.summary || null,
        summaryItems: payload.summaryItems || null,
        enriched: !!payload.enriched,
        articleId: payload.articleId || null,
    };
}

export async function triggerBackfill(job, { limit } = {}) {
    const token = await getAccessToken();
    if (!token) {
        throw new Error('You must be signed in as admin to run a backfill.');
    }

    const url = `${resolveApiBase()}/api/admin/backfill`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ job, limit }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (response.status === 404 && import.meta.env.DEV) {
            throw new Error(
                'Backfill API is unavailable in Vite-only mode. Run `npm run dev:api` (vercel dev) or test on your Vercel deployment.',
            );
        }
        throw new Error(payload.error || `Backfill failed (${response.status})`);
    }

    return payload;
}

/**
 * Connect or disconnect the official TheaterOrStream profile.
 * Uses a Supabase RPC (works in local Vite) — no /api/admin token required.
 */
export async function connectOfficialProfile({ username, userId, disconnect = false } = {}) {
    const { data, error } = await supabase.rpc('admin_connect_official_profile', {
        p_username: disconnect ? null : (username || null),
        p_user_id: disconnect ? null : (userId || null),
        p_disconnect: !!disconnect,
    });

    if (error) {
        const msg = error.message || 'Request failed';
        if (/Admin access required|42501/i.test(msg)) {
            throw new Error('Admin access required. Sign in with an admin account.');
        }
        if (/Profile not found|P0002/i.test(msg)) {
            throw new Error('Profile not found. Create the account first, then connect it.');
        }
        if (/Could not find the function|PGRST202|schema cache/i.test(msg)) {
            throw new Error(
                'Database function missing. Run supabase/migrations/20260720000000_admin_connect_official_profile.sql in Supabase SQL editor.',
            );
        }
        throw new Error(msg);
    }

    if (!data?.ok) {
        throw new Error(data?.error || 'Could not update official profile');
    }

    return data;
}
