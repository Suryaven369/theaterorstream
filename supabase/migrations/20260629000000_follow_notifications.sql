-- Notify a user when someone follows them. Same SECURITY DEFINER trigger pattern
-- as like/comment notifications — created automatically on every follow insert,
-- so the recipient sees "X started following you" in their bell.

-- 1. Allow the 'follow' notification type.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN ('like', 'comment', 'follow'));

-- 2. Trigger: on a new follow, notify the followed user (skip self-follows).
CREATE OR REPLACE FUNCTION public.notify_new_follow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.following_id IS NOT NULL AND NEW.following_id <> NEW.follower_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type)
    VALUES (NEW.following_id, NEW.follower_id, 'follow');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_follow ON public.user_follows;
CREATE TRIGGER trg_notify_new_follow
  AFTER INSERT ON public.user_follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_follow();
