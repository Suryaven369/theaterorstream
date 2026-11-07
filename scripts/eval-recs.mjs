/**
 * Leave-one-out recommendation eval.
 *
 * For each sample profile (scripts/eval-profiles.json, 6 loved films each):
 * hide one film, build the taste vector from the rest, generate candidates the
 * way production does (TMDB neighbours + shared-keyword discover + pgvector
 * nearest neighbours), score, and check if the hidden film ranks in the top K.
 *
 * Reports hit@5/10/20, pool recall (was it a candidate at all?) and compares
 * weight variants so reco/config.js can be tuned from data.
 *
 *   npm run eval:recs
 *   node scripts/eval-recs.mjs --profiles 5      # quick run on the first 5 profiles
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
const PROFILE_LIMIT = args.includes('--profiles') ? Number(args[args.indexOf('--profiles') + 1]) : Infinity;
const KS = [5, 10, 20];

const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);
const { getSupabaseAdmin } = await imp('api/_lib/supabase-admin.js');
const { fetchTmdbApi } = await imp('api/_lib/tmdb-server.js');
const { buildMovieDocument, embedBatchOpenAI } = await imp('api/_lib/embedding-server.js');
const { generateCandidates } = await imp('api/_lib/reco/candidates.js');
const { loadVectors } = await imp('api/_lib/reco/embeddings.js');
const { buildUserVector, scoreCandidates } = await imp('api/_lib/reco/scoring.js');
const { RECO_CONFIG } = await imp('api/_lib/reco/config.js');

const supabase = getSupabaseAdmin();
const profiles = JSON.parse(fs.readFileSync(path.join(root, 'scripts/eval-profiles.json'), 'utf8')).slice(0, PROFILE_LIMIT);

// Weight variants to compare (the first one is the current config).
const VARIANTS = [
    { name: 'config', weights: RECO_CONFIG.weights },
    { name: 'similarity only', weights: { similarity: 1, quality: 0, contextFit: 0 } },
    { name: '0.8/0.15/0.05', weights: { similarity: 0.8, quality: 0.15, contextFit: 0.05 } },
    { name: '0.7/0.3/0', weights: { similarity: 0.7, quality: 0.3, contextFit: 0 } },
    { name: '0.5/0.4/0.1', weights: { similarity: 0.5, quality: 0.4, contextFit: 0.1 } },
    { name: '0.5/0.35/0.15', weights: { similarity: 0.5, quality: 0.35, contextFit: 0.15 } },
    { name: '0.45/0.45/0.1', weights: { similarity: 0.45, quality: 0.45, contextFit: 0.1 } },
    { name: '0.4/0.5/0.1', weights: { similarity: 0.4, quality: 0.5, contextFit: 0.1 } },
];

// ---- vectors for any TMDB id (library first, else TMDB details → embed, memoised) ----
const memo = new Map();
let embeddedTokens = 0;
async function vectorsFor(ids) {
    const want = [...new Set(ids.map(String))].filter((id) => !memo.has(id));
    if (want.length) {
        const fromLib = await loadVectors(supabase, want);
        fromLib.forEach((v, id) => memo.set(id, v));
        const missing = want.filter((id) => !memo.has(id));
        for (let i = 0; i < missing.length; i += 100) {
            const chunk = missing.slice(i, i + 100);
            // eslint-disable-next-line no-await-in-loop
            const details = await Promise.all(chunk.map((id) => fetchTmdbApi(`/movie/${id}`, { append_to_response: 'keywords,credits' })
                .then((d) => ({ ...d, keywords: d?.keywords?.keywords || [] }))
                .catch(() => null)));
            const ok = details.map((d, k) => [chunk[k], d]).filter(([, d]) => d?.id);
            if (!ok.length) continue;
            // eslint-disable-next-line no-await-in-loop
            const res = await embedBatchOpenAI(ok.map(([, d]) => buildMovieDocument(d)), { withUsage: true });
            embeddedTokens += res.tokens;
            ok.forEach(([id], k) => memo.set(id, res.vectors[k]));
        }
    }
    const out = new Map();
    ids.forEach((id) => { if (memo.has(String(id))) out.set(String(id), memo.get(String(id))); });
    return out;
}

const keywordMemo = new Map();
async function keywordsFor(id) {
    if (!keywordMemo.has(id)) {
        keywordMemo.set(id, fetchTmdbApi(`/movie/${id}/keywords`).then((d) => d?.keywords || []).catch(() => []));
    }
    return keywordMemo.get(id);
}

/** Production-like candidate pool for a set of loved ids. */
async function candidatePool(lovedIds, userVector) {
    const lovedKeywords = await Promise.all(lovedIds.map(keywordsFor));
    const generated = await generateCandidates({
        lovedIds: lovedIds.map(String),
        lovedKeywords,
        prefs: {},                       // no platform/language limits: measure taste only
        exclude: new Set(lovedIds.map(String)),
    });
    const pool = new Map(generated.cards);

    // pgvector nearest neighbours to the taste vector (same as the embedding pool in prod).
    const { data: nn } = await supabase.rpc('match_movies_by_embedding', {
        query_embedding: `[${userVector.join(',')}]`,
        match_count: 150,
        filter_media_type: 'movie',
        filter_provider: 'openai',
    });
    const nnIds = (nn || []).map((r) => String(r.tmdb_id)).filter((id) => !lovedIds.map(String).includes(id) && !pool.has(id));
    if (nnIds.length) {
        const { data: rows } = await supabase
            .from('movies_library')
            .select('tmdb_id, title, vote_average, vote_count, runtime, genre_ids, genres, release_date')
            .in('tmdb_id', nnIds);
        (rows || []).forEach((r) => pool.set(String(r.tmdb_id), { ...r, tmdb_id: String(r.tmdb_id) }));
    }
    return [...pool.values()];
}

