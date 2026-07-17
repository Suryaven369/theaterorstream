import { createClient } from '@supabase/supabase-js';

export const SITE = 'https://www.theaterorstream.com';

export function getSupabase() {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
}

export function todayIso() {
    return new Date().toISOString().split('T')[0];
}

export function toDate(value) {
    if (!value) return todayIso();
    try {
        return new Date(value).toISOString().split('T')[0];
    } catch {
        return todayIso();
    }
}

/** Match client `createSlug` for user lists / collections. */
export function createListSlug(text) {
    const slug = String(text || '')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
    return slug || 'collection';
}

/** Match client `generateSlugWithId` for movie/TV detail URLs. */
export function moviePath(title, tmdbId, year, mediaType) {
    if (!tmdbId || !title) return null;
    let slug = String(title)
        .toLowerCase()
        .replace(/['']/g, '')
        .replace(/[&]/g, 'and')
        .replace(/[:;,!?@#$%^*()+=\[\]{}|\\/<>~`"]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (year) slug = `${slug}-${year}`;
    slug = `${slug}-${tmdbId}`;
    const prefix = mediaType === 'tv' ? 'tv' : 'movies';
    return `/${prefix}/${slug}`;
}

export function urlEntry({ loc, lastmod, changefreq, priority }) {
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>
`;
}

export function wrapUrlset(entries) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('')}</urlset>`;
}

export function wrapSitemapIndex(sitemaps) {
    const body = sitemaps
        .map(
            (s) => `  <sitemap>
    <loc>${s.loc}</loc>
    <lastmod>${s.lastmod}</lastmod>
  </sitemap>
`,
        )
        .join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}</sitemapindex>`;
}

export function xmlResponse(body) {
    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
    });
}

/** Paginate Supabase selects (anon key; stay under edge time limits). */
export async function fetchAllRows(queryFactory, { pageSize = 1000, maxRows = 5000 } = {}) {
    const rows = [];
    for (let from = 0; from < maxRows; from += pageSize) {
        const to = Math.min(from + pageSize - 1, maxRows - 1);
        const { data, error } = await queryFactory(from, to);
        if (error || !data?.length) break;
        rows.push(...data);
        if (data.length < pageSize) break;
    }
    return rows;
}
