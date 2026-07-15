/**
 * In-memory + localStorage cache for Home feed + thread pages.
 * Survives route changes AND page reloads for instant rendering.
 */

export const FEED_TTL_MS = 90_000; // 90s for fresh
const FEED_STALE_TTL_MS = 300_000; // 5min for stale-while-revalidate
const THREAD_TTL_MS = 120_000;
const COMMENTS_TTL_MS = 60_000;

const STORAGE_KEY_FEED = 'tos_feed_cache';
const STORAGE_KEY_THREAD = 'tos_thread_cache';

const feedByScope = new Map(); // scope -> { items, offset, hasMore, ts }
const threadById = new Map(); // item.id -> { item, ts }
const commentsByKey = new Map(); // subjectKey -> { list, ts }
let syncLikesDoneForUser = null;
let storageInitialized = false;

function isFresh(ts, ttl) {
  return typeof ts === 'number' && Date.now() - ts < ttl;
}

function initFromStorage() {
  if (storageInitialized || typeof localStorage === 'undefined') return;
  storageInitialized = true;
  try {
    const feedData = localStorage.getItem(STORAGE_KEY_FEED);
    if (feedData) {
      const parsed = JSON.parse(feedData);
      for (const [scope, entry] of Object.entries(parsed)) {
        if (entry?.ts && isFresh(entry.ts, FEED_STALE_TTL_MS)) {
          feedByScope.set(scope, entry);
          for (const item of entry.items || []) {
            if (item?.id) threadById.set(item.id, { item, ts: entry.ts });
          }
        }
      }
    }
  } catch {
    // Ignore parse errors
  }
}

function persistToStorage() {
  if (typeof localStorage === 'undefined') return;
  try {
    const feedObj = {};
    for (const [scope, entry] of feedByScope.entries()) {
      if (entry?.ts && isFresh(entry.ts, FEED_STALE_TTL_MS)) {
        // Only persist first 30 items to keep storage small
        feedObj[scope] = {
          ...entry,
          items: (entry.items || []).slice(0, 30),
        };
      }
    }
    localStorage.setItem(STORAGE_KEY_FEED, JSON.stringify(feedObj));
  } catch {
    // Storage full or unavailable
  }
}

export function getCachedFeed(scope = 'all', allowStale = false) {
  initFromStorage();
  const entry = feedByScope.get(scope);
  if (!entry) return null;
  const ttl = allowStale ? FEED_STALE_TTL_MS : FEED_TTL_MS;
  if (!isFresh(entry.ts, ttl)) return null;
  return entry;
}

export function isFeedStale(scope = 'all') {
  initFromStorage();
  const entry = feedByScope.get(scope);
  if (!entry?.ts) return true;
  return !isFresh(entry.ts, FEED_TTL_MS);
}

/** Force Home to refetch so newly public blogs appear immediately. */
export function invalidateFeedCaches() {
  feedByScope.clear();
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY_FEED);
  } catch { /* ignore */ }
}

export function setCachedFeed(scope, { items, offset, hasMore }) {
  feedByScope.set(scope, {
    items: Array.isArray(items) ? items : [],
    offset: offset || 0,
    hasMore: !!hasMore,
    ts: Date.now(),
  });
  // Index items for instant thread opens
  for (const item of items || []) {
    if (item?.id) setCachedThreadItem(item);
  }
  // Persist to localStorage for page reload survival
  persistToStorage();
}

export function patchCachedFeedItem(itemId, patch) {
  if (!itemId || !patch) return;
  for (const [scope, entry] of feedByScope.entries()) {
    const idx = entry.items.findIndex((i) => i.id === itemId);
    if (idx < 0) continue;
    const next = { ...entry.items[idx], ...patch };
    const items = entry.items.slice();
    items[idx] = next;
    feedByScope.set(scope, { ...entry, items });
    setCachedThreadItem(next);
  }
  const thread = threadById.get(itemId);
  if (thread?.item) {
    threadById.set(itemId, { item: { ...thread.item, ...patch }, ts: Date.now() });
  }
}

export function getCachedThreadItem(itemId) {
  if (!itemId) return null;
  const entry = threadById.get(itemId);
  if (!entry || !isFresh(entry.ts, THREAD_TTL_MS)) return null;
  return entry.item;
}

export function setCachedThreadItem(item) {
  if (!item?.id) return;
  threadById.set(item.id, { item, ts: Date.now() });
}

/** Match a cached feed/thread item against a /thread/:feedId slug. */
export function findCachedThreadByFeedId(feedId, parseFeedThreadId) {
  if (!feedId) return null;

  // Direct map hit if feedId is already an item id
  const direct = getCachedThreadItem(feedId);
  if (direct) return direct;

  const parsed = typeof parseFeedThreadId === 'function' ? parseFeedThreadId(feedId) : null;

  for (const entry of threadById.values()) {
    if (!isFresh(entry.ts, THREAD_TTL_MS)) continue;
    const item = entry.item;
    if (!item?.id) continue;

    if (parsed?.id) {
      const bare = String(item.id).replace(/^(article-|trailer-)/, '');
      if (bare === parsed.id || item.id === parsed.id) return item;
      if (parsed.kind === 'trailer' && String(item.tmdb_id) === String(parsed.id)) return item;
    }
    if (parsed?.shortId) {
      const bare = String(item.id).replace(/^article-/, '').replace(/-/g, '');
      if (bare.startsWith(parsed.shortId)) return item;
    }
  }

  // Also scan live feed caches
  for (const feed of feedByScope.values()) {
    if (!isFresh(feed.ts, FEED_TTL_MS)) continue;
    for (const item of feed.items) {
      if (!item?.id) continue;
      if (parsed?.id) {
        const bare = String(item.id).replace(/^(article-|trailer-)/, '');
        if (bare === parsed.id || item.id === parsed.id) return item;
        if (parsed.kind === 'trailer' && String(item.tmdb_id) === String(parsed.id)) return item;
      }
      if (parsed?.shortId) {
        const bare = String(item.id).replace(/^article-/, '').replace(/-/g, '');
        if (bare.startsWith(parsed.shortId)) return item;
      }
    }
  }

  return null;
}

export function getCachedComments(key) {
  const entry = commentsByKey.get(key);
  if (!entry || !isFresh(entry.ts, COMMENTS_TTL_MS)) return null;
  return entry.list;
}

export function setCachedComments(key, list) {
  if (!key) return;
  commentsByKey.set(key, { list: Array.isArray(list) ? list : [], ts: Date.now() });
}

/** Run local→server upvote sync at most once per user per session. */
export function shouldSyncLocalLikes(userId) {
  if (!userId) return false;
  if (syncLikesDoneForUser === userId) return false;
  syncLikesDoneForUser = userId;
  return true;
}
