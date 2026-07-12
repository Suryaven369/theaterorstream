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
        if (!/\(\s*\d{4}/.test(raw) && !/^[‘'"]/.test(raw)) return;

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
 * Build carousel slides for a listicle: titles from the text summarizer +
 * images from the article HTML, with TMDB poster fallback.
 */
export async function buildListicleSummaryItems(titles, bodyHtml) {
    const list = Array.isArray(titles) ? titles.filter(Boolean) : [];
    if (!list.length) return [];

    const { resolveListEntry } = await import('../../src/lib/articleSummary.js');
    const fromHtml = extractListicleImagesFromHtml(bodyHtml);

    const htmlByTitle = new Map();
    for (const row of fromHtml) {
        const t = resolveListEntry(row.rawHeading);
        if (t && row.imageUrl) htmlByTitle.set(t.toLowerCase(), row.imageUrl);
    }

    const items = [];
    for (const title of list) {
        let imageUrl = htmlByTitle.get(title.toLowerCase()) || null;
        let tmdbId = null;
        let mediaType = null;

        if (!imageUrl) {
            const tmdb = await tmdbPosterForTitle(title);
            if (tmdb) {
                imageUrl = tmdb.imageUrl;
                tmdbId = tmdb.tmdbId;
                mediaType = tmdb.mediaType;
            }
        }

        items.push({ title, imageUrl, tmdbId, mediaType });
    }

    return items;
}
