-- Structured listicle carousel entries for feed cards:
-- [{ "title": "Homecoming", "imageUrl": "https://...", "tmdbId": null, "mediaType": "tv" }, ...]

ALTER TABLE public.feed_articles
  ADD COLUMN IF NOT EXISTS summary_items jsonb;

COMMENT ON COLUMN public.feed_articles.summary_items IS
  'Listicle carousel slides: array of { title, imageUrl, tmdbId, mediaType }';
