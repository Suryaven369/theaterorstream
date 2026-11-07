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

// ---------------------------------------------------------------------------
// Response cache + retry/backoff. TMDB data changes slowly; caching cuts cost
// and keeps us well under TMDB's rate limit. Per serverless instance (memory);
// long-lived per-film data also lives in movies_library.
// ---------------------------------------------------------------------------
const CACHE_MAX_ENTRIES = 2000;
const TTL_LONG_MS = 24 * 60 * 60 * 1000;   // titles, keywords, credits, similar…
const TTL_SHORT_MS = 6 * 60 * 60 * 1000;   // discover / trending / search / providers
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const responseCache = new Map(); // key → { at, ttl, data }
const inflight = new Map();      // key → Promise (dedupes concurrent identical calls)

function cacheTtlFor(path) {
    return /^\/(discover|trending|search|watch)\b|\/watch\/providers$|\/(now_playing|upcoming|popular)$/.test(path)
        ? TTL_SHORT_MS
        : TTL_LONG_MS;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** Drop cached TMDB responses (tests / admin refresh). */
export function clearTmdbCache() {
    responseCache.clear();
}

async function requestTmdb(url, headers) {
    for (let attempt = 0; ; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let response;
        try {
            response = await fetch(url, { headers, signal: controller.signal });
        } catch (err) {
            clearTimeout(timer);
            if (attempt >= MAX_RETRIES) {
                const error = new Error(`TMDB request failed: ${err.name === 'AbortError' ? 'timeout' : err.message}`);
                error.status = 503;
                throw error;
            }
            await sleep(400 * 2 ** attempt);
            continue;
        }
        clearTimeout(timer);

        if (response.ok) return response.json();

        // Rate limited / transient — back off (honour Retry-After when sent).
        if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
            const retryAfter = Number(response.headers.get('retry-after'));
            await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
            continue;
        }

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
}

/**
 * GET a TMDB v3 path. Cached (24h for title data, 6h for lists/discover),
 * concurrent identical calls share one request, 429/5xx are retried with backoff.
 * Pass { noCache: true } as the third argument to bypass the cache.
 */
export async function fetchTmdbApi(path, params = {}, { noCache = false } = {}) {
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
    Object.entries(params)
        .filter(([, value]) => value != null && value !== '')
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([key, value]) => url.searchParams.set(key, String(value)));

    const key = `${normalizedPath}?${url.searchParams.toString()}`;
    if (!noCache) {
        const hit = responseCache.get(key);
        if (hit && Date.now() - hit.at < hit.ttl) return hit.data;
        if (inflight.has(key)) return inflight.get(key);
    }

    const headers = applyTmdbAuth(url, apiKey);
    const promise = requestTmdb(url.toString(), headers)
        .then((data) => {
            responseCache.set(key, { at: Date.now(), ttl: cacheTtlFor(normalizedPath), data });
            if (responseCache.size > CACHE_MAX_ENTRIES) {
                responseCache.delete(responseCache.keys().next().value);
            }
            return data;
        })
        .finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
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
