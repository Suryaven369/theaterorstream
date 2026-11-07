import { getSupabaseAdmin } from './supabase-admin.js';
import { fetchTmdbApi } from './tmdb-server.js';
import { verifyCronRequest } from './cron-auth.js';
import {
    mapFullTmdbToLibraryRecord,
    mapListItemToLibraryRecord,
    shouldRefreshFull,
    upsertLibraryRecord,
} from './movie-library-server.js';
import { refreshProvidersForRows } from './watch-providers-server.js';

// watch/providers keeps OTT availability current for every title the scan touches.
const DETAIL_APPEND = 'credits,videos,release_dates,keywords,reviews,watch/providers';
const BATCH_SIZE = 5;

/** Regions scanned for "new on streaming". */
const STREAMING_SCAN_REGIONS = ['IN', 'US', 'GB'];

// Helper to get date strings for TMDB discover queries
function getDateRange(daysBack, daysForward) {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - daysBack);
    const to = new Date(today);
    to.setDate(to.getDate() + daysForward);
    return {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
    };
}

/**
 * "New on streaming": recent titles that are on a subscription/free service in
 * a region. TMDB has no "date added to service", so this pairs a recent release
 * window with streaming availability — the closest reliable signal.
 */
function streamingNewSources(region) {
    return [
        {
            path: '/discover/movie',
            mediaType: 'movie',
            pages: 2,
            customParams: () => {
                const { from, to } = getDateRange(150, 0);
                return {
                    watch_region: region,
                    with_watch_monetization_types: 'flatrate|free|ads',
                    'primary_release_date.gte': from,
                    'primary_release_date.lte': to,
                    sort_by: 'popularity.desc',
                    'vote_count.gte': 3,
                    include_adult: false,
                };
            },
        },
        {
            // Shows with episodes airing now (catches new seasons, not just new shows).
            path: '/discover/tv',
            mediaType: 'tv',
            pages: 1,
            customParams: () => {
                const { from, to } = getDateRange(21, 0);
                return {
                    watch_region: region,
                    with_watch_monetization_types: 'flatrate|free|ads',
                    'air_date.gte': from,
                    'air_date.lte': to,
                    sort_by: 'popularity.desc',
                    'vote_count.gte': 3,
                    include_adult: false,
                };
            },
        },
    ];
}

