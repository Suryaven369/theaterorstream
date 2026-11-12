-- When an admin approved a trailer. Approved trailers are shown first in the
-- Feed tab's "New trailers" section (newest approval first) for 14 days.
ALTER TABLE public.trailer_posts
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_trailer_posts_approved_at
  ON public.trailer_posts (approved_at DESC)
  WHERE approved_at IS NOT NULL;
