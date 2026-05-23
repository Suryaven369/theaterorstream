-- Task #13: activity feed, badges, diary display fields, social RLS

-- ---------------------------------------------------------------------------
-- movie_logs — denormalized display fields for feed cards
-- ---------------------------------------------------------------------------
ALTER TABLE public.movie_logs
  ADD COLUMN IF NOT EXISTS movie_title text,
  ADD COLUMN IF NOT EXISTS poster_path text;

-- ---------------------------------------------------------------------------
-- activity_feed — social timeline (logs, ratings, badges, decisions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  target_tmdb_id text,
  target_movie_title text,
  target_poster_path text,
  media_type text DEFAULT 'movie',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility text NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.activity_feed IS
  'User activity stream for profile and following feed.';

CREATE INDEX IF NOT EXISTS idx_activity_feed_user_created
  ON public.activity_feed (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_feed_public_created
  ON public.activity_feed (created_at DESC)
  WHERE visibility = 'public';

ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own activity" ON public.activity_feed;
CREATE POLICY "Users manage own activity" ON public.activity_feed
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Read public activity" ON public.activity_feed;
CREATE POLICY "Read public activity" ON public.activity_feed
  FOR SELECT TO authenticated
  USING (visibility = 'public' OR auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- badge_definitions + user_badges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.badge_definitions (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT '🏅',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.user_badges (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  badge_id text NOT NULL REFERENCES public.badge_definitions (id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user
  ON public.user_badges (user_id, earned_at DESC);

ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read badge definitions" ON public.badge_definitions;
CREATE POLICY "Public read badge definitions" ON public.badge_definitions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users read all earned badges" ON public.user_badges;
CREATE POLICY "Users read all earned badges" ON public.user_badges
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users earn own badges" ON public.user_badges;
CREATE POLICY "Users earn own badges" ON public.user_badges
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- movie_logs — allow reading public diary entries
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Read public movie logs" ON public.movie_logs;
CREATE POLICY "Read public movie logs" ON public.movie_logs
  FOR SELECT TO authenticated
  USING (visibility = 'public' OR auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Seed badges
-- ---------------------------------------------------------------------------
INSERT INTO public.badge_definitions (id, name, description, icon, sort_order)
VALUES
  ('first_reel', 'First Reel', 'Logged your first movie', '🎬', 1),
  ('family_night_hero', 'Family Night Hero', '10 family watch logs', '👨‍👩‍👧', 2),
  ('platform_explorer', 'Platform Explorer', 'Logged movies on 5 different streaming platforms', '📺', 3),
  ('taste_maker', 'Taste Maker', '10 reviews with strong community upvotes', '⭐', 4),
  ('decisive', 'Decisive', 'Used Decision Mode 20 times', '🎯', 5)
ON CONFLICT (id) DO NOTHING;
