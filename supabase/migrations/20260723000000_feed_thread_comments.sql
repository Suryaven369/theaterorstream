-- Polymorphic comments for Home feed threads (articles, tweets, trailers).
-- User posts continue to use post_comments → feed_posts.

CREATE TABLE IF NOT EXISTS public.feed_thread_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind text NOT NULL CHECK (subject_kind IN ('article', 'tweet', 'trailer')),
  subject_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 2000),
  parent_id uuid REFERENCES public.feed_thread_comments (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_thread_comments_subject
  ON public.feed_thread_comments (subject_kind, subject_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_feed_thread_comments_user
  ON public.feed_thread_comments (user_id, created_at DESC);

ALTER TABLE public.feed_thread_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read thread comments" ON public.feed_thread_comments;
CREATE POLICY "Anyone can read thread comments" ON public.feed_thread_comments
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Auth users insert thread comments" ON public.feed_thread_comments;
CREATE POLICY "Auth users insert thread comments" ON public.feed_thread_comments
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own thread comments" ON public.feed_thread_comments;
CREATE POLICY "Users delete own thread comments" ON public.feed_thread_comments
  FOR DELETE
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

GRANT SELECT ON public.feed_thread_comments TO anon, authenticated;
GRANT INSERT, DELETE ON public.feed_thread_comments TO authenticated;

COMMENT ON TABLE public.feed_thread_comments IS
  'Reddit-style thread comments for article/tweet/trailer feed items (subject_id = article uuid or trailer tmdb id).';
