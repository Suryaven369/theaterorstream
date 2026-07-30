/**
 * Pure trailer eligibility helpers — Edge-safe (no node:http / node:https).
 * Kept out of rss-server.js so api/content (Edge) can import without Node APIs.
 */

/** Pull a 20xx year from a YouTube trailer title (e.g. "Official Trailer (2026)"). */
export function extractTrailerTitleYear(rawTitle) {
    if (!rawTitle) return null;
    const s = String(rawTitle);
    const paren = s.match(/\(\s*(20\d{2})\s*\)/);
    if (paren) return parseInt(paren[1], 10);
    const years = [...s.matchAll(/\b(20\d{2})\b/g)].map((m) => parseInt(m[1], 10));
    return years.length ? Math.max(...years) : null;
}

/**
 * Only accept trailers for current-year+ releases — skip classics, retrospectives,
 * and TMDB matches whose release/first-air year is in the past.
 */
export function isEligibleTrailerRelease(match, rawTitle) {
    if (!match) return false;
    const currentYear = new Date().getFullYear();
    const title = String(rawTitle || '');

    if (/\b(retrospective|classic trailer|restored|4k restoration|re-release|reissue|anniversary edition|look back|flashback)\b/i.test(title)) {
        return false;
    }

    const titleYear = extractTrailerTitleYear(title);
    const releaseDate = match.release_date || match.first_air_date || null;
    const releaseYear = releaseDate ? parseInt(String(releaseDate).slice(0, 4), 10) : null;

    // Studio titles often tag the launch year even when TMDB first_air_date is old (revivals).
    if (titleYear && titleYear >= currentYear) return true;

    if (releaseYear && releaseYear >= currentYear) return true;

    return false;
}
