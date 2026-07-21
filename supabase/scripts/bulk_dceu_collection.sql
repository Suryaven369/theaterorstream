-- =============================================================================
-- Bulk seed: The DCEU Saga → /collection/the-dceu-saga
-- =============================================================================
-- Run in: Supabase → SQL Editor (as postgres / service role)
--
-- What it does:
--   1) Finds or creates a public list named "The DCEU Saga"
--      (slug used by the app: the-dceu-saga)
--   2) Upserts DCEU films + Peacemaker into collection_movies
--   3) Pulls poster_path / title from movies_library when present
--   4) Sets added_at from real release dates (franchise UI sorts chronologically)
--
-- Safe to re-run (ON CONFLICT updates titles/posters/dates).
-- =============================================================================

DO $$
DECLARE
  v_owner_id uuid;
  v_collection_id uuid;
  v_inserted int := 0;
BEGIN
  -- Owner: verified/official profile first, else any profile (edit if needed)
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

  -- Match existing DCEU list (by slugified name or exact name)
  SELECT c.id INTO v_collection_id
  FROM public.user_collections c
  WHERE lower(trim(c.name)) = 'the dceu saga'
     OR lower(regexp_replace(regexp_replace(c.name, '[^\w\s-]', '', 'g'), '\s+', '-', 'g'))
        = 'the-dceu-saga'
  ORDER BY c.is_public DESC, c.created_at ASC
  LIMIT 1;

  IF v_collection_id IS NULL THEN
    -- category=list avoids franchise admin trigger when auth.uid() is null in SQL Editor
    INSERT INTO public.user_collections (
      user_id,
      name,
      description,
      is_public,
      category,
      tags
    ) VALUES (
      v_owner_id,
      'The DCEU Saga',
      'DC Extended Universe films and series in release order (2013–2023).',
      true,
      'list',
      ARRAY['franchise', 'dc', 'dceu']
    )
    RETURNING id INTO v_collection_id;

    RAISE NOTICE 'Created collection The DCEU Saga (%)', v_collection_id;
  ELSE
    RAISE NOTICE 'Using existing collection %', v_collection_id;
  END IF;

  -- Seed catalog (tmdb_id, title, media_type, release_date)
  CREATE TEMP TABLE IF NOT EXISTS _dceu_seed (
    tmdb_id text PRIMARY KEY,
    title text NOT NULL,
    media_type text NOT NULL CHECK (media_type IN ('movie', 'tv')),
    release_date date NOT NULL
  );
  TRUNCATE _dceu_seed;

  INSERT INTO _dceu_seed (tmdb_id, title, media_type, release_date) VALUES
  -- Theatrical release order
  ('49521',  'Man of Steel', 'movie', '2013-06-12'),
  ('209112', 'Batman v Superman: Dawn of Justice', 'movie', '2016-03-23'),
  ('297761', 'Suicide Squad', 'movie', '2016-08-03'),
  ('297762', 'Wonder Woman', 'movie', '2017-05-30'),
  ('141052', 'Justice League', 'movie', '2017-11-15'),
  ('297802', 'Aquaman', 'movie', '2018-12-07'),
  ('287947', 'Shazam!', 'movie', '2019-03-29'),
  ('495764', 'Birds of Prey (and the Fantabulous Emancipation of One Harley Quinn)', 'movie', '2020-02-05'),
  ('464052', 'Wonder Woman 1984', 'movie', '2020-12-16'),
  ('791373', 'Zack Snyder''s Justice League', 'movie', '2021-03-18'),
  ('436969', 'The Suicide Squad', 'movie', '2021-07-28'),
  ('110492', 'Peacemaker', 'tv', '2022-01-13'),
  ('436270', 'Black Adam', 'movie', '2022-10-19'),
  ('594767', 'Shazam! Fury of the Gods', 'movie', '2023-03-15'),
  ('298618', 'The Flash', 'movie', '2023-06-13'),
  ('565770', 'Blue Beetle', 'movie', '2023-08-16'),
  ('572802', 'Aquaman and the Lost Kingdom', 'movie', '2023-12-20');

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
    -- Real release date (UI sorts franchise lists chronologically)
    COALESCE(ml.release_date::timestamptz, ml.first_air_date::timestamptz, s.release_date::timestamptz)
  FROM _dceu_seed s
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
    name = 'The DCEU Saga',
    description = COALESCE(
      NULLIF(trim(description), ''),
      'DC Extended Universe films and series in release order (2013–2023).'
    ),
    is_public = true
  WHERE id = v_collection_id;

  RAISE NOTICE 'Upserted % DCEU titles into collection %', v_inserted, v_collection_id;
  RAISE NOTICE 'Open: /collection/the-dceu-saga';
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
WHERE lower(trim(c.name)) = 'the dceu saga'
   OR lower(regexp_replace(regexp_replace(c.name, '[^\w\s-]', '', 'g'), '\s+', '-', 'g'))
      = 'the-dceu-saga'
GROUP BY c.id, c.name, c.is_public, c.category;

-- Optional: ordered list (release order)
-- SELECT movie_title, media_type, added_at
-- FROM public.collection_movies
-- WHERE collection_id = (
--   SELECT id FROM public.user_collections
--   WHERE lower(trim(name)) = 'the dceu saga' LIMIT 1
-- )
-- ORDER BY added_at ASC;
