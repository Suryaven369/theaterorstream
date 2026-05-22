-- Task #9: Onboarding taste data + AI-ready user taste profiles
-- Stores declared preferences at onboarding; computed fields filled by profile rebuild worker (Task #10)

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- user_streaming_services — OTT subscriptions per user/region
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_streaming_services (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  service_id text NOT NULL,
  region text NOT NULL DEFAULT 'IN',
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'onboarding',
  added_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, service_id)
);

COMMENT ON TABLE public.user_streaming_services IS
  'User OTT platform selections for availability filtering and recommendations.';

CREATE INDEX IF NOT EXISTS idx_user_streaming_services_user_active
  ON public.user_streaming_services (user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_streaming_services_service_region
  ON public.user_streaming_services (service_id, region)
  WHERE is_active = true;

ALTER TABLE public.user_streaming_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own streaming services" ON public.user_streaming_services;
CREATE POLICY "Users manage own streaming services" ON public.user_streaming_services
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS user_streaming_services_set_updated_at ON public.user_streaming_services;
CREATE TRIGGER user_streaming_services_set_updated_at
  BEFORE UPDATE ON public.user_streaming_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_taste_profiles — central taste store for reco + AI (Task #10 worker)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_taste_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,

  -- Declared at onboarding (cold-start signals)
  genre_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  mood_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  preferred_languages text[] NOT NULL DEFAULT '{}',
  preferred_region text NOT NULL DEFAULT 'IN',

  -- Computed from ratings/logs (initialized empty; Task #10 rebuild worker)
  axis_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  avg_rating_given numeric(4, 2),
  rating_count integer NOT NULL DEFAULT 0,
  log_count integer NOT NULL DEFAULT 0,
  preferred_runtime_range int4range,
  preferred_decades integer[] NOT NULL DEFAULT '{}',

  -- Family-safe filtering
  family_mode_enabled boolean NOT NULL DEFAULT false,
  family_max_certification text,
  family_content_limits jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Onboarding audit trail (useful for AI feature engineering)
  onboarding_seed_movie_ids text[] NOT NULL DEFAULT '{}',
  onboarding_step_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  onboarding_completed_at timestamptz,

  -- AI enrichment (Task #10+)
  taste_summary text,
  embedding vector(512),
  profile_version integer NOT NULL DEFAULT 1,
  last_computed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_taste_profiles IS
  'Per-user taste vector and preferences for hybrid recommendations and AI summarization.';
COMMENT ON COLUMN public.user_taste_profiles.genre_weights IS
  'TMDB genre id → affinity 0–1. Seeded at onboarding; refined by rating worker.';
COMMENT ON COLUMN public.user_taste_profiles.embedding IS
  '512-d user taste embedding for similarity search (pgvector). Populated by AI worker.';

CREATE INDEX IF NOT EXISTS idx_user_taste_profiles_region
  ON public.user_taste_profiles (preferred_region);

CREATE INDEX IF NOT EXISTS idx_user_taste_profiles_family
  ON public.user_taste_profiles (family_mode_enabled)
  WHERE family_mode_enabled = true;

CREATE INDEX IF NOT EXISTS idx_user_taste_profiles_onboarding
  ON public.user_taste_profiles (onboarding_completed_at DESC NULLS LAST);

ALTER TABLE public.user_taste_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own taste profile" ON public.user_taste_profiles;
CREATE POLICY "Users manage own taste profile" ON public.user_taste_profiles
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS user_taste_profiles_set_updated_at ON public.user_taste_profiles;
CREATE TRIGGER user_taste_profiles_set_updated_at
  BEFORE UPDATE ON public.user_taste_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_profiles extensions — sync declared genres with existing column
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS mood_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS family_mode_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS family_max_certification text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Normalize default region to IN for Indian OTT focus
ALTER TABLE public.user_profiles
  ALTER COLUMN preferred_region SET DEFAULT 'IN';

-- ---------------------------------------------------------------------------
-- ratings — index for taste rebuild worker (user history scans)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ratings_user_updated
  ON public.ratings (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ratings_user_movie
  ON public.ratings (user_id, movie_id);

-- ---------------------------------------------------------------------------
-- movies_library — optional AI/reco columns (nullable until backfill)
-- ---------------------------------------------------------------------------
ALTER TABLE public.movies_library
  ADD COLUMN IF NOT EXISTS mood_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS family_score numeric(4, 2),
  ADD COLUMN IF NOT EXISTS embedding vector(512);

CREATE INDEX IF NOT EXISTS idx_movies_library_mood_tags
  ON public.movies_library USING gin (mood_tags);

-- Future ANN queries when embeddings are populated (Task #10)
CREATE INDEX IF NOT EXISTS idx_user_taste_profiles_embedding_hnsw
  ON public.user_taste_profiles
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_movies_library_embedding_hnsw
  ON public.movies_library
  USING hnsw (embedding vector_cosine_ops);
