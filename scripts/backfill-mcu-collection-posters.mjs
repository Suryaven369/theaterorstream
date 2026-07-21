/**
 * Backfill missing posters on the MCU collection from TMDB.
 *
 * Usage (from repo root, with .env / .env.local):
 *   node scripts/backfill-mcu-collection-posters.mjs
 *
 * Needs: VITE_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
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

const { getSupabaseAdmin } = await import('../api/_lib/supabase-admin.js');
const { fetchTmdbApi } = await import('../api/_lib/tmdb-server.js');

const COLLECTION_NAME = 'Marvel Cinematic Universe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sb = getSupabaseAdmin();

const { data: collection, error: colErr } = await sb
    .from('user_collections')
    .select('id, name')
    .ilike('name', COLLECTION_NAME)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

if (colErr || !collection) {
    console.error('Collection not found:', colErr?.message || COLLECTION_NAME);
    process.exit(1);
}

const { data: items, error: itemsErr } = await sb
    .from('collection_movies')
    .select('id, movie_id, movie_title, poster_path, media_type, added_at')
    .eq('collection_id', collection.id);

if (itemsErr) {
    console.error('Failed to load collection_movies:', itemsErr.message);
    process.exit(1);
}

const missing = (items || []).filter((row) => !row.poster_path);
console.log(`MCU collection ${collection.id}: ${items?.length || 0} titles, ${missing.length} missing posters`);

let updated = 0;
let failed = 0;

for (const row of missing) {
    const mediaType = row.media_type === 'tv' ? 'tv' : 'movie';
    const tmdbId = String(row.movie_id);

    try {
        const detail = await fetchTmdbApi(`/${mediaType}/${tmdbId}`);
        const poster = detail?.poster_path || null;
        const title = detail?.title || detail?.name || row.movie_title;
        const release = detail?.release_date || detail?.first_air_date || null;

        if (!poster) {
            console.warn(`No poster from TMDB for ${mediaType}/${tmdbId} (${row.movie_title})`);
            failed += 1;
            await sleep(120);
            continue;
        }

        const { error: upErr } = await sb
            .from('collection_movies')
            .update({
                poster_path: poster,
                movie_title: title,
                // Real release timestamp for "Released YYYY" / chronological sort
                added_at: release ? new Date(`${release}T12:00:00.000Z`).toISOString() : row.added_at,
            })
            .eq('id', row.id);

        if (upErr) {
            console.warn(`Update failed ${tmdbId}:`, upErr.message);
            failed += 1;
        } else {
            updated += 1;
            process.stdout.write('.');
        }

        // Also upsert a thin library row so future hydrates work
        await sb.from('movies_library').upsert(
            {
                tmdb_id: tmdbId,
                title,
                poster_path: poster,
                media_type: mediaType,
                release_date: mediaType === 'movie' ? release : null,
                first_air_date: mediaType === 'tv' ? release : null,
                is_active: true,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'tmdb_id,media_type' },
        );
    } catch (err) {
        console.warn(`\nTMDB failed ${mediaType}/${tmdbId}:`, err.message);
        failed += 1;
    }

    await sleep(150);
}

// Also refresh posters that exist in library but are still empty on the collection
const { data: stillMissing } = await sb
    .from('collection_movies')
    .select('id, movie_id, poster_path')
    .eq('collection_id', collection.id)
    .is('poster_path', null);

if (stillMissing?.length) {
    const ids = stillMissing.map((r) => String(r.movie_id));
    const { data: lib } = await sb
        .from('movies_library')
        .select('tmdb_id, poster_path, title')
        .in('tmdb_id', ids);
    const byId = new Map((lib || []).map((m) => [String(m.tmdb_id), m]));
    for (const row of stillMissing) {
        const hit = byId.get(String(row.movie_id));
        if (!hit?.poster_path) continue;
        await sb
            .from('collection_movies')
            .update({ poster_path: hit.poster_path, movie_title: hit.title || undefined })
            .eq('id', row.id);
        updated += 1;
    }
}

console.log(`\nDone. posters updated=${updated} failed=${failed}`);
