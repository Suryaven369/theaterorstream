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
export function scoreCandidates(candidates, userVector, tonight = {}, cfg = RECO_CONFIG) {
    const raw = candidates.map((c) => (userVector && c.vector ? cosine(userVector, c.vector) : null));
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
        let score = w.similarity * similarity + w.quality * quality + w.contextFit * ctx;
        if (c.onYourServices?.length) score += cfg.bonuses.onYourServices;
        if (c._fresh) score += cfg.bonuses.freshRelease;
        return {
            ...c,
            score: Math.round(score * 1000) / 1000,
            scores: {
                similarity: Math.round(similarity * 1000) / 1000,
                cosine: raw[i] == null ? null : Math.round(raw[i] * 1000) / 1000,
                quality: Math.round(quality * 1000) / 1000,
                contextFit: Math.round(ctx * 1000) / 1000,
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
