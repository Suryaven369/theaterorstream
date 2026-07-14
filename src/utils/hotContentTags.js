/** Detect display tags for Hot Right Now cards (announcement, trailer). */

const TRAILER_TYPES = new Set(['Trailer', 'Teaser', 'Featurette']);
export const RECENT_HOT_WINDOW_MS = 24 * 60 * 60 * 1000;

const ANNOUNCEMENT_CHANGE_KEYS = new Set([
    'release_dates',
    'releases',
    'release_date',
    'status',
    'first_air_date',
    'last_air_date',
    'name',
    'title',
]);

export function getRecentCutoffDate() {
    return new Date(Date.now() - RECENT_HOT_WINDOW_MS);
}

export function getRecentCutoffDateStr() {
    return getRecentCutoffDate().toISOString().split('T')[0];
}

/**
 * Trailer / announcement tags — only if activity in the last 24 hours.
 */
export function detectHotTags(fullData, { announcedRecently = false } = {}) {
    if (!fullData) return [];

    const tags = [];
    const cutoff = getRecentCutoffDate();

    const videos = fullData.videos?.results || [];
    const hasRecentTrailer = videos.some((video) => {
        if (!TRAILER_TYPES.has(video.type) || !video.key || !video.published_at) return false;
        return new Date(video.published_at) >= cutoff;
    });

    if (hasRecentTrailer) {
        tags.push('trailer');
    }

    if (announcedRecently) {
        tags.push('announcement');
    }

    return tags;
}

/** Check TMDB changes API for release/status updates in the last 24 hours. */
export async function checkRecentAnnouncement(tmdbApi, mediaType, tmdbId) {
    const end = new Date().toISOString().split('T')[0];
    const start = getRecentCutoffDateStr();
    const endpoint = mediaType === 'tv' ? `/tv/${tmdbId}/changes` : `/movie/${tmdbId}/changes`;

    try {
        const res = await tmdbApi.get(endpoint, { params: { start_date: start, end_date: end } });
        return (res.data.changes || []).some(
            (change) => ANNOUNCEMENT_CHANGE_KEYS.has(change.key) && change.items?.length > 0,
        );
    } catch {
        return false;
    }
}

export function formatHotTagLabel(tag) {
    if (tag === 'announcement') return 'Announcement';
    if (tag === 'trailer') return 'Trailer';
    return tag;
}
