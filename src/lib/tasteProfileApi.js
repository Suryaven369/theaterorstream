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

/**
 * Fire-and-forget taste profile rebuild after ratings or onboarding.
 * Failures are logged only — never blocks the UI.
 */
export async function requestTasteProfileRebuild(options = {}) {
    const token = await getAccessToken();
    if (!token) return { skipped: true, reason: 'not_signed_in' };

    const url = `${resolveApiBase()}/api/taste/rebuild`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                includeEmbedding: !!options.includeEmbedding,
            }),
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            if (import.meta.env.DEV) {
                console.warn('[taste-rebuild]', payload.error || response.status);
            }
            return { ok: false, error: payload.error };
        }

        return { ok: true, ...(await response.json()) };
    } catch (error) {
        if (import.meta.env.DEV) {
            console.warn('[taste-rebuild]', error.message);
        }
        return { ok: false, error: error.message };
    }
}
