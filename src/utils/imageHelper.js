export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';

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
            if (size !== 'original') {
                return path
                    .replace('/original/', `/${size}/`)
                    .replace('/w780/', `/${size}/`)
                    .replace('/w500/', `/${size}/`);
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
