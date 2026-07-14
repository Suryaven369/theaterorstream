export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';

const TMDB_SIZE_PATTERN = /\/t\/p\/w\d+\//;

/**
 * Pick the highest-voted poster from TMDB images, falling back to poster_path.
 */
export function pickBestPosterPath(movieData) {
    if (!movieData) return null;

    const posters = movieData.images?.posters;
    if (Array.isArray(posters) && posters.length > 0) {
        const ranked = [...posters]
            .filter((p) => p?.file_path)
            .sort((a, b) => {
                const langScore = (p) => {
                    const lang = p.iso_639_1;
                    if (lang === null || lang === 'en') return 2;
                    if (lang === 'hi') return 1;
                    return 0;
                };
                const scoreDiff = langScore(b) - langScore(a);
                if (scoreDiff !== 0) return scoreDiff;
                return (b.vote_count || 0) - (a.vote_count || 0);
            });
        if (ranked[0]?.file_path) return ranked[0].file_path;
    }

    return movieData.poster_path || null;
}

export const convertImageToBase64 = async (imageUrl) => {
    if (!imageUrl) return null;

    try {
        const response = await fetch(imageUrl, {
            mode: 'cors', // TMDB allows CORS
            cache: 'force-cache'
        });

        if (!response.ok) throw new Error('Failed to fetch image');

        const blob = await response.blob();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.warn('Image conversion failed:', error);
        return null;
    }
};

// Helper to determine optimized image source
export const getOptimizedImage = (path, base64, baseUrl) => {
    return resolveTmdbImageUrl(path, { base64, baseUrl });
};

/**
 * Build a TMDB CDN URL from a path or full URL.
 * Matches Card.jsx behavior: poster_path first, then valid base64, with fallback base URL.
 */
export const resolveTmdbImageUrl = (path, options = {}) => {
    const {
        base64 = null,
        baseUrl = null,
        size = 'original',
    } = options;

    const fallbackBase = `${TMDB_IMAGE_BASE}${size}`;

    if (path) {
        if (path.startsWith('data:')) return path;
        if (path.startsWith('http')) {
            if (TMDB_SIZE_PATTERN.test(path)) {
                return path.replace(TMDB_SIZE_PATTERN, `/t/p/${size}/`);
            }
            return path;
        }
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        const prefix = (baseUrl || fallbackBase).replace(/\/$/, '');
        return `${prefix}${normalizedPath}`;
    }

    if (base64 && typeof base64 === 'string' && base64.startsWith('data:image') && base64.length > 32) {
        return base64;
    }

    return null;
};
