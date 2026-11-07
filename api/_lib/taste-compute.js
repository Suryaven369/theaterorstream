/**
 * Taste Map math — pure functions over a user's films (no I/O, unit-testable).
 *
 * Principles:
 *  - Use ALL history (ratings, diary-log ratings, likes, dislikes), with gentle
 *    recency decay so old favourites still count but recent taste leads.
 *  - Judge each film against the user's OWN rating scale: a generous rater's 7
 *    is a "meh". Ratings are converted to z-scores around their personal mean.
 *  - Rank genres/moods/people by how much the user likes them relative to their
 *    average (affinity, shrunk toward 0 for small samples) AND how much of their
 *    loved viewing they make up (share) — never by raw counts alone.
 */

const DAY_MS = 86400000;
const RECENCY_HALF_LIFE_DAYS = 365;
const RECENCY_FLOOR = 0.35;           // a 3-year-old rating still counts a third
const SHRINK_K = 2.5;                  // pseudo-count pulling small samples to neutral
const MIN_SD = 0.75;

const AXIS_KEYS = ['acting', 'screenplay', 'sound', 'direction', 'entertainment', 'pacing', 'cinematography'];

export const GENRE_NAMES = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
    10759: 'Action', 10765: 'Sci-Fi', 10768: 'War', 10762: 'Family', 10764: 'Reality', 10767: 'Talk',
};

/** TV "combo" genres → their movie equivalents so shows and films pool together. */
const TV_GENRE_ALIASES = { 10759: ['28', '12'], 10765: ['878', '14'], 10768: ['10752'], 10762: ['10751'] };

/**
 * Mood inference (library mood_tags are empty): genre-led, refined by TMDB
 * keywords. Each entry: mood → { genres: weight by genre id, keywords: regex }.
 */
const MOOD_RULES = {
    mind_bending: { genres: { 878: 0.6, 9648: 0.7 }, keywords: /twist|time (travel|loop)|dream|simulation|alternate|parallel|psychological|mind|nonlinear|identity|memory/i },
    suspenseful: { genres: { 53: 1, 9648: 0.8, 80: 0.5 }, keywords: /suspense|cat and mouse|manhunt|hostage|kidnap|conspiracy|heist|investigation/i },
    dark: { genres: { 27: 0.9, 80: 0.6, 53: 0.4, 10752: 0.5 }, keywords: /serial killer|murder|revenge|gore|violence|torture|corruption|nihilism|grief|addiction/i },
    intense: { genres: { 28: 0.6, 53: 0.6, 27: 0.5, 10752: 0.7 }, keywords: /survival|chase|war|battle|fight|hostage|siege|escape/i },
    action_packed: { genres: { 28: 1, 12: 0.5 }, keywords: /martial arts|shootout|car chase|explosion|superhero|assassin|mercenary|one man army/i },
    funny: { genres: { 35: 1 }, keywords: /comedy|parody|satire|buddy|slapstick|mockumentary|spoof/i },
    feel_good: { genres: { 35: 0.5, 10751: 0.8, 16: 0.6, 10402: 0.6, 10749: 0.3 }, keywords: /friendship|feel.?good|heartwarming|underdog|coming of age|road trip|uplifting/i },
    emotional: { genres: { 18: 0.8, 10749: 0.5 }, keywords: /grief|loss|tragedy|cancer|terminal illness|family relationships|loneliness|tearjerker|sacrifice/i },
    romantic: { genres: { 10749: 1 }, keywords: /love|romance|relationship|wedding|first love|romcom/i },
    thoughtful: { genres: { 99: 0.8, 36: 0.6, 18: 0.3 }, keywords: /philosoph|biography|based on true story|social commentary|politics|existential|character study/i },
    family_friendly: { genres: { 10751: 1, 16: 0.8 }, keywords: /family|kids|children|animated|fairy tale/i },
};

