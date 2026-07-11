-- =============================================================================
-- RLS security hardening — closes 3 holes found by probing the live DB with the
-- PUBLIC anon key (i.e. what any visitor can do directly, bypassing the app):
--
--   1. ratings        : a legacy "Allow public insert/update ... USING(true)"
--                       policy let ANYONE forge ratings for ANY user_id, which
--                       corrupts the TOS aggregate scores shown across the app.
--   2. user_collections : SELECT was USING(true) → PRIVATE lists were publicly
--                       readable.
--   3. collection_movies: same leak — the CONTENTS of private lists were public.
--
-- Each block drops EVERY existing policy on the table (handles old, unknown
-- policy names) then recreates the correct minimal set. The service role bypasses
-- RLS, so the admin API / server jobs are unaffected.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ratings — public READ (TOS scores are shown publicly), owner-only WRITE.
--    user_id is TEXT, so compare with auth.uid()::text.
-- ---------------------------------------------------------------------------
DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('public.ratings') IS NOT NULL THEN
    ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ratings' LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.ratings', pol.policyname);
    END LOOP;

    CREATE POLICY ratings_public_read ON public.ratings
      FOR SELECT USING (true);

    -- INSERT / UPDATE / DELETE only for the row's owner, signed in.
    CREATE POLICY ratings_owner_write ON public.ratings
      FOR ALL TO authenticated
      USING (auth.uid()::text = user_id)
      WITH CHECK (auth.uid()::text = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. user_collections — readable if PUBLIC or owned; only the owner can write.
--    user_id is uuid here (auth.uid() = user_id).
-- ---------------------------------------------------------------------------
DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('public.user_collections') IS NOT NULL THEN
    ALTER TABLE public.user_collections ENABLE ROW LEVEL SECURITY;
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='user_collections' LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_collections', pol.policyname);
    END LOOP;

    CREATE POLICY user_collections_read ON public.user_collections
      FOR SELECT USING (is_public = true OR auth.uid() = user_id);

    CREATE POLICY user_collections_insert ON public.user_collections
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY user_collections_update ON public.user_collections
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY user_collections_delete ON public.user_collections
      FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. collection_movies — visible only if the PARENT collection is public or
--    owned; writable only by the parent collection's owner.
-- ---------------------------------------------------------------------------
DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('public.collection_movies') IS NOT NULL THEN
    ALTER TABLE public.collection_movies ENABLE ROW LEVEL SECURITY;
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='collection_movies' LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.collection_movies', pol.policyname);
    END LOOP;

    CREATE POLICY collection_movies_read ON public.collection_movies
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.user_collections c
          WHERE c.id = collection_movies.collection_id
            AND (c.is_public = true OR c.user_id = auth.uid())
        )
      );

    CREATE POLICY collection_movies_write ON public.collection_movies
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_collections c
          WHERE c.id = collection_movies.collection_id AND c.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_collections c
          WHERE c.id = collection_movies.collection_id AND c.user_id = auth.uid()
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
