-- Per-source keyword filtering for RSS/YouTube feeds. Lets admins fetch only
-- matching items (e.g. a YouTube channel where include = {trailer, teaser}).

ALTER TABLE public.rss_sources
  ADD COLUMN IF NOT EXISTS include_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exclude_keywords text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.rss_sources.include_keywords IS
  'If non-empty, only items whose title/summary contains one of these (case-insensitive) are stored.';
COMMENT ON COLUMN public.rss_sources.exclude_keywords IS
  'Items whose title/summary contains any of these are skipped.';
