/**
 * Re-embed the whole movies_library with OpenAI text-embedding-3-small (512 dims).
 *
 * Resumable: only rows whose embedding_provider isn't 'openai' are processed,
 * so it can be stopped and re-run safely. Walks the table by tmdb_id (keyset
 * pagination, ids only), loads full rows per batch of 100, embeds the batch in
 * one OpenAI call and writes vectors back with bounded concurrency.
 *
 *   node scripts/reembed-library.mjs            # everything not yet on OpenAI
 *   node scripts/reembed-library.mjs --limit 200 --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const ID_PAGE = 1000;
const BATCH = 100;
const WRITE_CONCURRENCY = 12;
const PRICE_PER_M_TOKENS = 0.02; // text-embedding-3-small
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { getSupabaseAdmin } = await import(pathToFileURL(path.join(root, 'api/_lib/supabase-admin.js')).href);
const { buildMovieDocument, embedBatchOpenAI } = await import(pathToFileURL(path.join(root, 'api/_lib/embedding-server.js')).href);
const supabase = getSupabaseAdmin();

const DETAIL = 'tmdb_id, media_type, title, tagline, overview, genres, genre_ids, keywords, credits, mood_tags, original_language, release_date, first_air_date';

/** Run a Supabase query, retrying statement timeouts / transient errors. */
async function withRetry(fn, label) {
    for (let attempt = 0; ; attempt += 1) {
        const { data, error } = await fn();
        if (!error) return data;
        if (attempt >= 4) throw new Error(`${label}: ${error.message}`);
        console.warn(`  ${label} failed (${error.message}) — retrying`);
        await sleep(1500 * 2 ** attempt);
    }
}

async function mapLimit(items, limit, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length) {
            const idx = i;
            i += 1;
            // eslint-disable-next-line no-await-in-loop
            await fn(items[idx]);
        }
    }));
}

let done = 0;
let failed = 0;
let tokens = 0;
let scanned = 0;
let cursor = '';
const started = Date.now();
console.log(`Re-embedding library with OpenAI${DRY_RUN ? ' (dry run — nothing is written)' : ''}…`);

outer:
while (true) {
    // Light keyset page: ids + provider only, ordered by tmdb_id (text).
    // eslint-disable-next-line no-await-in-loop
    const page = await withRetry(() => supabase
        .from('movies_library')
        .select('tmdb_id, media_type, embedding_provider')
        .eq('is_active', true)
        .gt('tmdb_id', cursor)
        .order('tmdb_id', { ascending: true })
        .limit(ID_PAGE), 'id page');
    if (!page?.length) break;
    cursor = page[page.length - 1].tmdb_id;
    scanned += page.length;
    const todo = page.filter((r) => r.embedding_provider !== 'openai');

    for (let b = 0; b < todo.length; b += BATCH) {
        if (done + failed >= LIMIT) break outer;
        const keys = todo.slice(b, b + BATCH).slice(0, LIMIT - done - failed);
        // eslint-disable-next-line no-await-in-loop
        const rows = await withRetry(() => supabase
            .from('movies_library')
            .select(DETAIL)
            .in('tmdb_id', [...new Set(keys.map((k) => k.tmdb_id))]), 'detail batch');
        const wanted = new Set(keys.map((k) => `${k.media_type || 'movie'}:${k.tmdb_id}`));
        const batch = (rows || []).filter((m) => wanted.has(`${m.media_type || 'movie'}:${m.tmdb_id}`));
        if (!batch.length) continue;

        let vectors;
        try {
            // eslint-disable-next-line no-await-in-loop
            const res = await embedBatchOpenAI(batch.map((m) => buildMovieDocument(m)), { withUsage: true });
            vectors = res.vectors;
            tokens += res.tokens;
        } catch (err) {
            console.error('  embed batch failed:', err.message);
            failed += batch.length;
            continue;
        }
        if (DRY_RUN) { done += batch.length; continue; }

        // eslint-disable-next-line no-await-in-loop
        await mapLimit(batch.map((m, k) => [m, vectors[k]]), WRITE_CONCURRENCY, async ([m, v]) => {
            for (let attempt = 0; attempt < 3; attempt += 1) {
                const { error } = await supabase
                    .from('movies_library')
                    .update({ embedding: `[${v.join(',')}]`, embedding_provider: 'openai' })
                    .eq('tmdb_id', String(m.tmdb_id))
                    .eq('media_type', m.media_type || 'movie');
                if (!error) { done += 1; return; }
                if (attempt === 2) { failed += 1; console.error('  write failed', m.tmdb_id, error.message); }
                await sleep(1000 * (attempt + 1));
            }
        });
        const secs = (Date.now() - started) / 1000;
        console.log(`  ${done} embedded · ${failed} failed · scanned ${scanned} · ${tokens.toLocaleString('en-US')} tokens ($${((tokens / 1e6) * PRICE_PER_M_TOKENS).toFixed(4)}) · ${secs.toFixed(0)}s`);
    }
}

console.log(`\nDone: ${done} embedded, ${failed} failed, ${scanned} scanned, ${tokens.toLocaleString('en-US')} tokens ≈ $${((tokens / 1e6) * PRICE_PER_M_TOKENS).toFixed(4)} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