export function extractGenreIdsForTaste(movie) {
    let ids = [];
    if (Array.isArray(movie?.genre_ids) && movie.genre_ids.length) ids = movie.genre_ids.map(String);
    else if (Array.isArray(movie?.genres)) ids = movie.genres.map((g) => String(g?.id ?? g)).filter((x) => x && x !== 'undefined');
    const out = new Set();
    ids.forEach((id) => {
        (TV_GENRE_ALIASES[id] || [id]).forEach((g) => out.add(String(g)));
    });
    return [...out];
}

export function overallFromRating(row) {
    const vals = AXIS_KEYS.map((k) => row?.[k]).filter((v) => v != null && !Number.isNaN(Number(v)));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + Number(b), 0) / vals.length;
}

export function recencyWeight(dateIso, now = Date.now()) {
    if (!dateIso) return 0.6;
    const ageDays = Math.max(0, (now - new Date(dateIso).getTime()) / DAY_MS);
    return Math.max(RECENCY_FLOOR, Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS));
}

/**
 * Build one signal per film from every source.
 * @returns {{ films: Array<{ tmdbId, z, weight, rating, liked, disliked, movie }>, stats }}
 */
export function buildFilmSignals({ ratings = [], logs = [], likes = [], dislikes = [], movieById = new Map(), now = Date.now() }) {
    const byFilm = new Map();
    const get = (id) => {
        const key = String(id);
        if (!byFilm.has(key)) byFilm.set(key, { tmdbId: key, rating: null, ratedAt: null, liked: false, likedAt: null, disliked: false, at: null });
        return byFilm.get(key);
    };

    ratings.forEach((r) => {
        const o = overallFromRating(r);
        if (o == null) return;
        const f = get(r.movie_id);
        f.rating = o;
        f.ratedAt = r.updated_at || r.created_at || null;
    });
    // Diary logs carry a rating too (0–10); use it when there is no full rating.
    logs.forEach((l) => {
        if (l.rating == null || Number.isNaN(Number(l.rating))) return;
        const f = get(l.tmdb_id);
        if (f.rating == null) {
            f.rating = Number(l.rating);
            f.ratedAt = l.created_at || l.watched_on || null;
        }
    });
    likes.forEach((l) => {
        const f = get(l.movie_id);
        f.liked = true;
        f.likedAt = l.liked_at || l.created_at || null;
    });
    dislikes.forEach((d) => {
        if (!d.tmdb_id) return;
        const f = get(d.tmdb_id);
        f.disliked = true;
        f.at = d.created_at || f.at;
    });

    const rated = [...byFilm.values()].filter((f) => f.rating != null).map((f) => f.rating);
    const mean = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : 7;
    const variance = rated.length > 1
        ? rated.reduce((a, b) => a + (b - mean) ** 2, 0) / (rated.length - 1)
        : 1.5 ** 2;
    const sd = Math.max(MIN_SD, Math.sqrt(variance));

    const films = [];
    byFilm.forEach((f) => {
        let z = 0;
        if (f.rating != null) {
            z = Math.max(-2.5, Math.min(2.5, (f.rating - mean) / sd));
            // A low absolute score is a dislike no matter how harsh the rater is.
            if (f.rating <= 5) z = Math.min(z, -1.2);
        }
        if (f.liked) z = f.rating != null ? Math.max(z, 0) + 0.6 : 1.0;
        if (f.disliked) z = Math.min(z, -1.5);
        if (z === 0 && f.rating == null) return; // no taste information
        const when = f.ratedAt || f.likedAt || f.at;
        films.push({
            tmdbId: f.tmdbId,
            z,
            weight: recencyWeight(when, now),
            rating: f.rating,
            liked: f.liked,
            disliked: f.disliked,
            at: when,
            movie: movieById.get(f.tmdbId) || null,
        });
    });

    return {
        films,
        stats: {
            mean: Math.round(mean * 100) / 100,
            sd: Math.round(sd * 100) / 100,
            ratedCount: rated.length,
            likedCount: likes.length,
            dislikedCount: dislikes.length,
            filmCount: films.length,
            positiveCount: films.filter((f) => f.z > 0).length,
        },
    };
}

