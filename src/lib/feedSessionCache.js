/**
 * In-memory session cache for Home feed + thread pages.
 * Survives route changes (Home unmount ↔ Thread) so navigations feel instant.
 */

const FEED_TTL_MS = 90_000;
const THREAD_TTL_MS = 120_000;
const COMMENTS_TTL_MS = 60_000;

const feedByScope = new Map(); // scope -> { items, offset, hasMore, ts }
const threadById = new Map(); // item.id -> { item, ts }
const commentsByKey = new Map(); // subjectKey -> { list, ts }
let syncLikesDoneForUser = null;

function isFresh(ts, ttl) {
  return typeof ts === 'number' && Date.now() - ts < ttl;
}

export function getCachedFeed(scope = 'all') {
  const entry = feedByScope.get(scope);
  if (!entry || !isFresh(entry.ts, FEED_TTL_MS)) return null;
  return entry;
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
