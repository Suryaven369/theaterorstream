-- =============================================================================
-- Backfill posters on MCU collection from movies_library
-- Run after bulk_mcu_collection.sql (or anytime posters are missing).
-- For titles NOT in movies_library, also run:
--   node scripts/backfill-mcu-collection-posters.mjs
-- =============================================================================

-- 1) Copy posters/titles from library (handles text/int tmdb_id)
UPDATE public.collection_movies cm
SET
  poster_path = COALESCE(ml.poster_path, cm.poster_path),
  movie_title = COALESCE(NULLIF(ml.title, ''), cm.movie_title),
  media_type = COALESCE(NULLIF(ml.media_type, ''), cm.media_type),
  -- Use real release dates (fixes "Added 2077" from inverted sort timestamps)
  added_at = COALESCE(
    NULLIF(ml.release_date, '')::timestamptz,
    NULLIF(ml.first_air_date, '')::timestamptz,
    cm.added_at
  )
FROM public.movies_library ml
WHERE cm.collection_id IN (
    SELECT id FROM public.user_collections
    WHERE lower(trim(name)) = 'marvel cinematic universe'
  )
  AND ml.tmdb_id::text = cm.movie_id
  AND (
    cm.poster_path IS NULL
    OR cm.poster_path = ''
    OR cm.added_at > timestamptz '2100-01-01'
  );

-- 2) Report what's still missing
SELECT
  cm.movie_id,
  cm.movie_title,
  cm.media_type,
  cm.poster_path IS NULL AS missing_poster
FROM public.collection_movies cm
JOIN public.user_collections c ON c.id = cm.collection_id
WHERE lower(trim(c.name)) = 'marvel cinematic universe'
  AND (cm.poster_path IS NULL OR cm.poster_path = '')
ORDER BY cm.movie_title;
