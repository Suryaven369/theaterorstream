-- =============================================================================
-- Bulk seed: The Pirates of the Caribbean Series
--   → /collection/the-pirates-of-the-caribbean-series
-- =============================================================================
-- Run in: Supabase → SQL Editor (as postgres / service role)
--
-- All five theatrical Pirates of the Caribbean films in release order.
-- Safe to re-run (ON CONFLICT updates titles/posters/dates).
-- =============================================================================

DO $$
DECLARE
  v_owner_id uuid;
  v_collection_id uuid;
  v_inserted int := 0;
BEGIN
  SELECT id INTO v_owner_id
  FROM public.user_profiles
  WHERE is_verified = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    SELECT id INTO v_owner_id
    FROM public.user_profiles
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'No user_profiles row found. Create/connect a profile first, then re-run.';
  END IF;

  SELECT c.id INTO v_collection_id
  FROM public.user_collections c
  WHERE lower(trim(c.name)) IN (
        'the pirates of the caribbean series',
        'pirates of the caribbean series',
        'pirates of the caribbean'
      )
     OR lower(regexp_replace(regexp_replace(c.name, '[^\w\s-]', '', 'g'), '\s+', '-', 'g'))
        IN (
          'the-pirates-of-the-caribbean-series',
          'pirates-of-the-caribbean-series',
          'pirates-of-the-caribbean'
        )
  ORDER BY c.is_public DESC, c.created_at ASC
  LIMIT 1;

  IF v_collection_id IS NULL THEN
    INSERT INTO public.user_collections (
      user_id, name, description, is_public, category, tags
    ) VALUES (
      v_owner_id,
      'The Pirates of the Caribbean Series',
      'All five Pirates of the Caribbean films in theatrical release order.',
      true,
      'list',
      ARRAY['franchise', 'pirates-of-the-caribbean', 'disney']
    )
    RETURNING id INTO v_collection_id;

    RAISE NOTICE 'Created collection The Pirates of the Caribbean Series (%)', v_collection_id;
  ELSE
    RAISE NOTICE 'Using existing collection %', v_collection_id;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _potc_seed (
    tmdb_id text PRIMARY KEY,
    title text NOT NULL,
    media_type text NOT NULL CHECK (media_type IN ('movie', 'tv')),
    release_date date NOT NULL
  );
  TRUNCATE _potc_seed;

  INSERT INTO _potc_seed (tmdb_id, title, media_type, release_date) VALUES
  ('22',     'Pirates of the Caribbean: The Curse of the Black Pearl', 'movie', '2003-07-09'),
  ('58',     'Pirates of the Caribbean: Dead Man''s Chest', 'movie', '2006-07-06'),
  ('285',    'Pirates of the Caribbean: At World''s End', 'movie', '2007-05-19'),
  ('1865',   'Pirates of the Caribbean: On Stranger Tides', 'movie', '2011-05-15'),
  ('166426', 'Pirates of the Caribbean: Dead Men Tell No Tales', 'movie', '2017-05-23');

  INSERT INTO public.collection_movies AS cm (
    collection_id, movie_id, movie_title, poster_path, media_type, added_at
  )
  SELECT
    v_collection_id,
    s.tmdb_id,
    COALESCE(NULLIF(ml.title, ''), s.title),
    COALESCE(ml.poster_path, NULL),
    COALESCE(NULLIF(ml.media_type, ''), s.media_type),
    COALESCE(ml.release_date::timestamptz, ml.first_air_date::timestamptz, s.release_date::timestamptz)
  FROM _potc_seed s
  LEFT JOIN LATERAL (
    SELECT title, poster_path, media_type, release_date, first_air_date
    FROM public.movies_library
    WHERE tmdb_id::text = s.tmdb_id
      AND is_active IS DISTINCT FROM false
    ORDER BY
      CASE WHEN poster_path IS NOT NULL AND poster_path <> '' THEN 0 ELSE 1 END,
      updated_at DESC NULLS LAST
    LIMIT 1
  ) ml ON true
  ON CONFLICT (collection_id, movie_id) DO UPDATE
    SET
      movie_title = EXCLUDED.movie_title,
      poster_path = COALESCE(EXCLUDED.poster_path, cm.poster_path),
      media_type = EXCLUDED.media_type,
      added_at = EXCLUDED.added_at;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.user_collections
  SET
    updated_at = now(),
    name = 'The Pirates of the Caribbean Series',
    description = COALESCE(
      NULLIF(trim(description), ''),
      'All five Pirates of the Caribbean films in theatrical release order.'
    ),
    is_public = true
  WHERE id = v_collection_id;

  RAISE NOTICE 'Upserted % Pirates titles into collection %', v_inserted, v_collection_id;
  RAISE NOTICE 'Open: /collection/the-pirates-of-the-caribbean-series';
END $$;

SELECT
  c.name, c.is_public, c.category, count(cm.*) AS titles
FROM public.user_collections c
JOIN public.collection_movies cm ON cm.collection_id = c.id
WHERE lower(trim(c.name)) IN (
      'the pirates of the caribbean series',
      'pirates of the caribbean series',
      'pirates of the caribbean'
    )
   OR lower(regexp_replace(regexp_replace(c.name, '[^\w\s-]', '', 'g'), '\s+', '-', 'g'))
      IN (
        'the-pirates-of-the-caribbean-series',
        'pirates-of-the-caribbean-series',
        'pirates-of-the-caribbean'
      )
GROUP BY c.id, c.name, c.is_public, c.category;
