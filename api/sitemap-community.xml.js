/**
 * Public blogs + hashtag discover pages.
 */
import {
    SITE,
    todayIso,
    toDate,
    urlEntry,
    wrapUrlset,
    xmlResponse,
    getSupabase,
    fetchAllRows,
} from './_lib/sitemap-utils.js';

export const config = {
    runtime: 'edge',
};

export default async function handler() {
    const today = todayIso();
    const entries = [];
    const supabase = getSupabase();

    if (supabase) {
        try {
            const blogs = await fetchAllRows(
                (from, to) =>
                    supabase
                        .from('blog_posts')
                        .select('id, updated_at, created_at')
                        .eq('visibility', 'public')
                        .order('updated_at', { ascending: false })
                        .range(from, to),
                { pageSize: 500, maxRows: 2000 },
            );

            for (const blog of blogs) {
                entries.push(
                    urlEntry({
                        loc: `${SITE}/blog/${blog.id}`,
                        lastmod: toDate(blog.updated_at || blog.created_at),
                        changefreq: 'weekly',
                        priority: '0.65',
                    }),
                );
            }
        } catch (err) {
            console.error('sitemap-community blogs:', err);
        }

        try {
            const tags = await fetchAllRows(
                (from, to) =>
                    supabase
                        .from('hashtags')
                        .select('slug, updated_at, posts_count')
                        .gt('posts_count', 0)
                        .not('slug', 'is', null)
                        .order('posts_count', { ascending: false })
                        .range(from, to),
                { pageSize: 500, maxRows: 1500 },
            );

            for (const tag of tags) {
                if (!tag.slug) continue;
                entries.push(
                    urlEntry({
                        loc: `${SITE}/tag/${encodeURIComponent(tag.slug)}`,
                        lastmod: toDate(tag.updated_at),
                        changefreq: 'weekly',
                        priority: '0.55',
                    }),
                );
            }
        } catch (err) {
            console.error('sitemap-community hashtags:', err);
        }
    }

    if (!entries.length) {
        entries.push(
            urlEntry({
                loc: `${SITE}/tags`,
                lastmod: today,
                changefreq: 'daily',
                priority: '0.5',
            }),
        );
    }

    return xmlResponse(wrapUrlset(entries));
}
