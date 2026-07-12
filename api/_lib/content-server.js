import { createClient } from '@supabase/supabase-js';
import { buildLibrarySearchOrClause, rankLibrarySearchHits } from './search-utils.js';
import { fetchTmdbApi } from './tmdb-server.js';
import { generateJson, isLlmEnabled } from './llm-server.js';
import { getSupabaseAdmin } from './supabase-admin.js';

export const LIBRARY_CARD_SELECT =
    'tmdb_id, title, poster_path, backdrop_path, media_type, release_date, first_air_date, vote_average, popularity, overview, genres, runtime, number_of_seasons, number_of_episodes';

export function getSupabase() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
    }

    return createClient(supabaseUrl, supabaseKey);
}

export function jsonResponse(data, cacheControl) {
    return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': cacheControl,
        },
    });
}

export function errorResponse(message, status = 500) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        },
    });
}

export function normalizeLibraryItem(item) {
    if (!item) return null;
    return {
        ...item,
        id: item.tmdb_id,
        release_date: item.release_date || item.first_air_date || null,
    };
}

async function getBatchMovieRatings(supabase, movieIds) {
    if (!movieIds?.length) return new Map();

    const { data, error } = await supabase
        .from('ratings')
        .select('movie_id, acting, screenplay, sound, direction, entertainment, pacing, cinematography')
        .in('movie_id', movieIds.map((id) => String(id)));

    if (error || !data?.length) return new Map();

    const ratingsByMovie = new Map();
    data.forEach((rating) => {
        const movieId = String(rating.movie_id);
        if (!ratingsByMovie.has(movieId)) ratingsByMovie.set(movieId, []);
        ratingsByMovie.get(movieId).push(rating);
    });

    const result = new Map();
    const categories = ['acting', 'screenplay', 'sound', 'direction', 'entertainment', 'pacing', 'cinematography'];

    ratingsByMovie.forEach((ratings, movieId) => {
        let totalSum = 0;
        let totalCount = 0;

        categories.forEach((cat) => {
            const validRatings = ratings.filter((r) => r[cat] != null);
            if (validRatings.length > 0) {
                totalSum += validRatings.reduce((sum, r) => sum + r[cat], 0) / validRatings.length;
                totalCount += 1;
            }
        });

        if (totalCount > 0) {
            result.set(movieId, {
                score: totalSum / totalCount,
                count: ratings.length,
            });
        }
    });

    return result;
}

async function hydrateSections(supabase, sections) {
    if (!sections?.length) return [];

    const keysToFetch = new Set();
    sections.forEach((section) => {
        if (!section.movies_by_region) return;
        Object.values(section.movies_by_region).forEach((movieList) => {
            if (!Array.isArray(movieList)) return;
            movieList.forEach((movie) => {
                if (movie.tmdb_id) {
                    keysToFetch.add(`${movie.media_type || 'movie'}:${movie.tmdb_id}`);
                }
            });
        });
    });

    if (keysToFetch.size === 0) return sections;

    const tmdbIds = [...new Set([...keysToFetch].map((k) => k.split(':')[1]))];

    const { data: globalMovies, error: libError } = await supabase
        .from('movies_library')
        .select(LIBRARY_CARD_SELECT)
        .in('tmdb_id', tmdbIds);

    if (libError) return sections;

    const movieMap = new Map();
    globalMovies?.forEach((m) => {
        movieMap.set(`${m.media_type || 'movie'}:${m.tmdb_id}`, m);
        // Fallback when section row lacks media_type
        if (!movieMap.has(`*:${m.tmdb_id}`)) movieMap.set(`*:${m.tmdb_id}`, m);
    });

    const ratingsMap = await getBatchMovieRatings(supabase, tmdbIds);

    return sections.map((section) => {
        if (!section.movies_by_region) return section;

        const hydratedMoviesByRegion = {};
        Object.keys(section.movies_by_region).forEach((regionCode) => {
            const rawMovies = section.movies_by_region[regionCode] || [];
            hydratedMoviesByRegion[regionCode] = rawMovies.map((rawMovie) => {
                const mt = rawMovie.media_type || 'movie';
                const globalMovie =
                    movieMap.get(`${mt}:${rawMovie.tmdb_id}`)
                    || movieMap.get(`*:${rawMovie.tmdb_id}`);
                const tosRating = ratingsMap.get(String(rawMovie.tmdb_id));

                if (globalMovie) {
                    return {
                        ...rawMovie,
                        ...globalMovie,
                        media_type: globalMovie.media_type || mt,
                        release_date: globalMovie.release_date || globalMovie.first_air_date || rawMovie.release_date,
                        tos_rating: tosRating || null,
                    };
                }

                return {
                    ...rawMovie,
                    tos_rating: tosRating || null,
                };
            });
        });

        return {
            ...section,
            movies_by_region: hydratedMoviesByRegion,
        };
    });
}

function sectionMergeKey(section) {
    const blob = `${section.slug || ''} ${section.name || ''} ${section.api_source || ''}`.toLowerCase();
    if (/airing.?today/.test(blob) || section.api_source === 'airing_today') return null; // dropped from My Feed

    // Provider / OTT first — never collapse into "Hot" (e.g. "Hotstar" matched /hot/)
    const provider = (section.api_source || '').match(/^provider_(\d+)$/);
    if (provider) return `ott:${provider[1]}`;
    if (/hotstar/.test(blob)) return 'ott:122';
    if (/netflix/.test(blob)) return 'ott:8';
    if (/prime|amazon/.test(blob)) return 'ott:119';
    if (/disney/.test(blob)) return 'ott:337';
    if (/hulu/.test(blob)) return 'ott:15';
    if (/hbo|\bmax\b/.test(blob)) return 'ott:1899';
    if (/apple/.test(blob)) return 'ott:350';

    // Word-boundary "hot" so Hotstar / Hotstar-named rows stay OTT
    if (/\bhot\b|trend|right.?now/.test(blob)) return 'hot';
    if (/theater|theatre|now.?play|cinema|in.?theater/.test(blob)) return 'theater';
    if (/coming|upcoming|soon/.test(blob)) return 'coming';
    return section.slug || `id:${section.id}`;
}

