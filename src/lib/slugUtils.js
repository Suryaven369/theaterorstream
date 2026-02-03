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

export default {
    generateSlug,
    generateSlugWithId,
    extractIdFromSlug,
    getDisplaySlug
};
