-- =============================================================================
-- Bulk seed: Marvel Cinematic Universe → /collection/marvel-cinematic-universe
-- =============================================================================
-- Run in: Supabase → SQL Editor (as postgres / service role)
--
-- What it does:
--   1) Finds or creates a public list named "Marvel Cinematic Universe"
--      (slug used by the app is derived from the name)
--   2) Upserts MCU films + Disney+ series into collection_movies
--   3) Pulls poster_path / title from movies_library when present
--   4) Sets added_at so the existing newest-first UI shows chronological
--      release order (Iron Man → … → latest)
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

  -- Match existing MCU list (by slugified name or exact name)
  SELECT c.id INTO v_collection_id
  FROM public.user_collections c
  WHERE lower(trim(c.name)) = 'marvel cinematic universe'
     OR lower(regexp_replace(regexp_replace(c.name, '[^\w\s-]', '', 'g'), '\s+', '-', 'g'))
        = 'marvel-cinematic-universe'
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
      'Marvel Cinematic Universe',
      'Complete MCU films and series in release order (Phases 1–6).',
      true,
      'list',
      ARRAY['franchise', 'marvel', 'mcu']
    )
    RETURNING id INTO v_collection_id;

    RAISE NOTICE 'Created collection Marvel Cinematic Universe (%)', v_collection_id;
  ELSE
    RAISE NOTICE 'Using existing collection %', v_collection_id;
  END IF;

  -- Seed catalog (tmdb_id, title, media_type, release_date)
  CREATE TEMP TABLE IF NOT EXISTS _mcu_seed (
    tmdb_id text PRIMARY KEY,
    title text NOT NULL,
    media_type text NOT NULL CHECK (media_type IN ('movie', 'tv')),
    release_date date NOT NULL
  );
  TRUNCATE _mcu_seed;

  INSERT INTO _mcu_seed (tmdb_id, title, media_type, release_date) VALUES
  -- ===== Phase One =====
  ('1726',  'Iron Man', 'movie', '2008-05-02'),
  ('1724',  'The Incredible Hulk', 'movie', '2008-06-13'),
  ('10138', 'Iron Man 2', 'movie', '2010-05-07'),
  ('10195', 'Thor', 'movie', '2011-05-06'),
  ('1771',  'Captain America: The First Avenger', 'movie', '2011-07-22'),
  ('24428', 'The Avengers', 'movie', '2012-05-04'),
  -- ===== Phase Two =====
  ('68721', 'Iron Man 3', 'movie', '2013-05-03'),
  ('76338', 'Thor: The Dark World', 'movie', '2013-11-08'),
  ('100402','Captain America: The Winter Soldier', 'movie', '2014-04-04'),
  ('118340','Guardians of the Galaxy', 'movie', '2014-08-01'),
  ('99861', 'Avengers: Age of Ultron', 'movie', '2015-05-01'),
  ('102899','Ant-Man', 'movie', '2015-07-17'),
  -- ===== Phase Three =====
  ('271110','Captain America: Civil War', 'movie', '2016-05-06'),
  ('284052','Doctor Strange', 'movie', '2016-11-04'),
  ('283995','Guardians of the Galaxy Vol. 2', 'movie', '2017-05-05'),
  ('315635','Spider-Man: Homecoming', 'movie', '2017-07-07'),
  ('284053','Thor: Ragnarok', 'movie', '2017-11-03'),
  ('284054','Black Panther', 'movie', '2018-02-16'),
  ('299536','Avengers: Infinity War', 'movie', '2018-04-27'),
  ('363088','Ant-Man and the Wasp', 'movie', '2018-07-06'),
  ('299537','Captain Marvel', 'movie', '2019-03-08'),
  ('299534','Avengers: Endgame', 'movie', '2019-04-26'),
  ('429617','Spider-Man: Far From Home', 'movie', '2019-07-02'),
  -- ===== Phase Four (films + series) =====
  ('85271', 'WandaVision', 'tv', '2021-01-15'),
  ('88396', 'The Falcon and the Winter Soldier', 'tv', '2021-03-19'),
  ('84958', 'Loki', 'tv', '2021-06-09'),
  ('497698','Black Widow', 'movie', '2021-07-09'),
  ('91363', 'What If...?', 'tv', '2021-08-11'),
  ('566525','Shang-Chi and the Legend of the Ten Rings', 'movie', '2021-09-03'),
  ('524434','Eternals', 'movie', '2021-11-05'),
  ('88329', 'Hawkeye', 'tv', '2021-11-24'),
  ('634649','Spider-Man: No Way Home', 'movie', '2021-12-17'),
  ('92783', 'Moon Knight', 'tv', '2022-03-30'),
  ('453395','Doctor Strange in the Multiverse of Madness', 'movie', '2022-05-06'),
  ('92782', 'Ms. Marvel', 'tv', '2022-06-08'),
  ('616037','Thor: Love and Thunder', 'movie', '2022-07-08'),
  ('92749', 'She-Hulk: Attorney at Law', 'tv', '2022-08-18'),
  ('1033219','Werewolf by Night', 'movie', '2022-10-07'),
  ('505642','Black Panther: Wakanda Forever', 'movie', '2022-11-11'),
  ('1110334','The Guardians of the Galaxy Holiday Special', 'movie', '2022-11-25'),
  -- ===== Phase Five =====
  ('640146','Ant-Man and the Wasp: Quantumania', 'movie', '2023-02-17'),
  ('114472','Secret Invasion', 'tv', '2023-06-21'),
  ('447365','Guardians of the Galaxy Vol. 3', 'movie', '2023-05-05'),
  ('609681','The Marvels', 'movie', '2023-11-10'),
  ('122226','Echo', 'tv', '2024-01-09'),
  ('533535','Deadpool & Wolverine', 'movie', '2024-07-26'),
  ('212562','Agatha All Along', 'tv', '2024-09-18'),
  ('822119','Captain America: Brave New World', 'movie', '2025-02-14'),
  ('209867','Daredevil: Born Again', 'tv', '2025-03-04'),
  ('986056','Thunderbolts*', 'movie', '2025-05-02'),
  ('617126','The Fantastic Four: First Steps', 'movie', '2025-07-25'),
  ('114471','Ironheart', 'tv', '2025-06-24');

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
  FROM _mcu_seed s
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
    description = COALESCE(
      NULLIF(trim(description), ''),
      'Complete MCU films and series in release order (Phases 1–6).'
    ),
    is_public = true
  WHERE id = v_collection_id;

  RAISE NOTICE 'Upserted % MCU titles into collection %', v_inserted, v_collection_id;
  RAISE NOTICE 'Open: /collection/marvel-cinematic-universe';
END $$;

-- Quick verify
SELECT
  c.name,
  c.is_public,
  c.category,
  count(cm.*) AS titles,
  min(cm.movie_title) FILTER (
    WHERE cm.added_at = (SELECT max(added_at) FROM public.collection_movies x WHERE x.collection_id = c.id)
  ) AS first_in_ui,
  max(cm.movie_title) FILTER (
    WHERE cm.added_at = (SELECT min(added_at) FROM public.collection_movies x WHERE x.collection_id = c.id)
  ) AS last_in_ui
FROM public.user_collections c
JOIN public.collection_movies cm ON cm.collection_id = c.id
WHERE lower(trim(c.name)) = 'marvel cinematic universe'
GROUP BY c.id, c.name, c.is_public, c.category;

-- Optional: show ordered list as the app will (newest-first on added_at = chronological)
-- SELECT movie_title, media_type, added_at
-- FROM public.collection_movies
-- WHERE collection_id = (SELECT id FROM public.user_collections WHERE lower(trim(name)) = 'marvel cinematic universe' LIMIT 1)
-- ORDER BY added_at DESC;
