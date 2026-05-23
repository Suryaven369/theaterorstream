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

async function postSocial(path, body) {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: 'not_signed_in' };

    try {
        const response = await fetch(`${resolveApiBase()}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `Request failed (${response.status})`);
        }
        return { ok: true, ...payload };
    } catch (error) {
        if (import.meta.env.DEV) console.warn('[socialApi]', path, error.message);
        return { ok: false, error: error.message };
    }
}

export function checkBadges() {
    return postSocial('/api/social/check-badges', {});
}

export function recordDecisionPick(movie) {
    return postSocial('/api/social/decision-pick', {
        tmdb_id: movie.tmdb_id,
        title: movie.title,
        poster_path: movie.poster_path,
        media_type: movie.media_type || 'movie',
    });
}
