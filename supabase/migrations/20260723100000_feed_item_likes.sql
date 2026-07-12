-- Global upvotes for non-post feed items (articles, tweets, trailers).
-- User posts continue to use post_likes.
-- Run this in Supabase SQL Editor if upvotes on news/tweets/trailers fail.

CREATE TABLE IF NOT EXISTS public.feed_item_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind text NOT NULL CHECK (subject_kind IN ('article', 'tweet', 'trailer')),
  subject_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_kind, subject_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_item_likes_subject
  ON public.feed_item_likes (subject_kind, subject_id);

CREATE INDEX IF NOT EXISTS idx_feed_item_likes_user
  ON public.feed_item_likes (user_id);

ALTER TABLE public.feed_item_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read feed item likes" ON public.feed_item_likes;
CREATE POLICY "Anyone can read feed item likes" ON public.feed_item_likes
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Auth users insert feed item likes" ON public.feed_item_likes;
CREATE POLICY "Auth users insert feed item likes" ON public.feed_item_likes
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own feed item likes" ON public.feed_item_likes;
CREATE POLICY "Users delete own feed item likes" ON public.feed_item_likes
  FOR DELETE
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

GRANT SELECT ON public.feed_item_likes TO anon, authenticated;
GRANT INSERT, DELETE ON public.feed_item_likes TO authenticated;

COMMENT ON TABLE public.feed_item_likes IS
  'Upvotes for article/tweet/trailer feed cards. Posts use post_likes.';
