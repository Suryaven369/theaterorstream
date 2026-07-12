// Utility functions for generating and handling movie slugs

/**
 * Generate a URL-friendly slug from movie title and optional year
 * Example: "Greenland 2" -> "greenland-2"
 * Example: "Spider-Man: No Way Home", 2021 -> "spider-man-no-way-home-2021"
 */
export const generateSlug = (title, year = null) => {
    if (!title) return '';

    let slug = title
        .toLowerCase()
        .replace(/['']/g, '') // Remove apostrophes
        .replace(/[&]/g, 'and') // Replace & with 'and'
        .replace(/[:;,!?@#$%^*()+=\[\]{}|\\/<>~`"]/g, '') // Remove special chars
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single
        .replace(/^-+|-+$/g, ''); // Trim hyphens from start/end

    // Append year if provided (helps distinguish remakes)
    if (year) {
        slug = `${slug}-${year}`;
    }

    return slug;
};

/**
 * Generate slug with TMDB ID as fallback
 * This ensures unique URLs even for movies with same names
 * Example: "greenland-2-840464"
 */
export const generateSlugWithId = (title, tmdbId, year = null) => {
    const baseSlug = generateSlug(title, year);
    return `${baseSlug}-${tmdbId}`;
};

/**
 * Extract TMDB ID from slug (if it ends with a number)
 * Example: "greenland-2-840464" -> "840464"
 */
export const extractIdFromSlug = (slug) => {
    if (!slug) return null;

    // Match the last number in the slug (TMDB ID)
    const match = slug.match(/-(\d+)$/);
    return match ? match[1] : null;
};

/**
 * Get display slug (without ID) for cleaner URLs when ID is not needed
 */
export const getDisplaySlug = (title, year = null) => {
    return generateSlug(title, year);
};

/** Compact a UUID to 32 hex chars (no dashes). */
export const compactUuid = (uuid) => String(uuid || '').replace(/-/g, '').toLowerCase();

/** First 8 hex chars of a UUID — enough to uniquely resolve on the backend. */
export const shortThreadId = (uuid) => {
    const compact = compactUuid(uuid);
    return compact.length >= 8 ? compact.slice(0, 8) : '';
};

/** Restore dashes into a 32-char hex UUID. */
export const expandCompactUuid = (hex32 = '') => {
    const h = String(hex32 || '').replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(h)) return null;
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/** Cut a slug at a word boundary so share links stay short. */
export const truncateSlug = (slug, maxLen = 42) => {
    const s = String(slug || '');
    if (s.length <= maxLen) return s;
    const cut = s.slice(0, maxLen);
    const at = cut.lastIndexOf('-');
    const trimmed = (at > 16 ? cut.slice(0, at) : cut).replace(/-+$/g, '');
    return trimmed || s.slice(0, maxLen);
};

/**
 * Shareable thread slug: short title + short id (not the full UUID).
 * Examples:
 *   → "40-years-later-alien-sequel-0e81f1fb"
 *   Trailer → "superman-official-trailer-t1061474"
 */
export const generateThreadSlug = (title, { kind, id } = {}) => {
    const base = truncateSlug(generateSlug(String(title || '').slice(0, 80)) || kind || 'thread', 42);
    if (kind === 'trailer') {
        const tmdb = String(id || '').replace(/^trailer-/, '').replace(/^(movie|tv):/, '');
        return `${base}-t${tmdb}`;
    }
    const rawId = String(id || '').replace(/^article-/, '');
    const short = shortThreadId(rawId);
    if (short) return `${base}-${short}`;
    if (rawId) return `${base}-${generateSlug(rawId) || rawId}`;
    return base;
};

/**
 * Extract article/post UUID, short prefix, or trailer tmdb id from a thread slug.
 * Returns:
 *   { kind, id?, shortId?, legacy }
 * - id: full UUID when known
 * - shortId: 8-hex prefix when the URL uses the short form (resolve via DB)
 */
export const parseThreadSlug = (feedId = '') => {
    const raw = decodeURIComponent(String(feedId || '').trim());
    if (!raw) return null;

    // Legacy: article-{uuid}
    if (raw.startsWith('article-')) {
        const id = raw.slice('article-'.length);
        if (/^[0-9a-f-]{36}$/i.test(id)) return { kind: 'article', id, legacy: true };
    }
    // Legacy: trailer-{tmdb}
    if (raw.startsWith('trailer-')) {
        return { kind: 'trailer', id: raw.slice('trailer-'.length), legacy: true };
    }
    // Bare UUID → user post
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
        return { kind: 'post', id: raw, legacy: true };
    }
    // Shareable trailer: …-t{tmdbId}
    const trailerMatch = raw.match(/-t(\d+)$/);
    if (trailerMatch) {
        return { kind: 'trailer', id: trailerMatch[1], legacy: false };
    }
    // Legacy long form: …-{32hex}
    const compactMatch = raw.match(/-([0-9a-f]{32})$/i);
    if (compactMatch) {
        const id = expandCompactUuid(compactMatch[1]);
        if (id) return { kind: 'article_or_post', id, legacy: true };
    }
    // Short form: …-{8hex}  (preferred shareable links)
    const shortMatch = raw.match(/-([0-9a-f]{8})$/i);
    if (shortMatch) {
        return {
            kind: 'article_or_post',
            shortId: shortMatch[1].toLowerCase(),
            legacy: false,
        };
    }
    return { kind: 'post', id: raw, legacy: true };
};

export default {
    generateSlug,
    generateSlugWithId,
    extractIdFromSlug,
    getDisplaySlug,
    compactUuid,
    shortThreadId,
    expandCompactUuid,
    truncateSlug,
    generateThreadSlug,
    parseThreadSlug,
};
