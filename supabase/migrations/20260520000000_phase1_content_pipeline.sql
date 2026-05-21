-- =============================================
-- TheaterOrStream — Phase 1 Content Pipeline & RLS
-- Task: db-migrations (TOS production architecture plan)
--
-- PREREQUISITE: Run supabase_production_optimization.sql first if you
-- have not already (TV columns, tv_sections, indexes, search function).
--
-- Run this entire script in Supabase SQL Editor (safe to re-run).
-- =============================================

-- =============================================
-- 0. ADMIN HELPER (used by RLS policies)
-- =============================================

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.user_profiles WHERE id = auth.uid()),
    false
  );
$$;

COMMENT ON FUNCTION public.is_admin_user() IS
  'Returns true when the authenticated user has is_admin on user_profiles.';

-- =============================================
-- 1. CONTENT SNAPSHOTS (precomputed read payloads)
-- =============================================

CREATE TABLE IF NOT EXISTS public.content_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_key text NOT NULL,
  region text NOT NULL DEFAULT 'IN',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_version integer NOT NULL DEFAULT 1,
  item_count integer DEFAULT 0,
  source_run_id uuid,
  built_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_snapshots_key_region_unique UNIQUE (snapshot_key, region)
);

CREATE INDEX IF NOT EXISTS idx_content_snapshots_key
  ON public.content_snapshots (snapshot_key);

CREATE INDEX IF NOT EXISTS idx_content_snapshots_expires
  ON public.content_snapshots (expires_at)
  WHERE expires_at IS NOT NULL;

COMMENT ON TABLE public.content_snapshots IS
  'Cached JSON payloads for Edge/API reads (homepage, upcoming, tv-sections).';

-- Link to sync run after tmdb_sync_runs exists
-- (added below after tmdb_sync_runs creation)

-- =============================================
-- 2. TMDB SYNC RUNS (job execution history)
-- =============================================

