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
 * Transform a Supabase storage URL to use the render endpoint for optimized images.
 * Adds width/height/quality params for crisp display at target size.
 * @param {string} url - Original storage URL
 * @param {object} options - { width, height, quality, resize }
 * @returns {string} - Transformed URL or original if not a Supabase storage URL
 */
export function getOptimizedImageUrl(url, { width = 200, height = 200, quality = 85, resize = 'cover' } = {}) {
    if (!url || typeof url !== 'string') return url || null;
    
    // Only transform Supabase storage URLs
    const storageMatch = url.match(/^(https:\/\/[^/]+)\/storage\/v1\/object\/public\/([^?]+)/);
    if (!storageMatch) return url;
    
    const [, baseUrl, path] = storageMatch;
    // Use render endpoint for image transformations
    return `${baseUrl}/storage/v1/render/image/public/${path}?width=${width}&height=${height}&quality=${quality}&resize=${resize}`;
}

/**
 * Get avatar URL optimized for display size.
 * Uses 2x resolution for retina displays.
 */
export function getAvatarUrl(url, displaySize = 32) {
    // Request 2x for retina displays
    const size = displaySize * 2;
    return getOptimizedImageUrl(url, { width: size, height: size, quality: 90, resize: 'cover' });
}
