import { createClient } from '@supabase/supabase-js';
import { fetchTmdbApi } from './tmdb-server.js';

const MOVIE_DETAIL_SELECT =
    'tmdb_id, title, original_title, overview, tagline, poster_path, backdrop_path, media_type, release_date, first_air_date, status, runtime, vote_average, vote_count, popularity, genres, certification, custom_parent_guide, custom_vibes, streaming_platforms, editor_review, editor_rating, credits, videos, number_of_seasons, number_of_episodes, seasons, networks, imdb_id, homepage, production_companies, spoken_languages, belongs_to_collection, adult, budget, revenue';

function getSupabase() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
    }

    return createClient(supabaseUrl, supabaseKey);
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

    const { data, error } = await query.single();

    if (error) {
        // Not in the local library — fall back to TMDB so any title resolves
        // (e.g. "More like this" suggestions that were never synced).
        if (error.code === 'PGRST116') {
            return fetchMovieDetailFromTmdb(tmdbId, mediaType);
        }
        throw error;
    }

    return data;
}

/**
 * Build a detail payload directly from TMDB for titles not in movies_library.
 * Shaped to match the DB row the frontend expects (genres [{id,name}],
 * credits {cast,crew}, videos {results}). Returns null if TMDB has neither a
 * movie nor a show with this id.
 */
async function fetchMovieDetailFromTmdb(tmdbId, mediaType = null) {
    const types = mediaType ? [mediaType === 'tv' ? 'tv' : 'movie'] : ['movie', 'tv'];

    for (const type of types) {
        try {
            const m = await fetchTmdbApi(`/${type}/${tmdbId}`, {
                append_to_response: 'credits,videos',
            });
            if (!m?.id) continue;

            return {
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
                certification: null,
                custom_parent_guide: null,
                custom_vibes: null,
                streaming_platforms: [],
                editor_review: null,
                editor_rating: null,
                credits: m.credits || { cast: [], crew: [] },
                videos: m.videos || { results: [] },
                number_of_seasons: m.number_of_seasons ?? null,
                number_of_episodes: m.number_of_episodes ?? null,
                seasons: m.seasons || null,
                networks: m.networks || null,
                imdb_id: m.imdb_id || null,
                homepage: m.homepage || null,
                production_companies: m.production_companies || null,
                spoken_languages: m.spoken_languages || null,
                belongs_to_collection: m.belongs_to_collection || null,
                adult: m.adult ?? false,
                budget: m.budget ?? null,
                revenue: m.revenue ?? null,
                _source: 'tmdb',
            };
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