/**
 * Generic "how much do they like X" scorer. `keysOf(film)` returns the keys a
 * film contributes to (genres, decades…) with an optional strength.
 * score = 0.6 × affinity (z-average, shrunk) + 0.4 × share of positive viewing.
 * Returns signed scores in [-1, 1] plus counts.
 */
export function scoreDimension(films, keysOf, { shrink = SHRINK_K, minFilms = 1 } = {}) {
    const agg = new Map(); // key → { zSum, wSum, posW, n }
    let totalPosW = 0;
    films.forEach((f) => {
        const keys = keysOf(f);
        if (!keys?.length) return;
        // Spread a film's influence across its keys (a 4-genre film shouldn't count 4×).
        const split = 1 / Math.sqrt(keys.length);
        if (f.z > 0) totalPosW += f.weight * f.z;
        keys.forEach((entry) => {
            const [key, strength = 1] = Array.isArray(entry) ? entry : [entry, 1];
            const a = agg.get(key) || { zSum: 0, wSum: 0, posW: 0, n: 0 };
            const w = f.weight * split * strength;
            a.zSum += w * f.z;
            a.wSum += w;
            if (f.z > 0) a.posW += f.weight * f.z * strength;
            a.n += 1;
            agg.set(key, a);
        });
    });

    const raw = [];
    agg.forEach((a, key) => {
        if (a.n < minFilms) return;
        const affinity = a.zSum / (a.wSum + shrink);
        const share = totalPosW > 0 ? a.posW / totalPosW : 0;
        raw.push({ key, affinity, share, n: a.n });
    });
    if (!raw.length) return [];

    const maxAff = Math.max(...raw.map((r) => Math.abs(r.affinity)), 0.001);
    const maxShare = Math.max(...raw.map((r) => r.share), 0.001);
    const scored = raw.map((r) => ({
        key: r.key,
        n: r.n,
        score: 0.6 * (r.affinity / maxAff) + 0.4 * (r.share / maxShare),
    }));
    const maxAbs = Math.max(...scored.map((s) => Math.abs(s.score)), 0.001);
    return scored
        .map((s) => ({ ...s, score: Math.round((s.score / maxAbs) * 100) / 100 }))
        .sort((a, b) => b.score - a.score);
}

export function computeGenreWeights(films) {
    const scored = scoreDimension(films, (f) => extractGenreIdsForTaste(f.movie));
    return Object.fromEntries(scored.map((s) => [s.key, s.score]));
}

export function inferMoods(movie) {
    const genres = new Set(extractGenreIdsForTaste(movie).map(Number));
    const kwText = (Array.isArray(movie?.keywords) ? movie.keywords : [])
        .map((k) => k?.name || k).filter(Boolean).join(' | ');
    const out = [];
    Object.entries(MOOD_RULES).forEach(([mood, rule]) => {
        let s = 0;
        Object.entries(rule.genres).forEach(([g, w]) => { if (genres.has(Number(g))) s = Math.max(s, w); });
        if (kwText && rule.keywords.test(kwText)) s += 0.5;
        if (Array.isArray(movie?.mood_tags) && movie.mood_tags.includes(mood)) s += 0.5;
        if (s >= 0.5) out.push([mood, Math.min(1.5, s)]);
    });
    return out;
}

export function computeMoodPreferences(films, { top = 6 } = {}) {
    const scored = scoreDimension(films, (f) => inferMoods(f.movie), { minFilms: 2 });
    return Object.fromEntries(scored.filter((s) => s.score > 0).slice(0, top).map((s) => [s.key, s.score]));
}

