-- Recommendation Engine Phase: behavioral event tracking + manual taste preferences
-- Adds:
--   * user_events            — weighted behavioral signal stream (decayed at read time)
--   * user_taste_profiles.*  — manual override columns (Settings → Taste Preferences)
-- Behavioral data always outranks manual prefs; manual prefs act as a baseline floor.

-- ---------------------------------------------------------------------------
-- user_events — every meaningful interaction, weighted for taste learning
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  tmdb_id text,
  media_type text NOT NULL DEFAULT 'movie',
  weight numeric(6, 2) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'web',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_events IS
  'Weighted behavioral event stream (views, trailers, watchlists, shares, reco clicks). '
  'Recency-decayed at read time to drive the dynamic taste profile.';

-- Profile rebuild + dashboard scan recent events per user
CREATE INDEX IF NOT EXISTS idx_user_events_user_created
  ON public.user_events (user_id, created_at DESC);

-- Freshness / impression suppression looks up (user, movie) interactions
CREATE INDEX IF NOT EXISTS idx_user_events_user_tmdb
  ON public.user_events (user_id, tmdb_id);

-- Reco accuracy rollups filter by event_type
CREATE INDEX IF NOT EXISTS idx_user_events_user_type_created
  ON public.user_events (user_id, event_type, created_at DESC);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own events" ON public.user_events;
CREATE POLICY "Users insert own events" ON public.user_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own events" ON public.user_events;
CREATE POLICY "Users read own events" ON public.user_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- user_taste_profiles — manual override columns (Settings → Taste Preferences)
-- Kept separate from computed columns so behavioral learning is never destroyed
-- by a manual edit; merged as a baseline floor at recommendation time.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_taste_profiles
  ADD COLUMN IF NOT EXISTS manual_genre_weights   jsonb     NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_mood_preferences jsonb    NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_languages       text[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS manual_preferred_eras  integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS favorite_actor_ids     integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS favorite_director_ids  integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS favorite_actors        jsonb     NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS favorite_directors     jsonb     NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_updated_at      timestamptz;

COMMENT ON COLUMN public.user_taste_profiles.manual_genre_weights IS
  'User-declared genre preferences from Settings. Behavioral genre_weights take priority; '
  'these provide a baseline floor when behavioral signal is sparse.';

-- Allow users to update their own taste profile rows (manual prefs path).
-- Computed columns remain service-role-written by the rebuild worker.
DROP POLICY IF EXISTS "Users update own taste profile" ON public.user_taste_profiles;
CREATE POLICY "Users update own taste profile" ON public.user_taste_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
