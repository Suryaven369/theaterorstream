-- Carousel images and 2-option polls on feed posts

ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS media_items jsonb,
  ADD COLUMN IF NOT EXISTS poll_data jsonb;

COMMENT ON COLUMN public.feed_posts.media_items IS
  'Carousel payload: { "slides": [{ "url": "..." }, ...], "caption": "optional global caption" }';
COMMENT ON COLUMN public.feed_posts.poll_data IS
  'Poll payload: { "options": [{ "text": "...", "votes": 0 }, { "text": "...", "votes": 0 }] }';

-- ---------------------------------------------------------------------------
-- post_poll_votes — one vote per user per poll post (exactly 2 options: 0 or 1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_poll_votes (
  post_id uuid NOT NULL REFERENCES public.feed_posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  option_index smallint NOT NULL CHECK (option_index IN (0, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_poll_votes_post ON public.post_poll_votes (post_id);

ALTER TABLE public.post_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read poll votes" ON public.post_poll_votes;
CREATE POLICY "Public read poll votes" ON public.post_poll_votes
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users manage own poll votes" ON public.post_poll_votes;
CREATE POLICY "Users manage own poll votes" ON public.post_poll_votes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Keep poll_data vote counts in sync
CREATE OR REPLACE FUNCTION public.sync_poll_vote_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_post_id uuid;
  counts int[];
BEGIN
  target_post_id := COALESCE(NEW.post_id, OLD.post_id);

  SELECT ARRAY[
    COUNT(*) FILTER (WHERE option_index = 0),
    COUNT(*) FILTER (WHERE option_index = 1)
  ]
  INTO counts
  FROM public.post_poll_votes
  WHERE post_id = target_post_id;

  UPDATE public.feed_posts
  SET poll_data = jsonb_set(
    jsonb_set(
      COALESCE(poll_data, '{"options":[]}'::jsonb),
      '{options,0,votes}',
      to_jsonb(COALESCE(counts[1], 0)),
      true
    ),
    '{options,1,votes}',
    to_jsonb(COALESCE(counts[2], 0)),
    true
  )
  WHERE id = target_post_id
    AND post_type = 'poll';

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_poll_vote_counts ON public.post_poll_votes;
CREATE TRIGGER trg_sync_poll_vote_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.post_poll_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_poll_vote_counts();
