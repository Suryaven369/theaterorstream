/**
 * Real-history recommendation eval ("can we predict what they watched next?").
 *
 * For every user with enough history: sort everything they watched / logged /
 * rated / liked by when it first happened, hide the most recent ~20%, rebuild
 * their taste ONLY from what came before, generate candidates the way
 * production does, and check how many of the hidden films land in the top K.
 *
 * Unlike scripts/eval-recs.mjs (synthetic profiles of famous films), this
 * measures the engine on real people's real next watches.
 *
 *   npm run eval:real                       # time split: predict the latest ~20%
 *   node scripts/eval-real.mjs --mode folds # 5 random folds: every film predicted once
 *   node scripts/eval-real.mjs --variants current,cl+pop+share --debug cl+pop+share
 *
 * Metrics: recall@K = share of hidden films in the top K (averaged per user),
 * pool recall = share of hidden films that were candidates at all.
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
const argVal = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const MIN_WATCHED = Number(argVal('--min-watched', 20));
const TEST_SHARE = Number(argVal('--test-share', 0.2));
const KS = [10, 20, 50];
const MODE = argVal('--mode', 'time'); // 'time' | 'folds'
const FOLDS = 5;
const DEBUG = argVal('--debug', null); // variant name: print hidden films' ranks + top picks

const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);
const { getSupabaseAdmin } = await imp('api/_lib/supabase-admin.js');
const { fetchTmdbApi } = await imp('api/_lib/tmdb-server.js');
const { buildMovieDocument, embedBatchOpenAI } = await imp('api/_lib/embedding-server.js');
const { generateCandidates } = await imp('api/_lib/reco/candidates.js');
const { loadVectors } = await imp('api/_lib/reco/embeddings.js');
const {
    buildUserVector, scoreCandidates, buildTasteClusters, applyDislikesToClusters,
    clusterTopGenres, interleaveByCluster, familiarityTarget,
} = await imp('api/_lib/reco/scoring.js');
const { RECO_CONFIG } = await imp('api/_lib/reco/config.js');
const { computeOverallFromRatingRow } = await imp('api/_lib/taste-profile-server.js');
const { buildTasteSignals } = await imp('api/_lib/reco/signals.js');

const supabase = getSupabaseAdmin();
const DAY = 86400000;

// ---------------------------------------------------------------------------
// Vectors / keywords (library first, else TMDB → embed; memoised)
// ---------------------------------------------------------------------------
const vecMemo = new Map();
let embeddedTokens = 0;
async function vectorsFor(ids) {
    const want = [...new Set(ids.map(String))].filter((id) => !vecMemo.has(id));
    if (want.length) {
        const fromLib = await loadVectors(supabase, want);
        fromLib.forEach((v, id) => vecMemo.set(id, v));
        const missing = want.filter((id) => !vecMemo.has(id));
        for (let i = 0; i < missing.length; i += 100) {
            const chunk = missing.slice(i, i + 100);
            // eslint-disable-next-line no-await-in-loop
            const details = await Promise.all(chunk.map((id) => fetchTmdbApi(`/movie/${id}`, { append_to_response: 'keywords,credits' })
                .then((d) => ({ ...d, keywords: d?.keywords?.keywords || [] }))
                .catch(() => null)));
            const ok = details.map((d, k) => [chunk[k], d]).filter(([, d]) => d?.id);
            chunk.forEach((id) => { if (!ok.some(([x]) => x === id)) vecMemo.set(id, null); });
            if (!ok.length) continue;
            // eslint-disable-next-line no-await-in-loop
            const res = await embedBatchOpenAI(ok.map(([, d]) => buildMovieDocument(d)), { withUsage: true });
            embeddedTokens += res.tokens;
            ok.forEach(([id], k) => vecMemo.set(id, res.vectors[k]));
        }
    }
    const out = new Map();
    ids.forEach((id) => { const v = vecMemo.get(String(id)); if (v) out.set(String(id), v); });
    return out;
}

const genreMemo = new Map();
const voteMemo = new Map();
async function genresFor(ids) {
    const want = [...new Set(ids.map(String))].filter((id) => !genreMemo.has(id));
    if (want.length) {
        for (let i = 0; i < want.length; i += 200) {
            // eslint-disable-next-line no-await-in-loop
            const { data } = await supabase.from('movies_library').select('tmdb_id, genre_ids, genres, vote_count').in('tmdb_id', want.slice(i, i + 200));
            (data || []).forEach((r) => {
                genreMemo.set(String(r.tmdb_id),
                    (r.genre_ids?.length ? r.genre_ids : (r.genres || []).map((g) => g?.id ?? g)).map(Number).filter(Boolean));
                voteMemo.set(String(r.tmdb_id), Number(r.vote_count) || 0);
            });
        }
        const missing = want.filter((id) => !genreMemo.has(id));
        const details = await Promise.all(missing.map((id) => fetchTmdbApi(`/movie/${id}`).catch(() => null)));
        missing.forEach((id, k) => {
            genreMemo.set(id, (details[k]?.genres || []).map((g) => g.id));
            voteMemo.set(id, Number(details[k]?.vote_count) || 0);
        });
    }
    return new Map(ids.map((id) => [String(id), genreMemo.get(String(id)) || []]));
}

const kwMemo = new Map();
function keywordsFor(id) {
    if (!kwMemo.has(id)) kwMemo.set(id, fetchTmdbApi(`/movie/${id}/keywords`).then((d) => d?.keywords || []).catch(() => []));
    return kwMemo.get(id);
}

async function nearest(vector, count, exclude) {
    const { data } = await supabase.rpc('match_movies_by_embedding', {
        query_embedding: `[${vector.join(',')}]`,
        match_count: count,
        filter_media_type: 'movie',
        filter_provider: 'openai',
    });
    return (data || []).map((r) => String(r.tmdb_id)).filter((id) => !exclude.has(id));
}

// ---------------------------------------------------------------------------
// History → timeline
// ---------------------------------------------------------------------------
async function loadHistory(userId) {
    const [watched, logs, likes, ratings, events] = await Promise.all([
        supabase.from('user_watched_movies').select('movie_id, media_type, watched_at').eq('user_id', userId),
        supabase.from('movie_logs').select('tmdb_id, media_type, rating, created_at').eq('user_id', userId),
        supabase.from('user_liked_movies').select('movie_id, media_type, liked_at').eq('user_id', userId),
        supabase.from('ratings').select('*').eq('user_id', userId),
        supabase.from('user_events').select('tmdb_id, event_type, created_at').eq('user_id', userId)
            .in('event_type', ['movie_disliked', 'movie_meh', 'not_interested']),
    ]);
    const films = new Map(); // id → { first, tv, watched, liked, tosRating, logRating, disliked, at:{} }
    const touch = (id, when, patch = {}) => {
        if (!id || !when) return;
        const key = String(id);
        const t = new Date(when).getTime();
        const f = films.get(key) || { id: key, first: t, tv: false };
        f.first = Math.min(f.first, t);
        Object.assign(f, patch);
        films.set(key, f);
    };
    (watched.data || []).forEach((r) => touch(r.movie_id, r.watched_at, { watched: true, tv: r.media_type === 'tv' }));
    (logs.data || []).forEach((r) => touch(r.tmdb_id, r.created_at, {
        watched: true,
        tv: r.media_type === 'tv' || undefined,
        ...(r.rating != null ? { logRating: Number(r.rating) } : {}),
    }));
    (likes.data || []).forEach((r) => touch(r.movie_id, r.liked_at, { liked: true, likedAt: new Date(r.liked_at).getTime() }));
    (ratings.data || []).forEach((r) => {
        const o = computeOverallFromRatingRow(r);
        if (o != null) touch(r.movie_id, r.created_at || r.updated_at, { tosRating: o });
    });
    (events.data || []).forEach((e) => touch(e.tmdb_id, e.created_at, { disliked: true }));
    return [...films.values()].filter((f) => !f.tv).sort((a, b) => a.first - b.first || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Signal builders (the thing we're comparing)
// ---------------------------------------------------------------------------
const recency = (t, now) => Math.max(0.3, 0.5 ** (((now - t) / DAY) / RECO_CONFIG.feedbackHalfLifeDays));

/** Production today: loved = TOS rating ≥ 7 or liked; disliked = TOS ≤ 5 or dislike events. */
function signalsCurrent(train, now) {
    const loved = [];
    const disliked = [];
    train.forEach((f) => {
        if (f.liked || (f.tosRating != null && f.tosRating >= 7)) loved.push({ id: f.id, weight: recency(f.first, now) });
        else if (f.disliked || (f.tosRating != null && f.tosRating <= 5)) disliked.push({ id: f.id, weight: recency(f.first, now) });
    });
    return { loved, disliked };
}

