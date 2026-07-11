-- Rich blogs: cover image + a public image bucket. Self-contained — it also
-- CREATEs the blog tables if the original blog migration (20260529) was never
-- applied (which is why an earlier ALTER failed with "blog_posts does not exist").
-- Everything here is idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- blog_posts (+ cover_image) — create if missing, else just add the column.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  cover_image text,
  likes_count integer NOT NULL DEFAULT 0,
  visibility text NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS cover_image text;

CREATE INDEX IF NOT EXISTS idx_blog_posts_user ON public.blog_posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_public ON public.blog_posts (created_at DESC)
  WHERE visibility = 'public';

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read blog posts" ON public.blog_posts;
CREATE POLICY "Public read blog posts" ON public.blog_posts
  FOR SELECT
  USING (visibility = 'public' OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own blog posts" ON public.blog_posts;
CREATE POLICY "Users manage own blog posts" ON public.blog_posts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- blog_likes (+ count trigger)
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
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users manage own blog likes" ON public.blog_likes;
CREATE POLICY "Users manage own blog likes" ON public.blog_likes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.sync_blog_likes_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- ---------------------------------------------------------------------------
-- Public bucket for blog cover/inline images (files under "<uid>/...").
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-images', 'blog-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read blog images" ON storage.objects;
CREATE POLICY "Public read blog images" ON storage.objects
  FOR SELECT USING (bucket_id = 'blog-images');

DROP POLICY IF EXISTS "Owner upload blog images" ON storage.objects;
CREATE POLICY "Owner upload blog images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'blog-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Owner update blog images" ON storage.objects;
CREATE POLICY "Owner update blog images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'blog-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Owner delete blog images" ON storage.objects;
CREATE POLICY "Owner delete blog images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'blog-images' AND (storage.foldername(name))[1] = auth.uid()::text);

NOTIFY pgrst, 'reload schema';
