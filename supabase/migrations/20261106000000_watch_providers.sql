-- OTT availability for recommendations.
--
-- movies_library.watch_providers stores TMDB watch/providers per region in a
-- compact shape, refreshed by the library sync + the daily providers-refresh cron:
--   { "IN": { "stream": [{ "id": 8, "name": "Netflix", "logo": "/x.jpg" }],
--             "rent": [2, 3], "buy": [2], "link": "https://..." }, ... }
--
-- user_streaming_services gains the TMDB provider id so a user's picks map
-- exactly onto that data (service_id stays the primary key; new rows use the
-- provider id as text).

ALTER TABLE public.movies_library
  ADD COLUMN IF NOT EXISTS watch_providers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS watch_providers_synced_at timestamptz;

COMMENT ON COLUMN public.movies_library.watch_providers IS
  'TMDB watch/providers by region: { REGION: { stream: [{id,name,logo}], rent: [id], buy: [id], link } }';

CREATE INDEX IF NOT EXISTS idx_movies_library_watch_providers_synced
  ON public.movies_library (watch_providers_synced_at NULLS FIRST)
  WHERE is_active = true;

ALTER TABLE public.user_streaming_services
  ADD COLUMN IF NOT EXISTS provider_id integer,
  ADD COLUMN IF NOT EXISTS provider_name text,
  ADD COLUMN IF NOT EXISTS logo_path text;