function mergeRegionLists(a = [], b = []) {
    const seen = new Set();
    const out = [];
    for (const item of [...a, ...b]) {
        const key = `${item.media_type || 'movie'}:${item.tmdb_id}`;
        if (!item.tmdb_id || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out.sort((x, y) => (y.popularity || 0) - (x.popularity || 0));
}

function mergeHomepageAndTvSections(homeSections = [], tvSections = []) {
    const byKey = new Map();
    for (const section of [...homeSections, ...tvSections]) {
        const key = sectionMergeKey(section);
        if (!key) continue;
        const existing = byKey.get(key);
        const regionBag = { ...(section.movies_by_region || section.shows_by_region || {}) };
        if (!existing) {
            byKey.set(key, { ...section, movies_by_region: regionBag });
            continue;
        }
        const regions = new Set([
            ...Object.keys(existing.movies_by_region || {}),
            ...Object.keys(regionBag),
        ]);
        const merged = { ...existing.movies_by_region };
        for (const region of regions) {
            merged[region] = mergeRegionLists(existing.movies_by_region?.[region], regionBag[region]);
        }
        existing.movies_by_region = merged;
    }
    return [...byKey.values()].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

export async function fetchHomepageSections(activeOnly = true) {
    const supabase = getSupabase();

    let query = supabase
        .from('homepage_sections')
        .select('*')
        .order('display_order', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data: sections, error } = await query;
    if (error) throw error;

    // My Feed stores movies + series together in homepage_sections.
    // Do NOT merge legacy tv_sections — that overwrote admin OTT publishes with old TV-only rows.
    return hydrateSections(supabase, sections || []);
}

export async function fetchTVSections(activeOnly = true) {
    const supabase = getSupabase();

    let query = supabase
        .from('tv_sections')
        .select('*')
        .order('display_order', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data: sections, error } = await query;

    if (error) {
        if (error.code === '42P01') {
            return fetchHomepageSections(activeOnly);
        }
        throw error;
    }

    return hydrateSections(supabase, sections || []);
}

/**
 * Live upcoming releases straight from TMDB discover, so titles that haven't
 * been synced into movies_library yet still show in Coming Soon. Mapped to the
 * library card shape. Best-effort — returns [] on any failure.
 */
async function fetchTmdbUpcoming({ minDate, maxDate, mediaType = null, maxPages = 10 }) {
    const today = minDate || new Date().toISOString().split('T')[0];
    const out = [];

    const types = mediaType ? [mediaType] : ['movie', 'tv'];
    for (const type of types) {
        const pages = type === 'tv' ? Math.min(maxPages, 4) : maxPages;
        const dateField = type === 'tv' ? 'first_air_date' : 'primary_release_date';

        for (let page = 1; page <= pages; page += 1) {
            const params = {
                // Most-anticipated first so the calendar fills with titles people
                // actually care about (the page re-sorts by date per month).
                sort_by: 'popularity.desc',
                [`${dateField}.gte`]: today,
                include_adult: 'false',
                'vote_count.gte': '0',
                page: String(page),
            };
            if (maxDate) params[`${dateField}.lte`] = maxDate;

            let data;
            try {
                // eslint-disable-next-line no-await-in-loop
                data = await fetchTmdbApi(`/discover/${type}`, params);
            } catch (err) {
                console.warn(`tmdb upcoming ${type} p${page} failed:`, err.message);
                break;
            }

            const results = data?.results || [];
            results.forEach((m) => {
                if (!m.poster_path) return;
                const releaseDate = type === 'tv' ? m.first_air_date : m.release_date;
                if (!releaseDate || releaseDate < today) return;
                out.push({
                    tmdb_id: String(m.id),
                    id: String(m.id),
                    title: m.title || m.name,
                    poster_path: m.poster_path,
                    backdrop_path: m.backdrop_path || null,
                    media_type: type,
                    release_date: type === 'movie' ? releaseDate : null,
                    first_air_date: type === 'tv' ? releaseDate : null,
                    vote_average: m.vote_average ?? null,
                    popularity: m.popularity ?? 0,
                    overview: m.overview || null,
                    genres: (m.genre_ids || []).map((gid) => ({ id: gid })),
                    runtime: null,
                    _source: 'tmdb',
                });
            });

            if (page >= (data?.total_pages || 1)) break;
        }
    }

    return out;
}

export async function fetchUpcoming(options = {}) {
    const supabase = getSupabase();
    const {
        yearFrom = null,
        yearTo = null,
        minReleaseDate = null,
        mediaType = null,
        limit = 24,
        offset = 0,
        fetchAll = false,
    } = options;

    const today = new Date().toISOString().split('T')[0];
    const hasCalendarRange = yearFrom != null || yearTo != null || minReleaseDate != null;
    const effectiveMinDate = minReleaseDate ?? (hasCalendarRange ? null : today);

    const buildQuery = (rangeFrom, rangeTo) => {
        let query = supabase
            .from('movies_library')
            .select(LIBRARY_CARD_SELECT, { count: 'exact' })
            .eq('is_active', true)
            .not('release_date', 'is', null)
            .order('release_date', { ascending: true, nullsFirst: false })
            .order('popularity', { ascending: false, nullsFirst: false });

        if (effectiveMinDate) query = query.gte('release_date', effectiveMinDate);
        if (yearFrom) query = query.gte('release_date', `${yearFrom}-01-01`);
        if (yearTo) query = query.lte('release_date', `${yearTo}-12-31`);
        if (mediaType) query = query.eq('media_type', mediaType);

        return query.range(rangeFrom, rangeTo);
    };

    if (!fetchAll) {
        const { data, error, count } = await buildQuery(offset, offset + limit - 1);
        if (error) throw error;
        return {
            data: (data || []).map(normalizeLibraryItem),
            total: count || 0,
        };
    }

    const PAGE_SIZE = 500;
    const MAX_ROWS = 2000;
    let allData = [];
    let total = 0;
    let pageOffset = 0;

    while (pageOffset < MAX_ROWS) {
        const { data, error, count } = await buildQuery(pageOffset, pageOffset + PAGE_SIZE - 1);
        if (error) throw error;

        total = count || 0;
        const batch = data || [];
        allData = allData.concat(batch);

        if (batch.length < PAGE_SIZE || allData.length >= total) break;
        pageOffset += PAGE_SIZE;
    }

    const dbItems = allData.map(normalizeLibraryItem);

    // Merge live TMDB upcoming so not-yet-synced releases still appear.
    let merged = dbItems;
    try {
        const tmdbItems = await fetchTmdbUpcoming({
            minDate: today,
            maxDate: yearTo ? `${yearTo}-12-31` : null,
            mediaType,
        });
        const seen = new Set(dbItems.map((m) => String(m.tmdb_id ?? m.id)));
        const extras = tmdbItems.filter((m) => !seen.has(String(m.tmdb_id)));
        merged = dbItems.concat(extras);
    } catch (err) {
        console.warn('tmdb upcoming merge failed:', err.message);
    }

    return {
        data: merged,
        total: merged.length,
    };
}

function personNameScore(query, name) {
    const q = String(query || '').toLowerCase().trim();
    const n = String(name || '').toLowerCase().trim();
    if (!q || !n) return 0;
    if (n === q) return 1;
    if (n.includes(q) || q.includes(n)) return 0.92;
    const qt = q.split(/\s+/).filter(Boolean);
    const nt = n.split(/\s+/).filter(Boolean);
    if (!qt.length) return 0;
    const hits = qt.filter((t) => nt.some((w) => w === t || w.startsWith(t) || t.startsWith(w))).length;
    return hits / qt.length;
}

/** Movies/TV in our library for actors & directors matching the query. */
async function searchLibraryByPerson(term, { mediaType = null, limit = 40 } = {}) {
    let people;
    try {
        const res = await fetchTmdbApi('/search/person', { query: term, include_adult: 'false' });
        people = (res?.results || [])
            .map((p) => ({ p, score: personNameScore(term, p.name) }))
            .filter((x) => x.score >= 0.65)
            .sort((a, b) => b.score - a.score || (b.p.popularity || 0) - (a.p.popularity || 0))
            .slice(0, 2)
            .map((x) => x.p);
    } catch {
        return [];
    }
    if (!people.length) return [];

    const ids = new Set();
    const CREW_JOBS = new Set(['Director', 'Writer', 'Screenplay', 'Producer', 'Creator', 'Executive Producer']);

    await Promise.all(people.map(async (person) => {
        for (const k of person.known_for || []) {
            if (k?.id && (k.media_type === 'movie' || k.media_type === 'tv')) ids.add(String(k.id));
        }
        try {
            const credits = await fetchTmdbApi(`/person/${person.id}/combined_credits`, {});
            for (const c of credits?.cast || []) {
                if (c?.id) ids.add(String(c.id));
            }
            for (const c of credits?.crew || []) {
                if (c?.id && CREW_JOBS.has(c.job)) ids.add(String(c.id));
            }
        } catch {
            /* known_for only */
        }
    }));

    const idList = [...ids].slice(0, 80);
    if (!idList.length) return [];

    const supabase = getSupabase();
    let dbQuery = supabase
        .from('movies_library')
        .select(LIBRARY_CARD_SELECT)
        .eq('is_active', true)
        .in('tmdb_id', idList)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (mediaType) dbQuery = dbQuery.eq('media_type', mediaType);

    const { data, error } = await dbQuery;
    if (error) return [];
    return (data || []).map(normalizeLibraryItem);
}

export async function searchPeople(query, limit = 20) {
    const term = (query || '').trim();
    if (term.length < 2) return [];

    try {
        const res = await fetchTmdbApi('/search/person', { query: term, include_adult: 'false' });
        return (res?.results || []).slice(0, limit).map((p) => {
            const kf = (p.known_for || [])[0];
            const dept = p.known_for_department || '';
            return {
                id: p.id,
                name: p.name,
                role: dept === 'Directing' ? 'Director' : dept === 'Acting' ? 'Actor' : dept || 'Person',
                profile_path: p.profile_path,
                known_for_movie: kf?.title || kf?.name || '',
                known_for_tmdb_id: kf?.id || null,
                media_type: kf?.media_type || 'movie',
            };
        });
    } catch {
        return [];
    }
}

export async function searchContent(query, options = {}) {
    const supabase = getSupabase();
    const { mediaType = null, limit = 20, offset = 0 } = options;

    const term = (query || '').trim();
    if (term.length < 2) {
        return { data: [], total: 0 };
    }

    const orClause = buildLibrarySearchOrClause(term);
    const pool = Math.min(120, Math.max(60, limit * 4));

    const titlePromise = (async () => {
        if (!orClause) return [];
        let dbQuery = supabase
            .from('movies_library')
            .select(LIBRARY_CARD_SELECT)
            .eq('is_active', true)
            .or(orClause)
            .order('popularity', { ascending: false, nullsFirst: false })
            .range(0, pool - 1);
        if (mediaType) dbQuery = dbQuery.eq('media_type', mediaType);
        const { data, error } = await dbQuery;
        if (error) throw error;
        return rankLibrarySearchHits(term, (data || []).map(normalizeLibraryItem));
    })();

    const personPromise = offset === 0
        ? searchLibraryByPerson(term, { mediaType, limit: Math.max(limit, 30) })
        : Promise.resolve([]);

    const [titleHits, personHits] = await Promise.all([titlePromise, personPromise]);

    const seen = new Set();
    const merged = [];
    for (const row of [...titleHits, ...personHits]) {
        const id = String(row.tmdb_id || row.id);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push(row);
    }

    return {
        data: merged.slice(offset, offset + limit),
        total: merged.length,
    };
}

export async function fetchExploreContent(options = {}) {
    const supabase = getSupabase();
    const {
        mediaType = 'movie',
        category = 'popular',
        genreId = null,
        limit = 20,
        offset = 0,
    } = options;

    let query = supabase
        .from('movies_library')
        .select(LIBRARY_CARD_SELECT, { count: 'exact' })
        .eq('is_active', true)
        .eq('media_type', mediaType);

    if (genreId) {
        query = query.contains('genres', [{ id: Number(genreId) }]);
    }

    switch (category) {
        case 'top_rated':
            query = query
                .gte('vote_count', 50)
                .order('vote_average', { ascending: false, nullsFirst: false });
            break;
        case 'new_releases':
            {
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                query = query
                    .gte('release_date', sixMonthsAgo.toISOString().split('T')[0])
                    .order('release_date', { ascending: false, nullsFirst: false });
            }
            break;
        case 'popular':
        default:
            query = query.order('popularity', { ascending: false, nullsFirst: false });
            break;
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    return {
        data: (data || []).map(normalizeLibraryItem),
        total: count || 0,
    };
}

export async function fetchTrendingContent(mediaType = null, limit = 20) {
    const supabase = getSupabase();

    let query = supabase
        .from('movies_library')
        .select(LIBRARY_CARD_SELECT)
        .eq('is_active', true)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(limit);

    if (mediaType) {
        query = query.eq('media_type', mediaType);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(normalizeLibraryItem);
}

// =============================================
// NEW CONTENT ENDPOINTS
// =============================================

/**
 * Fetch movies/TV with trailers (has videos in TMDB data)
 */
export async function fetchTrailers(options = {}) {
    const supabase = getSupabase();
    const {
        mediaType = null,
        limit = 20,
        offset = 0,
        daysBack = 30,
        trailerType = 'Trailer',
        // 'recent' ranks by the trailer's own publish date (default, used by the public feed).
        // 'popular'/'trending' are admin-only candidate-browsing sorts: 'popular' ranks by the
        // underlying movie's vote_average, 'trending' by its TMDB popularity score. Neither
        // changes which trailers are eligible — only the order candidates are presented in.
        sortBy = 'recent',
    } = options;

    // The trailer's own `published_at` (inside the videos jsonb) is what determines
    // "latest launch" — it has no relationship to synced_at/release_date, so there's
    // no indexed column to sort/filter on at the DB level. Page through every row
    // with videos (PostgREST caps each request at 1000) and rank in JS instead of
    // trusting a recently-synced slice, which could miss the globally freshest trailer.
    const PAGE_SIZE = 1000;
    const MAX_ROWS = 6000;
    const data = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
        let query = supabase
            .from('movies_library')
            .select(`
                tmdb_id, title, poster_path, backdrop_path, media_type,
                release_date, first_air_date, vote_average, popularity, overview,
                genres, runtime, videos
            `)
            .eq('is_active', true)
            .not('videos', 'is', null)
            .range(from, from + PAGE_SIZE - 1);

        if (mediaType) {
            query = query.eq('media_type', mediaType);
        }

        const { data: page, error } = await query;
        if (error) throw error;
        data.push(...(page || []));
        if (!page || page.length < PAGE_SIZE) break;
    }

    const cutoffDate = daysBack > 0
        ? (() => { const d = new Date(); d.setDate(d.getDate() - daysBack); return d; })()
        : null;

    // Extract + rank trailers by publish date (most recent launch first)
    const withTrailers = (data || [])
        .map((item) => {
            const videos = item.videos?.results || item.videos || [];
            const trailers = videos.filter((v) => {
                const isYouTube = v.site === 'YouTube';
                // 'launch' = the trailer-launch types people care about (Trailer +
                // Teaser), excluding featurettes/clips/behind-the-scenes.
                const isTrailer = trailerType === 'all'
                    ? true
                    : trailerType === 'launch'
                        ? (v.type === 'Trailer' || v.type === 'Teaser')
                        : v.type === trailerType;
                return isYouTube && isTrailer && v.key && v.published_at;
            });

            if (trailers.length === 0) return null;

            const mappedTrailers = trailers
                .map((t) => ({
                    key: t.key,
                    name: t.name,
                    type: t.type,
                    official: t.official,
                    published_at: t.published_at,
                    thumbnail: `https://img.youtube.com/vi/${t.key}/maxresdefault.jpg`,
                    thumbnailFallback: `https://img.youtube.com/vi/${t.key}/hqdefault.jpg`,
                    url: `https://www.youtube.com/watch?v=${t.key}`,
                }))
                .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

            const latestPublishedAt = mappedTrailers[0].published_at;
            if (cutoffDate && new Date(latestPublishedAt) < cutoffDate) return null;

            return {
                ...normalizeLibraryItem(item),
                trailers: mappedTrailers,
                featured_trailer: mappedTrailers[0],
                latestPublishedAt,
                vote_average: item.vote_average,
                popularity: item.popularity,
            };
        })
        .filter(Boolean);

    if (sortBy === 'popular') {
        withTrailers.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    } else if (sortBy === 'trending') {
        withTrailers.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    } else {
        withTrailers.sort((a, b) => new Date(b.latestPublishedAt) - new Date(a.latestPublishedAt));
    }

    const results = withTrailers.slice(offset, offset + limit);

    return {
        data: results,
        total: withTrailers.length,
    };
}

/**
 * Showcase trailers: admin-curated, DB-backed trailers shown on the public Home feed.
 * Unlike fetchTrailers (which scans the whole library live), this is a simple read of
 * whatever the admin has picked via the Showcase Trailers admin panel.
 */
export async function fetchShowcaseTrailers(activeOnly = true) {
    const supabase = getSupabase();

    let query = supabase
        .from('showcase_trailers')
        .select('*')
        .order('display_order', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((row) => ({
        id: row.id,
        tmdb_id: row.tmdb_id,
        media_type: row.media_type,
        title: row.title,
        poster_path: row.poster_path,
        backdrop_path: row.backdrop_path,
        release_date: row.release_date,
        category: row.category,
        display_order: row.display_order,
        is_active: row.is_active,
        featured_trailer: {
            key: row.trailer_key,
            name: row.trailer_name,
            published_at: row.trailer_published_at,
            thumbnail: row.thumbnail_url,
            thumbnailFallback: row.thumbnail_fallback_url,
            url: row.youtube_url,
        },
    }));
}

/**
 * Articles: admin-curated RSS news articles shown on the public Home feed.
 * Like fetchShowcaseTrailers, this is a plain read of admin-approved rows — fetching
 * and parsing the RSS feeds themselves happens server-side in rss-server.js (cron/admin only).
 */
export async function fetchArticles(options = {}) {
    const supabase = getSupabase();
    const { limit = 20, offset = 0 } = options;

    // Exclude trailer entries: a verified trailer carries a tmdb_id and is shown
    // as a clean post via trailer_posts, never as a raw news card here.
    let { data, error, count } = await supabase
        .from('feed_articles')
        .select('id, source_name, source_logo_url, title, link, author, summary, summary_items, image_url, published_at', { count: 'exact' })
        .eq('status', 'approved')
        .eq('is_active', true)
        .is('tmdb_id', null)
        .order('published_at', { ascending: false })
        .range(offset, offset + limit - 1);

    // Pre-migration DBs may not have summary_items yet.
    if (error && /summary_items/i.test(error.message || '')) {
        ({ data, error, count } = await supabase
            .from('feed_articles')
            .select('id, source_name, source_logo_url, title, link, author, summary, image_url, published_at', { count: 'exact' })
            .eq('status', 'approved')
            .eq('is_active', true)
            .is('tmdb_id', null)
            .order('published_at', { ascending: false })
            .range(offset, offset + limit - 1));
    }

    if (error) throw error;
    return { data: data || [], total: count ?? (data || []).length };
}

/**
 * Fetch coming soon movies (not yet released)
 */
export async function fetchComingSoon(options = {}) {
    const supabase = getSupabase();
    const {
        mediaType = 'movie',
        limit = 20,
        offset = 0,
        daysAhead = 90,
    } = options;

    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    const futureDateStr = futureDate.toISOString().split('T')[0];

    let query = supabase
        .from('movies_library')
        .select(LIBRARY_CARD_SELECT, { count: 'exact' })
        .eq('is_active', true)
        .gt('release_date', today)
        .lte('release_date', futureDateStr)
        .order('release_date', { ascending: true, nullsFirst: false })
        .range(offset, offset + limit - 1);

    if (mediaType) {
        query = query.eq('media_type', mediaType);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return {
        data: (data || []).map(normalizeLibraryItem),
        total: count || 0,
    };
}

/**
 * Fetch new releases (recently released)
 */
export async function fetchNewReleases(options = {}) {
    const supabase = getSupabase();
    const {
        mediaType = null,
        limit = 20,
        offset = 0,
        daysBack = 30,
    } = options;

    const today = new Date().toISOString().split('T')[0];
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - daysBack);
    const pastDateStr = pastDate.toISOString().split('T')[0];

    let query = supabase
        .from('movies_library')
        .select(LIBRARY_CARD_SELECT, { count: 'exact' })
        .eq('is_active', true)
        .gte('release_date', pastDateStr)
        .lte('release_date', today)
        .order('release_date', { ascending: false, nullsFirst: false })
        .order('popularity', { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

    if (mediaType) {
        query = query.eq('media_type', mediaType);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return {
        data: (data || []).map(normalizeLibraryItem),
        total: count || 0,
    };
}

/**
 * Fetch popular content by time period
 */
export async function fetchPopularByPeriod(options = {}) {
    const supabase = getSupabase();
    const {
        mediaType = null,
        period = 'week', // day, week, month, year
        limit = 20,
        offset = 0,
    } = options;

    // Calculate date range based on period
    const today = new Date();
    let daysBack;
    switch (period) {
        case 'day':
            daysBack = 1;
            break;
        case 'week':
            daysBack = 7;
            break;
        case 'month':
            daysBack = 30;
            break;
        case 'year':
            daysBack = 365;
            break;
        default:
            daysBack = 7;
    }

    const pastDate = new Date();
    pastDate.setDate(today.getDate() - daysBack);
    const pastDateStr = pastDate.toISOString().split('T')[0];

    let query = supabase
        .from('movies_library')
        .select(LIBRARY_CARD_SELECT, { count: 'exact' })
        .eq('is_active', true)
        .gte('release_date', pastDateStr)
        .order('popularity', { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

    if (mediaType) {
        query = query.eq('media_type', mediaType);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return {
        data: (data || []).map(normalizeLibraryItem),
        total: count || 0,
    };
}

/**
 * Fetch now playing (in theaters) - movies released in last 45 days
 */
export async function fetchNowPlaying(options = {}) {
    const supabase = getSupabase();
    const {
        limit = 20,
        offset = 0,
    } = options;

    const today = new Date().toISOString().split('T')[0];
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 45);
    const pastDateStr = pastDate.toISOString().split('T')[0];

    const { data, error, count } = await supabase
        .from('movies_library')
        .select(LIBRARY_CARD_SELECT, { count: 'exact' })
        .eq('is_active', true)
        .eq('media_type', 'movie')
        .gte('release_date', pastDateStr)
        .lte('release_date', today)
        .order('popularity', { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
        data: (data || []).map(normalizeLibraryItem),
        total: count || 0,
    };
}

/**
 * Fetch admin dashboard statistics
 */
export async function fetchAdminStats() {
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase
            .from('admin_dashboard_stats')
            .select('*')
            .single();

        if (error) {
            // Fallback to manual queries if view doesn't exist
            const [libraryStats, userStats] = await Promise.all([
                supabase.from('movies_library').select('*', { count: 'exact', head: true }).eq('is_active', true),
                supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
            ]);

            return {
                total_active_movies: libraryStats.count || 0,
                total_users: userStats.count || 0,
            };
        }

        return data;
    } catch (err) {
        console.error('Error fetching admin stats:', err);
        return {
            total_active_movies: 0,
            total_users: 0,
            error: err.message,
        };
    }
}

const PG_LEVELS = new Set(['none', 'mild', 'moderate', 'severe']);
const VIBE_KEYS = ['emotional', 'thrilling', 'funny', 'romantic', 'thoughtful', 'intense'];

function pickCertification(detail, mediaType, region = 'IN') {
    if (mediaType === 'tv') {
        const results = detail?.content_ratings?.results || [];
        const r = results.find((x) => x.iso_3166_1 === region)
            || results.find((x) => x.iso_3166_1 === 'US')
            || results[0];
        return r?.rating || null;
    }
    const results = detail?.release_dates?.results || [];
    const region_rel = results.find((x) => x.iso_3166_1 === region)
        || results.find((x) => x.iso_3166_1 === 'US')
        || results[0];
    const cert = (region_rel?.release_dates || [])
        .map((d) => d.certification)
        .find((c) => c && c.trim());
    return cert || null;
}

function sanitizeParentGuide(raw) {
    const out = {};
    ['violence', 'nudity', 'profanity', 'frightening'].forEach((k) => {
        const v = String(raw?.[k] || 'none').toLowerCase();
        out[k] = PG_LEVELS.has(v) ? v : 'none';
    });
    return out;
}

function sanitizeVibes(raw) {
    const out = {};
    VIBE_KEYS.forEach((k) => {
        const n = Math.round(Number(raw?.[k]));
        out[k] = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    });
    return out;
}

/**
 * Accurate Parent Guide + Movie Vibes for a title (movie or TV), combining
 * TMDB certification with an LLM content analysis. Persists to the library row
 * (when present and not admin-overridden) so it's permanent. Works for any
 * tmdb id, including titles not in the local library.
 */
export async function fetchTitleAnalysis(tmdbId, mediaType = 'movie', region = 'IN') {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const append = type === 'tv' ? 'content_ratings' : 'release_dates';

    let detail;
    try {
        detail = await fetchTmdbApi(`/${type}/${tmdbId}`, { append_to_response: append });
    } catch (err) {
        console.warn('title analysis tmdb fetch failed:', err.message);
        return { certification: null, parentGuide: null, vibes: null };
    }

    const certification = pickCertification(detail, type, region);
    const genres = (detail?.genres || []).map((g) => g.name).filter(Boolean);

    let parentGuide = null;
    let vibes = null;
    if (isLlmEnabled()) {
        const prompt = [
            'Analyse this title for a content guide. Use your knowledge of the title if',
            'you recognise it; otherwise infer from the description, genres and rating.',
            '',
            `Title: ${detail?.title || detail?.name || ''}`,
            certification ? `Rating: ${certification}` : '',
            genres.length ? `Genres: ${genres.join(', ')}` : '',
            detail?.overview ? `Overview: ${String(detail.overview).slice(0, 700)}` : '',
            '',
            'Return ONLY JSON of this exact shape:',
            '{"parent_guide":{"violence":"none|mild|moderate|severe","nudity":"...","profanity":"...","frightening":"..."},',
            ' "vibes":{"emotional":0-100,"thrilling":0-100,"funny":0-100,"romantic":0-100,"thoughtful":0-100,"intense":0-100}}',
            'parent_guide = severity of sex/nudity, violence, language (profanity), and scary/intense (frightening).',
            'vibes = how much the title feels each way (they need not sum to 100).',
        ].filter(Boolean).join('\n');

        try {
            const parsed = await generateJson(prompt, { temperature: 0.2, maxOutputTokens: 400 });
            if (parsed?.parent_guide) parentGuide = sanitizeParentGuide(parsed.parent_guide);
            if (parsed?.vibes) vibes = sanitizeVibes(parsed.vibes);
        } catch (err) {
            console.warn('title analysis llm failed:', err.message);
        }
    }

    // Persist to the library row (only if present and not admin-overridden).
    try {
        const supabase = getSupabaseAdmin();
        const { data: row } = await supabase
            .from('movies_library')
            .select('tmdb_id, certification, custom_parent_guide, custom_vibes')
            .eq('tmdb_id', String(tmdbId)).eq('media_type', type).maybeSingle();
        if (row) {
            const patch = {};
            if (certification && !row.certification) patch.certification = certification;
            const pgEmpty = !row.custom_parent_guide || !Object.keys(row.custom_parent_guide).length;
            if (parentGuide && pgEmpty) patch.custom_parent_guide = parentGuide;
            const vibesEmpty = !row.custom_vibes || !Object.keys(row.custom_vibes).length;
            if (vibes && vibesEmpty) patch.custom_vibes = vibes;
            if (Object.keys(patch).length) {
                await supabase.from('movies_library').update(patch).eq('tmdb_id', String(tmdbId)).eq('media_type', type);
            }
        }
    } catch (err) {
        console.warn('title analysis persist failed:', err.message);
    }

    return { certification, parentGuide, vibes };
}

/**
 * Verified trailer posts for the Home feed. Reads ONLY the persisted
 * `trailer_posts` table — the clean TMDB post saved during RSS ingestion. No
 * join, no live TMDB call, and the raw RSS entry is never exposed here.
 */
export async function fetchRssTrailers({ limit = 15, daysBack = 21 } = {}) {
    const supabase = getSupabase();
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    const { data, error } = await supabase
        .from('trailer_posts')
        .select('*')
        .eq('is_active', true)
        .gte('published_at', since.toISOString())
        .order('published_at', { ascending: false })
        .limit(limit);

    if (error || !data?.length) return { data: [], total: 0 };

    const items = data.map((p) => {
        const tmdbThumb = p.backdrop_path ? `https://image.tmdb.org/t/p/w780${p.backdrop_path}` : null;
        return {
            id: p.tmdb_id,
            tmdb_id: p.tmdb_id,
            media_type: p.media_type,
            title: p.title,
            poster_path: p.poster_path,
            backdrop_path: p.backdrop_path,
            release_date: p.release_date,
            vote_average: p.vote_average,
            overview: p.overview,
            source_name: p.source_name,
            source_logo: p.source_logo || null,
            featured_trailer: {
                key: p.youtube_key || null,
                name: p.trailer_name,
                type: p.trailer_type || 'Trailer',
                published_at: p.published_at,
                url: p.trailer_url,
                thumbnail: p.youtube_key ? `https://img.youtube.com/vi/${p.youtube_key}/maxresdefault.jpg` : tmdbThumb,
                thumbnailFallback: p.youtube_key ? `https://img.youtube.com/vi/${p.youtube_key}/hqdefault.jpg` : tmdbThumb,
            },
        };
    });
    return { data: items, total: items.length };
}

/**
 * "More like this" — content-based similar titles, biased toward the seed's
 * language / region / genres so a Hindi film doesn't surface only English hits.
 *
 * Sources (merged + re-ranked):
 *  1) TMDB /recommendations
 *  2) TMDB /similar
 *  3) Local library: same original_language + overlapping genres
 *
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 * @param {number} limit
 */
export async function fetchSimilarTitles(tmdbId, mediaType = 'movie', limit = 18) {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const seedId = String(tmdbId);
    const want = Math.max(6, Math.min(40, Number(limit) || 18));

    // ── Seed metadata ──────────────────────────────────────────────────────
    let seed = null;
    try {
        seed = await fetchTmdbApi(`/${type}/${seedId}`, {});
    } catch (err) {
        console.warn('similar seed fetch failed:', err.message);
    }

    // Fallback: library row
    if (!seed?.id) {
        try {
            const supabase = getSupabase();
            const { data } = await supabase
                .from('movies_library')
                .select('tmdb_id, title, original_language, origin_country, genre_ids, genres, media_type, poster_path')
                .eq('tmdb_id', seedId)
                .eq('media_type', type)
                .maybeSingle();
            if (data) {
                seed = {
                    id: data.tmdb_id,
                    original_language: data.original_language,
                    origin_country: data.origin_country,
                    genre_ids: data.genre_ids || (Array.isArray(data.genres) ? data.genres.map((g) => g.id).filter(Boolean) : []),
                };
            }
        } catch {
            /* ignore */
        }
    }

    const seedLang = (seed?.original_language || '').toLowerCase() || null;
    const seedCountries = new Set(
        (Array.isArray(seed?.origin_country) ? seed.origin_country : [])
            .map((c) => String(c).toUpperCase())
            .filter(Boolean),
    );
    // production_countries from detail payload
    if (Array.isArray(seed?.production_countries)) {
        seed.production_countries.forEach((c) => {
            if (c?.iso_3166_1) seedCountries.add(String(c.iso_3166_1).toUpperCase());
        });
    }
    const seedGenres = new Set(
        (seed?.genres || [])
            .map((g) => Number(g.id))
            .filter((id) => Number.isFinite(id) && id > 0),
    );
    if (Array.isArray(seed?.genre_ids)) {
        seed.genre_ids.forEach((id) => {
            const n = Number(id);
            if (Number.isFinite(n) && n > 0) seedGenres.add(n);
        });
    }

    const mapTmdbResult = (m, source) => ({
        id: m.id,
        tmdb_id: m.id,
        title: m.title || m.name,
        name: m.name,
        poster_path: m.poster_path,
        backdrop_path: m.backdrop_path,
        overview: m.overview,
        vote_average: m.vote_average,
        vote_count: m.vote_count,
        popularity: m.popularity,
        release_date: m.release_date,
        first_air_date: m.first_air_date,
        media_type: m.media_type || type,
        genre_ids: m.genre_ids || [],
        original_language: m.original_language || null,
        origin_country: m.origin_country || [],
        _source: source,
    });

    // ── TMDB recommendations + similar ─────────────────────────────────────
    const [recRes, simRes] = await Promise.allSettled([
        fetchTmdbApi(`/${type}/${seedId}/recommendations`, { page: 1 }),
        fetchTmdbApi(`/${type}/${seedId}/similar`, { page: 1 }),
    ]);

    const byId = new Map();
    const ingest = (list, source) => {
        for (const m of list || []) {
            if (!m?.id || !m.poster_path) continue;
            if (String(m.id) === seedId) continue;
            const existing = byId.get(String(m.id));
            if (existing) {
                existing._source = `${existing._source}+${source}`;
                continue;
            }
            byId.set(String(m.id), mapTmdbResult(m, source));
        }
    };

    if (recRes.status === 'fulfilled') ingest(recRes.value?.results, 'recommendations');
    if (simRes.status === 'fulfilled') ingest(simRes.value?.results, 'similar');

    // ── Local library: same language + shared genres ───────────────────────
    if (seedLang) {
        try {
            const supabase = getSupabase();
            let q = supabase
                .from('movies_library')
                .select('tmdb_id, title, poster_path, backdrop_path, overview, vote_average, vote_count, popularity, release_date, first_air_date, media_type, genre_ids, genres, original_language, origin_country')
                .eq('is_active', true)
                .eq('media_type', type)
                .eq('original_language', seedLang)
                .not('poster_path', 'is', null)
                .neq('tmdb_id', seedId)
                .order('popularity', { ascending: false, nullsFirst: false })
                .limit(60);

            const { data: localRows } = await q;
            for (const row of localRows || []) {
                const id = String(row.tmdb_id);
                if (byId.has(id)) {
                    const existing = byId.get(id);
                    existing._source = `${existing._source}+library`;
                    if (!existing.original_language) existing.original_language = row.original_language;
                    continue;
                }
                const genreIds = Array.isArray(row.genre_ids) && row.genre_ids.length
                    ? row.genre_ids.map(Number)
                    : (Array.isArray(row.genres) ? row.genres.map((g) => Number(g.id)).filter(Boolean) : []);
                byId.set(id, {
                    id: row.tmdb_id,
                    tmdb_id: row.tmdb_id,
                    title: row.title,
                    poster_path: row.poster_path,
                    backdrop_path: row.backdrop_path,
                    overview: row.overview,
                    vote_average: row.vote_average,
                    vote_count: row.vote_count,
                    popularity: row.popularity,
                    release_date: row.release_date,
                    first_air_date: row.first_air_date,
                    media_type: row.media_type || type,
                    genre_ids: genreIds,
                    original_language: row.original_language,
                    origin_country: row.origin_country || [],
                    _source: 'library',
                });
            }
        } catch (err) {
            console.warn('similar library pool failed:', err.message);
        }
    }

    // ── Score & rank ───────────────────────────────────────────────────────
    const scoreItem = (item) => {
        let score = 0;
        const lang = (item.original_language || '').toLowerCase();
        const countries = new Set(
            (Array.isArray(item.origin_country) ? item.origin_country : [])
                .map((c) => String(c).toUpperCase())
                .filter(Boolean),
        );

        // Language match is the strongest signal (fixes Hindi → English problem)
        if (seedLang && lang && lang === seedLang) score += 120;
        else if (seedLang && lang && lang !== seedLang) score -= 40;

        // Shared origin country (e.g. IN)
        if (seedCountries.size) {
            let sharedCountry = false;
            for (const c of countries) {
                if (seedCountries.has(c)) { sharedCountry = true; break; }
            }
            if (sharedCountry) score += 35;
        }

        // Genre overlap
        const itemGenres = new Set((item.genre_ids || []).map(Number).filter((n) => n > 0));
        let overlap = 0;
        for (const g of itemGenres) {
            if (seedGenres.has(g)) overlap += 1;
        }
        score += overlap * 18;
        if (seedGenres.size && overlap === 0) score -= 15;

        // Source quality
        const src = item._source || '';
        if (src.includes('recommendations')) score += 25;
        if (src.includes('similar')) score += 18;
        if (src.includes('library')) score += 12;

        // Soft quality / popularity
        score += Math.min(12, (Number(item.vote_average) || 0) * 1.2);
        score += Math.min(8, Math.log10((Number(item.popularity) || 1) + 1) * 3);

        return score;
    };

    const ranked = [...byId.values()]
        .map((item) => ({ ...item, _score: scoreItem(item) }))
        .sort((a, b) => b._score - a._score);

    // Prefer same-language fill first when we know the seed language
    let picked = [];
    if (seedLang) {
        const sameLang = ranked.filter((i) => (i.original_language || '').toLowerCase() === seedLang);
        const other = ranked.filter((i) => (i.original_language || '').toLowerCase() !== seedLang);
        // Aim for ≥70% same-language when available
        const sameTarget = Math.ceil(want * 0.7);
        picked = [
            ...sameLang.slice(0, Math.max(sameTarget, want)),
            ...other,
        ];
        // Dedupe preserving order
        const seen = new Set();
        picked = picked.filter((i) => {
            const id = String(i.tmdb_id);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        }).slice(0, want);
    } else {
        picked = ranked.slice(0, want);
    }

    return picked.map(({ _score, _source, ...rest }) => rest);
}

/**
 * Alternate poster art for a title (TMDB images).
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 */
export async function fetchTitlePosters(tmdbId, mediaType = 'movie') {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const id = String(tmdbId || '').trim();
    if (!id) return { posters: [], backdrops: [], default_poster: null, default_backdrop: null };

    let defaultPoster = null;
    let defaultBackdrop = null;
    try {
        const detail = await fetchTmdbApi(`/${type}/${id}`, {});
        defaultPoster = detail?.poster_path || null;
        defaultBackdrop = detail?.backdrop_path || null;
    } catch {
        defaultPoster = null;
        defaultBackdrop = null;
    }

    const mapImage = (p) => ({
        file_path: p.file_path,
        width: p.width,
        height: p.height,
        iso_639_1: p.iso_639_1 || null,
        vote_average: p.vote_average || 0,
    });

    const sortImages = (list) =>
        (list || [])
            .filter((p) => p?.file_path)
            .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0) || (b.vote_count || 0) - (a.vote_count || 0));

    let posters = [];
    let backdrops = [];
    try {
        const images = await fetchTmdbApi(`/${type}/${id}/images`, {});
        posters = sortImages(images?.posters).slice(0, 40).map(mapImage);
        backdrops = sortImages(images?.backdrops).slice(0, 40).map(mapImage);
    } catch {
        posters = [];
        backdrops = [];
    }

    if (defaultPoster && !posters.some((p) => p.file_path === defaultPoster)) {
        posters.unshift({ file_path: defaultPoster, width: null, height: null, iso_639_1: null, vote_average: 0 });
    }
    if (defaultBackdrop && !backdrops.some((p) => p.file_path === defaultBackdrop)) {
        backdrops.unshift({ file_path: defaultBackdrop, width: null, height: null, iso_639_1: null, vote_average: 0 });
    }

    return {
        posters,
        backdrops,
        default_poster: defaultPoster,
        default_backdrop: defaultBackdrop,
    };
}

/**
 * Where-to-watch (OTT) availability for a title, from TMDB watch/providers.
 * Picks the requested region, falling back to US/IN/any so something shows.
 * @param {string|number} tmdbId
 * @param {'movie'|'tv'} mediaType
 * @param {string} region ISO-3166-1 (e.g. 'IN', 'US')
 */
export async function fetchWatchProviders(tmdbId, mediaType = 'movie', region = 'IN') {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    let data;
    try {
        data = await fetchTmdbApi(`/${type}/${tmdbId}/watch/providers`);
    } catch (err) {
        console.warn('watch providers fetch failed:', err.message);
        return { region: null, link: null, flatrate: [], rent: [], buy: [] };
    }

    const results = data?.results || {};
    const chosenRegion = results[region] ? region
        : results.US ? 'US'
            : results.IN ? 'IN'
                : Object.keys(results)[0] || null;
    const r = chosenRegion ? results[chosenRegion] : {};

    const map = (arr) => (arr || [])
        .map((p) => ({
            provider_id: p.provider_id,
            name: p.provider_name,
            logo_path: p.logo_path,
        }))
        .filter((p) => p.name);

    return {
        region: chosenRegion,
        link: r?.link || null,
        flatrate: map(r?.flatrate),
        rent: map(r?.rent),
        buy: map(r?.buy),
    };
}
