-- =============================================================================
-- Bulk seed: World of Harry Potter → /collection/world-of-harry-potter
-- =============================================================================
-- Run in: Supabase → SQL Editor (as postgres / service role)
--
-- What it does:
--   1) Finds or creates a public list named "World Of Harry Potter"
--      (slug used by the app: world-of-harry-potter)
--   2) Upserts the 8 Harry Potter films + Fantastic Beasts trilogy
--   3) Pulls poster_path / title from movies_library when present
--   4) Sets added_at from release dates (franchise UI sorts chronologically)
--
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
  WHERE lower(trim(c.name)) IN ('world of harry potter', 'world of harry potter')
     OR lower(regexp_replace(regexp_replace(c.name, '[^\w\s-]', '', 'g'), '\s+', '-', 'g'))
        = 'world-of-harry-potter'
  ORDER BY c.is_public DESC, c.created_at ASC
  LIMIT 1;

  IF v_collection_id IS NULL THEN
    INSERT INTO public.user_collections (
      user_id,
      name,
      description,
      is_public,
      category,
      tags
    ) VALUES (
      v_owner_id,
      'World Of Harry Potter',
      'The complete Wizarding World film saga — Harry Potter (1–8) and Fantastic Beasts.',
      true,
      'list',
      ARRAY['franchise', 'harry-potter', 'wizarding-world']
    )
    RETURNING id INTO v_collection_id;

    RAISE NOTICE 'Created collection World Of Harry Potter (%)', v_collection_id;
  ELSE
    RAISE NOTICE 'Using existing collection %', v_collection_id;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _hp_seed (
    tmdb_id text PRIMARY KEY,
    title text NOT NULL,
    media_type text NOT NULL CHECK (media_type IN ('movie', 'tv')),
    release_date date NOT NULL
  );
  TRUNCATE _hp_seed;

  INSERT INTO _hp_seed (tmdb_id, title, media_type, release_date) VALUES
  -- ===== Harry Potter (1–8) =====
  ('671',    'Harry Potter and the Philosopher''s Stone', 'movie', '2001-11-16'),
  ('672',    'Harry Potter and the Chamber of Secrets', 'movie', '2002-11-13'),
  ('673',    'Harry Potter and the Prisoner of Azkaban', 'movie', '2004-05-31'),
  ('674',    'Harry Potter and the Goblet of Fire', 'movie', '2005-11-16'),
  ('675',    'Harry Potter and the Order of the Phoenix', 'movie', '2007-07-08'),
  ('767',    'Harry Potter and the Half-Blood Prince', 'movie', '2009-07-15'),
  ('12444',  'Harry Potter and the Deathly Hallows: Part 1', 'movie', '2010-11-17'),
  ('12445',  'Harry Potter and the Deathly Hallows: Part 2', 'movie', '2011-07-12'),
  -- ===== Fantastic Beasts =====
  ('259316', 'Fantastic Beasts and Where to Find Them', 'movie', '2016-11-16'),
  ('338952', 'Fantastic Beasts: The Crimes of Grindelwald', 'movie', '2018-11-14'),
  ('338953', 'Fantastic Beasts: The Secrets of Dumbledore', 'movie', '2022-04-06');

  INSERT INTO public.collection_movies AS cm (
    collection_id,
    movie_id,
    movie_title,
    poster_path,
    media_type,
    added_at
  )
  SELECT
    v_collection_id,
    s.tmdb_id,
    COALESCE(NULLIF(ml.title, ''), s.title),
    COALESCE(ml.poster_path, NULL),
    COALESCE(NULLIF(ml.media_type, ''), s.media_type),
    COALESCE(ml.release_date::timestamptz, ml.first_air_date::timestamptz, s.release_date::timestamptz)
  FROM _hp_seed s
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
    name = 'World Of Harry Potter',
    description = COALESCE(
      NULLIF(trim(description), ''),
      'The complete Wizarding World film saga — Harry Potter (1–8) and Fantastic Beasts.'
    ),
    is_public = true
  WHERE id = v_collection_id;

  RAISE NOTICE 'Upserted % Harry Potter titles into collection %', v_inserted, v_collection_id;
  RAISE NOTICE 'Open: /collection/world-of-harry-potter';
END $$;

-- Quick verify
SELECT
  c.name,
  c.is_public,
  c.category,
  count(cm.*) AS titles,
  min(cm.movie_title) FILTER (
    WHERE cm.added_at = (SELECT min(added_at) FROM public.collection_movies x WHERE x.collection_id = c.id)
  ) AS first_by_date,
  max(cm.movie_title) FILTER (
    WHERE cm.added_at = (SELECT max(added_at) FROM public.collection_movies x WHERE x.collection_id = c.id)
  ) AS last_by_date
FROM public.user_collections c
JOIN public.collection_movies cm ON cm.collection_id = c.id
WHERE lower(trim(c.name)) = 'world of harry potter'
   OR lower(regexp_replace(regexp_replace(c.name, '[^\w\s-]', '', 'g'), '\s+', '-', 'g'))
      = 'world-of-harry-potter'
GROUP BY c.id, c.name, c.is_public, c.category;
