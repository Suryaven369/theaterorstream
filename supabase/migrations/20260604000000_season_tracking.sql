-- TV season tracking: store TMDB's per-season metadata so the show detail page
-- can render a real "Seasons" grid, and let a movie_log/activity_feed row point
-- at a specific season (season_number IS NULL keeps meaning "whole movie/show",
-- matching all existing rows) so marking a season watched is independently
-- trackable and shows up in the public activity feed.

ALTER TABLE public.movies_library
  ADD COLUMN IF NOT EXISTS seasons jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.movies_library.seasons IS
  'Raw TMDB seasons array for TV shows (season_number, name, poster_path, episode_count, air_date). Empty for movies.';

ALTER TABLE public.movie_logs
  ADD COLUMN IF NOT EXISTS season_number integer;

ALTER TABLE public.activity_feed
  ADD COLUMN IF NOT EXISTS season_number integer;

ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS season_number integer;

COMMENT ON COLUMN public.movie_logs.season_number IS
  'Set when this log marks a specific TV season watched rather than the whole title.';
COMMENT ON COLUMN public.activity_feed.season_number IS
  'Denormalized from movie_logs.season_number for feed card display/filtering.';
COMMENT ON COLUMN public.feed_posts.season_number IS
  'Denormalized from movie_logs.season_number — lets unmarking a season watched find and remove the matching feed post.';

-- One "watched" row per user+title+season — the eye icon is a toggle, not a
-- rewatch diary, so re-clicking should unmark rather than pile up duplicate rows.
-- Movies (season_number IS NULL) keep their existing unrestricted behavior since
-- a NULL season_number isn't subject to a unique index by default in Postgres.
CREATE UNIQUE INDEX IF NOT EXISTS idx_movie_logs_user_title_season
  ON public.movie_logs (user_id, tmdb_id, season_number)
  WHERE season_number IS NOT NULL;
