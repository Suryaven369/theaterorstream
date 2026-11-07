/**
 * Import a title into movies_library from an IMDb id (via TMDB /find).
 *
 * Usage:
 *   node scripts/import-by-imdb.mjs tt1579592
 *
 * Needs: SUPABASE_URL / VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *        TMDB_ACCESS_TOKEN or TMDB_API_KEY
 */
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFiles() {
    for (const file of ['.env', '.env.local']) {
        const p = path.resolve(file);
        if (!fs.existsSync(p)) continue;
        for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
            const t = line.trim();
            if (!t || t.startsWith('#')) continue;
            const i = t.indexOf('=');
            if (i <= 0) continue;
            const k = t.slice(0, i).trim();
            if (k in process.env) continue;
            process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
        }
    }
    if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
        process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    }
}

loadEnvFiles();

const imdbId = String(process.argv[2] || '').trim();
if (!/^tt\d+$/i.test(imdbId)) {
    console.error('Usage: node scripts/import-by-imdb.mjs tt1579592');
    process.exit(1);
}

const { getSupabaseAdmin } = await import('../api/_lib/supabase-admin.js');
const { fetchTmdbApi } = await import('../api/_lib/tmdb-server.js');
const { mapFullTmdbToLibraryRecord, upsertLibraryRecord } = await import('../api/_lib/movie-library-server.js');

const find = await fetchTmdbApi(`/find/${imdbId}`, { external_source: 'imdb_id' });
const movieHit = find?.movie_results?.[0];
const tvHit = find?.tv_results?.[0];
const hit = movieHit || tvHit;
const mediaType = movieHit ? 'movie' : tvHit ? 'tv' : null;

if (!hit?.id || !mediaType) {
    console.error('No TMDB match for', imdbId, find);
    process.exit(1);
}

console.log(`Found TMDB ${mediaType}/${hit.id}: ${hit.title || hit.name} (${(hit.release_date || hit.first_air_date || '').slice(0, 4)})`);

const full = await fetchTmdbApi(`/${mediaType}/${hit.id}`, {
    append_to_response: 'credits,videos,release_dates,keywords,external_ids',
});
if (!full?.id) {
    console.error('Failed to fetch TMDB detail for', hit.id);
    process.exit(1);
}

const record = mapFullTmdbToLibraryRecord(full, mediaType);
const sb = getSupabaseAdmin();
const row = await upsertLibraryRecord(sb, record);

console.log('Saved to movies_library:', {
    tmdb_id: row?.tmdb_id || record.tmdb_id,
    title: row?.title || record.title,
    imdb_id: row?.imdb_id || record.imdb_id,
    release_date: row?.release_date || record.release_date,
    original_language: row?.original_language || record.original_language,
});
