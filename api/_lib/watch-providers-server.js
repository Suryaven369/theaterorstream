/**
 * OTT availability — TMDB watch/providers, stored per region on movies_library.
 *
 * Every recommendation path runs candidates through attachAvailability() so the
 * "on your services" filter and the badges on cards come from real provider data
 * (not hand-entered streaming_platforms). Data is persisted when the migration
 * 20261106000000_watch_providers.sql is applied; without it we still fetch live
 * (in-memory cache) so filtering stays accurate, just slower.
 */
import { fetchTmdbApi } from './tmdb-server.js';

/** Regions we keep provider data for (matches src/constants/regions.js). */
export const PROVIDER_REGIONS = ['IN', 'US', 'GB', 'CA', 'AU', 'DE', 'FR', 'JP', 'KR', 'BR'];
export const DEFAULT_REGION = 'IN';

/** Subscription-style access — what "on your services" means. Rent/buy never count. */
const STREAM_TYPES = ['flatrate', 'free', 'ads'];

export const PROVIDER_STALE_HOURS = 72;
const FETCH_CONCURRENCY = 8;
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000;
const CATALOG_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * TMDB lists some services under several ids (ad tiers, regional brands,
 * rebrands). Picking any id of a group matches the whole group.
 */
const PROVIDER_GROUPS = [
    [8, 1796],                 // Netflix, Netflix basic with Ads
    [9, 119, 2100],            // Amazon Prime Video (+ regional / ads ids)
    [122, 2336, 220],          // Hotstar, JioHotstar, JioCinema
    [1899, 384],               // Max, HBO Max
    [386, 387],                // Peacock, Peacock Premium
    [531, 582],                // Paramount+, Paramount+ Amazon Channel
    [337, 390],                // Disney+
    [350, 2552],               // Apple TV+
];

/** Legacy onboarding service ids → TMDB provider ids. */
const LEGACY_SERVICE_PROVIDER_IDS = {
    netflix: [8],
    prime: [9, 119],
    hotstar: [122, 2336],
    jio_cinema: [220, 2336],
    sonyliv: [237],
    zee5: [232],
    apple_tv: [350],
    disney_plus: [337],
    hulu: [15],
    max: [1899, 384],
    peacock: [386, 387],
    paramount: [531],
    now: [39],
    bbc_iplayer: [38],
    crunchyroll: [283],
    mubi: [11],
};

export function normalizeRegion(value) {
    const code = String(value || '').trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
}

/** Expand ids with their equivalents (Prime 9 ⇄ 119, Hotstar ⇄ JioHotstar, …). */
export function expandProviderIds(ids) {
    const out = new Set();
    (ids || []).forEach((raw) => {
        const id = Number(raw);
        if (!Number.isFinite(id) || id <= 0) return;
        out.add(id);
        PROVIDER_GROUPS.forEach((group) => {
            if (group.includes(id)) group.forEach((g) => out.add(g));
        });
    });
    return [...out];
}

/** Resolve a user_streaming_services row to TMDB provider ids. */
export function providerIdsForServiceRow(row) {
    if (row?.provider_id != null && Number(row.provider_id) > 0) return [Number(row.provider_id)];
    const sid = String(row?.service_id || '').trim();
    if (/^\d+$/.test(sid)) return [Number(sid)];
    return LEGACY_SERVICE_PROVIDER_IDS[sid] || [];
}

/** TMDB watch/providers `results` → compact per-region map for our regions. */
export function compactWatchProviders(results) {
    const out = {};
    if (!results || typeof results !== 'object') return out;
    PROVIDER_REGIONS.forEach((region) => {
        const r = results[region];
        if (!r) return;
        const stream = [];
        const seen = new Set();
        STREAM_TYPES.forEach((type) => {
            (r[type] || []).forEach((p) => {
                const id = Number(p.provider_id);
                if (!id || seen.has(id)) return;
                seen.add(id);
                stream.push({ id, name: p.provider_name, logo: p.logo_path || null, type });
            });
        });
        const ids = (arr) => [...new Set((arr || []).map((p) => Number(p.provider_id)).filter(Boolean))];
        out[region] = {
            stream,
            rent: ids(r.rent),
            buy: ids(r.buy),
            link: r.link || null,
        };
    });
    return out;
}

/** watch/providers appended to a TMDB detail payload → library record fields. */
export function watchProviderFieldsFromDetail(detail) {
    const payload = detail?.['watch/providers'];
    if (!payload || typeof payload !== 'object') return null;
    return {
        watch_providers: compactWatchProviders(payload.results),
        watch_providers_synced_at: new Date().toISOString(),
    };
}

