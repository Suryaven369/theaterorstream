/**
 * Behavioural event tracking — the client half of the learning engine.
 *
 * Calls are fire-and-forget and batched: events queue in memory and flush on a
 * short debounce (or when the tab hides), so wiring trackEvent() into hot paths
 * like card impressions never blocks the UI or floods the API.
 */
import { sendEvents } from './recommendationApi';

export const EVENT_TYPES = {
    MOVIE_VIEW: 'movie_view',
    TRAILER_PLAYED: 'trailer_played',
    TRAILER_COMPLETED: 'trailer_completed',
    WATCHLISTED: 'watchlisted',
    WATCHLIST_REMOVED: 'watchlist_removed',
    MOVIE_LIKED: 'movie_liked',
    MOVIE_DISLIKED: 'movie_disliked',
    SHARED: 'shared',
    COLLECTION_ADDED: 'collection_added',
    COLLECTION_CREATED: 'collection_created',
    COLLECTION_UPDATED: 'collection_updated',
    SEARCH_PERFORMED: 'search_performed',
    SEARCH_RESULT_CLICKED: 'search_result_clicked',
    RECOMMENDATION_CLICKED: 'recommendation_clicked',
    RECOMMENDATION_IGNORED: 'recommendation_ignored',
};

const FLUSH_DELAY_MS = 1500;
const MAX_QUEUE = 40;

let queue = [];
let timer = null;

function flush() {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
    if (!queue.length) return;
    const batch = queue.splice(0, queue.length);
    // Never let a failed flush throw into a render/effect path.
    Promise.resolve(sendEvents(batch)).catch(() => {});
}

function scheduleFlush() {
    if (queue.length >= MAX_QUEUE) {
        flush();
        return;
    }
    if (timer) return;
    timer = setTimeout(flush, FLUSH_DELAY_MS);
}

/**
 * Queue a behavioural event.
 * @param {string} eventType one of EVENT_TYPES
 * @param {{ tmdbId?: string|number, mediaType?: string, metadata?: object }} [payload]
 */
export function trackEvent(eventType, payload = {}) {
    if (!eventType) return;
    queue.push({
        eventType,
        tmdbId: payload.tmdbId ?? payload.tmdb_id ?? null,
        mediaType: payload.mediaType || payload.media_type || 'movie',
        metadata: payload.metadata || {},
    });
    scheduleFlush();
}

// Flush on tab hide / unload so queued events aren't lost.
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
}
