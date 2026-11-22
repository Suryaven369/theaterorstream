/**
 * Phase 3 — embedding scoring (pure functions, unit-tested).
 *
 *   userVector  = normalize( mean(loved) − dislikedWeight · mean(disliked) )
 *   similarity  = cosine(userVector, candidateVector)        (min–max scaled per pool)
 *   quality     = Bayesian-adjusted vote average / 10
 *   contextFit  = runtimeWeight · runtimeFit + moodWeight · moodFit
 *   score       = w.similarity·similarity + w.quality·quality + w.contextFit·contextFit
 *
 * Weighted means accept per-item weights (recency, Phase 5).
 */
import { RECO_CONFIG, TONIGHT_MOODS, TONIGHT_COMPANY } from './config.js';

export function parseVector(value) {
    if (!value) return null;
    if (Array.isArray(value)) return value.map(Number);
    if (typeof value === 'string') {
        const inner = value.trim().replace(/^\[|\]$/g, '');
        if (!inner) return null;
        const v = inner.split(',').map(Number);
        return v.every(Number.isFinite) ? v : null;
    }
    return null;
}

export function normalize(v) {
    const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return n ? v.map((x) => x / n) : v.slice();
}

export function cosine(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Weighted mean of vectors: items = [{ vector, weight }]. */
export function weightedMean(items) {
    const valid = items.filter((it) => it?.vector?.length && (it.weight ?? 1) > 0);
    if (!valid.length) return null;
    const dim = valid[0].vector.length;
    const out = new Array(dim).fill(0);
    let total = 0;
    valid.forEach(({ vector, weight = 1 }) => {
        if (vector.length !== dim) return;
        total += weight;
        for (let i = 0; i < dim; i += 1) out[i] += vector[i] * weight;
    });
    return total ? out.map((x) => x / total) : null;
}

/**
 * userVector = normalize(mean(loved) − dislikedWeight · mean(disliked)).
 * Returns null when there are no loved vectors (no taste signal yet).
 */
export function buildUserVector(loved, disliked = [], { dislikedWeight = RECO_CONFIG.dislikedWeight } = {}) {
    const pos = weightedMean(loved);
    if (!pos) return null;
    const neg = weightedMean(disliked);
    const combined = neg ? pos.map((x, i) => x - dislikedWeight * neg[i]) : pos;
    return normalize(combined);
}

// ---------------------------------------------------------------------------
// Taste clusters (multi-interest). One averaged vector lands *between* tastes
// (horror + rom-com → neither), so loved films are split into a few clusters
// and a candidate is scored against the cluster it fits best.
// ---------------------------------------------------------------------------

/**
 * Spherical k-means over loved films. items: [{ id, vector, weight }].
 * k grows with history (one cluster per `minPerCluster` films, up to maxK).
 * Deterministic: seeds are the heaviest film, then the film least like any seed.
 * Returns [{ centroid, weight (share 0–1), members: ids }], heaviest first.
 */
export function buildTasteClusters(items, { maxK = RECO_CONFIG.clusters.maxK, minPerCluster = RECO_CONFIG.clusters.minPerCluster, iterations = 15 } = {}) {
    const valid = (items || []).filter((it) => it?.vector?.length && (it.weight ?? 1) > 0)
        .map((it) => ({ ...it, weight: it.weight ?? 1, unit: normalize(it.vector) }));
    if (!valid.length) return [];
    const k = Math.max(1, Math.min(maxK, Math.floor(valid.length / minPerCluster)));

    const byWeight = valid.slice().sort((a, b) => b.weight - a.weight || String(a.id).localeCompare(String(b.id)));
    let centroids = [byWeight[0].unit];
    while (centroids.length < k) {
        let far = null;
        let farSim = Infinity;
        byWeight.forEach((it) => {
            const sim = Math.max(...centroids.map((c) => cosine(c, it.unit)));
            if (sim < farSim) { farSim = sim; far = it; }
        });
        if (!far) break;
        centroids.push(far.unit);
    }

    let assign = [];
    for (let iter = 0; iter < iterations; iter += 1) {
        const next = valid.map((it) => {
            let best = 0;
            let bestSim = -Infinity;
            centroids.forEach((c, ci) => {
                const s = cosine(c, it.unit);
                if (s > bestSim) { bestSim = s; best = ci; }
            });
            return best;
        });
        const changed = next.some((ci, i) => ci !== assign[i]);
        assign = next;
        centroids = centroids.map((c, ci) => {
            const members = valid.filter((_, i) => assign[i] === ci).map((it) => ({ vector: it.unit, weight: it.weight }));
            const mean = weightedMean(members);
            return mean ? normalize(mean) : c;
        });
        if (!changed) break;
    }

    const total = valid.reduce((s, it) => s + it.weight, 0) || 1;
    return centroids.map((centroid, ci) => {
        const members = valid.filter((_, i) => assign[i] === ci);
        return {
            centroid,
            weight: members.reduce((s, it) => s + it.weight, 0) / total,
            members: members.map((it) => String(it.id)),
        };
    }).filter((c) => c.members.length).sort((a, b) => b.weight - a.weight);
}

/**
 * Pull each cluster away from what the user dislikes (same idea as
 * buildUserVector's negative term). Returns new clusters.
 */
export function applyDislikesToClusters(clusters, disliked = [], { dislikedWeight = RECO_CONFIG.dislikedWeight } = {}) {
    const neg = weightedMean(disliked);
    if (!neg) return clusters;
    return clusters.map((c) => ({ ...c, centroid: normalize(c.centroid.map((x, i) => x - dislikedWeight * neg[i])) }));
}

/**
 * How well a film fits the user's taste: cosine to its best-matching cluster.
 * Small clusters get a slight discount so a one-off doesn't outrank a core taste.
 * Returns { cosine, cluster } (cluster index into `clusters`).
 */
export function clusterFit(clusters, vector, { sizeDiscount = RECO_CONFIG.clusters.sizeDiscount } = {}) {
    let best = { cosine: -Infinity, cluster: -1 };
    clusters.forEach((c, ci) => {
        const raw = cosine(c.centroid, vector);
        const adjusted = raw - sizeDiscount * (1 - Math.min(1, c.weight * clusters.length));
        if (adjusted > best.cosine) best = { cosine: adjusted, cluster: ci };
    });
    return best;
}

/**
 * Each cluster's defining genres: the genres its films share most, ignoring
 * Drama (too broad) unless it's all there is. genresById: Map(id → number[]).
 * Returns [[genreId, …], …] aligned with `clusters`.
 */
export function clusterTopGenres(clusters, genresById, n = 2) {
    return clusters.map((c) => {
        const counts = new Map();
        c.members.forEach((id) => (genresById.get(String(id)) || []).forEach((g) => counts.set(Number(g), (counts.get(Number(g)) || 0) + 1)));
        const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([g]) => g);
        const specific = ranked.filter((g) => g !== 18);
        return (specific.length ? specific : ranked).slice(0, n);
    });
}

