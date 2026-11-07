/**
 * Phase 7 — TOS verdict: Theater / Wait for OTT / Skip.
 *
 *   quality     Bayesian blend of TMDB votes (base) + our users' ratings + the
 *               AI review analysis + external critic scores (pluggable), so a
 *               few early votes can't swing it.
 *   bigScreen   spectacle (genres, keywords, runtime) vs dialogue-driven.
 *   personalFit taste similarity from Phase 3 (signed-in users), optional.
 *   confidence  "early reviews" while evidence is thin.
 *
 * Pure decide() is unit-tested; computeTosVerdict() gathers inputs.
 */

// ---------------------------------------------------------------------------
// Critic scores — pluggable providers
// ---------------------------------------------------------------------------

/**
 * @typedef {{ criticScore10: number, source: string, details?: object }} CriticScore
 * @typedef {{ name: string, isConfigured(): boolean, getScores(movie: object): Promise<CriticScore|null> }} CriticScoreProvider
 */

/** OMDb (Rotten Tomatoes / Metacritic / IMDb) — needs OMDB_API_KEY + imdb_id. */
export const omdbProvider = {
    name: 'omdb',
    isConfigured: () => !!process.env.OMDB_API_KEY,
    async getScores(movie) {
        // TODO: add OMDB_API_KEY in Vercel env to enable critic scores (free tier: 1k/day).
        if (!this.isConfigured() || !movie?.imdb_id) return null;
        const url = `https://www.omdbapi.com/?i=${encodeURIComponent(movie.imdb_id)}&apikey=${process.env.OMDB_API_KEY}`;
        const res = await fetch(url).catch(() => null);
        if (!res?.ok) return null;
        const d = await res.json().catch(() => null);
        if (!d || d.Response === 'False') return null;
        const rt = (d.Ratings || []).find((r) => r.Source === 'Rotten Tomatoes')?.Value; // "91%"
        const mc = Number(d.Metascore);                                                   // 0–100
        const parts = [];
        if (rt) parts.push(Number(String(rt).replace('%', '')) / 10);
        if (Number.isFinite(mc)) parts.push(mc / 10);
        if (!parts.length) return null;
        return {
            criticScore10: parts.reduce((a, b) => a + b, 0) / parts.length,
            source: 'omdb',
            details: { rottenTomatoes: rt || null, metacritic: Number.isFinite(mc) ? mc : null },
        };
    },
};

const criticProviders = [omdbProvider];

/** Register another critic source (e.g. a licensed RT feed) without touching the verdict code. */
export function registerCriticProvider(provider) {
    criticProviders.unshift(provider);
}

