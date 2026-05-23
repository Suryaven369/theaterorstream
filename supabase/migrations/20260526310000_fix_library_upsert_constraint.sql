-- Repair: ensure movies_library has a constraint PostgREST upsert can target
-- Safe to run if 20260526300000 partially failed (old unique dropped, new missing)

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.movies_library'::regclass
      AND conname = 'movies_library_tmdb_id_media_type_key'
  ) THEN
    ALTER TABLE public.movies_library
      ADD CONSTRAINT movies_library_tmdb_id_media_type_key
      UNIQUE (tmdb_id, media_type);
  END IF;
END $$;

-- Optional: remove legacy single-column unique so movie/tv can share numeric TMDB ids
ALTER TABLE public.movies_library
  DROP CONSTRAINT IF EXISTS movies_library_tmdb_id_key;
