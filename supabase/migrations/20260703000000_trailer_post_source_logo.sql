-- Show the originating channel's logo (e.g. Warner Bros) on a trailer post.
ALTER TABLE public.trailer_posts
  ADD COLUMN IF NOT EXISTS source_logo text;

NOTIFY pgrst, 'reload schema';