const totals = Object.fromEntries(VARIANTS.map((v) => [v.name, { hits: Object.fromEntries(KS.map((k) => [k, 0])), ranks: [] }]));
let trials = 0;
let inPool = 0;
const perProfile = [];
const started = Date.now();

for (const profile of profiles) {
    const ids = profile.films.map((f) => String(f.id));
    const profileHits = { name: profile.name, hit20: 0, trials: 0 };
    for (const hidden of ids) {
        const loved = ids.filter((id) => id !== hidden);
        const lovedVecs = await vectorsFor(loved);
        const userVector = buildUserVector([...lovedVecs.values()].map((vector) => ({ vector })));
        if (!userVector) continue;

        const pool = await candidatePool(loved, userVector);
        const vecs = await vectorsFor(pool.map((c) => c.tmdb_id));
        const scored = pool.map((c) => ({ ...c, vector: vecs.get(String(c.tmdb_id)) || null }));
        const present = scored.some((c) => String(c.tmdb_id) === hidden);
        trials += 1;
        profileHits.trials += 1;
        if (present) inPool += 1;

        VARIANTS.forEach((variant) => {
            const ranked = scoreCandidates(scored, userVector, { pattern: 'casual' }, { ...RECO_CONFIG, weights: variant.weights });
            const rank = ranked.findIndex((c) => String(c.tmdb_id) === hidden);
            const t = totals[variant.name];
            t.ranks.push(rank >= 0 ? rank + 1 : null);
            KS.forEach((k) => { if (rank >= 0 && rank < k) t.hits[k] += 1; });
            if (variant.name === 'config' && rank >= 0 && rank < 20) profileHits.hit20 += 1;
        });
    }
    perProfile.push(profileHits);
    process.stdout.write(`  ${profile.name.padEnd(28)} hit@20 ${profileHits.hit20}/${profileHits.trials}\n`);
}

const pct = (n) => `${((n / Math.max(trials, 1)) * 100).toFixed(1)}%`;
console.log(`\n${trials} leave-one-out trials over ${perProfile.length} profiles · pool recall ${pct(inPool)} (hidden film was a candidate)`);
console.log('\nvariant              hit@5    hit@10   hit@20   median rank (when found)');
VARIANTS.forEach((v) => {
    const t = totals[v.name];
    const found = t.ranks.filter((r) => r != null).sort((a, b) => a - b);
    const median = found.length ? found[Math.floor(found.length / 2)] : '-';
    console.log(`${v.name.padEnd(20)} ${pct(t.hits[5]).padEnd(8)} ${pct(t.hits[10]).padEnd(8)} ${pct(t.hits[20]).padEnd(8)} ${median}`);
});
console.log(`\nembedded ${embeddedTokens.toLocaleString('en-US')} tokens for titles outside the library (≈ $${((embeddedTokens / 1e6) * 0.02).toFixed(4)}) · ${((Date.now() - started) / 1000).toFixed(0)}s`);
