import { createClient } from '@supabase/supabase-js';

const MOVIE_DETAIL_SELECT =
    'tmdb_id, title, original_title, overview, tagline, poster_path, backdrop_path, media_type, release_date, first_air_date, status, runtime, vote_average, vote_count, popularity, genres, certification, custom_parent_guide, custom_vibes, streaming_platforms, editor_review, editor_rating, credits, videos, number_of_seasons, number_of_episodes, networks, imdb_id, homepage, production_companies, spoken_languages, belongs_to_collection, adult, budget, revenue';

function getSupabase() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
    }

    return createClient(supabaseUrl, supabaseKey);
}

export async function fetchMovieDetail(tmdbId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIE_DETAIL_SELECT)
        .eq('tmdb_id', String(tmdbId))
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }

    return data;
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
