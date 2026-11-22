// Session cache for the Feed tab so switching tabs doesn't reload it.
// Admin edits clear it so the next visit refetches.
const CACHE_MS = 5 * 60 * 1000;
let cache = null; // { key, at, data, lists }

export function readHomeFeedCache(key) {
    return cache && cache.key === key && Date.now() - cache.at < CACHE_MS ? cache : null;
}

export function writeHomeFeedCache(entry) {
    cache = { ...entry, at: Date.now() };
}

export function clearHomeFeedCache() {
    cache = null;
}
