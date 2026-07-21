-- =============================================================================
-- Bulk seed: Star Wars Saga → /collection/star-wars-saga
-- =============================================================================
-- Run in: Supabase → SQL Editor (as postgres / service role)
--
-- Theatrical Skywalker Saga (Episodes I–IX) + anthology films Rogue One & Solo.
-- Sorted by release date via added_at.
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
  WHERE lower(trim(c.name)) = 'star wars saga'
     OR lower(regexp_replace(regexp_replace(c.name, '[^\w\s-]', '', 'g'), '\s+', '-', 'g'))
        = 'star-wars-saga'
  ORDER BY c.is_public DESC, c.created_at ASC
  LIMIT 1;

  IF v_collection_id IS NULL THEN
    INSERT INTO public.user_collections (
      user_id, name, description, is_public, category, tags
    ) VALUES (
      v_owner_id,
      'Star Wars Saga',
      'The Skywalker Saga (Episodes I–IX) plus Rogue One and Solo — theatrical release order.',
      true,
      'list',
      ARRAY['franchise', 'star-wars', 'saga']
    )
    RETURNING id INTO v_collection_id;

    RAISE NOTICE 'Created collection Star Wars Saga (%)', v_collection_id;
  ELSE
    RAISE NOTICE 'Using existing collection %', v_collection_id;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _sw_seed (
    tmdb_id text PRIMARY KEY,
    title text NOT NULL,
    media_type text NOT NULL CHECK (media_type IN ('movie', 'tv')),
    release_date date NOT NULL
  );
  TRUNCATE _sw_seed;

  INSERT INTO _sw_seed (tmdb_id, title, media_type, release_date) VALUES
  -- Original trilogy
  ('11',     'Star Wars', 'movie', '1977-05-25'),
  ('1891',   'The Empire Strikes Back', 'movie', '1980-05-20'),
  ('1892',   'Return of the Jedi', 'movie', '1983-05-25'),
  -- Prequel trilogy
  ('1893',   'Star Wars: Episode I - The Phantom Menace', 'movie', '1999-05-19'),
  ('1894',   'Star Wars: Episode II - Attack of the Clones', 'movie', '2002-05-15'),
  ('1895',   'Star Wars: Episode III - Revenge of the Sith', 'movie', '2005-05-17'),
  -- Sequel trilogy + anthology
  ('140607', 'Star Wars: The Force Awakens', 'movie', '2015-12-15'),
  ('330459', 'Rogue One: A Star Wars Story', 'movie', '2016-12-14'),
  ('181808', 'Star Wars: The Last Jedi', 'movie', '2017-12-13'),
  ('348350', 'Solo: A Star Wars Story', 'movie', '2018-05-15'),
  ('181812', 'Star Wars: The Rise of Skywalker', 'movie', '2019-12-18');

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
  FROM _sw_seed s
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
    name = 'Star Wars Saga',
    description = COALESCE(
      NULLIF(trim(description), ''),
      'The Skywalker Saga (Episodes I–IX) plus Rogue One and Solo — theatrical release order.'
    ),
    is_public = true
  WHERE id = v_collection_id;

  RAISE NOTICE 'Upserted % Star Wars titles into collection %', v_inserted, v_collection_id;
  RAISE NOTICE 'Open: /collection/star-wars-saga';
END $$;

SELECT
  c.name, c.is_public, c.category, count(cm.*) AS titles
FROM public.user_collections c
JOIN public.collection_movies cm ON cm.collection_id = c.id
WHERE lower(trim(c.name)) = 'star wars saga'
   OR lower(regexp_replace(regexp_replace(c.name, '[^\w\s-]', '', 'g'), '\s+', '-', 'g'))
      = 'star-wars-saga'
GROUP BY c.id, c.name, c.is_public, c.category;