/** Decades / languages: positive viewing only, must be a real pattern (≥2 films, ≥10%). */
function patternShare(films, keyOf, { minFilms = 2, minShare = 0.1, top = 4 } = {}) {
    const pos = films.filter((f) => f.z > 0);
    const totals = new Map();
    let total = 0;
    pos.forEach((f) => {
        const key = keyOf(f.movie);
        if (key == null) return;
        const w = f.weight * f.z;
        total += w;
        const t = totals.get(key) || { w: 0, n: 0 };
        t.w += w;
        t.n += 1;
        totals.set(key, t);
    });
    if (!total) return [];
    return [...totals.entries()]
        .filter(([, t]) => t.n >= minFilms && t.w / total >= minShare)
        .sort((a, b) => b[1].w - a[1].w)
        .slice(0, top)
        .map(([key]) => key);
}

export function computePreferredDecades(films) {
    return patternShare(films, (m) => {
        const y = parseInt(String(m?.release_date || m?.first_air_date || '').slice(0, 4), 10);
        return Number.isFinite(y) && y >= 1900 ? Math.floor(y / 10) * 10 : null;
    });
}

export function computePreferredLanguages(films) {
    return patternShare(films, (m) => m?.original_language || null, { minShare: 0.06, top: 4 });
}

/** Directors and top-billed actors who show up across the user's favourite films. */
export function computeLearnedPeople(films, { topDirectors = 6, topActors = 8 } = {}) {
    const directors = new Map();
    const actors = new Map();
    const bump = (map, person, w, film) => {
        if (!person?.id || !person?.name) return;
        const e = map.get(person.id) || { id: person.id, name: person.name, profile_path: person.profile_path || null, score: 0, films: new Set(), titles: [] };
        e.score += w;
        if (!e.films.has(film.tmdbId)) {
            e.films.add(film.tmdbId);
            if (film.movie?.title && e.titles.length < 3) e.titles.push(film.movie.title);
        }
        map.set(person.id, e);
    };
    films.filter((f) => f.z > 0 && f.movie?.credits).forEach((f) => {
        const w = f.weight * f.z;
        (f.movie.credits.crew || []).filter((c) => c.job === 'Director').forEach((d) => bump(directors, d, w, f));
        (f.movie.credits.cast || []).filter((c) => (c.order ?? 99) < 5).forEach((a) => bump(actors, a, w, f));
    });
    const finish = (map, top) => [...map.values()]
        .filter((e) => e.films.size >= 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, top)
        .map((e) => ({ id: e.id, name: e.name, profile_path: e.profile_path, count: e.films.size, titles: e.titles }));
    return { directors: finish(directors, topDirectors), actors: finish(actors, topActors) };
}

/** Craft axes (acting, pacing…): weighted by how much above their norm they loved it. */
export function computeAxisPreferences(ratings, mean) {
    const sums = {};
    const weights = {};
    ratings.forEach((r) => {
        const o = overallFromRating(r);
        if (o == null || o < mean) return;
        const w = 1 + (o - mean);
        AXIS_KEYS.forEach((k) => {
            const v = r[k];
            if (v == null || Number.isNaN(Number(v))) return;
            sums[k] = (sums[k] || 0) + Number(v) * w;
            weights[k] = (weights[k] || 0) + w;
        });
    });
    const out = {};
    AXIS_KEYS.forEach((k) => { if (weights[k]) out[k] = Math.round((sums[k] / weights[k]) * 100) / 100; });
    return out;
}

export function computeRuntimeRange(films) {
    const runtimes = films
        .filter((f) => f.z > 0 && Number(f.movie?.runtime) > 0)
        .map((f) => Number(f.movie.runtime))
        .sort((a, b) => a - b);
    if (runtimes.length < 4) return null;
    const q = (p) => runtimes[Math.floor((runtimes.length - 1) * p)];
    const low = q(0.2);
    const high = q(0.8);
    return low < high ? `[${Math.floor(low)},${Math.ceil(high)})` : null;
}

/** Top loved titles, best first (for the LLM summary + "because you loved"). */
export function topLovedTitles(films, n = 8) {
    return films
        .filter((f) => f.z > 0 && f.movie?.title)
        .sort((a, b) => (b.z * b.weight) - (a.z * a.weight))
        .slice(0, n)
        .map((f) => f.movie.title);
}