/** Streaming (subscription/free) providers for a movie in a region. */
export function streamingProvidersFor(movie, region) {
    const map = movie?._watchProviders || movie?.watch_providers;
    const entry = map && typeof map === 'object' ? map[region] : null;
    if (entry?.stream?.length) return entry.stream;
    return [];
}

export function hasProviderData(movie) {
    return !!(movie?._watchProvidersSyncedAt || movie?.watch_providers_synced_at);
}

/** Which of the user's providers stream this title in their region. */
export function matchUserProviders(movie, region, providerIds) {
    if (!providerIds?.length) return [];
    const wanted = new Set(expandProviderIds(providerIds));
    return streamingProvidersFor(movie, region).filter((p) => wanted.has(Number(p.id)));
}

// ---------------------------------------------------------------------------
// Fetching + persistence
// ---------------------------------------------------------------------------

const memoryCache = new Map(); // `${type}:${id}` → { at, providers }
let columnsAvailable = null;   // null = unknown, true/false once probed

async function probeColumns(supabase) {
    if (columnsAvailable !== null) return columnsAvailable;
    const { error } = await supabase
        .from('movies_library')
        .select('watch_providers, watch_providers_synced_at')
        .limit(1);
    columnsAvailable = !error;
    if (error) {
        console.warn('[providers] watch_providers columns missing — apply migration 20261106000000_watch_providers.sql. Using live TMDB lookups.');
    }
    return columnsAvailable;
}

export function isMissingProviderColumnError(error) {
    const msg = String(error?.message || error || '');
    return /watch_providers/.test(msg) && /(column|schema cache|does not exist|Could not find)/i.test(msg);
}

async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            // eslint-disable-next-line no-await-in-loop
            results[index] = await fn(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}

export async function fetchWatchProvidersCompact(tmdbId, mediaType = 'movie') {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const key = `${type}:${tmdbId}`;
    const hit = memoryCache.get(key);
    if (hit && Date.now() - hit.at < MEMORY_TTL_MS) return hit.providers;
    const data = await fetchTmdbApi(`/${type}/${tmdbId}/watch/providers`);
    const providers = compactWatchProviders(data?.results);
    memoryCache.set(key, { at: Date.now(), providers });
    if (memoryCache.size > 5000) memoryCache.delete(memoryCache.keys().next().value);
    return providers;
}

function isStale(syncedAt, staleHours) {
    if (!syncedAt) return true;
    return Date.now() - new Date(syncedAt).getTime() > staleHours * 3600 * 1000;
}

/**
 * Refresh provider data for library rows (cron + on-demand). Persists when the
 * columns exist. Returns how many titles were fetched / failed.
 */
export async function refreshProvidersForRows(supabase, rows, { concurrency = FETCH_CONCURRENCY } = {}) {
    const persist = await probeColumns(supabase);
    const stats = { fetched: 0, failed: 0 };
    const results = await mapWithConcurrency(rows, concurrency, async (row) => {
        const type = row.media_type === 'tv' ? 'tv' : 'movie';
        try {
            const providers = await fetchWatchProvidersCompact(row.tmdb_id, type);
            const syncedAt = new Date().toISOString();
            stats.fetched += 1;
            if (persist) {
                const { error } = await supabase
                    .from('movies_library')
                    .update({ watch_providers: providers, watch_providers_synced_at: syncedAt })
                    .eq('tmdb_id', String(row.tmdb_id))
                    .eq('media_type', type);
                if (error) console.warn('[providers] persist failed:', row.tmdb_id, error.message);
            }
            return { providers, syncedAt };
        } catch (err) {
            stats.failed += 1;
            console.warn('[providers] fetch failed:', row.tmdb_id, err.message);
            return null;
        }
    });
    return { stats, results };
}

/**
 * Attach provider data to recommendation candidates (mutates + returns them).
 *
 * - Loads stored provider data for every candidate in one query.
 * - Fetches missing/stale data from TMDB for up to `maxFetch` candidates,
 *   prioritised by the order given (callers pass best-first).
 * - Titles that came from a provider-filtered TMDB Discover call can be passed
 *   in `knownAvailable` (tmdbId → providerIds) so they count as available even
 *   before their provider data is fetched.
 *
 * Sets on each movie: _watchProviders, _watchProvidersSyncedAt,
 * availability (streaming providers in region), onYourServices (matches).
 */
