-- =============================================================================
-- Profile system v2 — schema for: image upload (avatars/banners), favorite
-- shows + directors, reputation, polymorphic follows (collections/genres/
-- directors/franchises/creators), privacy controls, and blocking.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. user_profiles — new columns (favorites, reputation, privacy, prefs)
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS favorite_shows      jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS favorite_directors  jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reputation          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reputation_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_visibility  text    NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS activity_visibility text    NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS notification_prefs  jsonb   NOT NULL DEFAULT '{}'::jsonb;

-- visibility: public | followers | private  (reputation is never user-writable
-- in practice — it's set server-side / via the cache helper, but it's harmless
-- if a user edits their own cached number; the real values are recomputed).
DO $$
BEGIN
  ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_profile_visibility_chk
    CHECK (profile_visibility IN ('public','followers','private'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_activity_visibility_chk
    CHECK (activity_visibility IN ('public','followers','private'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. Storage buckets for uploaded avatars & banners (public read, own-folder write)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES
  ('profile-avatars', 'profile-avatars', true),
  ('profile-banners', 'profile-banners', true)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['profile-avatars','profile-banners'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Public read '||b);
    EXECUTE format($p$CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L)$p$, 'Public read '||b, b);

    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Owner upload '||b);
    EXECUTE format($p$CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)$p$, 'Owner upload '||b, b);

    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Owner update '||b);
    EXECUTE format($p$CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)$p$, 'Owner update '||b, b);

    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Owner delete '||b);
    EXECUTE format($p$CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)$p$, 'Owner delete '||b, b);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. entity_follows — follow non-user entities: collection | genre | director |
--    actor | franchise | creator. (User→user follows stay in user_follows.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_follows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  target_type  text NOT NULL,                 -- collection|genre|director|actor|franchise|creator
  target_id    text NOT NULL,                 -- tmdb id / genre id / internal uuid
  target_label text,                          -- display name (cached)
  target_image text,                          -- poster/profile path (cached)
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_entity_follows_user ON public.entity_follows (user_id);
CREATE INDEX IF NOT EXISTS idx_entity_follows_target ON public.entity_follows (target_type, target_id);

ALTER TABLE public.entity_follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entity_follows_read ON public.entity_follows;
CREATE POLICY entity_follows_read ON public.entity_follows
  FOR SELECT USING (true);
DROP POLICY IF EXISTS entity_follows_write ON public.entity_follows;
CREATE POLICY entity_follows_write ON public.entity_follows
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. blocked_users — moderation. Blocker can never see / be contacted by blocked.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
-- A user only ever sees/manages their OWN block list.
DROP POLICY IF EXISTS blocked_users_owner ON public.blocked_users;
CREATE POLICY blocked_users_owner ON public.blocked_users
  FOR ALL TO authenticated
  USING (auth.uid() = blocker_id) WITH CHECK (auth.uid() = blocker_id);

-- ---------------------------------------------------------------------------
-- 5. user_reports — report a user/content for moderation review (admin reads).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reported_id  uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  reason       text NOT NULL,
  details      text,
  context      jsonb,
  status       text NOT NULL DEFAULT 'open',
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_reports_insert ON public.user_reports;
CREATE POLICY user_reports_insert ON public.user_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
DROP POLICY IF EXISTS user_reports_read_own ON public.user_reports;
CREATE POLICY user_reports_read_own ON public.user_reports
  FOR SELECT TO authenticated USING (auth.uid() = reporter_id OR public.is_admin_user());

NOTIFY pgrst, 'reload schema';
