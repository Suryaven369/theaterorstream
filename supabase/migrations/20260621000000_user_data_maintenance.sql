-- User data maintenance: provision taste profiles on signup, keep updated_at
-- fresh, guarantee user-deletion cleans up all owned rows (ON DELETE CASCADE),
-- and harden RLS without changing existing read access.
--
-- Safe to re-run: every statement is idempotent. Service-role writes (workers,
-- cron, recommendation engine) bypass RLS and are unaffected.

-- ===========================================================================
-- 0. Shared helper — set_updated_at() (CREATE OR REPLACE so it always exists)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ===========================================================================
-- 1. Auto-provision a taste profile for every new user
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.provision_user_taste_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_taste_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_taste ON auth.users;
CREATE TRIGGER on_auth_user_created_taste
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_user_taste_profile();

-- Backfill any existing users missing a profile (no-op if already present).
INSERT INTO public.user_taste_profiles (user_id)
SELECT u.id FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_taste_profiles p WHERE p.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

-- ===========================================================================
-- 2. updated_at triggers (only on tables that have the column)
-- ===========================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'user_profiles','user_taste_profiles','user_streaming_services',
    'ratings','movie_logs','recommendation_cache','user_collections'
  ])
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='updated_at'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t||'_set_updated_at', t);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
        t||'_set_updated_at', t
      );
    END IF;
  END LOOP;
END $$;

-- ===========================================================================
-- 3. ON DELETE CASCADE to auth.users — so deleting a user removes all their data
-- ===========================================================================
DO $$
DECLARE
  t text; c text; con text; deltype "char";
BEGIN
  FOR t, c IN
    SELECT v.t, v.c FROM (VALUES
      ('user_profiles','id'),
      ('user_taste_profiles','user_id'),
      ('user_streaming_services','user_id'),
      ('user_events','user_id'),
      ('recommendation_cache','user_id'),
      ('ratings','user_id'),
      ('movie_logs','user_id'),
      ('user_watched_movies','user_id'),
      ('user_liked_movies','user_id'),
      ('user_watchlist','user_id'),
      ('user_collections','user_id'),
      ('user_follows','follower_id'),
      ('user_follows','following_id'),
      ('notifications','recipient_id'),
      ('notifications','actor_id')
    ) AS v(t,c)
  LOOP
    -- skip if the column is missing OR isn't uuid (can't FK to auth.users.id).
    -- e.g. ratings.user_id is text (stores 'anonymous' for logged-out ratings).
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name=c
        AND data_type = 'uuid'
    );

    SELECT conname, confdeltype INTO con, deltype
    FROM pg_constraint
    WHERE conrelid = ('public.'||t)::regclass
      AND contype = 'f'
      AND confrelid = 'auth.users'::regclass
      AND conkey = ARRAY[(
        SELECT attnum FROM pg_attribute
        WHERE attrelid = ('public.'||t)::regclass AND attname = c
      )]::smallint[]
    LIMIT 1;

    IF con IS NOT NULL THEN
      IF deltype <> 'c' THEN
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, con);
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE CASCADE',
          t, t||'_'||c||'_fkey', c);
      END IF;
    ELSE
      -- NOT VALID: enforce cascade + future inserts without failing on any
      -- pre-existing orphan rows.
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID',
        t, t||'_'||c||'_fkey', c);
    END IF;

    con := NULL; deltype := NULL;
  END LOOP;
END $$;

-- collection_movies should die with its parent collection
DO $$
DECLARE con text; deltype "char";
BEGIN
  IF to_regclass('public.collection_movies') IS NOT NULL
     AND to_regclass('public.user_collections') IS NOT NULL THEN
    SELECT conname, confdeltype INTO con, deltype
    FROM pg_constraint
    WHERE conrelid = 'public.collection_movies'::regclass
      AND contype='f' AND confrelid = 'public.user_collections'::regclass
    LIMIT 1;
    IF con IS NOT NULL AND deltype <> 'c' THEN
      EXECUTE format('ALTER TABLE public.collection_movies DROP CONSTRAINT %I', con);
      EXECUTE 'ALTER TABLE public.collection_movies ADD CONSTRAINT collection_movies_collection_id_fkey '
        || 'FOREIGN KEY (collection_id) REFERENCES public.user_collections(id) ON DELETE CASCADE';
    END IF;
  END IF;
END $$;

-- ===========================================================================
-- 4. RLS hardening — owner-only writes; public reads preserved where the app
--    already shows data cross-user (profiles, ratings, watchlists, collections).
-- ===========================================================================

-- 4a. Private to the owner (engine-internal; never shown to other users).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'user_taste_profiles','user_streaming_services','user_events','recommendation_cache'
  ])
  LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_owner_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      t||'_owner_all', t);
  END LOOP;
END $$;

-- 4b. Public read + owner write (data the app already exposes on profile pages).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'user_watched_movies','user_liked_movies','user_watchlist','user_collections'
  ])
  LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_public_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO public USING (true)', t||'_public_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_owner_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      t||'_owner_write', t);
  END LOOP;
END $$;

-- 4b-ii. ratings — text user_id (stores 'anonymous'); compare with a cast.
DO $$
BEGIN
  IF to_regclass('public.ratings') IS NOT NULL THEN
    ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS ratings_public_read ON public.ratings;
    CREATE POLICY ratings_public_read ON public.ratings
      FOR SELECT TO public USING (true);
    DROP POLICY IF EXISTS ratings_owner_write ON public.ratings;
    CREATE POLICY ratings_owner_write ON public.ratings
      FOR ALL TO authenticated
      USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
  END IF;
END $$;

-- 4c. user_profiles — public read, owner manages own row (keyed on id).
DO $$
BEGIN
  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS user_profiles_public_read ON public.user_profiles;
    CREATE POLICY user_profiles_public_read ON public.user_profiles
      FOR SELECT TO public USING (true);
    DROP POLICY IF EXISTS user_profiles_owner_insert ON public.user_profiles;
    CREATE POLICY user_profiles_owner_insert ON public.user_profiles
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
    DROP POLICY IF EXISTS user_profiles_owner_update ON public.user_profiles;
    CREATE POLICY user_profiles_owner_update ON public.user_profiles
      FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- 4d. user_follows — public read, follower manages their own follow rows.
DO $$
BEGIN
  IF to_regclass('public.user_follows') IS NOT NULL THEN
    ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS user_follows_public_read ON public.user_follows;
    CREATE POLICY user_follows_public_read ON public.user_follows
      FOR SELECT TO public USING (true);
    DROP POLICY IF EXISTS user_follows_owner_write ON public.user_follows;
    CREATE POLICY user_follows_owner_write ON public.user_follows
      FOR ALL TO authenticated USING (auth.uid() = follower_id) WITH CHECK (auth.uid() = follower_id);
  END IF;
END $$;
