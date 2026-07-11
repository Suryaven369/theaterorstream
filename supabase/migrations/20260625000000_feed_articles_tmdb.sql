-- Link feed items (esp. YouTube trailers) to the TMDB title they're about, so
-- a verified trailer can deep-link to the movie/show and inherit its poster.

ALTER TABLE public.feed_articles
  ADD COLUMN IF NOT EXISTS tmdb_id text,
  ADD COLUMN IF NOT EXISTS media_type text;

COMMENT ON COLUMN public.feed_articles.tmdb_id IS
  'TMDB id of the matched title (set when a trailer is verified against TMDB).';

CREATE INDEX IF NOT EXISTS idx_feed_articles_tmdb ON public.feed_articles (tmdb_id)
  WHERE tmdb_id IS NOT NULL;
