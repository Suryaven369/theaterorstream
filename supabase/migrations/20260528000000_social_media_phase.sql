-- Social Media Transformation: reviews, engagement, streaks, profile extensions

-- ---------------------------------------------------------------------------
-- social_reviews — Letterboxd-style long-form reviews (separate from threaded reviews)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tmdb_id text NOT NULL,
  media_type text NOT NULL DEFAULT 'movie',
  movie_title text NOT NULL,
  poster_path text,
  title text NOT NULL,
  content text NOT NULL,
  spoiler boolean NOT NULL DEFAULT false,
  rating_id uuid REFERENCES public.ratings (id) ON DELETE SET NULL,
  likes_count integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  visibility text NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_reviews_user ON public.social_reviews (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_reviews_public ON public.social_reviews (created_at DESC)
  WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_social_reviews_tmdb ON public.social_reviews (tmdb_id);

ALTER TABLE public.social_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read social reviews" ON public.social_reviews;
CREATE POLICY "Public read social reviews" ON public.social_reviews
  FOR SELECT TO authenticated
  USING (visibility = 'public' OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own social reviews" ON public.social_reviews;
CREATE POLICY "Users manage own social reviews" ON public.social_reviews
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- review_comments — threaded comments on social_reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.social_reviews (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.review_comments (id) ON DELETE CASCADE,
  content text NOT NULL,
  likes_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_comments_review ON public.review_comments (review_id, created_at ASC);

ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read review comments" ON public.review_comments;
CREATE POLICY "Read review comments" ON public.review_comments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users manage own review comments" ON public.review_comments;
CREATE POLICY "Users manage own review comments" ON public.review_comments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- review_likes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.review_likes (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES public.social_reviews (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, review_id)
);

ALTER TABLE public.review_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read review likes" ON public.review_likes;
CREATE POLICY "Read review likes" ON public.review_likes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users manage own review likes" ON public.review_likes;
CREATE POLICY "Users manage own review likes" ON public.review_likes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- collection_likes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.collection_likes (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  collection_id uuid NOT NULL REFERENCES public.user_collections (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, collection_id)
);

ALTER TABLE public.collection_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read collection likes" ON public.collection_likes;
CREATE POLICY "Read collection likes" ON public.collection_likes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users manage own collection likes" ON public.collection_likes;
CREATE POLICY "Users manage own collection likes" ON public.collection_likes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- user_streaks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_streaks (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_activity_date date,
  streak_type text NOT NULL DEFAULT 'watch',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read all streaks" ON public.user_streaks;
CREATE POLICY "Users read all streaks" ON public.user_streaks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users manage own streak" ON public.user_streaks;
CREATE POLICY "Users manage own streak" ON public.user_streaks
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- badge_definitions extensions
-- ---------------------------------------------------------------------------
ALTER TABLE public.badge_definitions
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS tier text,
  ADD COLUMN IF NOT EXISTS threshold integer,
  ADD COLUMN IF NOT EXISTS rarity_percent decimal(5, 2),
  ADD COLUMN IF NOT EXISTS unlock_message text,
  ADD COLUMN IF NOT EXISTS image_url text;

-- ---------------------------------------------------------------------------
-- user_profiles extensions
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS favorite_films jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pinned_review_id uuid,
  ADD COLUMN IF NOT EXISTS profile_header_url text,
  ADD COLUMN IF NOT EXISTS total_watch_time_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS films_this_year integer NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- user_collections extensions
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_collections
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS cover_tmdb_id text,
  ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saves_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tags text[];

-- ---------------------------------------------------------------------------
-- activity_feed engagement score
-- ---------------------------------------------------------------------------
ALTER TABLE public.activity_feed
  ADD COLUMN IF NOT EXISTS engagement_score integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_activity_feed_engagement
  ON public.activity_feed (engagement_score DESC, created_at DESC)
  WHERE visibility = 'public';

-- ---------------------------------------------------------------------------
-- Triggers: sync likes_count on social_reviews
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_social_review_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.social_reviews SET likes_count = likes_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.social_reviews SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.review_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_review_likes_count ON public.review_likes;
CREATE TRIGGER trg_social_review_likes_count
  AFTER INSERT OR DELETE ON public.review_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_social_review_likes_count();

CREATE OR REPLACE FUNCTION public.sync_review_comments_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.social_reviews SET comments_count = comments_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.social_reviews SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.review_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_review_comments_count ON public.review_comments;
CREATE TRIGGER trg_review_comments_count
  AFTER INSERT OR DELETE ON public.review_comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_review_comments_count();

CREATE OR REPLACE FUNCTION public.sync_collection_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.user_collections SET likes_count = likes_count + 1 WHERE id = NEW.collection_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.user_collections SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.collection_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_collection_likes_count ON public.collection_likes;
CREATE TRIGGER trg_collection_likes_count
  AFTER INSERT OR DELETE ON public.collection_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_collection_likes_count();
