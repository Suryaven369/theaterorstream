/**
 * What counts as taste (pure, shared by the engine and scripts/eval-real.mjs).
 *
 * Watch history is the main signal, as on Netflix: every film the user watched
 * is a (weaker) positive. Ratings — TOS ratings and diary ratings alike — are
 * judged on the user's OWN scale (z-score), so a generous rater's 7 is "meh"
 * and a harsh rater's 7 is a favourite. Likes are strong positives; dislikes,
 * and ratings well below the user's average, are negatives. Newer signals
 * count more (feedbackHalfLifeDays), with a floor so old favourites still count.
 *
 * Validated with `npm run eval:real -- --mode folds` (2026-11-22): together with
 * taste clusters, the popular-per-cluster pool and familiarity, recall@20 on
 * real users' held-out films went from 2.1% to 6.7%.
 */
import { RECO_CONFIG } from './config.js';

const DAY_MS = 86400000;

export const SIGNAL_WEIGHTS = {
    watched: 0.5,     // watched, no rating
    liked: 1.2,       // explicit like
    ratingBase: 0.6,  // an average-for-them rating
    ratingPerZ: 0.4,  // each SD above their average adds this
    ratingMax: 1.5,
    dislikeZ: -1,     // a rating this many SDs below their average is a dislike
};

export function recencyWeight(at, now = Date.now(), halfLifeDays = RECO_CONFIG.feedbackHalfLifeDays) {
    const t = typeof at === 'number' ? at : new Date(at || now).getTime();
    const days = Math.max(0, (now - t) / DAY_MS);
    return Math.max(0.3, 0.5 ** (days / halfLifeDays));
}

/**
 * films: [{ id, at, watched?, liked?, tosRating?, logRating?, disliked? }]
 * (at = when it happened; ratings on 0–10). Returns { loved, disliked } as
 * [{ id, weight }], loved sorted strongest first.
 */
export function buildTasteSignals(films, now = Date.now(), w = SIGNAL_WEIGHTS) {
    const ratingOf = (f) => (f.tosRating ?? f.logRating ?? null);
    const rated = films.map(ratingOf).filter((r) => r != null).map(Number);
    const mean = rated.length ? rated.reduce((s, r) => s + r, 0) / rated.length : 7;
    const sd = rated.length > 1
        ? Math.max(0.75, Math.sqrt(rated.reduce((s, r) => s + (r - mean) ** 2, 0) / (rated.length - 1)))
        : 1.5;

    const loved = [];
    const disliked = [];
    films.forEach((f) => {
        const r = ratingOf(f);
        const z = r != null ? (Number(r) - mean) / sd : null;
        const rec = recencyWeight(f.at, now);
        if (f.disliked || (z != null && z <= w.dislikeZ && !f.liked)) {
            disliked.push({ id: String(f.id), weight: rec });
            return;
        }
        let weight = 0;
        if (f.watched) weight = w.watched;
        if (z != null) weight = Math.max(weight, Math.min(w.ratingMax, w.ratingBase + w.ratingPerZ * z));
        if (f.liked) weight = Math.max(weight, w.liked);
        if (weight > 0) loved.push({ id: String(f.id), weight: weight * rec });
    });
    loved.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
    return { loved, disliked };
}
