-- Mention notifications: when a post's content tags an app user via the
-- [[user|<uuid>|username|name]] token, notify that user. SECURITY DEFINER
-- trigger parses the content on insert — works for every insert path (client or
-- server), and never depends on the client remembering to "notify".

-- Allow the 'mention' type (keep the others).
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN ('like', 'comment', 'follow', 'mention'));

CREATE OR REPLACE FUNCTION public.notify_post_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.content IS NULL OR NEW.content = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (recipient_id, actor_id, type, post_id)
  SELECT DISTINCT m.uid::uuid, NEW.user_id, 'mention', NEW.id
  FROM (
    SELECT (regexp_matches(NEW.content, '\[\[user\|([0-9a-fA-F\-]{36})\|', 'g'))[1] AS uid
  ) m
  WHERE m.uid IS NOT NULL
    AND m.uid <> NEW.user_id::text                       -- don't notify yourself
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.uid::uuid);  -- real user only

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_post_mentions ON public.feed_posts;
CREATE TRIGGER trg_notify_post_mentions
  AFTER INSERT ON public.feed_posts
  FOR EACH ROW EXECUTE FUNCTION public.notify_post_mentions();
