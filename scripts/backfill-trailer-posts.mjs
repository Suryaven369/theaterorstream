// One-off: populate trailer_posts from already-verified trailer feed_articles.
// Run AFTER applying migration 20260626000000_trailer_posts.sql:
//   node scripts/backfill-trailer-posts.mjs
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
const { fetchTmdbApi } = await import('../api/_lib/tmdb-server.js');
const { extractYouTubeKey } = await import('../api/_lib/rss-server.js');
const sb = getSupabaseAdmin();

// verified trailer entries (have a tmdb_id) that are PLAYABLE YouTube links
const { data: allArts } = await sb
    .from('feed_articles')
    .select('tmdb_id, media_type, title, link, published_at, source_name')
    .not('tmdb_id', 'is', null)
    .order('published_at', { ascending: false });
const arts = (allArts || []).filter((a) => extractYouTubeKey(a.link));

console.log('verified YouTube trailer articles:', arts.length, `(of ${allArts?.length || 0} total)`);

// newest trailer per (media_type, tmdb_id)
const byKey = new Map();
for (const a of arts) {
    const k = `${a.media_type || 'movie'}:${a.tmdb_id}`;
    if (!byKey.has(k)) byKey.set(k, a);
}

const rows = [];
for (const a of byKey.values()) {
    const mt = a.media_type || 'movie';
    let d = {};
    try { d = await fetchTmdbApi(`/${mt}/${a.tmdb_id}`, {}); } catch {}
    const ytId = extractYouTubeKey(a.link);
    rows.push({
        tmdb_id: String(a.tmdb_id),
        media_type: mt,
        title: d.title || d.name || a.title,
        poster_path: d.poster_path || null,
        backdrop_path: d.backdrop_path || null,
        release_date: d.release_date || d.first_air_date || null,
        overview: d.overview || null,
        vote_average: d.vote_average ?? null,
        youtube_key: ytId,
        trailer_name: a.title,
        trailer_type: /teaser/i.test(a.title || '') ? 'Teaser' : 'Trailer',
        trailer_url: a.link,
        source_name: a.source_name,
        published_at: a.published_at,
        updated_at: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 100));
}

const { error } = await sb.from('trailer_posts').upsert(rows, { onConflict: 'media_type,tmdb_id' });
if (error) { console.error('upsert failed:', error.message); process.exit(1); }
console.log('trailer_posts written:', rows.length);
rows.slice(0, 12).forEach((r) => console.log('  •', r.title, `(#${r.tmdb_id})`, 'yt:' + (r.youtube_key || 'none'), 'via', r.source_name));
