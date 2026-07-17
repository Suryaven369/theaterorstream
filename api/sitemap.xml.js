/**
 * Sitemap index for Google Search Console.
 * Submit: https://www.theaterorstream.com/sitemap.xml
 */
import { SITE, todayIso, wrapSitemapIndex, xmlResponse } from './_lib/sitemap-utils.js';

export const config = {
    runtime: 'edge',
};

export default async function handler() {
    const lastmod = todayIso();
    const body = wrapSitemapIndex([
        { loc: `${SITE}/sitemap-pages.xml`, lastmod },
        { loc: `${SITE}/sitemap-movies.xml`, lastmod },
        { loc: `${SITE}/sitemap-lists.xml`, lastmod },
        { loc: `${SITE}/sitemap-community.xml`, lastmod },
    ]);
    return xmlResponse(body);
}
