/**
 * Public storage URLs must use the real Supabase host — never the Vite
 * `/supabase-proxy` base used in local DEV. Uploads that called
 * `getPublicUrl()` while the client pointed at the proxy saved
 * `http://localhost:5173/supabase-proxy/storage/...` into the DB, which
 * breaks on production.
 */

function remoteSupabaseUrl() {
    const fromVite =
        typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
            ? import.meta.env.VITE_SUPABASE_URL
            : '';
    const fromProcess =
        typeof process !== 'undefined'
            ? (process.env?.VITE_SUPABASE_URL || process.env?.SUPABASE_URL || '')
            : '';
    return String(fromVite || fromProcess || '').replace(/\/$/, '');
}

/** True when a stored URL was minted against the local Vite supabase proxy. */
export function isDevProxyStorageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return /\/supabase-proxy\/storage\//i.test(url)
        || (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)
            && /\/storage\/v1\/object\/public\//i.test(url));
}

/**
 * Rewrite proxy/localhost public storage URLs to the real Supabase host.
 * Leaves Google OAuth avatars, TMDB, Cloudinary, etc. unchanged.
 */
export function toPublicStorageUrl(url) {
    if (!url || typeof url !== 'string') return url || null;
    const remote = remoteSupabaseUrl();
    if (!remote) return url;

    const storagePath = url.match(/(\/storage\/v1\/object\/public\/.+)$/i);
    if (storagePath && isDevProxyStorageUrl(url)) {
        return `${remote}${storagePath[1]}`;
    }
    return url;
}

/** Build a public object URL without going through the DEV-proxied client. */
export function publicUrlForStorageObject(bucket, path) {
    const remote = remoteSupabaseUrl();
    const cleanPath = String(path || '').replace(/^\/+/, '');
    if (!remote || !bucket || !cleanPath) return null;
    return `${remote}/storage/v1/object/public/${bucket}/${cleanPath}`;
}

/** Normalize avatar / banner fields on a profile row (or plain object). */
export function normalizeProfileMediaUrls(profile) {
    if (!profile || typeof profile !== 'object') return profile;
    const next = { ...profile };
    if (next.avatar_url) next.avatar_url = toPublicStorageUrl(next.avatar_url);
    if (next.profile_header_url) next.profile_header_url = toPublicStorageUrl(next.profile_header_url);
    return next;
}

/**
 * Get avatar URL - passes through the public storage URL.
 * Supabase image transformations require Pro plan, so we use original URLs.
 */
export function getAvatarUrl(url, displaySize = 32) {
    // Just return the normalized public URL
    return toPublicStorageUrl(url);
}
