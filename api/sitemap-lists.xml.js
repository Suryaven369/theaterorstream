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
                        .select('name, user_id, updated_at, is_system, collection_kind, is_watch_party')
                        .eq('is_public', true)
                        .order('updated_at', { ascending: false })
                        .range(from, to),
                { pageSize: 500, maxRows: 2000 },
            );

            // Same address the app uses: /collection/{list-name}?u=owner
            // (names are only unique per owner, so ?u= is required).
            const ownerIds = [...new Set(lists.map((l) => l.user_id).filter(Boolean))];
            const usernames = new Map();
            for (let i = 0; i < ownerIds.length; i += 200) {
                const { data: profiles } = await supabase
                    .from('user_profiles')
                    .select('id, username')
                    .in('id', ownerIds.slice(i, i + 200));
                (profiles || []).forEach((p) => usernames.set(p.id, p.username));
            }

            for (const list of lists) {
                if (list.is_system || list.collection_kind === 'watched_in_theater' || list.is_watch_party) continue;
                const slug = createListSlug(list.name);
                const owner = usernames.get(list.user_id);
                if (!slug || !owner) continue;
                push(`/collection/${slug}?u=${encodeURIComponent(owner)}`, toDate(list.updated_at), 'weekly', '0.7');
            }
        } catch (err) {
            console.error('sitemap-lists user_collections:', err);
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
