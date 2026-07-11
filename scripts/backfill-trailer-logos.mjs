// One-off: stamp existing trailer_posts with their source channel logo.
// Run AFTER applying migration 20260703000000_trailer_post_source_logo.sql:
//   node scripts/backfill-trailer-logos.mjs
import fs from 'node:fs';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;

const { getSupabaseAdmin } = await import('../api/_lib/supabase-admin.js');
const sb = getSupabaseAdmin();

const probe = await sb.from('trailer_posts').select('source_logo').limit(1);
if (probe.error) {
    console.error('source_logo column missing — apply migration 20260703000000 first.');
    process.exit(1);
}

const { data: src } = await sb.from('rss_sources').select('name, logo_url').eq('source_kind', 'trailer');
const logoByName = new Map((src || []).map((s) => [s.name, s.logo_url]));

const { data: posts } = await sb.from('trailer_posts').select('media_type, tmdb_id, source_name, source_logo');
let updated = 0;
for (const p of posts || []) {
    const logo = logoByName.get(p.source_name);
    if (logo && p.source_logo !== logo) {
        await sb.from('trailer_posts').update({ source_logo: logo }).eq('media_type', p.media_type).eq('tmdb_id', p.tmdb_id);
        updated++;
    }
}
console.log('trailer_posts source_logo backfilled:', updated);