export const SYNC_JOBS = {
    // === EXISTING JOBS ===
    'trending-daily': {
        region: 'IN',
        sources: [
            { path: '/trending/movie/day', mediaType: 'movie', pages: 2 },
            { path: '/trending/tv/day', mediaType: 'tv', pages: 1 },
        ],
        maxItems: 45,
    },
    'now-playing-daily': {
        region: 'IN',
        // Theatrical discover (not /movie/now_playing) — TMDB's convenience list
        // often keeps stale/older titles. Restrict to regional theatrical releases
        // in the last ~4 weeks, then keep the top 9 by popularity.
        sources: [
            {
                path: '/discover/movie',
                mediaType: 'movie',
                pages: 2,
                useRegion: true,
                customParams: () => {
                    const { from, to } = getDateRange(28, 0);
                    return {
                        'release_date.gte': from,
                        'release_date.lte': to,
                        with_release_type: '2|3', // Theatrical limited | Theatrical
                        sort_by: 'popularity.desc',
                        'vote_count.gte': 5,
                        include_adult: false,
                    };
                },
            },
        ],
        maxItems: 9,
        sortByPopularity: true,
        maxReleaseAgeDays: 28,
    },
    'upcoming-weekly': {
        region: 'IN',
        sources: [
            // Comprehensive upcoming via discover (next ~13 months), most
            // anticipated first, plus the region-specific theatrical slate.
            {
                path: '/discover/movie',
                mediaType: 'movie',
                pages: 8,
                customParams: () => {
                    const today = new Date().toISOString().split('T')[0];
                    const future = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000)
                        .toISOString().split('T')[0];
                    return {
                        'primary_release_date.gte': today,
                        'primary_release_date.lte': future,
                        sort_by: 'popularity.desc',
                    };
                },
            },
            {
                path: '/discover/tv',
                mediaType: 'tv',
                pages: 3,
                customParams: () => {
                    const today = new Date().toISOString().split('T')[0];
                    const future = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000)
                        .toISOString().split('T')[0];
                    return {
                        'first_air_date.gte': today,
                        'first_air_date.lte': future,
                        sort_by: 'popularity.desc',
                    };
                },
            },
            { path: '/movie/upcoming', mediaType: 'movie', pages: 3, useRegion: true },
        ],
        maxItems: 200,
    },
    
    // === NEW JOBS ===
    
    // Popular movies and TV shows (wider coverage)
    'popular-weekly': {
        region: 'IN',
        sources: [
            { path: '/movie/popular', mediaType: 'movie', pages: 5 },
            { path: '/tv/popular', mediaType: 'tv', pages: 3 },
        ],
        maxItems: 100,
    },
    
    // Top rated content (quality over popularity)
    'top-rated-monthly': {
        region: 'IN',
        sources: [
            { path: '/movie/top_rated', mediaType: 'movie', pages: 3 },
            { path: '/tv/top_rated', mediaType: 'tv', pages: 2 },
        ],
        maxItems: 80,
    },
    
    // Trending weekly (different from daily)
    'trending-weekly': {
        region: 'IN',
        sources: [
            { path: '/trending/movie/week', mediaType: 'movie', pages: 3 },
            { path: '/trending/tv/week', mediaType: 'tv', pages: 2 },
        ],
        maxItems: 80,
    },
    
    // New releases with trailers (discover movies released recently)
    'new-releases-weekly': {
        region: 'IN',
        sources: [
            { 
                path: '/discover/movie', 
                mediaType: 'movie', 
                pages: 3,
                customParams: () => {
                    const range = getDateRange(30, 0);
                    return {
                        'primary_release_date.gte': range.from,
                        'primary_release_date.lte': range.to,
                        'sort_by': 'popularity.desc',
                        'vote_count.gte': 10,
                    };
                },
            },
        ],
        maxItems: 60,
        enrichVideos: true,
    },
    
    // Upcoming with trailers (movies announcing soon)
    'upcoming-trailers': {
        region: 'IN',
        sources: [
            {
                path: '/discover/movie',
                mediaType: 'movie',
                pages: 3,
                customParams: () => {
                    // Window: today → +120 days (the gte was wrongly set to the
                    // future bound, collapsing it to a near-empty range).
                    const range = getDateRange(0, 120);
                    return {
                        'primary_release_date.gte': range.from,
                        'primary_release_date.lte': range.to,
                        'sort_by': 'popularity.desc',
                    };
                },
            },
        ],
        maxItems: 50,
        enrichVideos: true,
    },
    
    // New arrivals on streaming services (daily, multi-region)
    'streaming-new-daily': {
        region: 'IN',
        sources: STREAMING_SCAN_REGIONS.flatMap((region) => streamingNewSources(region)),
        maxItems: 120,
    },

    // Multi-region popular (US + India)
    'popular-global': {
        region: 'US',
        sources: [
            { path: '/movie/popular', mediaType: 'movie', pages: 2 },
            { path: '/movie/now_playing', mediaType: 'movie', pages: 2, useRegion: true },
        ],
        maxItems: 60,
        additionalRegions: ['IN', 'GB'],
    },
};

async function startSyncRun(supabase, jobName, region) {
    const { data, error } = await supabase
        .from('tmdb_sync_runs')
        .insert({
            job_name: jobName,
            region,
            status: 'running',
            metadata: { source: 'vercel-cron' },
        })
        .select('id')
        .single();

    if (error) throw error;
    return data.id;
}

async function finishSyncRun(supabase, runId, stats, errorMessage = null) {
    const { error } = await supabase
        .from('tmdb_sync_runs')
        .update({
            status: errorMessage ? 'failed' : 'completed',
            finished_at: new Date().toISOString(),
            movies_added: stats.added,
            movies_updated: stats.updated,
            movies_skipped: stats.skipped,
            pages_fetched: stats.pagesFetched,
            error_message: errorMessage,
            metadata: stats.metadata,
        })
        .eq('id', runId);

    if (error) throw error;
}

async function updateSyncState(supabase, jobName, region, runId, status, cursor, { isStart = false } = {}) {
    const patch = {
        job_name: jobName,
        region,
        last_run_id: runId,
        last_status: status,
        last_cursor: cursor,
        updated_at: new Date().toISOString(),
    };

    if (isStart) {
        patch.last_started_at = new Date().toISOString();
    }
    if (status === 'completed') {
        patch.last_success_at = new Date().toISOString();
    }

    const { error } = await supabase
        .from('tmdb_sync_state')
        .upsert(patch, { onConflict: 'job_name' });

    if (error) throw error;
}

async function fetchSourceItems(source, region) {
    const items = [];
    let pagesFetched = 0;

    for (let page = 1; page <= source.pages; page += 1) {
        const params = { page };
        if (source.useRegion) params.region = region;
        
        // Apply custom params if defined (for discover queries)
        if (source.customParams) {
            const custom = typeof source.customParams === 'function' 
                ? source.customParams() 
                : source.customParams;
            Object.assign(params, custom);
        }

        const payload = await fetchTmdbApi(source.path, params);
        pagesFetched += 1;
        const batch = payload.results || [];
        items.push(...batch.map((item) => ({ ...item, _mediaType: source.mediaType })));

        if (page >= (payload.total_pages || 1)) break;
    }

    return { items, pagesFetched };
}

