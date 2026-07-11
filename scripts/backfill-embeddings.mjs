/**
 * Resumable movie-embedding backfill.
 *
 * Embeds movies_library rows that don't yet have an embedding, popular-first,
 * throttled for the free Gemini tier. Stops cleanly when the daily quota is
 * hit — only ever processes rows with a NULL embedding, so it's safe to run
 * again tomorrow until everything is covered.
 *
 *   node scripts/backfill-embeddings.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load .env (and .env.local) without requiring dotenv.
for (const file of ['.env', '.env.local']) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const i = t.indexOf('=');
        if (i <= 0) continue;
        const k = t.slice(0, i).trim();
        if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
}
if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
}

const BATCH = 400;
const THROTTLE_MS = 110;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { getSupabaseAdmin } = await import(`file://${root}/api/_lib/supabase-admin.js`);
const { buildMovieDocument, embedTextWithProvider, isEmbeddingConfigured } = await import(`file://${root}/api/_lib/embedding-server.js`);

if (!isEmbeddingConfigured()) {
    console.error('No embedding provider configured. Set GEMINI_API_KEY (free) in .env');
    process.exit(1);
}

const sb = getSupabaseAdmin();
const start = Date.now();
let totalOk = 0;
let totalFail = 0;
let round = 0;

while (true) {
    const { data: movies, error } = await sb.from('movies_library')
        .select('tmdb_id, title, overview, genres, genre_ids, mood_tags, original_language')
        .eq('is_active', true).is('embedding', null)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(BATCH);

    if (error) { console.error('query failed:', error.message); break; }
    if (!movies?.length) { console.log('✓ ALL MOVIES EMBEDDED.'); break; }

    round += 1;
    let ok = 0;
    let quotaHit = false;

    for (const m of movies) {
        try {
            const { vector, provider } = await embedTextWithProvider(buildMovieDocument(m), 'document');
            const { error: upErr } = await sb.from('movies_library')
                .update({ embedding: `[${vector.join(',')}]`, embedding_provider: provider })
                .eq('tmdb_id', m.tmdb_id);
            if (upErr) totalFail += 1; else { ok += 1; totalOk += 1; }
        } catch (e) {
            totalFail += 1;
            if (/429|RESOURCE_EXHAUSTED|quota/i.test(e.message)) {
                console.log(`\nDaily quota reached after ${totalOk} embeds. Run again tomorrow to continue.`);
                quotaHit = true;
                break;
            }
        }
        await sleep(THROTTLE_MS);
    }

    const left = await sb.from('movies_library').select('tmdb_id', { count: 'exact', head: true })
        .eq('is_active', true).is('embedding', null);
    console.log(`round ${round}: +${ok} | total ${totalOk} | remaining ${left.count} | ${Math.round((Date.now() - start) / 1000)}s`);

    if (quotaHit) break;
}

console.log(`\nDone: ${totalOk} embedded, ${totalFail} failed, in ${Math.round((Date.now() - start) / 60000)} min.`);
process.exit(0);
