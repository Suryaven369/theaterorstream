-- Group feed sources by kind so the admin can keep YouTube trailer channels in a
-- dedicated "Trailers" space, separate from news article feeds.

ALTER TABLE public.rss_sources
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'article'
  CHECK (source_kind IN ('article', 'trailer'));

COMMENT ON COLUMN public.rss_sources.source_kind IS
  'article = news/blog RSS; trailer = YouTube channel feed shown in the Trailers space.';

CREATE INDEX IF NOT EXISTS idx_rss_sources_kind ON public.rss_sources (source_kind);