/**
 * Give every taste its fair share of the list (Netflix-style multi-interest):
 * slots go to clusters in proportion to their weight (largest-remainder), each
 * cluster filling its slots with its own best-scored films. scored: best-first
 * with `_cluster`. Films without a cluster join the biggest one.
 * `floor` keeps a minimum share for small clusters so a side taste still shows.
 */
export function interleaveByCluster(scored, clusters, limit = scored.length, { floor = RECO_CONFIG.clusters.minShare } = {}) {
    if (!clusters?.length || clusters.length === 1) return scored.slice(0, limit);
    const buckets = clusters.map(() => []);
    scored.forEach((c) => buckets[c._cluster >= 0 && c._cluster < clusters.length ? c._cluster : 0].push(c));
    const raw = clusters.map((c) => Math.max(c.weight, floor));
    const sum = raw.reduce((s, x) => s + x, 0);
    const share = raw.map((x) => x / sum);
    const out = [];
    const taken = clusters.map(() => 0);
    while (out.length < limit && buckets.some((b, i) => taken[i] < b.length)) {
        // Next slot goes to the cluster furthest below its share so far.
        let pickIdx = -1;
        let deficit = -Infinity;
        share.forEach((s, i) => {
            if (taken[i] >= buckets[i].length) return;
            const d = s * (out.length + 1) - taken[i];
            if (d > deficit) { deficit = d; pickIdx = i; }
        });
        out.push(buckets[pickIdx][taken[pickIdx]]);
        taken[pickIdx] += 1;
    }
    return out;
}

