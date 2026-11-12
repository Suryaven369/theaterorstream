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

// Titles marked watched / liked / rated / dismissed this session.
const seenIds = new Set();
const idOf = (m) => String(m?.tmdb_id ?? m?.tmdbId ?? m?.id ?? '');

/**
 * Drop seen titles from a row and fill each gap with the next saved backup
 * (row.reserve, sent by the server), keeping the row at its original size.
 */
export function refillRow(row) {
    if (!row?.items) return row;
    const items = row.items.filter((m) => !seenIds.has(idOf(m)));
    const reserve = (row.reserve || []).filter((m) => !seenIds.has(idOf(m)));
    const target = row.target ?? row.items.length;
    const have = new Set(items.map(idOf));
    while (items.length < target && reserve.length) {
        const next = reserve.shift();
        if (have.has(idOf(next))) continue;
        have.add(idOf(next));
        items.push(next);
    }
    if (items.length === row.items.length && items.every((m, i) => m === row.items[i])) return row;
    return { ...row, items, reserve };
}

const ROW_KEYS = ['forYou', 'tonight', 'trending', 'family', 'becauseLoved', 'hiddenGems', 'outsideComfort', 'moodRow'];

/** Remove a title from cached rows after watched / dislike and swap in a backup. */
export function removeFromWatchSessionCache(userId, tmdbId) {
    if (tmdbId == null) return;
    const id = String(tmdbId);
    seenIds.add(id);
    const cached = getWatchSessionCache(userId);
    if (!cached) return;
    const next = { ...cached };
    ROW_KEYS.forEach((k) => { if (cached[k]) next[k] = refillRow(cached[k]); });
    next.perfect = cached.perfect?.movie && idOf(cached.perfect.movie) === id
        ? { movie: null, loading: false }
        : cached.perfect;
    setWatchSessionCache(userId, next);
}

/**
 * Call when the user marks a title watched / liked / disliked / logged / rated
 * anywhere in the app, so the Watch tab replaces it with a backup title.
 */
export function markSeenInWatchCache(tmdbId) {
    if (tmdbId == null) return;
    seenIds.add(String(tmdbId));
    if (!entry?.userId) return;
    removeFromWatchSessionCache(entry.userId, tmdbId);
}

export function clearWatchSessionCache() {
    entry = null;
    seenIds.clear();
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
