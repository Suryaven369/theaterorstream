-- Social Feed Posts: Twitter/Instagram-style posts with likes, comments, saves
-- This extends the social media phase with a general feed system

-- ---------------------------------------------------------------------------
-- feed_posts — General social posts (can be about movies, discussions, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feed_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  content text NOT NULL,
  -- Optional movie reference
  tmdb_id text,
  media_type text DEFAULT 'movie',
  movie_title text,
  movie_poster text,
  movie_backdrop text,
  movie_year integer,
  movie_rating decimal(3, 1),
  -- Post metadata
  post_type text NOT NULL DEFAULT 'post', -- post, review, activity, discussion
  has_image boolean NOT NULL DEFAULT false,
  -- Engagement counts (synced via triggers)
  likes_count integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  shares_count integer NOT NULL DEFAULT 0,
  saves_count integer NOT NULL DEFAULT 0,
  -- Visibility
  visibility text NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_posts_user ON public.feed_posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_posts_public ON public.feed_posts (created_at DESC)
  WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_feed_posts_type ON public.feed_posts (post_type, created_at DESC);

ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read feed posts" ON public.feed_posts;
CREATE POLICY "Public read feed posts" ON public.feed_posts
  FOR SELECT TO authenticated
  USING (visibility = 'public' OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own feed posts" ON public.feed_posts;
CREATE POLICY "Users manage own feed posts" ON public.feed_posts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- post_likes — Likes on feed posts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_likes (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.feed_posts (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_post ON public.post_likes (post_id);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read post likes" ON public.post_likes;
CREATE POLICY "Read post likes" ON public.post_likes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users manage own post likes" ON public.post_likes;
CREATE POLICY "Users manage own post likes" ON public.post_likes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- post_comments — Comments on feed posts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.feed_posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.post_comments (id) ON DELETE CASCADE,
  content text NOT NULL,
  likes_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON public.post_comments (post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_post_comments_user ON public.post_comments (user_id);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read post comments" ON public.post_comments;
CREATE POLICY "Read post comments" ON public.post_comments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users manage own post comments" ON public.post_comments;
CREATE POLICY "Users manage own post comments" ON public.post_comments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- saved_posts — Bookmarked/saved posts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_posts (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.feed_posts (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_posts_user ON public.saved_posts (user_id, created_at DESC);

ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own saved posts" ON public.saved_posts;
CREATE POLICY "Users read own saved posts" ON public.saved_posts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own saved posts" ON public.saved_posts;
CREATE POLICY "Users manage own saved posts" ON public.saved_posts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- post_shares — Track shares (for analytics)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  post_id uuid NOT NULL REFERENCES public.feed_posts (id) ON DELETE CASCADE,
  share_type text NOT NULL DEFAULT 'link', -- link, twitter, whatsapp, etc.
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_shares_post ON public.post_shares (post_id);

ALTER TABLE public.post_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Insert post shares" ON public.post_shares;
CREATE POLICY "Insert post shares" ON public.post_shares
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Read own post shares" ON public.post_shares;
CREATE POLICY "Read own post shares" ON public.post_shares
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

-- ---------------------------------------------------------------------------
-- Triggers: sync counts on feed_posts
-- ---------------------------------------------------------------------------

-- Sync likes count
CREATE OR REPLACE FUNCTION public.sync_post_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feed_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.feed_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_likes_count ON public.post_likes;
CREATE TRIGGER trg_post_likes_count
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_likes_count();

-- Sync comments count
CREATE OR REPLACE FUNCTION public.sync_post_comments_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feed_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.feed_posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_comments_count ON public.post_comments;
CREATE TRIGGER trg_post_comments_count
  AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_comments_count();

-- Sync saves count
CREATE OR REPLACE FUNCTION public.sync_post_saves_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feed_posts SET saves_count = saves_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.feed_posts SET saves_count = GREATEST(0, saves_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_saves_count ON public.saved_posts;
CREATE TRIGGER trg_post_saves_count
  AFTER INSERT OR DELETE ON public.saved_posts
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_saves_count();

-- Sync shares count
CREATE OR REPLACE FUNCTION public.sync_post_shares_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feed_posts SET shares_count = shares_count + 1 WHERE id = NEW.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_shares_count ON public.post_shares;
CREATE TRIGGER trg_post_shares_count
  AFTER INSERT ON public.post_shares
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_shares_count();
