/**
 * Recommendation tuning knobs — one place, so the eval script
 * (scripts/eval-recs.mjs) can tune them. Change values here, re-run the eval,
 * keep what raises hit@K.
 */
export const RECO_CONFIG = {
    // Final score = similarity·w + quality·w + contextFit·w (weights sum to 1).
    // Tuned with `npm run eval:recs` (2026-11-07, 138 leave-one-out trials):
    // 0.6/0.2/0.2 → hit@20 32.6%; 0.45/0.45/0.1 → 45.7%. Heavier quality scored
    // higher still, but the eval films are famous titles, so we stop here to
    // avoid everyone getting the same top-rated classics.
    weights: {
        similarity: 0.45,
        quality: 0.45,
        contextFit: 0.1,
    },

    // User vector = mean(loved) − dislikedWeight · mean(disliked), then normalised.
    dislikedWeight: 0.5,

    // Bayesian quality: (v·R + m·C) / (v + m) on TMDB's 0–10 scale.
    quality: {
        priorVotes: 500,   // m — votes needed before a film's own average dominates
        priorMean: 6.6,    // C — typical TMDB average
    },

    // Context fit (tonight): runtime vs time available + mood match.
    context: {
        runtimeWeight: 0.6,
        moodWeight: 0.4,
        // Minutes of slack before an over-long film starts losing points.
        runtimeSlackMin: 10,
        // Score lost per extra 30 minutes over the available time.
        runtimePenaltyPer30: 0.35,
        unknownRuntimeFit: 0.6,
        // Default time available by watching pattern when the user hasn't said.
        defaultMinutesByPattern: { weeknights: 120, weekends: 170, theater: 180, casual: 140 },
        defaultMinutes: 140,
    },

    // Small tie-breakers on top of the weighted score.
    bonuses: {
        onYourServices: 0.05,
        freshRelease: 0.03,
    },

    // MMR diversity: λ·relevance − (1−λ)·max similarity to already-picked titles.
    mmrLambda: 0.72,

    // Feedback recency (Phase 5): newer signals count more.
    feedbackHalfLifeDays: 60,

    // Personal fit (TOS verdict): raw cosine → 0–1. Calibrated on real profiles:
    // ~fitCosineLow is "unrelated", ~fitCosineHigh is "squarely their taste".
    fitCosineLow: 0.2,
    fitCosineHigh: 0.6,
};

// Mood / company definitions are shared with the UI.
export { TONIGHT_MOODS, TONIGHT_COMPANY, TONIGHT_TIMES } from '../../../src/constants/tonight.js';
