/**
 * In-memory Watch-tab cache for the SPA session.
 * Survives Home ↔ Explore ↔ Watch tab switches without re-hitting the API.
 * Cleared on full page reload (new JS context) so the next load can refresh.
 */

const TTL_MS = 45 * 60 * 1000; // 45 minutes within one browser session

let entry = null; // { ts, userId, payload }

export function getWatchSessionCache(userId) {
    if (!entry || !userId || entry.userId !== userId) return null;
    if (Date.now() - entry.ts > TTL_MS) {
        entry = null;
        return null;
    }
    return entry.payload;
}

export function setWatchSessionCache(userId, payload) {
    if (!userId || !payload) return;
    const prev = entry?.userId === userId ? entry.payload : null;
    entry = {
        userId,
        ts: Date.now(),
        // Merge so staggered row fetches don't wipe siblings mid-load.
        payload: { ...(prev || {}), ...payload },
    };
}

/** Drop a title from cached rows after watched / dislike (no re-analysis). */
export function removeFromWatchSessionCache(userId, tmdbId) {
    const cached = getWatchSessionCache(userId);
    if (!cached) return;
    const id = String(tmdbId);
    const strip = (row) => {
        if (!row?.items) return row;
        return {
            ...row,
            items: row.items.filter((m) => String(m.tmdb_id ?? m.id) !== id),
        };
    };
    setWatchSessionCache(userId, {
        ...cached,
        forYou: strip(cached.forYou),
        tonight: strip(cached.tonight),
        trending: strip(cached.trending),
        family: strip(cached.family),
        becauseLoved: strip(cached.becauseLoved),
        hiddenGems: strip(cached.hiddenGems),
        outsideComfort: strip(cached.outsideComfort),
        perfect: cached.perfect?.movie
            && String(cached.perfect.movie.tmdb_id ?? cached.perfect.movie.id) === id
            ? { movie: null, loading: false }
            : cached.perfect,
    });
}

/**
 * Call when the user marks a title watched / liked / disliked / logged / rated
 * anywhere in the app, so the Watch tab never shows it again this session.
 */
export function markSeenInWatchCache(tmdbId) {
    if (!entry?.userId || tmdbId == null) return;
    removeFromWatchSessionCache(entry.userId, tmdbId);
    const mood = entry?.payload?.moodRow;
    if (mood?.items) {
        entry.payload.moodRow = {
            ...mood,
            items: mood.items.filter((m) => String(m.tmdb_id ?? m.id) !== String(tmdbId)),
        };
    }
}

export function clearWatchSessionCache() {
    entry = null;
    inflight.clear();
}

// In-flight request sharing: a remount (StrictMode, tab switch mid-load,
// auth refresh) attaches to the request already running instead of firing
// the same API call again. Entries drop once settled — results live in the
// session cache above.
const inflight = new Map();

export function sharedWatchRequest(key, factory) {
    if (inflight.has(key)) return inflight.get(key);
    const promise = Promise.resolve()
        .then(factory)
        .finally(() => {
            if (inflight.get(key) === promise) inflight.delete(key);
        });
    inflight.set(key, promise);
    return promise;
}
