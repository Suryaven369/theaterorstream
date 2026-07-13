import * as cheerio from 'cheerio';
import { fetchTmdbApi } from './tmdb-server.js';

/**
 * Pull listicle section images that sit under year-stamped h2/h3 headings
 * (Collider / Variety style: 'Homecoming' (2018–2020) + hero still).
 */
export function extractListicleImagesFromHtml(bodyHtml) {
    if (!bodyHtml) return [];
    const $ = cheerio.load(`<div id="tos-root">${bodyHtml}</div>`);
    const root = $('#tos-root');
    const entries = [];

    root.find('h2, h3').each((_, heading) => {
        const raw = $(heading).text().replace(/\s+/g, ' ').trim();
        if (!/\(\s*\d{4}/.test(raw) && !/^[''"]/.test(raw)) return;

        let imageUrl = null;
        let el = $(heading).next();
        for (let i = 0; i < 12 && el.length; i += 1) {
            if (el.is('h2, h3')) break;
            const img = el.is('img') ? el : el.find('img').first();
            if (img.length) {
                imageUrl = pickImgUrl(img);
                if (imageUrl) break;
            }
            el = el.next();
        }

        entries.push({ rawHeading: raw, imageUrl });
    });

    return entries;
}

/**
 * Extract images from ALL h2/h3/h4 headings (for reason-based listicles).
 * More liberal - doesn't require year annotations.
 */
export function extractAllHeadingImages(bodyHtml) {
    if (!bodyHtml) return [];
    const $ = cheerio.load(`<div id="tos-root">${bodyHtml}</div>`);
    const root = $('#tos-root');
    const entries = [];

    root.find('h2, h3, h4').each((_, heading) => {
        const raw = $(heading).text().replace(/\s+/g, ' ').trim();
        // Strip leading numbers like "1. " or "#1 "
        const cleaned = raw.replace(/^[\d#.)\-\s]+/, '').trim();
        if (!cleaned || cleaned.length < 2) return;

        let imageUrl = null;
        let el = $(heading).next();
        // Look for image in next 12 sibling elements
        for (let i = 0; i < 12 && el.length; i += 1) {
            if (el.is('h2, h3, h4')) break;
            const img = el.is('img') ? el : el.find('img').first();
            if (img.length) {
                imageUrl = pickImgUrl(img);
                if (imageUrl) break;
            }
            el = el.next();
        }

        entries.push({ rawHeading: raw, cleanedHeading: cleaned, imageUrl });
    });

    return entries;
}

function pickImgUrl($img) {
    const candidates = [
        $img.attr('src'),
        $img.attr('data-src'),
        $img.attr('data-lazy-src'),
        $img.attr('data-original'),
        ($img.attr('srcset') || $img.attr('data-srcset') || '').split(',')[0]?.trim().split(/\s+/)[0],
    ].filter(Boolean);

    for (const c of candidates) {
        if (!/^https?:\/\//i.test(c)) continue;
        if (/svg|sprite|pixel|1x1|blank|data:image/i.test(c)) continue;
        return c;
    }
    return null;
}

async function tmdbPosterForTitle(title) {
    try {
        const data = await fetchTmdbApi('/search/multi', {
            query: title,
            include_adult: 'false',
            page: '1',
        });
        const match = (data?.results || []).find(
            (r) => (r.media_type === 'movie' || r.media_type === 'tv') && (r.poster_path || r.backdrop_path),
        );
        if (!match) return null;
        const path = match.poster_path || match.backdrop_path;
        return {
            imageUrl: `https://image.tmdb.org/t/p/w780${path}`,
            tmdbId: match.id,
            mediaType: match.media_type,
        };
    } catch {
        return null;
    }
}

/**
 * Search TMDB for a person (actor/director) and get their profile image.
 */
async function tmdbPersonImage(name) {
    try {
        const data = await fetchTmdbApi('/search/person', {
            query: name,
            include_adult: 'false',
            page: '1',
        });
        const match = (data?.results || []).find((r) => r.profile_path);
        if (!match) return null;
        return {
            imageUrl: `https://image.tmdb.org/t/p/w780${match.profile_path}`,
            tmdbId: match.id,
            mediaType: 'person',
        };
    } catch {
        return null;
    }
}

/**
 * Normalize text for fuzzy matching (lowercase, remove punctuation, collapse spaces).
 */
function normalizeForMatch(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[''"`"]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Build carousel slides for a listicle: titles from the text summarizer +
 * images from the article HTML, with TMDB fallback (movie/TV or person).
 */
export async function buildListicleSummaryItems(titles, bodyHtml) {
    const list = Array.isArray(titles) ? titles.filter(Boolean) : [];
    if (!list.length) return [];

    const { resolveListEntry } = await import('../../src/lib/articleSummary.js');
    
    // Extract images using both methods
    const fromYearHeadings = extractListicleImagesFromHtml(bodyHtml);
    const fromAllHeadings = extractAllHeadingImages(bodyHtml);

    // Build lookup maps for matching titles to images
    const htmlByTitle = new Map();
    const htmlByNormalized = new Map();
    
    // From year-stamped headings (movie titles)
    for (const row of fromYearHeadings) {
        const t = resolveListEntry(row.rawHeading);
        if (t && row.imageUrl) htmlByTitle.set(t.toLowerCase(), row.imageUrl);
    }
    
    // From all headings (full text match)
    for (const row of fromAllHeadings) {
        if (row.imageUrl) {
            // Store by both raw and cleaned heading
            htmlByNormalized.set(normalizeForMatch(row.rawHeading), row.imageUrl);
            htmlByNormalized.set(normalizeForMatch(row.cleanedHeading), row.imageUrl);
        }
    }

    const items = [];
    for (const title of list) {
        let imageUrl = null;
        let tmdbId = null;
        let mediaType = null;

        // Try exact match first
        imageUrl = htmlByTitle.get(title.toLowerCase()) || null;
        
        // Try normalized match for full headings
        if (!imageUrl) {
            imageUrl = htmlByNormalized.get(normalizeForMatch(title)) || null;
        }
        
        // Try partial match (title contained in heading or vice versa)
        if (!imageUrl) {
            const normalizedTitle = normalizeForMatch(title);
            for (const [key, url] of htmlByNormalized.entries()) {
                if (key.includes(normalizedTitle) || normalizedTitle.includes(key)) {
                    imageUrl = url;
                    break;
                }
            }
        }

        // TMDB fallback
        if (!imageUrl) {
            // Try movie/TV search first
            const tmdb = await tmdbPosterForTitle(title);
            if (tmdb) {
                imageUrl = tmdb.imageUrl;
                tmdbId = tmdb.tmdbId;
                mediaType = tmdb.mediaType;
            } else {
                // Try person search (for actor listicles)
                const person = await tmdbPersonImage(title);
                if (person) {
                    imageUrl = person.imageUrl;
                    tmdbId = person.tmdbId;
                    mediaType = person.mediaType;
                }
            }
        }

        items.push({ title, imageUrl, tmdbId, mediaType });
    }

    return items;
}
