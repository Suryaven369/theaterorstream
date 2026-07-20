/**
 * PostgREST returns 500 for SELECT * when movies_library.embedding (vector) exists.
 * Always use these projections instead of * for reads/upsert returns.
 *
 * Prefer CARD/LIST for browse paths — credits/videos/images JSONB dominate egress.
 */

const LIBRARY_LIST_COLUMNS = [
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
    'is_active',
    'featured',
    'priority',
    'collection_tags',
    'display_sections',
    'streaming_platforms',
    'certification',
    'editor_rating',
    'created_at',
    'updated_at',
    'synced_at',
    'first_air_date',
    'last_air_date',
    'number_of_seasons',
    'number_of_episodes',
    'networks',
    'origin_country',
    'original_language',
    'belongs_to_collection',
    'adult',
];

const LIBRARY_DETAIL_EXTRA_COLUMNS = [
    'production_companies',
    'production_countries',
    'spoken_languages',
    'imdb_id',
    'homepage',
    'budget',
    'revenue',
    'custom_vibes',
    'custom_parent_guide',
    'admin_notes',
    'editor_review',
    'in_production',
    'episode_run_time',
    'credits',
    'videos',
    'images',
    'reviews',
    'similar_movies',
    'recommendations',
    'keywords',
    'release_dates_data',
];

/** Card rails / homepage hydration — match Edge LIBRARY_CARD_SELECT (no fat JSONB). */
export const LIBRARY_CARD_SELECT =
    'tmdb_id, title, poster_path, backdrop_path, media_type, release_date, first_air_date, vote_average, popularity, overview, genres, runtime, number_of_seasons, number_of_episodes';

/**
 * Admin / client list browse — scalars + light admin fields only.
 * Never include images/reviews/similar/recommendations/credits/videos here.
 */
export const MOVIES_LIBRARY_LIST_SELECT = LIBRARY_LIST_COLUMNS.join(',');

/** Full row for detail/editor — still omit embedding; include heavy JSONB only here. */
export const MOVIES_LIBRARY_SELECT = [
    ...LIBRARY_LIST_COLUMNS,
    ...LIBRARY_DETAIL_EXTRA_COLUMNS,
].join(',');

/** Optional columns — only after taste onboarding migration (20260522000000) */
export const MOVIES_LIBRARY_OPTIONAL_COLUMNS = [
    'mood_tags',
    'family_score',
];

/** Safe columns for upsert RETURNING — avoids heavy JSONB / vector serialization issues */
export const LIBRARY_UPSERT_SELECT =
    'tmdb_id, title, media_type, poster_path, is_active, vote_average, release_date, first_air_date';

export const MOVIE_DETAIL_SELECT =
    'tmdb_id, title, original_title, overview, tagline, poster_path, backdrop_path, media_type, release_date, first_air_date, status, runtime, vote_average, vote_count, popularity, genres, certification, custom_parent_guide, custom_vibes, streaming_platforms, editor_review, editor_rating, web_ratings, credits, videos, number_of_seasons, number_of_episodes, seasons, networks, imdb_id, homepage, production_companies, spoken_languages, belongs_to_collection, adult, budget, revenue';
