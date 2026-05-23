-- Prevent duplicate movies_library rows (same TMDB id + media type)
-- PostgREST upsert needs a UNIQUE CONSTRAINT (not only a unique index).

-- Remove duplicate rows, keep the most recently synced
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tmdb_id, COALESCE(media_type, 'movie')
      ORDER BY synced_at DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) AS rn
  FROM public.movies_library
)
DELETE FROM public.movies_library ml
USING ranked r
WHERE ml.id = r.id
  AND r.rn > 1;

-- Drop old single-column unique (name varies by install)
ALTER TABLE public.movies_library
  DROP CONSTRAINT IF EXISTS movies_library_tmdb_id_key;

ALTER TABLE public.movies_library
  DROP CONSTRAINT IF EXISTS movies_library_tmdb_id_media_type_key;

DROP INDEX IF EXISTS public.idx_movies_library_tmdb_media_unique;

-- Explicit constraint for ON CONFLICT (tmdb_id, media_type)
ALTER TABLE public.movies_library
  ADD CONSTRAINT movies_library_tmdb_id_media_type_key
  UNIQUE (tmdb_id, media_type);

COMMENT ON CONSTRAINT movies_library_tmdb_id_media_type_key ON public.movies_library IS
  'One library row per TMDB id per media type; required for Supabase upsert onConflict.';
