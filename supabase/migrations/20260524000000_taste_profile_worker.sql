-- Task #10: movie diary logs, recommendation cache, worker-friendly indexes

-- ---------------------------------------------------------------------------
-- movie_logs — watch diary (feeds profile rebuild + future social)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.movie_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tmdb_id text NOT NULL,
  media_type text NOT NULL DEFAULT 'movie',
  watched_on date NOT NULL DEFAULT CURRENT_DATE,
  rating numeric(4, 2),
  review_text text,
  rewatch_count integer NOT NULL DEFAULT 0,
  watched_with text[] NOT NULL DEFAULT '{}',
  visibility text NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.movie_logs IS
  'User watch diary entries; each log can trigger taste profile rebuild.';

CREATE INDEX IF NOT EXISTS idx_movie_logs_user_watched
  ON public.movie_logs (user_id, watched_on DESC);

CREATE INDEX IF NOT EXISTS idx_movie_logs_user_tmdb
  ON public.movie_logs (user_id, tmdb_id);

ALTER TABLE public.movie_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own movie logs" ON public.movie_logs;
CREATE POLICY "Users manage own movie logs" ON public.movie_logs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS movie_logs_set_updated_at ON public.movie_logs;
CREATE TRIGGER movie_logs_set_updated_at
  BEFORE UPDATE ON public.movie_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- recommendation_cache — precomputed reco payloads (Task #11 serves these)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recommendation_cache (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cache_key)
);

COMMENT ON TABLE public.recommendation_cache IS
  'Per-user recommendation payloads (for_you, tonight, family). Invalidated on profile rebuild.';

CREATE INDEX IF NOT EXISTS idx_recommendation_cache_expires
  ON public.recommendation_cache (expires_at);

ALTER TABLE public.recommendation_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own recommendation cache" ON public.recommendation_cache;
CREATE POLICY "Users read own recommendation cache" ON public.recommendation_cache
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Writes via service role only (profile rebuild / reco workers)

DROP TRIGGER IF EXISTS recommendation_cache_set_updated_at ON public.recommendation_cache;
CREATE TRIGGER recommendation_cache_set_updated_at
  BEFORE UPDATE ON public.recommendation_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Taste profiles — index for weekly rebuild cron scans
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_taste_profiles_last_computed
  ON public.user_taste_profiles (last_computed_at NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_movies_library_embedding_null
  ON public.movies_library (synced_at DESC)
  WHERE embedding IS NULL AND is_active = true;