async function loadExistingMap(supabase, tmdbIds) {
    if (!tmdbIds.length) return new Map();

    let { data, error } = await supabase
        .from('movies_library')
        .select('tmdb_id, media_type, popularity, vote_average, synced_at, release_date, watch_providers_synced_at')
        .in('tmdb_id', tmdbIds);

    if (error && /watch_providers/.test(error.message || '')) {
        // Provider migration not applied yet.
        ({ data, error } = await supabase
            .from('movies_library')
            .select('tmdb_id, media_type, popularity, vote_average, synced_at, release_date')
            .in('tmdb_id', tmdbIds));
    }

    if (error) throw error;

    // Keyed by media type too: a movie and a show can share a TMDB id.
    const map = new Map();
    (data || []).forEach((row) => map.set(`${row.media_type || 'movie'}:${row.tmdb_id}`, row));
    return map;
}

async function fetchAndUpsertFull(supabase, item, mediaType) {
    const detailPath = mediaType === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`;
    const fullData = await fetchTmdbApi(detailPath, {
        append_to_response: DETAIL_APPEND,
    });
    const record = mapFullTmdbToLibraryRecord(fullData, mediaType);
    await upsertLibraryRecord(supabase, record);
}

async function processItems(supabase, items, stats) {
    const unique = new Map();
    items.forEach((item) => {
        if (!item?.id) return;
        const mediaType = item._mediaType || item.media_type || 'movie';
        unique.set(`${mediaType}:${item.id}`, item);
    });

    const list = Array.from(unique.values());
    const existingMap = await loadExistingMap(supabase, [...new Set(list.map((i) => String(i.id)))]);

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
        const batch = list.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (item) => {
            const mediaType = item._mediaType || item.media_type || 'movie';
            const tmdbId = String(item.id);
            const existing = existingMap.get(`${mediaType}:${tmdbId}`);

            try {
                if (!existing) {
                    await fetchAndUpsertFull(supabase, item, mediaType);
                    stats.added += 1;
                    return;
                }

                if (shouldRefreshFull(existing, item)) {
                    await fetchAndUpsertFull(supabase, item, mediaType);
                    stats.updated += 1;
                    return;
                }

                await upsertLibraryRecord(
                    supabase,
                    mapListItemToLibraryRecord(item, mediaType),
                );
                stats.updated += 1;
            } catch (itemError) {
                console.error(`Sync item ${tmdbId} failed:`, itemError.message);
                stats.skipped += 1;
            }
        }));
    }
}

export async function runSyncJob(jobName) {
    const config = SYNC_JOBS[jobName];
    if (!config) {
        const error = new Error(`Unknown sync job: ${jobName}`);
        error.status = 400;
        throw error;
    }

    const supabase = getSupabaseAdmin();
    const runId = await startSyncRun(supabase, jobName, config.region);
    await updateSyncState(supabase, jobName, config.region, runId, 'running', null, { isStart: true });

    const stats = {
        added: 0,
        updated: 0,
        skipped: 0,
        pagesFetched: 0,
        metadata: { jobName, region: config.region, sources: [] },
    };

    try {
        let collected = [];

        const regions = [config.region, ...(config.additionalRegions || [])];
        for (const source of config.sources) {
            // Region-scoped sources run once per configured region.
            const sourceRegions = source.useRegion ? regions : [config.region];
            for (const region of sourceRegions) {
                let result;
                try {
                    result = await fetchSourceItems(source, region);
                } catch (sourceError) {
                    // One failing source must not sink the whole scan.
                    console.error(`Sync source ${source.path} (${region}) failed:`, sourceError.message);
                    stats.metadata.sources.push({ path: source.path, region, error: sourceError.message });
                    continue;
                }
                const { items, pagesFetched } = result;
                stats.pagesFetched += pagesFetched;
                collected = collected.concat(items);
                stats.metadata.sources.push({
                    path: source.path,
                    mediaType: source.mediaType,
                    region,
                    pages: source.pages,
                    fetched: items.length,
                });
            }
        }

        let deduped = Array.from(
            new Map(collected.map((item) => [`${item._mediaType}:${item.id}`, item])).values(),
        );

        // Drop titles whose primary/list release_date is outside the theatrical window
        // (guards against remasters / old catalog noise slipping through discover).
        if (config.maxReleaseAgeDays != null) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - Number(config.maxReleaseAgeDays));
            const cutoffStr = cutoff.toISOString().split('T')[0];
            const todayStr = new Date().toISOString().split('T')[0];
            deduped = deduped.filter((item) => {
                const d = item.release_date || item.first_air_date;
                if (!d) return false;
                return d >= cutoffStr && d <= todayStr;
            });
        }

        // In Theaters: top N by TMDB popularity (not raw page order)
        if (config.sortByPopularity) {
            deduped = deduped.sort((a, b) => (Number(b.popularity) || 0) - (Number(a.popularity) || 0));
        }
        deduped = deduped.slice(0, config.maxItems);

        await processItems(supabase, deduped, stats);
        stats.metadata.processed = deduped.length;

        if (jobName === 'now-playing-daily') {
            const { runNowPlayingPostSync } = await import('./web-ratings-server.js');
            const tmdbIds = deduped.map((item) => String(item.id));
            stats.metadata.inTheaters = await runNowPlayingPostSync({
                region: config.region,
                tmdbIds,
            });
        }

        await finishSyncRun(supabase, runId, stats);
        await updateSyncState(supabase, jobName, config.region, runId, 'completed', String(deduped.length));

        return { success: true, jobName, runId, ...stats };
    } catch (error) {
        await finishSyncRun(supabase, runId, stats, error.message);
        await updateSyncState(supabase, jobName, config.region, runId, 'failed', null);
        throw error;
    }
}

/**
 * Keep OTT availability fresh across the library: refresh the titles whose
 * provider data is missing or oldest (popular first). Runs daily.
 */
export async function runProvidersRefresh({ limit = 220 } = {}) {
    const supabase = getSupabaseAdmin();
    const { data: rows, error } = await supabase
        .from('movies_library')
        .select('tmdb_id, media_type')
        .eq('is_active', true)
        .order('watch_providers_synced_at', { ascending: true, nullsFirst: true })
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (error) {
        if (/watch_providers/.test(error.message || '')) {
            return { skipped: true, reason: 'Apply migration 20261106000000_watch_providers.sql first' };
        }
        throw error;
    }
    if (!rows?.length) return { checked: 0, fetched: 0, failed: 0 };

    const { stats } = await refreshProvidersForRows(supabase, rows, { concurrency: 10 });
    return { checked: rows.length, ...stats };
}

// Backfills the `seasons` column for TV shows that were synced into the library
// before that field existed — fetches each show's current /tv/{id} detail from
// TMDB and writes just its seasons array, leaving everything else untouched.
// Capped + batched so a single run can't run past the function's time limit.
const SEASONS_BACKFILL_BATCH_SIZE = 4;

export async function backfillTvSeasons({ limit = 50 } = {}) {
    const supabase = getSupabaseAdmin();

    // The seasons column was added with DEFAULT '[]'::jsonb, so every show synced
    // before this feature existed has seasons = [] rather than NULL.
    const { data: shows, error } = await supabase
        .from('movies_library')
        .select('tmdb_id, title')
        .eq('media_type', 'tv')
        .eq('is_active', true)
        .eq('seasons', JSON.stringify([]))
        .limit(limit);

    if (error) throw error;

    const stats = { checked: shows?.length || 0, updated: 0, failed: 0, errors: [] };
    if (!shows?.length) return stats;

    for (let i = 0; i < shows.length; i += SEASONS_BACKFILL_BATCH_SIZE) {
        const batch = shows.slice(i, i + SEASONS_BACKFILL_BATCH_SIZE);
        await Promise.all(batch.map(async (show) => {
            try {
                const detail = await fetchTmdbApi(`/tv/${show.tmdb_id}`, {});
                const { error: updateError } = await supabase
                    .from('movies_library')
                    .update({ seasons: detail.seasons || [] })
                    .eq('tmdb_id', show.tmdb_id)
                    .eq('media_type', 'tv');
                if (updateError) throw updateError;
                stats.updated += 1;
            } catch (itemError) {
                stats.failed += 1;
                stats.errors.push(`${show.title || show.tmdb_id}: ${itemError.message}`);
            }
        }));
    }

    return stats;
}

export function createCronHandler(jobName) {
    return async function handler(req, res) {
        if (req.method !== 'GET' && req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const auth = verifyCronRequest(req);
        if (!auth.ok) {
            return res.status(auth.status).json({ error: auth.message });
        }

        try {
            const result = await runSyncJob(jobName);
            return res.status(200).json(result);
        } catch (error) {
            console.error(`Cron ${jobName} failed:`, error);
            return res.status(error.status || 500).json({
                error: error.message || 'Sync failed',
                jobName,
            });
        }
    };
}
