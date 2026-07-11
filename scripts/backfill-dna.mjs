/**
 * Resumable Movie DNA backfill — LLM-tags active movies (popular first) that
 * don't yet have DNA. Throttled; stops cleanly on quota. Safe to re-run.
 *
 *   node scripts/backfill-dna.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { getSupabaseAdmin } = await import(`file://${root}/api/_lib/supabase-admin.js`);
const { computeMovieDna } = await import(`file://${root}/api/_lib/movie-dna-server.js`);
const { isLlmEnabled } = await import(`file://${root}/api/_lib/llm-server.js`);

if (!isLlmEnabled()) {
    console.error('No LLM configured. Set GEMINI_API_KEY or MIST_API_KEY in .env');
    process.exit(1);
}

const sb = getSupabaseAdmin();
const start = Date.now();
let ok = 0;
let fail = 0;
let round = 0;

while (true) {
    const { data: movies, error } = await sb.from('movies_library')
        .select('tmdb_id, title, overview, genres')
        .eq('is_active', true).is('dna_computed_at', null)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(200);

    if (error) { console.error('query failed:', error.message); break; }
    if (!movies?.length) { console.log('✓ ALL MOVIES TAGGED.'); break; }

    round += 1;
    let quota = false;
    for (const m of movies) {
        try {
            const dna = await computeMovieDna(m);
            const { error: upErr } = await sb.from('movies_library')
                .update({ movie_dna: dna || {}, dna_computed_at: new Date().toISOString() })
                .eq('tmdb_id', m.tmdb_id);
            if (upErr) fail += 1; else ok += 1;
        } catch (e) {
            fail += 1;
            if (/429|RESOURCE_EXHAUSTED|quota|rate/i.test(e.message)) {
                console.log(`\nQuota reached after ${ok} tagged. Re-run later to continue.`);
                quota = true;
                break;
            }
        }
        await sleep(150);
    }

    const left = await sb.from('movies_library').select('tmdb_id', { count: 'exact', head: true })
        .eq('is_active', true).is('dna_computed_at', null);
    console.log(`round ${round}: total ${ok} tagged | ${fail} failed | remaining ${left.count} | ${Math.round((Date.now() - start) / 1000)}s`);
    if (quota) break;
}

console.log(`\nDone: ${ok} tagged, ${fail} failed, in ${Math.round((Date.now() - start) / 60000)} min.`);
process.exit(0);
