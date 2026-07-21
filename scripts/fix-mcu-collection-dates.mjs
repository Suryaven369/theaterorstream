/**
 * Rewrite MCU collection_movies.added_at from bogus future years
 * to real TMDB release / first_air dates.
 *
 *   node scripts/fix-mcu-collection-dates.mjs
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

const sb = getSupabaseAdmin();
const maxYear = new Date().getFullYear() + 1;

const { data: collection, error: colErr } = await sb
  .from('user_collections')
  .select('id, name')
  .ilike('name', 'Marvel Cinematic Universe')
  .order('created_at', { ascending: true })
  .limit(1)
  .maybeSingle();

if (colErr || !collection) {
  console.error('Collection not found:', colErr?.message);
  process.exit(1);
}

const { data: items, error: itemsErr } = await sb
  .from('collection_movies')
  .select('id, movie_id, movie_title, media_type, added_at')
  .eq('collection_id', collection.id);

if (itemsErr) {
  console.error(itemsErr.message);
  process.exit(1);
}

const bad = (items || []).filter((row) => {
  const y = new Date(row.added_at).getFullYear();
  return Number.isFinite(y) && y > maxYear;
});

console.log(`MCU ${collection.id}: ${items?.length || 0} titles, ${bad.length} with future added_at`);

let fixed = 0;
let failed = 0;

for (const row of bad) {
  const mt = row.media_type === 'tv' ? 'tv' : 'movie';
  try {
    const detail = await fetchTmdbApi(`/${mt}/${row.movie_id}`);
    const rel = detail?.release_date || detail?.first_air_date;
    if (!rel) {
      console.warn(`no release date: ${row.movie_title} (${row.movie_id})`);
      failed += 1;
      continue;
    }
    const iso = new Date(`${rel}T12:00:00.000Z`).toISOString();
    const { error } = await sb
      .from('collection_movies')
      .update({ added_at: iso })
      .eq('id', row.id);
    if (error) {
      console.warn(`update failed ${row.movie_title}:`, error.message);
      failed += 1;
      continue;
    }
    fixed += 1;
    console.log(`  ${row.movie_title}: ${row.added_at?.slice(0, 10)} → ${rel}`);
  } catch (e) {
    console.warn(`tmdb fail ${row.movie_title}:`, e?.message || e);
    failed += 1;
  }
  await new Promise((r) => setTimeout(r, 120));
}

console.log(`Done. fixed=${fixed} failed=${failed}`);