/**
 * How well-known the user's films usually are: median log10(vote_count) of the
 * films they watched/loved. Big-hit watchers sit near 4 (10k votes), hidden-gem
 * hunters near 2.5. Returns null without enough data.
 */
export function familiarityTarget(voteCounts) {
    const logs = (voteCounts || []).map(Number).filter((v) => v > 0).map((v) => Math.log10(v + 1)).sort((a, b) => a - b);
    if (logs.length < 5) return null;
    return logs[Math.floor(logs.length / 2)];
}

/** 1 when a film is as well-known as what the user usually watches, falling off either side. */
export function familiarityFit(voteCount, target, spread = RECO_CONFIG.familiarity.spread) {
    if (target == null) return 0.5;
    const v = Math.log10(Math.max(0, Number(voteCount) || 0) + 1);
    return Math.exp(-((v - target) ** 2) / (2 * spread * spread));
}

/** Bayesian-adjusted rating on 0–1: a handful of votes can't inflate it. */
export function bayesianQuality(voteAverage, voteCount, cfg = RECO_CONFIG.quality) {
    const R = Number(voteAverage) || 0;
    const v = Math.max(0, Number(voteCount) || 0);
    const { priorVotes: m, priorMean: C } = cfg;
    return ((v * R + m * C) / (v + m)) / 10;
}

export function genreIdsOf(movie) {
    if (Array.isArray(movie?.genre_ids) && movie.genre_ids.length) return movie.genre_ids.map(Number);
    return (movie?.genres || []).map((g) => Number(g?.id ?? g)).filter(Boolean);
}

/** 1 when it fits the time available, sliding down per extra half hour. */
export function runtimeFit(runtimeMin, minutesAvailable, cfg = RECO_CONFIG.context) {
    const rt = Number(runtimeMin);
    if (!rt || !minutesAvailable) return cfg.unknownRuntimeFit;
    const over = rt - minutesAvailable - cfg.runtimeSlackMin;
    if (over <= 0) return 1;
    return Math.max(0, 1 - (over / 30) * cfg.runtimePenaltyPer30);
}

/** Mood + company match from genres (0–1, 0.5 = neutral). */
export function moodFit(movie, { mood = 'any', company = 'solo' } = {}) {
    const genres = genreIdsOf(movie);
    const m = TONIGHT_MOODS[mood] || TONIGHT_MOODS.any;
    const c = TONIGHT_COMPANY[company] || TONIGHT_COMPANY.solo;
    if (!genres.length) return 0.5;
    let fit = 0.5;
    if (m.fits.length) {
        const fits = genres.some((g) => m.fits.includes(g));
        const diluted = (m.dilutes || []).some((g) => genres.includes(g));
        fit = fits ? (diluted ? 0.6 : 0.9) : 0.3;
    }
    if (m.clashes.some((g) => genres.includes(g))) fit -= 0.35;
    if (c.prefer.some((g) => genres.includes(g))) fit += 0.1;
    if (c.avoid.some((g) => genres.includes(g))) fit -= 0.45;
    return Math.max(0, Math.min(1, fit));
}

export function contextFit(movie, tonight = {}, cfg = RECO_CONFIG.context) {
    const minutes = tonight.minutes
        || cfg.defaultMinutesByPattern[tonight.pattern]
        || cfg.defaultMinutes;
    return cfg.runtimeWeight * runtimeFit(movie?.runtime, minutes, cfg)
        + cfg.moodWeight * moodFit(movie, tonight);
}