export async function fetchCriticScores(movie) {
    for (const p of criticProviders) {
        if (!p.isConfigured()) continue;
        try {
            // eslint-disable-next-line no-await-in-loop
            const s = await p.getScores(movie);
            if (s) return s;
        } catch { /* try next */ }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Pure scoring + decision
// ---------------------------------------------------------------------------

export const TOS_CONFIG = {
    priorVotes: 400,         // m — "virtual" votes at the prior mean
    priorMean: 6.5,          // C
    communityVoteWeight: 15, // one of our users' ratings ≈ 15 TMDB votes
    aiReviewWeight: 120,     // AI review analysis ≈ 120 votes
    criticWeight: 400,       // critic consensus ≈ 400 votes
    earlyVotes: 150,         // below this (all sources) → "early reviews"
    solidVotes: 1500,
    theaterWindowDays: 75,   // released within this window (or upcoming) = theatrical
    theaterMinQuality: 6.8,
    theaterMinBigScreen: 0.5,
    mustSeeQuality: 7.8,     // great films earn the theater with less spectacle
    skipBelow: 5.8,
};

const SPECTACLE_GENRES = { 28: 0.3, 878: 0.3, 12: 0.25, 14: 0.2, 10752: 0.2, 16: 0.12, 53: 0.1, 27: 0.08, 10402: 0.1 };
const DIALOGUE_GENRES = { 18: -0.12, 10749: -0.15, 35: -0.1, 99: -0.2, 10770: -0.3 };
const SPECTACLE_KEYWORDS = /\b(imax|3d|epic|space|spacecraft|outer space|superhero|battle|war|dinosaur|kaiju|monster|explosion|car chase|disaster|alien|visual effects|spectacle|musical|concert|aerial|heist|martial arts)\b/i;
const INTIMATE_KEYWORDS = /\b(dialogue|chamber piece|conversation|relationship drama|slice of life|courtroom|single location|mumblecore)\b/i;

function genreIds(movie) {
    if (Array.isArray(movie?.genre_ids) && movie.genre_ids.length) return movie.genre_ids.map(Number);
    return (movie?.genres || []).map((g) => Number(g?.id ?? g)).filter(Boolean);
}

/** 0–10 quality, Bayesian across sources; returns { quality, evidenceVotes }. */
export function blendQuality({ tmdbAvg, tmdbVotes, communityAvg, communityCount, aiOverall, criticScore10 }, cfg = TOS_CONFIG) {
    let num = cfg.priorVotes * cfg.priorMean;
    let den = cfg.priorVotes;
    let evidence = 0;
    const add = (value, weight) => {
        if (value == null || !Number.isFinite(Number(value)) || weight <= 0) return;
        num += Number(value) * weight;
        den += weight;
        evidence += weight;
    };
    add(tmdbAvg, Math.max(0, Number(tmdbVotes) || 0));
    add(communityAvg, (Number(communityCount) || 0) * cfg.communityVoteWeight);
    add(aiOverall, aiOverall != null ? cfg.aiReviewWeight : 0);
    add(criticScore10, criticScore10 != null ? cfg.criticWeight : 0);
    return { quality: Math.round((num / den) * 100) / 100, evidenceVotes: Math.round(evidence) };
}

/** 0–1: how much the big screen adds. */
export function bigScreenScore(movie) {
    const ids = genreIds(movie);
    let s = 0.35;
    ids.forEach((g) => { s += SPECTACLE_GENRES[g] || 0; s += DIALOGUE_GENRES[g] || 0; });
    const kw = (Array.isArray(movie?.keywords) ? movie.keywords : []).map((k) => k?.name || k).join(' | ');
    if (SPECTACLE_KEYWORDS.test(kw)) s += 0.15;
    if (INTIMATE_KEYWORDS.test(kw)) s -= 0.12;
    const rt = Number(movie?.runtime) || 0;
    if (rt >= 140) s += 0.08; else if (rt && rt < 95) s -= 0.05;
    return Math.round(Math.max(0, Math.min(1, s)) * 100) / 100;
}

export function confidenceLabel(evidenceVotes, cfg = TOS_CONFIG) {
    if (evidenceVotes < cfg.earlyVotes) return 'early reviews';
    if (evidenceVotes < cfg.solidVotes) return 'moderate';
    return 'high';
}

function isTheatricalWindow(releaseDate, now = Date.now(), cfg = TOS_CONFIG) {
    if (!releaseDate) return false;
    const days = (now - new Date(releaseDate).getTime()) / 86400000;
    return days <= cfg.theaterWindowDays; // includes upcoming (negative days)
}

/**
 * Decide the verdict from computed inputs.
 * @param {{ quality: number, bigScreen: number, personalFit: number|null, confidence: string,
 *           releaseDate: string|null, streamingNow: boolean }} input
 */
export function decideVerdict(input, cfg = TOS_CONFIG, now = Date.now()) {
    const { quality, bigScreen, personalFit = null, confidence, releaseDate, streamingNow = false } = input;
    const inWindow = isTheatricalWindow(releaseDate, now, cfg) && !streamingNow;
    const fitNote = personalFit == null ? '' : personalFit >= 0.65 ? ' and it suits your taste' : personalFit < 0.35 ? ', though it’s not really your kind of film' : '';
    const early = confidence === 'early reviews' ? ' (early reviews — may change)' : '';

    if (quality < cfg.skipBelow || (personalFit != null && personalFit < 0.2 && quality < 7)) {
        return { verdict: 'Skip', reason: `Reviews are weak (${quality.toFixed(1)}/10)${fitNote}${early}.` };
    }

    const theaterWorthy = quality >= cfg.mustSeeQuality
        ? bigScreen >= 0.35
        : quality >= cfg.theaterMinQuality && bigScreen >= cfg.theaterMinBigScreen;
    // A poor personal fit takes the edge off a marginal theater call.
    const fitDowngrade = personalFit != null && personalFit < 0.35 && quality < cfg.mustSeeQuality;

    if (inWindow && theaterWorthy && !fitDowngrade) {
        const why = bigScreen >= 0.6 ? 'built for the big screen' : 'strong enough to be worth the trip';
        return { verdict: 'Theater', reason: `${quality.toFixed(1)}/10 and ${why}${fitNote}${early}.` };
    }

    if (!inWindow) {
        return {
            verdict: 'Wait for OTT',
            reason: `${streamingNow ? 'Already streaming' : 'Out of theaters'} — ${quality.toFixed(1)}/10, best enjoyed at home${fitNote}${early}.`,
        };
    }
    return {
        verdict: 'Wait for OTT',
        reason: `${quality.toFixed(1)}/10 — good, but it won’t lose much on a TV${fitNote}${early}.`,
    };
}

/**
 * Full verdict for a title.
 * @param {{ movie: object, community?: { avg: number, count: number }, aiOverall?: number|null,
 *           personalFit?: number|null, streamingNow?: boolean, critic?: object|null }} input
 */
export function buildVerdict({ movie, community = null, aiOverall = null, personalFit = null, streamingNow = false, critic = null }) {
    const { quality, evidenceVotes } = blendQuality({
        tmdbAvg: movie?.vote_average,
        tmdbVotes: movie?.vote_count,
        communityAvg: community?.avg ?? null,
        communityCount: community?.count ?? 0,
        aiOverall,
        criticScore10: critic?.criticScore10 ?? null,
    });
    const big = bigScreenScore(movie);
    const confidence = confidenceLabel(evidenceVotes);
    const fit = personalFit == null ? null : Math.round(Math.max(0, Math.min(1, personalFit)) * 100) / 100;
    const { verdict, reason } = decideVerdict({
        quality, bigScreen: big, personalFit: fit, confidence,
        releaseDate: movie?.release_date || movie?.first_air_date || null,
        streamingNow,
    });
    return {
        verdict,
        qualityScore: quality,
        bigScreenScore: big,
        personalFit: fit,
        confidence,
        reason,
        sources: {
            tmdb: { avg: movie?.vote_average ?? null, votes: movie?.vote_count ?? 0 },
            community: community || null,
            aiReview: aiOverall,
            critic: critic ? { score10: critic.criticScore10, source: critic.source, ...critic.details } : null,
        },
    };
}
