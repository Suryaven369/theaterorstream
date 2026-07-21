-- =============================================================================
-- Bulk seed: James Gunn's DCU → /collection/james-gunns-dcu
-- =============================================================================
-- Run in: Supabase → SQL Editor (as postgres / service role)
--
-- What it does:
--   1) Finds or creates a public list named "James Gunn's DCU"
--      (slug used by the app: james-gunns-dcu)
--   2) Upserts Chapter One: Gods and Monsters films + series
--      (released + upcoming / TBA on TMDB)
--   3) Pulls poster_path / title from movies_library when present
--   4) Sets added_at from release / first_air dates (franchise UI sorts chrono--      chronologically; TBA titles use TMDB placeholder dates)
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

  -- Match existing DCU list (by slugified name or exact name)
  SELECT c.id INTO v_collection_id
  FROM public.user_collections c
  WHERE lower(trim(c.name)) IN ('james gunn''s dcu', 'james gunns dcu', 'james gunn dcu')
     OR lower(regexp_replace(regexp_replace(c.name, '[^\w\s-]', '', 'g'), '\s+', '-', 'g'))
        IN ('james-gunns-dcu', 'james-gunn-dcu')
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
      'James Gunn''s DCU',
      'DC Universe Chapter One: Gods and Monsters — films and series (released + upcoming).',
      true,
      'list',
      ARRAY['franchise', 'dc', 'dcu', 'james-gunn']
    )
    RETURNING id INTO v_collection_id;

    RAISE NOTICE 'Created collection James Gunn''s DCU (%)', v_collection_id;
  ELSE
    RAISE NOTICE 'Using existing collection %', v_collection_id;
  END IF;

  -- Seed catalog (tmdb_id, title, media_type, release_date)
  CREATE TEMP TABLE IF NOT EXISTS _dcu_seed (
    tmdb_id text PRIMARY KEY,
    title text NOT NULL,
    media_type text NOT NULL CHECK (media_type IN ('movie', 'tv')),
    release_date date NOT NULL
  );
  TRUNCATE _dcu_seed;

  INSERT INTO _dcu_seed (tmdb_id, title, media_type, release_date) VALUES
  -- ===== Released =====
  ('219543',  'Creature Commandos', 'tv', '2024-12-05'),
  ('1061474', 'Superman', 'movie', '2025-07-09'),
  -- Peacemaker continues into the DCU with Season 2 (same TMDB series)
  ('110492',  'Peacemaker', 'tv', '2022-01-13'),
  -- ===== Upcoming (dated) =====
  ('1081003', 'Supergirl', 'movie', '2026-06-24'),
  ('95350',   'Lanterns', 'tv', '2026-08-16'),
  ('1400940', 'Clayface', 'movie', '2026-10-21'),
  ('1523140', 'Man of Tomorrow', 'movie', '2027-07-07'),
  -- ===== Announced / TBA on TMDB (placeholder dates sort last) =====
  ('1081004', 'The Brave and the Bold', 'movie', '2099-01-01'),
  ('328829',  'Booster Gold', 'tv', '2099-01-01'),
  ('328830',  'Waller', 'tv', '2099-01-01');

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
    -- Real / announced release date (franchise UI sorts chronologically)
    COALESCE(ml.release_date::timestamptz, ml.first_air_date::timestamptz, s.release_date::timestamptz)
  FROM _dcu_seed s
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
    name = 'James Gunn''s DCU',
    description = COALESCE(
      NULLIF(trim(description), ''),
      'DC Universe Chapter One: Gods and Monsters — films and series (released + upcoming).'
    ),
    is_public = true
  WHERE id = v_collection_id;

  RAISE NOTICE 'Upserted % DCU titles into collection %', v_inserted, v_collection_id;
  RAISE NOTICE 'Open: /collection/james-gunns-dcu';
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
WHERE lower(trim(c.name)) IN ('james gunn''s dcu', 'james gunns dcu', 'james gunn dcu')
   OR lower(regexp_replace(regexp_replace(c.name, '[^\w\s-]', '', 'g'), '\s+', '-', 'g'))
      IN ('james-gunns-dcu', 'james-gunn-dcu')
GROUP BY c.id, c.name, c.is_public, c.category;

-- Optional: ordered list (release order)
-- SELECT movie_title, media_type, added_at
-- FROM public.collection_movies
-- WHERE collection_id = (
--   SELECT id FROM public.user_collections
--   WHERE lower(regexp_replace(regexp_replace(name, '[^\w\s-]', '', 'g'), '\s+', '-', 'g'))
--         = 'james-gunns-dcu'
--   LIMIT 1
-- )
-- ORDER BY added_at ASC;