export async function attachAvailability(supabase, movies, {
    region = DEFAULT_REGION,
    providerIds = [],
    maxFetch = 40,
    staleHours = PROVIDER_STALE_HOURS,
    knownAvailable = null,
} = {}) {
    if (!movies?.length) return movies || [];
    const persist = await probeColumns(supabase);

    if (persist) {
        const ids = [...new Set(movies.map((m) => String(m.tmdb_id ?? m.id)).filter(Boolean))];
        const stored = new Map();
        for (let i = 0; i < ids.length; i += 300) {
            // eslint-disable-next-line no-await-in-loop
            const { data, error } = await supabase
                .from('movies_library')
                .select('tmdb_id, media_type, watch_providers, watch_providers_synced_at')
                .in('tmdb_id', ids.slice(i, i + 300));
            if (error) break;
            (data || []).forEach((row) => stored.set(`${row.tmdb_id}:${row.media_type || 'movie'}`, row));
        }
        movies.forEach((m) => {
            const row = stored.get(`${m.tmdb_id ?? m.id}:${m.media_type || 'movie'}`);
            if (row?.watch_providers_synced_at) {
                m._watchProviders = row.watch_providers || {};
                m._watchProvidersSyncedAt = row.watch_providers_synced_at;
            }
        });
    }

    // Live-fetch the best candidates that lack fresh data.
    const needFetch = movies
        .filter((m) => isStale(m._watchProvidersSyncedAt, staleHours))
        .slice(0, maxFetch);
    if (needFetch.length) {
        const { results } = await refreshProvidersForRows(
            supabase,
            needFetch.map((m) => ({ tmdb_id: m.tmdb_id ?? m.id, media_type: m.media_type || 'movie' })),
        );
        needFetch.forEach((m, i) => {
            const res = results[i];
            if (!res) return;
            m._watchProviders = res.providers;
            m._watchProvidersSyncedAt = res.syncedAt;
        });
    }

    const wanted = new Set(expandProviderIds(providerIds));
    movies.forEach((m) => {
        let stream = streamingProvidersFor(m, region);
        const known = knownAvailable?.get(String(m.tmdb_id ?? m.id));
        const freshData = !isStale(m._watchProvidersSyncedAt, 24);
        if (known?.length && !freshData && !stream.some((p) => known.includes(Number(p.id)))) {
            // Provider-filtered Discover listed it; trust that until we have fresh data.
            stream = [...known.map((id) => ({ id, name: null, logo: null, type: 'flatrate' })), ...stream];
        }
        m.availability = stream.slice(0, 6);
        m.onYourServices = wanted.size
            ? stream.filter((p) => wanted.has(Number(p.id)))
            : [];
        m._availabilityKnown = hasProviderData(m) || !!known?.length;
    });
    return movies;
}

/** Strip internal provider fields before sending items to the client. */
/**
 * Short, human service names: "Amazon Prime Video with Ads" → "Prime Video",
 * "MovieSphere+ Amazon Channel" → "MovieSphere+", "Netflix basic with Ads" → "Netflix".
 */
export function cleanProviderName(name) {
    return String(name || '')
        .replace(/\s+(standard|basic|premium)?\s*with ads$/i, '')
        .replace(/\s+(amazon|apple tv|roku premium)\s+channel$/i, '')
        .replace(/^amazon prime video$/i, 'Prime Video')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

export function publicAvailability(movie) {
    // One entry per service (ad tiers / channel variants collapse into it).
    const named = (list) => {
        const seen = new Set();
        const out = [];
        (list || []).forEach((p) => {
            const name = cleanProviderName(p.name);
            if (!name || seen.has(name.toLowerCase())) return;
            seen.add(name.toLowerCase());
            out.push({ id: p.id, name, logo: p.logo || null });
        });
        return out;
    };
    return {
        availability: named(movie.availability),
        onYourServices: named(movie.onYourServices),
    };
}

// ---------------------------------------------------------------------------
// Regional provider catalog (for the settings picker)
// ---------------------------------------------------------------------------

const catalogCache = new Map();

/** Streaming services available in a region, most prominent first. */
export async function getRegionProviderCatalog(regionInput) {
    const region = normalizeRegion(regionInput) || DEFAULT_REGION;
    const hit = catalogCache.get(region);
    if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.providers;

    const [movies, tv] = await Promise.all([
        fetchTmdbApi('/watch/providers/movie', { watch_region: region }).catch(() => null),
        fetchTmdbApi('/watch/providers/tv', { watch_region: region }).catch(() => null),
    ]);

    const byId = new Map();
    [...(movies?.results || []), ...(tv?.results || [])].forEach((p) => {
        const id = Number(p.provider_id);
        if (!id) return;
        const priority = Number(p.display_priorities?.[region] ?? p.display_priority ?? 999);
        const prev = byId.get(id);
        if (!prev || priority < prev.priority) {
            byId.set(id, { id, name: p.provider_name, logo: p.logo_path || null, priority });
        }
    });

    const providers = [...byId.values()]
        .filter((p) => !/ (amazon|apple tv|roku premium) channel$/i.test(p.name || ''))
        .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
    catalogCache.set(region, { at: Date.now(), providers });
    return providers;
}
