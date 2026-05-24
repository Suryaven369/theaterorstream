/**
 * PostgREST returns 500 for SELECT * when movies_library.embedding (vector) exists.
 * Always use these projections instead of * for reads/upsert returns.
 */

export const MOVIES_LIBRARY_SELECT = [
    'id',
    'tmdb_id',
    'media_type',
    'title',
    'original_title',
    'overview',
    'tagline',
    'poster_path',
    'backdrop_path',
    'release_date',
    'status',
    'runtime',
    'vote_average',
    'vote_count',
    'popularity',
    'genres',
    'genre_ids',
    'production_companies',
    'production_countries',
    'spoken_languages',
    'imdb_id',
    'homepage',
    'budget',
    'revenue',
    'is_active',
    'featured',
    'priority',
    'collection_tags',
    'display_sections',
    'streaming_platforms',
    'custom_vibes',
    'custom_parent_guide',
    'certification',
    'admin_notes',
    'editor_review',
    'editor_rating',
    'created_at',
    'updated_at',
    'synced_at',
    'first_air_date',
    'last_air_date',
    'number_of_seasons',
    'number_of_episodes',
    'networks',
    'in_production',
    'episode_run_time',
    'origin_country',
    'original_language',
    'credits',
    'videos',
    'images',
    'reviews',
    'similar_movies',
    'recommendations',
    'keywords',
    'release_dates_data',
    'belongs_to_collection',
    'adult',
].join(',');

/** Optional columns — only after taste onboarding migration (20260522000000) */
export const MOVIES_LIBRARY_OPTIONAL_COLUMNS = [
    'mood_tags',
    'family_score',
];

export const LIBRARY_CARD_SELECT =
    'tmdb_id, title, poster_path, backdrop_path, media_type, release_date, first_air_date, vote_average, overview, genres, runtime, number_of_seasons, number_of_episodes';

/** Safe columns for upsert RETURNING — avoids heavy JSONB / vector serialization issues */
export const LIBRARY_UPSERT_SELECT =
    'tmdb_id, title, media_type, poster_path, is_active, vote_average, release_date, first_air_date';

export const MOVIE_DETAIL_SELECT =
    'tmdb_id, title, original_title, overview, tagline, poster_path, backdrop_path, media_type, release_date, first_air_date, status, runtime, vote_average, vote_count, popularity, genres, certification, custom_parent_guide, custom_vibes, streaming_platforms, editor_review, editor_rating, credits, videos, number_of_seasons, number_of_episodes, networks, imdb_id, homepage, production_companies, spoken_languages, belongs_to_collection, adult, budget, revenue';
