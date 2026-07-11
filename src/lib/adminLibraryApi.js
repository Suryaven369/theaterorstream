import { supabase } from './supabaseClient.js';

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
 * Upsert movies_library rows via admin API (service role, bypasses RLS).
 * Returns null when API is unavailable so callers can fall back to direct Supabase.
 */
export async function upsertMoviesViaAdminApi(records) {
    const token = await getAccessToken();
    if (!token) return null;

    const url = `${resolveApiBase()}/api/admin/library`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ records }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            throw new Error(payload.error || 'Admin sign-in required to save to the library');
        }
        if (response.status === 404 && import.meta.env.DEV) {
            console.warn('[adminLibraryApi] /api/admin/library unavailable in Vite-only mode');
            return null;
        }
        console.warn('[adminLibraryApi] save failed, will try direct upsert:', payload.error || response.status);
        return null;
    }

    return payload;
}
