const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const ALLOWED_PATH =
    /^\/(movie|tv|search|discover|trending|person|collection|configuration|genre|find|review|company|network|keyword|certification|watch|list)(\/|$)/;

export function buildTmdbUrl(path) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return new URL(normalizedPath.replace(/^\//, ''), `${TMDB_BASE_URL}/`);
}

export function getTmdbApiKey() {
    return (
        process.env.TMDB_ACCESS_TOKEN
        || process.env.TMDB_API_KEY
        || process.env.VITE_MOVIE_API_KEY
        || null
    );
}

/** v4 JWT read token → Bearer header; v3 API key → api_key query param */
export function applyTmdbAuth(url, credential) {
    const headers = { Accept: 'application/json' };
    const token = credential.trim();

    if (token.startsWith('eyJ')) {
        headers.Authorization = `Bearer ${token}`;
        return headers;
    }

    url.searchParams.set('api_key', token);
    return headers;
}

export function isAllowedTmdbPath(path) {
    if (!path || typeof path !== 'string') return false;
    const normalized = path.startsWith('/') ? path : `/${path}`;
    if (normalized.includes('..')) return false;
    return ALLOWED_PATH.test(normalized);
}

export async function fetchTmdbApi(path, params = {}) {
    const apiKey = getTmdbApiKey();
    if (!apiKey) {
        const error = new Error('TMDB_API_KEY is not configured');
        error.status = 500;
        throw error;
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (!isAllowedTmdbPath(normalizedPath)) {
        const error = new Error('TMDB path not allowed');
        error.status = 400;
        throw error;
    }

    const url = buildTmdbUrl(normalizedPath);
    Object.entries(params).forEach(([key, value]) => {
        if (value != null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });

    const headers = applyTmdbAuth(url, apiKey);

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
        let detail = '';
        try {
            const body = await response.json();
            detail = body?.status_message || body?.error || JSON.stringify(body);
        } catch {
            detail = response.statusText;
        }
        const error = new Error(`TMDB request failed (${response.status}): ${detail}`);
        error.status = response.status;
        throw error;
    }

    return response.json();
}

export function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'private, no-store',
        },
    });
}

export function errorResponse(message, status = 500) {
    return jsonResponse({ error: message }, status);
}