/** Production signals (api/_lib/reco/signals.js): watch history + personal-scale ratings. */
function signalsHistory(train, now) {
    return buildTasteSignals(train.map((f) => ({ ...f, at: f.first })), now);
}

// ---------------------------------------------------------------------------
// One trial: build taste from train, rank, measure hidden films
// ---------------------------------------------------------------------------
async function runVariant(variant, train, test, now) {
    const sig = variant.signals(train, now);
    if (!sig.loved.length) return null;
    const vecs = await vectorsFor([...sig.loved, ...sig.disliked].map((x) => x.id));
    const lovedV = sig.loved.map((x) => ({ ...x, vector: vecs.get(x.id) })).filter((x) => x.vector);
    const dislikedV = sig.disliked.map((x) => ({ ...x, vector: vecs.get(x.id) })).filter((x) => x.vector);
    const userVector = buildUserVector(lovedV, dislikedV);
    if (!userVector) return null;
    const clusters = variant.clusters
        ? applyDislikesToClusters(buildTasteClusters(lovedV, variant.clusterOpts), dislikedV)
        : null;

    // Candidates: TMDB neighbours/keywords from the strongest seeds (+ per-cluster seeds) + pgvector NN.
    const seen = new Set(train.map((f) => f.id));
    const byWeight = lovedV.slice().sort((a, b) => b.weight - a.weight);
    let seeds = byWeight.slice(0, 8).map((x) => x.id);
    if (clusters?.length > 1) {
        const perCluster = Math.max(2, Math.floor(8 / clusters.length));
        seeds = clusters.flatMap((c) => byWeight.filter((x) => c.members.includes(x.id)).slice(0, perCluster).map((x) => x.id)).slice(0, 10);
    }
    const lovedKeywords = await Promise.all(seeds.map(keywordsFor));
    const clusterGenres = variant.popular && clusters?.length
        ? clusterTopGenres(clusters, await genresFor(lovedV.map((x) => x.id)))
        : [];
    const generated = await generateCandidates({ lovedIds: seeds, lovedKeywords, prefs: {}, clusterGenres, exclude: seen });
    const pool = new Map(generated.cards);
    const nnQueries = clusters?.length > 1
        ? clusters.map((c) => ({ v: c.centroid, n: Math.max(60, Math.round(150 * c.weight) + 40) }))
        : [{ v: userVector, n: 150 }];
    const nnIds = (await Promise.all(nnQueries.map((q) => nearest(q.v, q.n, seen)))).flat().filter((id) => !pool.has(id));
    if (nnIds.length) {
        const { data: rows } = await supabase.from('movies_library')
            .select('tmdb_id, title, vote_average, vote_count, runtime, genre_ids, genres, release_date')
            .in('tmdb_id', [...new Set(nnIds)]);
        (rows || []).forEach((r) => pool.set(String(r.tmdb_id), { ...r, tmdb_id: String(r.tmdb_id) }));
    }
    const candidates = [...pool.values()];
    const cvecs = await vectorsFor(candidates.map((c) => c.tmdb_id));
    const withVec = candidates.map((c) => ({ ...c, vector: cvecs.get(String(c.tmdb_id)) || null }));

    let familiarity = null;
    if (variant.familiarity) {
        const watchedIds = train.filter((f) => f.watched || f.liked || f.tosRating != null).map((f) => f.id);
        await genresFor(watchedIds);
        familiarity = familiarityTarget(watchedIds.map((id) => voteMemo.get(id)));
    }
    let ranked = scoreCandidates(withVec, userVector, { pattern: 'casual' },
        {
            ...RECO_CONFIG,
            weights: variant.weights || RECO_CONFIG.weights,
            clusters: { ...RECO_CONFIG.clusters, ...(variant.clusterOpts || {}) },
        },
        { clusters, familiarity });
    if (variant.interleave && clusters) ranked = interleaveByCluster(ranked, clusters);
    const rankOf = new Map(ranked.map((c, i) => [String(c.tmdb_id), i + 1]));
    const testIds = test.map((f) => f.id);
    if (DEBUG && DEBUG === variant.name) {
        const { data: titles } = await supabase.from('movies_library').select('tmdb_id, title, vote_count, popularity').in('tmdb_id', testIds);
        const t = new Map((titles || []).map((x) => [String(x.tmdb_id), x]));
        console.log('    hidden films:');
        test.forEach((f) => {
            const c = ranked.find((x) => String(x.tmdb_id) === f.id);
            console.log(`      ${(t.get(f.id)?.title || f.id).slice(0, 34).padEnd(34)} rank ${String(rankOf.get(f.id) || '-').padStart(4)}  ${c ? `cos ${c.scores.cosine} q ${c.scores.quality} src ${c._source || 'nn'}` : `not in pool (votes ${t.get(f.id)?.vote_count ?? '?'})`}`);
        });
        console.log('    top 12 picks:');
        ranked.slice(0, 12).forEach((c, i) => console.log(`      ${String(i + 1).padStart(2)}. ${(c.title || c.tmdb_id).slice(0, 34).padEnd(34)} cos ${c.scores.cosine} q ${c.scores.quality} src ${c._source || 'nn'}`));
        if (clusters) {
            const g = clusterTopGenres(clusters, await genresFor(lovedV.map((x) => x.id)));
            clusters.forEach((c, ci) => console.log(`    cluster ${ci}: ${(c.weight * 100).toFixed(0)}% · ${c.members.length} films · genres ${g[ci].join(',')}`));
        }
    }
    return {
        clusters: clusters?.length || 1,
        loved: lovedV.length,
        pool: candidates.length,
        inPool: testIds.filter((id) => pool.has(id)).length,
        hits: Object.fromEntries(KS.map((k) => [k, testIds.filter((id) => (rankOf.get(id) || Infinity) <= k).length])),
        n: testIds.length,
    };
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------
const W_FIT = { similarity: 0.7, quality: 0.25, contextFit: 0.05 };
const ALL_VARIANTS = [
    { name: 'current', signals: signalsCurrent },
    { name: 'history', signals: signalsHistory },
    { name: 'history+fit', signals: signalsHistory, weights: W_FIT },
    { name: 'clusters', signals: signalsHistory, clusters: true },
    { name: 'clusters+fit', signals: signalsHistory, clusters: true, weights: W_FIT },
    { name: 'cl+popular', signals: signalsHistory, clusters: true, popular: true },
    { name: 'cl+pop+share', signals: signalsHistory, clusters: true, popular: true, interleave: true },
    { name: 'cl+pop+share+fit', signals: signalsHistory, clusters: true, popular: true, interleave: true, weights: W_FIT },
    { name: 'fam15', signals: signalsHistory, clusters: true, popular: true, interleave: true, familiarity: true,
        weights: { similarity: 0.5, quality: 0.3, contextFit: 0.05, familiarity: 0.15 } },
    { name: 'fam25', signals: signalsHistory, clusters: true, popular: true, interleave: true, familiarity: true,
        weights: { similarity: 0.45, quality: 0.25, contextFit: 0.05, familiarity: 0.25 } },
    { name: 'fam35', signals: signalsHistory, clusters: true, popular: true, interleave: true, familiarity: true,
        weights: { similarity: 0.4, quality: 0.2, contextFit: 0.05, familiarity: 0.35 } },
    { name: 'fam15-k10', signals: signalsHistory, clusters: true, popular: true, interleave: true, familiarity: true,
        clusterOpts: { minPerCluster: 10 }, weights: { similarity: 0.5, quality: 0.3, contextFit: 0.05, familiarity: 0.15 } },
    { name: 'fam15-k15', signals: signalsHistory, clusters: true, popular: true, interleave: true, familiarity: true,
        clusterOpts: { minPerCluster: 15 }, weights: { similarity: 0.5, quality: 0.3, contextFit: 0.05, familiarity: 0.15 } },
    { name: 'fam15-blend', signals: signalsHistory, clusters: true, popular: true, interleave: true, familiarity: true,
        clusterOpts: { globalBlend: 0.5 }, weights: { similarity: 0.5, quality: 0.3, contextFit: 0.05, familiarity: 0.15 } },
    { name: 'fam15-k10-blend', signals: signalsHistory, clusters: true, popular: true, interleave: true, familiarity: true,
        clusterOpts: { minPerCluster: 10, globalBlend: 0.5 }, weights: { similarity: 0.5, quality: 0.3, contextFit: 0.05, familiarity: 0.15 } },
    { name: 'final', signals: signalsHistory, clusters: true, popular: true, interleave: true, familiarity: true,
        weights: { similarity: 0.5, quality: 0.25, contextFit: 0.1, familiarity: 0.15 } },
    { name: 'fam25-noshare', signals: signalsHistory, clusters: true, popular: true, familiarity: true,
        weights: { similarity: 0.45, quality: 0.25, contextFit: 0.05, familiarity: 0.25 } },
];
const pick = argVal('--variants', null);
const VARIANTS = pick ? ALL_VARIANTS.filter((v) => pick.split(',').includes(v.name)) : ALL_VARIANTS;

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const started = Date.now();
const { data: users } = await supabase.from('user_profiles').select('id, username');
const results = Object.fromEntries(VARIANTS.map((v) => [v.name, []]));

// Seeded shuffle so fold runs are repeatable.
function seededShuffle(list, seed) {
    const out = list.slice();
    let x = seed >>> 0 || 1;
    for (let i = out.length - 1; i > 0; i -= 1) {
        x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
        const j = x % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

for (const u of users || []) {
    const timeline = await loadHistory(u.id);
    const watchedFilms = timeline.filter((f) => f.watched || f.tosRating != null || f.liked);
    if (watchedFilms.length < MIN_WATCHED) continue;

    // Trials: time split (predict the most recent ~20%) or 5 random folds
    // (every film predicted once from the rest — bigger sample, less noise).
    const trials = [];
    if (MODE === 'folds') {
        const shuffled = seededShuffle(watchedFilms, 7 + watchedFilms.length);
        for (let k = 0; k < FOLDS; k += 1) {
            const test = shuffled.filter((_, i) => i % FOLDS === k);
            const hidden = new Set(test.map((f) => f.id));
            trials.push({ test, train: timeline.filter((f) => !hidden.has(f.id)), now: Date.now() });
        }
        console.log(`\n@${u.username}: ${watchedFilms.length} films, ${FOLDS} folds`);
    } else {
        const nTest = Math.max(8, Math.min(25, Math.round(watchedFilms.length * TEST_SHARE)));
        const test = watchedFilms.slice(-nTest);
        const cutoff = test[0].first;
        trials.push({ test, train: timeline.filter((f) => f.first < cutoff), now: cutoff });
        console.log(`\n@${u.username}: ${trials[0].train.length} films before ${new Date(cutoff).toISOString().slice(0, 10)}, predicting next ${test.length}`);
    }

    for (const variant of VARIANTS) {
        const agg = { clusters: 0, loved: 0, pool: 0, inPool: 0, hits: Object.fromEntries(KS.map((k) => [k, 0])), n: 0 };
        let ran = 0;
        for (const t of trials) {
            // eslint-disable-next-line no-await-in-loop
            const r = await runVariant(variant, t.train, t.test, t.now);
            if (!r) continue;
            ran += 1;
            agg.clusters = r.clusters; agg.loved = r.loved; agg.pool += r.pool; agg.inPool += r.inPool; agg.n += r.n;
            KS.forEach((k) => { agg.hits[k] += r.hits[k]; });
        }
        if (!ran) { console.log(`  ${variant.name.padEnd(16)} (no taste signal)`); continue; }
        agg.pool = Math.round(agg.pool / ran);
        results[variant.name].push(agg);
        const pct = (x) => `${Math.round((x / agg.n) * 100)}%`.padStart(4);
        console.log(`  ${variant.name.padEnd(16)} @10 ${pct(agg.hits[10])}  @20 ${pct(agg.hits[20])}  @50 ${pct(agg.hits[50])}  pool ${pct(agg.inPool)} of ~${agg.pool}  (${agg.n} hidden, ${agg.clusters} cluster${agg.clusters === 1 ? '' : 's'})`);
    }
}

console.log('\nAverage over users');
console.log('variant         recall@10  recall@20  recall@50  pool recall');
VARIANTS.forEach((v) => {
    const rs = results[v.name];
    if (!rs.length) return;
    const avg = (fn) => `${((rs.reduce((s, r) => s + fn(r), 0) / rs.length) * 100).toFixed(1)}%`;
    console.log(`${v.name.padEnd(15)} ${avg((r) => r.hits[10] / r.n).padEnd(10)} ${avg((r) => r.hits[20] / r.n).padEnd(10)} ${avg((r) => r.hits[50] / r.n).padEnd(10)} ${avg((r) => r.inPool / r.n)}`);
});
console.log(`\nembedded ${embeddedTokens.toLocaleString('en-US')} tokens for titles outside the library (≈ $${((embeddedTokens / 1e6) * 0.02).toFixed(4)}) · ${((Date.now() - started) / 1000).toFixed(0)}s`);
