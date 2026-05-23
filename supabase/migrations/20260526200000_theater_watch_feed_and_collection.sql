-- Theater watch tracking on diary + feed, and per-user system collection

-- ---------------------------------------------------------------------------
-- movie_logs + activity_feed — explicit theater flag (in addition to watched_with)
-- ---------------------------------------------------------------------------
ALTER TABLE public.movie_logs
  ADD COLUMN IF NOT EXISTS watched_in_theater boolean NOT NULL DEFAULT false;

ALTER TABLE public.activity_feed
  ADD COLUMN IF NOT EXISTS watched_in_theater boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.movie_logs.watched_in_theater IS
  'True when the user watched this title in a theater (also tagged in watched_with as theater).';

COMMENT ON COLUMN public.activity_feed.watched_in_theater IS
  'Denormalized theater flag for feed filters and cards.';

CREATE INDEX IF NOT EXISTS idx_movie_logs_user_theater
  ON public.movie_logs (user_id, watched_on DESC)
  WHERE watched_in_theater = true;

CREATE INDEX IF NOT EXISTS idx_activity_feed_theater_public
  ON public.activity_feed (created_at DESC)
  WHERE watched_in_theater = true AND visibility = 'public';

-- Backfill from existing watched_with tags
UPDATE public.movie_logs
SET watched_in_theater = true
WHERE watched_with @> ARRAY['theater']::text[]
  AND watched_in_theater = false;

UPDATE public.activity_feed
SET watched_in_theater = true
WHERE event_type = 'log'
  AND watched_in_theater = false
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(payload->'watched_with', '[]'::jsonb)) AS tag(val)
    WHERE tag.val = 'theater'
  );

-- ---------------------------------------------------------------------------
-- user_collections — system "Watched in Theaters" list per user
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_collections
  ADD COLUMN IF NOT EXISTS collection_kind text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_collections.collection_kind IS
  'custom | watched_in_theater (system collection, auto-managed from diary logs).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_collections_system_theater
  ON public.user_collections (user_id)
  WHERE is_system = true AND collection_kind = 'watched_in_theater';

-- ---------------------------------------------------------------------------
-- Badge: theater regular
-- ---------------------------------------------------------------------------
INSERT INTO public.badge_definitions (id, name, description, icon, sort_order)
VALUES
  ('theater_buff', 'Theater Buff', 'Logged 10 movies watched in theaters', '🍿', 6)
ON CONFLICT (id) DO NOTHING;
