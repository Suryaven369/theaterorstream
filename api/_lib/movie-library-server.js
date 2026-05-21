export function mapFullTmdbToLibraryRecord(movieData, mediaType) {
    const tmdbId = String(movieData.id);
    const genreIds = movieData.genres?.map((g) => g.id).filter(Boolean) || [];

    return {
        tmdb_id: tmdbId,
        media_type: mediaType,
        title: movieData.title || movieData.name,
        original_title: movieData.original_title || movieData.original_name,
        overview: movieData.overview,
        tagline: movieData.tagline,
        poster_path: movieData.poster_path,
        backdrop_path: movieData.backdrop_path,
        release_date: movieData.release_date || movieData.first_air_date,
        status: movieData.status,
        runtime: movieData.runtime || movieData.episode_run_time?.[0],
        vote_average: movieData.vote_average,
        vote_count: movieData.vote_count,
        popularity: movieData.popularity,
        genres: movieData.genres,
        genre_ids: genreIds,
        production_companies: movieData.production_companies,
        production_countries: movieData.production_countries,
        spoken_languages: movieData.spoken_languages,
        first_air_date: movieData.first_air_date,
        last_air_date: movieData.last_air_date,
        number_of_seasons: movieData.number_of_seasons,
        number_of_episodes: movieData.number_of_episodes,
        networks: movieData.networks,
        in_production: movieData.in_production,
        episode_run_time: movieData.episode_run_time,
        origin_country: movieData.origin_country,
        original_language: movieData.original_language,
        credits: movieData.credits || null,
        videos: movieData.videos?.results || movieData.videos || [],
        images: movieData.images || null,
        reviews: movieData.reviews?.results || [],
        similar_movies: movieData.similar?.results || movieData.similar || [],
        recommendations: movieData.recommendations?.results || movieData.recommendations || [],
        keywords: movieData.keywords?.keywords || movieData.keywords?.results || [],
        release_dates_data: movieData.release_dates?.results || [],
        imdb_id: movieData.imdb_id || movieData.external_ids?.imdb_id,
        homepage: movieData.homepage,
        budget: movieData.budget,
        revenue: movieData.revenue,
        belongs_to_collection: movieData.belongs_to_collection,
        adult: movieData.adult || false,
        is_active: true,
        synced_at: new Date().toISOString(),
    };
}

export function mapListItemToLibraryRecord(item, mediaType) {
    return {
        tmdb_id: String(item.id),
        media_type: mediaType,
        title: item.title || item.name,
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        overview: item.overview,
        release_date: item.release_date || item.first_air_date,
        first_air_date: item.first_air_date,
        vote_average: item.vote_average,
        vote_count: item.vote_count,
        popularity: item.popularity,
        is_active: true,
        synced_at: new Date().toISOString(),
    };
}

export function shouldRefreshFull(existing, listItem) {
    if (!existing) return true;
    const popDelta = Math.abs((existing.popularity || 0) - (listItem.popularity || 0));
    const voteDelta = Math.abs((existing.vote_average || 0) - (listItem.vote_average || 0));
    return popDelta > 5 || voteDelta > 0.5;
}

export async function upsertLibraryRecord(supabase, record) {
    const { data, error } = await supabase
        .from('movies_library')
        .upsert(record, { onConflict: 'tmdb_id' })
        .select('tmdb_id')
        .single();

    if (error) throw error;
    return data;
}
