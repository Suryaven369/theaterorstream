-- Allow owners to edit their thread comments (posts already have FOR ALL on post_comments).
DROP POLICY IF EXISTS "Users update own thread comments" ON public.feed_thread_comments;
CREATE POLICY "Users update own thread comments" ON public.feed_thread_comments
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT UPDATE ON public.feed_thread_comments TO authenticated;
