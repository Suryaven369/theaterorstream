/**
 * Public lists (collections) + boards + admin CMS collections.
 */
import {
    SITE,
    todayIso,
    toDate,
    createListSlug,
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
    const seen = new Set();
    const supabase = getSupabase();

    const push = (path, lastmod, changefreq, priority) => {
        if (!path || seen.has(path)) return;
        seen.add(path);
        entries.push(
            urlEntry({
                loc: `${SITE}${path}`,
                lastmod: lastmod || today,
                changefreq,
                priority,
            }),
        );
    };

    if (supabase) {
        // User public lists → /collection/:slug
        try {
            const lists = await fetchAllRows(
                (from, to) =>
                    supabase
                        .from('user_collections')
                        .select('name, updated_at, is_system, collection_kind')
                        .eq('is_public', true)
                        .order('updated_at', { ascending: false })
                        .range(from, to),
                { pageSize: 500, maxRows: 2000 },
            );

            for (const list of lists) {
                if (list.is_system || list.collection_kind === 'watched_in_theater') continue;
                const slug = createListSlug(list.name);
                push(`/collection/${slug}`, toDate(list.updated_at), 'weekly', '0.7');
            }
        } catch (err) {
            console.error('sitemap-lists user_collections:', err);
        }

        // Public boards → /boards/:slug
        try {
            const boards = await fetchAllRows(
                (from, to) =>
                    supabase
                        .from('boards')
                        .select('slug, updated_at')
                        .eq('is_public', true)
                        .not('slug', 'is', null)
                        .order('updated_at', { ascending: false })
                        .range(from, to),
                { pageSize: 500, maxRows: 2000 },
            );

            for (const board of boards) {
                if (!board.slug) continue;
                push(`/boards/${board.slug}`, toDate(board.updated_at), 'weekly', '0.75');
            }
        } catch (err) {
            console.error('sitemap-lists boards:', err);
        }

        // Admin CMS collections (if present) — same /collection/:slug surface when slug exists
        try {
            const { data: cms } = await supabase
                .from('collections')
                .select('slug, updated_at')
                .not('slug', 'is', null)
                .order('updated_at', { ascending: false })
                .limit(500);

            for (const c of cms || []) {
                if (!c.slug) continue;
                push(`/collection/${c.slug}`, toDate(c.updated_at), 'weekly', '0.8');
            }
        } catch (err) {
            console.error('sitemap-lists cms collections:', err);
        }
    }

    return xmlResponse(wrapUrlset(entries));
}