CREATE TABLE IF NOT EXISTS public.tmdb_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  region text DEFAULT 'IN',
  triggered_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  movies_added integer NOT NULL DEFAULT 0,
  movies_updated integer NOT NULL DEFAULT 0,
  movies_skipped integer NOT NULL DEFAULT 0,
  pages_fetched integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tmdb_sync_runs_job_started
  ON public.tmdb_sync_runs (job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_tmdb_sync_runs_status
  ON public.tmdb_sync_runs (status, started_at DESC);

COMMENT ON TABLE public.tmdb_sync_runs IS
  'Audit log for automated and manual TMDB sync jobs (Cron / admin).';

-- FK from content_snapshots → sync runs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'content_snapshots_source_run_id_fkey'
  ) THEN
    ALTER TABLE public.content_snapshots
      ADD CONSTRAINT content_snapshots_source_run_id_fkey
      FOREIGN KEY (source_run_id) REFERENCES public.tmdb_sync_runs (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================
-- 3. TMDB SYNC STATE (per-job cursor / watermark)
-- =============================================

CREATE TABLE IF NOT EXISTS public.tmdb_sync_state (
  job_name text PRIMARY KEY,
  region text NOT NULL DEFAULT 'IN',
  last_run_id uuid REFERENCES public.tmdb_sync_runs (id) ON DELETE SET NULL,
  last_success_at timestamptz,
  last_started_at timestamptz,
  last_status text,
  last_cursor text,
  last_page integer DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tmdb_sync_state IS
  'Latest watermark per sync job for delta ingestion.';

-- =============================================
-- 4. CONTENT EVENTS (admin queue / async work)
-- =============================================

CREATE TABLE IF NOT EXISTS public.content_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL
    CHECK (event_type IN (
      'ingest', 'enrich', 'publish', 'hide', 'snapshot_rebuild',
      'parent_guide', 'streaming_refresh', 'section_sync'
    )),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'cancelled')),
  priority integer NOT NULL DEFAULT 0,
  tmdb_id text,
  media_type text,
  region text DEFAULT 'IN',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  processed_by_run_id uuid REFERENCES public.tmdb_sync_runs (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_content_events_status_priority
  ON public.content_events (status, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_content_events_tmdb
  ON public.content_events (tmdb_id)
  WHERE tmdb_id IS NOT NULL;

COMMENT ON TABLE public.content_events IS
  'Queue for ingest, enrichment, and snapshot rebuild tasks (admin control tower).';

-- =============================================
-- 5. ROW LEVEL SECURITY — NEW TABLES
-- =============================================

ALTER TABLE public.content_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmdb_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmdb_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_events ENABLE ROW LEVEL SECURITY;

-- Snapshots: public read for non-expired; admins manage all
DROP POLICY IF EXISTS "Public read active content_snapshots" ON public.content_snapshots;
DROP POLICY IF EXISTS "Admins manage content_snapshots" ON public.content_snapshots;

CREATE POLICY "Public read active content_snapshots" ON public.content_snapshots
  FOR SELECT TO public
  USING (expires_at IS NULL OR expires_at > now());

CREATE POLICY "Admins manage content_snapshots" ON public.content_snapshots
  FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- Sync + events: admin-only (service_role bypasses RLS for workers)
DROP POLICY IF EXISTS "Admins read tmdb_sync_runs" ON public.tmdb_sync_runs;
DROP POLICY IF EXISTS "Admins insert tmdb_sync_runs" ON public.tmdb_sync_runs;
DROP POLICY IF EXISTS "Admins update tmdb_sync_runs" ON public.tmdb_sync_runs;

CREATE POLICY "Admins read tmdb_sync_runs" ON public.tmdb_sync_runs
  FOR SELECT TO authenticated
  USING (public.is_admin_user());

CREATE POLICY "Admins insert tmdb_sync_runs" ON public.tmdb_sync_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins update tmdb_sync_runs" ON public.tmdb_sync_runs
  FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "Admins manage tmdb_sync_state" ON public.tmdb_sync_state;

CREATE POLICY "Admins manage tmdb_sync_state" ON public.tmdb_sync_state
  FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "Admins manage content_events" ON public.content_events;

CREATE POLICY "Admins manage content_events" ON public.content_events
  FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- =============================================
-- 6. FIX RLS — movies_library, homepage_sections, tv_sections
-- Replaces permissive "allow all" policies with admin-gated writes.
-- =============================================

-- --- movies_library ---
ALTER TABLE public.movies_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.movies_library;
DROP POLICY IF EXISTS "Admin write access" ON public.movies_library;
DROP POLICY IF EXISTS "Allow public read on movies_library" ON public.movies_library;
DROP POLICY IF EXISTS "Allow all on movies_library" ON public.movies_library;

CREATE POLICY "Public read active movies_library" ON public.movies_library
  FOR SELECT TO public
  USING (is_active = true OR public.is_admin_user());

CREATE POLICY "Admins insert movies_library" ON public.movies_library
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins update movies_library" ON public.movies_library
  FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins delete movies_library" ON public.movies_library
  FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- --- homepage_sections ---
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read active sections" ON public.homepage_sections;
DROP POLICY IF EXISTS "Allow all on homepage_sections" ON public.homepage_sections;

CREATE POLICY "Public read active homepage_sections" ON public.homepage_sections
  FOR SELECT TO public
  USING (is_active = true OR public.is_admin_user());

CREATE POLICY "Admins insert homepage_sections" ON public.homepage_sections
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins update homepage_sections" ON public.homepage_sections
  FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins delete homepage_sections" ON public.homepage_sections
  FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- --- tv_sections (may not exist until production optimization SQL runs) ---
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tv_sections'
  ) THEN
    ALTER TABLE public.tv_sections ENABLE ROW LEVEL SECURITY;

    EXECUTE 'DROP POLICY IF EXISTS "Allow public read active tv_sections" ON public.tv_sections';
    EXECUTE 'DROP POLICY IF EXISTS "Allow all on tv_sections" ON public.tv_sections';

    EXECUTE $policy$
      CREATE POLICY "Public read active tv_sections" ON public.tv_sections
        FOR SELECT TO public
        USING (is_active = true OR public.is_admin_user())
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "Admins insert tv_sections" ON public.tv_sections
        FOR INSERT TO authenticated
        WITH CHECK (public.is_admin_user())
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "Admins update tv_sections" ON public.tv_sections
        FOR UPDATE TO authenticated
        USING (public.is_admin_user())
        WITH CHECK (public.is_admin_user())
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "Admins delete tv_sections" ON public.tv_sections
        FOR DELETE TO authenticated
        USING (public.is_admin_user())
    $policy$;
  END IF;
END $$;

-- --- genres lookup (from production optimization) ---
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'genres'
  ) THEN
    ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;

    EXECUTE 'DROP POLICY IF EXISTS "Public read genres" ON public.genres';
    EXECUTE 'DROP POLICY IF EXISTS "Admins manage genres" ON public.genres';

    EXECUTE $policy$
      CREATE POLICY "Public read genres" ON public.genres
        FOR SELECT TO public
        USING (true)
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "Admins manage genres" ON public.genres
        FOR ALL TO authenticated
        USING (public.is_admin_user())
        WITH CHECK (public.is_admin_user())
    $policy$;
  END IF;
END $$;

-- =============================================
-- 7. SEED SYNC STATE ROWS (idempotent)
-- =============================================

INSERT INTO public.tmdb_sync_state (job_name, region, metadata) VALUES
  ('trending-daily', 'IN', '{"description": "Trending movies + TV delta"}'::jsonb),
  ('now-playing-daily', 'IN', '{"description": "In theaters by region"}'::jsonb),
  ('upcoming-weekly', 'IN', '{"description": "Upcoming releases"}'::jsonb),
  ('streaming-availability', 'IN', '{"description": "Watch providers refresh"}'::jsonb),
  ('snapshot-rebuild', 'IN', '{"description": "Rebuild content_snapshots"}'::jsonb)
ON CONFLICT (job_name) DO NOTHING;

-- =============================================
-- 8. UPDATED_AT TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_snapshots_set_updated_at ON public.content_snapshots;
CREATE TRIGGER content_snapshots_set_updated_at
  BEFORE UPDATE ON public.content_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tmdb_sync_state_set_updated_at ON public.tmdb_sync_state;
CREATE TRIGGER tmdb_sync_state_set_updated_at
  BEFORE UPDATE ON public.tmdb_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- DONE
-- Verify: SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public'
--   AND tablename IN (
--     'content_snapshots', 'tmdb_sync_runs', 'tmdb_sync_state', 'content_events'
--   );
-- =============================================