/**
 * Score candidates. candidates: [{ ...movie, vector }].
 * Similarity is min–max scaled within the pool so the weights compare like
 * with like (raw cosines from one model sit in a narrow band).
 * Returns new objects sorted best-first with { score, scores: {...} }.
 */
export function scoreCandidates(candidates, userVector, tonight = {}, cfg = RECO_CONFIG, { clusters = null, familiarity = null } = {}) {
    // With taste clusters, similarity = fit to the best-matching cluster.
    const fits = clusters?.length
        ? candidates.map((c) => (c.vector ? clusterFit(clusters, c.vector) : null))
        : null;
    // Blend in the overall taste vector so small, noisy clusters can't bury a film
    // that fits the user's taste as a whole.
    const blend = clusters?.length ? (cfg.clusters?.globalBlend ?? 0) : 0;
    const raw = fits
        ? fits.map((f, i) => {
            if (!f) return null;
            const v = candidates[i].vector;
            return blend && userVector && v ? (1 - blend) * f.cosine + blend * cosine(userVector, v) : f.cosine;
        })
        : candidates.map((c) => (userVector && c.vector ? cosine(userVector, c.vector) : null));
    const known = raw.filter((x) => x != null);
    const lo = known.length ? Math.min(...known) : 0;
    const hi = known.length ? Math.max(...known) : 1;
    const span = hi - lo || 1;
    const w = cfg.weights;

    return candidates.map((c, i) => {
        // No vector (rare): neutral-low similarity so it can still place on quality/context.
        const similarity = raw[i] == null ? 0.35 : (raw[i] - lo) / span;
        const quality = bayesianQuality(c.vote_average, c.vote_count, cfg.quality);
        const ctx = contextFit(c, tonight, cfg.context);
        // Familiarity: as well-known as the user's usual films (only when we know their level).
        const fam = familiarity != null ? familiarityFit(c.vote_count, familiarity) : null;
        let score = w.similarity * similarity + w.quality * quality + w.contextFit * ctx
            + (fam != null ? (w.familiarity || 0) * fam : 0);
        if (c.onYourServices?.length) score += cfg.bonuses.onYourServices;
        if (c._fresh) score += cfg.bonuses.freshRelease;
        return {
            ...c,
            ...(fits?.[i] ? { _cluster: fits[i].cluster } : {}),
            score: Math.round(score * 1000) / 1000,
            scores: {
                similarity: Math.round(similarity * 1000) / 1000,
                cosine: raw[i] == null ? null : Math.round(raw[i] * 1000) / 1000,
                quality: Math.round(quality * 1000) / 1000,
                contextFit: Math.round(ctx * 1000) / 1000,
                ...(fam != null ? { familiarity: Math.round(fam * 1000) / 1000 } : {}),
            },
        };
    }).sort((a, b) => b.score - a.score || String(a.tmdb_id).localeCompare(String(b.tmdb_id)));
}

/**
 * Maximal Marginal Relevance: pick the best, then keep penalising candidates
 * that are too similar to anything already chosen. scored: best-first with
 * .score and .vector. Returns k items.
 */
export function mmrSelect(scored, k, { lambda = RECO_CONFIG.mmrLambda } = {}) {
    const pool = scored.slice();
    const picked = [];
    const maxScore = Math.max(...pool.map((c) => c.score), 1e-9);
    while (picked.length < k && pool.length) {
        let bestIdx = 0;
        let bestVal = -Infinity;
        pool.forEach((c, idx) => {
            const relevance = c.score / maxScore;
            const redundancy = picked.length
                ? Math.max(...picked.map((p) => (c.vector && p.vector ? cosine(c.vector, p.vector) : 0)))
                : 0;
            const val = lambda * relevance - (1 - lambda) * redundancy;
            if (val > bestVal) { bestVal = val; bestIdx = idx; }
        });
        picked.push(pool.splice(bestIdx, 1)[0]);
    }
    return picked;
}
