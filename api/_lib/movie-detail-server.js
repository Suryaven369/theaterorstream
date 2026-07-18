import { createClient } from '@supabase/supabase-js';
import { fetchTmdbApi } from './tmdb-server.js';
import { getSupabaseAdmin } from './supabase-admin.js';
import { mapFullTmdbToLibraryRecord } from './movie-library-server.js';
import { upsertMoviesLibrary } from '../../src/lib/libraryDedupe.js';

const MOVIE_DETAIL_SELECT =
    'tmdb_id, title, original_title, overview, tagline, poster_path, backdrop_path, media_type, release_date, first_air_date, status, runtime, vote_average, vote_count, popularity, genres, certification, custom_parent_guide, custom_vibes, streaming_platforms, editor_review, editor_rating, web_ratings, credits, videos, number_of_seasons, number_of_episodes, seasons, networks, imdb_id, homepage, production_companies, spoken_languages, belongs_to_collection, adult, budget, revenue';

/** Richer append so first-visit writes match admin sync quality. */
const DETAIL_APPEND = 'credits,videos,release_dates,keywords,external_ids';

function getSupabase() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
    }

    return createClient(supabaseUrl, supabaseKey);
}

function pickUsCertification(releaseDates) {
    const results = releaseDates?.results || releaseDates || [];
    const us = results.find((r) => r.iso_3166_1 === 'US');
    if (!us?.release_dates?.length) return null;
    const theatrical = us.release_dates.find((d) => d.certification && (d.type === 3 || d.type === 2));
    const any = us.release_dates.find((d) => d.certification);
    return (theatrical || any)?.certification || null;
}

/**
 * Shape a library/detail row for the Details page.
 * videos in DB may be an array; frontend also accepts { results }.
 */
function toDetailPayload(row, { source = 'library' } = {}) {
    if (!row) return null;
    const videos = row.videos;
    const normalizedVideos = Array.isArray(videos)
        ? { results: videos }
        : (videos || { results: [] });

    return {
        ...row,
        videos: normalizedVideos,
        credits: row.credits || { cast: [], crew: [] },
        streaming_platforms: row.streaming_platforms || [],
        _source: source,
    };
}

/**
 * Persist a TMDB detail payload into movies_library (service role).
 * Returns the upserted detail row, or null if persist failed.
 */
async function persistTmdbDetailToLibrary(tmdbData, mediaType) {
    try {
        const admin = getSupabaseAdmin();
        const record = mapFullTmdbToLibraryRecord(tmdbData, mediaType);
        const cert = pickUsCertification(tmdbData.release_dates);
        if (cert) record.certification = cert;

        const { data, error } = await upsertMoviesLibrary(
            admin,
            [record],
            MOVIE_DETAIL_SELECT,
        );
        if (error) {
            console.warn('[movie-detail] library upsert failed:', error.message);
            return null;
        }
        const row = Array.isArray(data) ? data[0] : data;
        return row || null;
    } catch (err) {
        // Missing service role in local/dev should not break the detail page
        console.warn('[movie-detail] library persist skipped:', err.message);
        return null;
    }
}

export async function fetchMovieDetail(tmdbId, mediaType = null) {
    const supabase = getSupabase();

    // tmdb_id alone isn't unique across the table — movie IDs and TV IDs are
    // separate numbering spaces in TMDB, so the same id can match a movie row
    // AND a show row. Without filtering by media_type, .single() errors out
    // (it requires exactly one match) whenever that collision happens, which
    // surfaces to the client as a plain 404 for either title.
    let query = supabase
        .from('movies_library')
        .select(MOVIE_DETAIL_SELECT)
        .eq('tmdb_id', String(tmdbId));

    if (mediaType) {
        query = query.eq('media_type', mediaType);
    }

    let { data, error } = await query.single();

    // Pre-migration DBs may not have web_ratings yet — retry without it.
    if (error && /web_ratings/i.test(error.message || '')) {
        const selectWithoutWeb = MOVIE_DETAIL_SELECT.replace(', web_ratings', '');
        let retry = supabase.from('movies_library').select(selectWithoutWeb).eq('tmdb_id', String(tmdbId));
        if (mediaType) retry = retry.eq('media_type', mediaType);
        ({ data, error } = await retry.single());
        if (data) data = { ...data, web_ratings: null };
    }

    if (error) {
        // Not in the local library — fall back to TMDB and write-through to DB
        // so the next visit is served from movies_library.
        if (error.code === 'PGRST116') {
            return fetchMovieDetailFromTmdb(tmdbId, mediaType);
        }
        throw error;
    }

    return toDetailPayload(data, { source: 'library' });
}

/**
 * Build a detail payload from TMDB for titles not in movies_library,
 * then upsert into the library (write-through cache).
 */
async function fetchMovieDetailFromTmdb(tmdbId, mediaType = null) {
    const types = mediaType ? [mediaType === 'tv' ? 'tv' : 'movie'] : ['movie', 'tv'];

    for (const type of types) {
        try {
            const m = await fetchTmdbApi(`/${type}/${tmdbId}`, {
                append_to_response: DETAIL_APPEND,
            });
            if (!m?.id) continue;

            // Prefer returning the persisted library row (same shape as DB hits).
            const saved = await persistTmdbDetailToLibrary(m, type);
            if (saved) {
                return toDetailPayload(saved, { source: 'library' });
            }

            // Persist failed (e.g. no service role) — still return TMDB payload.
            return toDetailPayload({
                tmdb_id: String(m.id),
                title: m.title || m.name || null,
                original_title: m.original_title || m.original_name || null,
                overview: m.overview || null,
                tagline: m.tagline || null,
                poster_path: m.poster_path || null,
                backdrop_path: m.backdrop_path || null,
                media_type: type,
                release_date: m.release_date || null,
                first_air_date: m.first_air_date || null,
                status: m.status || null,
                runtime: m.runtime ?? (Array.isArray(m.episode_run_time) ? m.episode_run_time[0] : null),
                vote_average: m.vote_average ?? null,
                vote_count: m.vote_count ?? null,
                popularity: m.popularity ?? null,
                genres: Array.isArray(m.genres) ? m.genres : [],
                certification: pickUsCertification(m.release_dates),
                custom_parent_guide: null,
                custom_vibes: null,
                streaming_platforms: [],
                editor_review: null,
                editor_rating: null,
                web_ratings: null,
                credits: m.credits || { cast: [], crew: [] },
                videos: m.videos || { results: [] },
                number_of_seasons: m.number_of_seasons ?? null,
                number_of_episodes: m.number_of_episodes ?? null,
                seasons: m.seasons || null,
                networks: m.networks || null,
                imdb_id: m.imdb_id || m.external_ids?.imdb_id || null,
                homepage: m.homepage || null,
                production_companies: m.production_companies || null,
                spoken_languages: m.spoken_languages || null,
                belongs_to_collection: m.belongs_to_collection || null,
                adult: m.adult ?? false,
                budget: m.budget ?? null,
                revenue: m.revenue ?? null,
            }, { source: 'tmdb' });
        } catch (err) {
            // 404 for this type — try the next (movie vs tv id spaces differ).
            if (err?.status === 404) continue;
            console.warn(`TMDB detail fallback failed (${type}/${tmdbId}):`, err.message);
        }
    }

    return null;
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
