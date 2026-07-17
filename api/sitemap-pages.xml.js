/**
 * Static / hub pages for Google Search Console.
 */
import { SITE, todayIso, urlEntry, wrapUrlset, xmlResponse } from './_lib/sitemap-utils.js';

export const config = {
    runtime: 'edge',
};

const STATIC_PAGES = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/upcoming', priority: '0.9', changefreq: 'daily' },
    { url: '/coming-soon', priority: '0.9', changefreq: 'daily' },
    { url: '/search', priority: '0.8', changefreq: 'weekly' },
    { url: '/feed', priority: '0.8', changefreq: 'hourly' },
    { url: '/boards', priority: '0.8', changefreq: 'daily' },
    { url: '/tags', priority: '0.7', changefreq: 'daily' },
    { url: '/parent-guide', priority: '0.8', changefreq: 'weekly' },
    { url: '/parent-guide/violence', priority: '0.6', changefreq: 'weekly' },
    { url: '/parent-guide/sex-nudity', priority: '0.6', changefreq: 'weekly' },
    { url: '/parent-guide/profanity', priority: '0.6', changefreq: 'weekly' },
    { url: '/parent-guide/frightening', priority: '0.6', changefreq: 'weekly' },
    { url: '/about', priority: '0.5', changefreq: 'monthly' },
    { url: '/privacy', priority: '0.3', changefreq: 'yearly' },
    { url: '/terms', priority: '0.3', changefreq: 'yearly' },
    { url: '/attributions', priority: '0.3', changefreq: 'yearly' },
];

export default async function handler() {
    const today = todayIso();
    const entries = STATIC_PAGES.map((page) =>
        urlEntry({
            loc: `${SITE}${page.url}`,
            lastmod: today,
            changefreq: page.changefreq,
            priority: page.priority,
        }),
    );
    return xmlResponse(wrapUrlset(entries));
}
