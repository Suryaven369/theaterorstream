-- One content edit per feed post (owner may edit text once after publishing)

ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS edit_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.feed_posts.edit_count IS
  'Number of times post content was edited. Max 1 allowed.';

CREATE OR REPLACE FUNCTION public.enforce_feed_post_single_edit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.content IS DISTINCT FROM NEW.content THEN
    IF COALESCE(OLD.edit_count, 0) >= 1 THEN
      RAISE EXCEPTION 'post_already_edited' USING ERRCODE = 'P0001';
    END IF;
    NEW.edit_count := COALESCE(OLD.edit_count, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feed_post_single_edit ON public.feed_posts;
CREATE TRIGGER trg_feed_post_single_edit
  BEFORE UPDATE ON public.feed_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_feed_post_single_edit();
