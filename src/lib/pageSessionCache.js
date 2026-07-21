/**
 * In-memory page/data cache for instant SPA back/forward navigation.
 * Pattern: show cached UI immediately, revalidate in background (SWR).
 */

export const PAGE_FRESH_TTL_MS = 90_000; // treat as fresh for 90s
export const PAGE_STALE_TTL_MS = 15 * 60_000; // usable stale for 15min

const store = new Map(); // key -> { data, ts }
const inflight = new Map(); // key -> Promise

function isFresh(ts, ttl) {
  return typeof ts === 'number' && Date.now() - ts < ttl;
}

export function getPageCache(key, { allowStale = true } = {}) {
  if (!key) return null;
  const entry = store.get(key);
  if (!entry?.data) return null;
  const ttl = allowStale ? PAGE_STALE_TTL_MS : PAGE_FRESH_TTL_MS;
  if (!isFresh(entry.ts, ttl)) return null;
  return entry.data;
}

export function isPageCacheFresh(key) {
  const entry = store.get(key);
  if (!entry?.ts) return false;
  return isFresh(entry.ts, PAGE_FRESH_TTL_MS);
}

export function setPageCache(key, data) {
  if (!key || data == null) return;
  store.set(key, { data, ts: Date.now() });
}

export function invalidatePageCache(keyOrPrefix) {
  if (!keyOrPrefix) {
    store.clear();
    return;
  }
  if (store.has(keyOrPrefix)) {
    store.delete(keyOrPrefix);
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(keyOrPrefix)) store.delete(key);
  }
}

export function peekPageCacheEntry(key) {
  return store.get(key) || null;
}

/**
 * Deduped fetch: returns cached data immediately via onCached,
 * always revalidates unless fresh and skipIfFresh is true.
 */
export async function loadWithPageCache({
  key,
  fetcher,
  onCached,
  onFresh,
  skipIfFresh = false,
}) {
  if (!key || typeof fetcher !== 'function') {
    const data = await fetcher?.();
    onFresh?.(data);
    return data;
  }

  const cached = getPageCache(key, { allowStale: true });
  if (cached != null) {
    onCached?.(cached);
    if (skipIfFresh && isPageCacheFresh(key)) {
      return cached;
    }
  }

  if (inflight.has(key)) {
    const data = await inflight.get(key);
    onFresh?.(data);
    return data;
  }

  const promise = (async () => {
    const data = await fetcher();
    if (data != null) setPageCache(key, data);
    return data;
  })();

  inflight.set(key, promise);
  try {
    const data = await promise;
    onFresh?.(data);
    return data;
  } finally {
    inflight.delete(key);
  }
}

/** Collection detail cache key */
export function collectionPageKey(slug, viewerUserId = null) {
  return `collection:${slug || ''}:${viewerUserId || 'anon'}`;
}

/** User collections list cache key */
export function collectionsListKey(profileId, own = false) {
  return `collections-list:${profileId || ''}:${own ? 'own' : 'public'}`;
}

/** Prefetch a collection page into cache (e.g. link hover). */
export function prefetchCollectionPage(slug, viewerUserId, fetcher) {
  const key = collectionPageKey(slug, viewerUserId);
  if (!slug || isPageCacheFresh(key) || inflight.has(key)) return;
  loadWithPageCache({
    key,
    fetcher,
    skipIfFresh: true,
  }).catch(() => {});
}
