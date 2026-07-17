/**
 * Movie + TV detail URLs from movies_library (+ homepage section fallback).
 */
import {
    SITE,
    todayIso,
    toDate,
    moviePath,
    urlEntry,
    wrapUrlset,
    xmlResponse,
    getSupabase,
    fetchAllRows,
} from './_lib/sitemap-utils.js';

export const config = {
    runtime: 'edge',
};

function pathFromRow(row) {
    const year = (row.release_date || row.first_air_date || '').slice(0, 4) || null;
    return moviePath(row.title, row.tmdb_id, year, row.media_type);
}

export default async function handler() {
    const today = todayIso();
    const paths = new Map(); // path -> lastmod
    const supabase = getSupabase();

    if (supabase) {
        try {
            const library = await fetchAllRows(
                (from, to) =>
                    supabase
                        .from('movies_library')
                        .select('tmdb_id, title, media_type, release_date, first_air_date, updated_at, popularity')
                        .not('title', 'is', null)
                        .order('popularity', { ascending: false })
                        .range(from, to),
                { pageSize: 1000, maxRows: 4000 },
            );

            for (const row of library) {
                const path = pathFromRow(row);
                if (path) paths.set(path, toDate(row.updated_at));
            }
        } catch (err) {
            console.error('sitemap-movies library:', err);
        }

        // Also pull homepage rails so newly featured titles are never missed
        try {
            const { data: sections } = await supabase
                .from('homepage_sections')
                .select('movies_by_region, updated_at')
                .eq('is_active', true);

            for (const section of sections || []) {
                const lastmod = toDate(section.updated_at);
                const byRegion = section.movies_by_region || {};
                for (const regionMovies of Object.values(byRegion)) {
                    if (!Array.isArray(regionMovies)) continue;
                    for (const movie of regionMovies) {
                        if (!movie?.tmdb_id || !movie?.title) continue;
                        const year = movie.release_date?.split('-')[0] || null;
                        const path = moviePath(movie.title, movie.tmdb_id, year, movie.media_type);
                        if (path && !paths.has(path)) paths.set(path, lastmod);
                    }
                }
            }
        } catch (err) {
            console.error('sitemap-movies sections:', err);
        }
    }

    const entries = [...paths.entries()].map(([path, lastmod]) =>
        urlEntry({
            loc: `${SITE}${path}`,
            lastmod: lastmod || today,
            changefreq: 'monthly',
            priority: '0.7',
        }),
    );

    return xmlResponse(wrapUrlset(entries));
}
