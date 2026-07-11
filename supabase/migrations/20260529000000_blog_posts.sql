-- Blog posts: long-form articles any user can write (title + char-limited body),
-- mirrors the social_reviews / collection_likes pattern already used elsewhere.

-- ---------------------------------------------------------------------------
-- blog_posts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  likes_count integer NOT NULL DEFAULT 0,
  visibility text NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_user ON public.blog_posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_public ON public.blog_posts (created_at DESC)
  WHERE visibility = 'public';

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read blog posts" ON public.blog_posts;
CREATE POLICY "Public read blog posts" ON public.blog_posts
  FOR SELECT TO authenticated
  USING (visibility = 'public' OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own blog posts" ON public.blog_posts;
CREATE POLICY "Users manage own blog posts" ON public.blog_posts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- blog_likes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blog_likes (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  blog_id uuid NOT NULL REFERENCES public.blog_posts (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blog_id)
);

ALTER TABLE public.blog_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read blog likes" ON public.blog_likes;
CREATE POLICY "Read blog likes" ON public.blog_likes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users manage own blog likes" ON public.blog_likes;
CREATE POLICY "Users manage own blog likes" ON public.blog_likes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Trigger: sync likes_count on blog_posts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_blog_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.blog_posts SET likes_count = likes_count + 1 WHERE id = NEW.blog_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.blog_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.blog_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_blog_likes_count ON public.blog_likes;
CREATE TRIGGER trg_blog_likes_count
  AFTER INSERT OR DELETE ON public.blog_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_blog_likes_count();
