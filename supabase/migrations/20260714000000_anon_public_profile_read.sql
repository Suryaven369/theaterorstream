-- =============================================================================
-- Guest / anon public profile reads
--
-- Several "Public read …" policies were created as TO authenticated only, so
-- signed-out visitors could find a user in search but saw an empty profile
-- shell (0 films, no reviews, no activity, no badges) when opening /:user/profile.
--
-- Re-create SELECT policies for anon + authenticated on content that profiles
-- already expose publicly. Writes stay owner-only / authenticated.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Social reviews + engagement (profile "Recent Reviews")
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.social_reviews') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public read social reviews" ON public.social_reviews;
    CREATE POLICY "Public read social reviews" ON public.social_reviews
      FOR SELECT TO anon, authenticated
      USING (visibility = 'public' OR auth.uid() = user_id);
  END IF;

  IF to_regclass('public.review_comments') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Read review comments" ON public.review_comments;
    CREATE POLICY "Read review comments" ON public.review_comments
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.review_likes') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Read review likes" ON public.review_likes;
    CREATE POLICY "Read review likes" ON public.review_likes
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Feed posts + engagement (home feed + profile posts)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.feed_posts') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public read feed posts" ON public.feed_posts;
    CREATE POLICY "Public read feed posts" ON public.feed_posts
      FOR SELECT TO anon, authenticated
      USING (visibility = 'public' OR auth.uid() = user_id);
  END IF;

  IF to_regclass('public.post_likes') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Read post likes" ON public.post_likes;
    CREATE POLICY "Read post likes" ON public.post_likes
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.post_comments') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Read post comments" ON public.post_comments;
    CREATE POLICY "Read post comments" ON public.post_comments
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Diary / activity / badges (profile Activity + Diary + Achievements)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.activity_feed') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Read public activity" ON public.activity_feed;
    CREATE POLICY "Read public activity" ON public.activity_feed
      FOR SELECT TO anon, authenticated
      USING (visibility = 'public' OR auth.uid() = user_id);
  END IF;

  IF to_regclass('public.movie_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Read public movie logs" ON public.movie_logs;
    CREATE POLICY "Read public movie logs" ON public.movie_logs
      FOR SELECT TO anon, authenticated
      USING (visibility = 'public' OR auth.uid() = user_id);
  END IF;

  IF to_regclass('public.user_badges') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users read all earned badges" ON public.user_badges;
    CREATE POLICY "Users read all earned badges" ON public.user_badges
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.badge_definitions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public read badge definitions" ON public.badge_definitions;
    CREATE POLICY "Public read badge definitions" ON public.badge_definitions
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Blogs (profile Blogs tab) — ensure anon can read public posts
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.blog_posts') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public read blog posts" ON public.blog_posts;
    CREATE POLICY "Public read blog posts" ON public.blog_posts
      FOR SELECT TO anon, authenticated
      USING (visibility = 'public' OR auth.uid() = user_id);
  END IF;

  IF to_regclass('public.blog_likes') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Read blog likes" ON public.blog_likes;
    CREATE POLICY "Read blog likes" ON public.blog_likes
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Library tables used for profile stats (films / watchlist / likes / follows)
-- Re-assert public SELECT in case an older env never got user_data_maintenance.
-- Collections stay public-OR-owner (private lists stay private).
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'user_watched_movies', 'user_liked_movies', 'user_watchlist'
  ])
  LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_public_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
      t||'_public_read', t
    );
  END LOOP;

  IF to_regclass('public.user_follows') IS NOT NULL THEN
    DROP POLICY IF EXISTS user_follows_public_read ON public.user_follows;
    CREATE POLICY user_follows_public_read ON public.user_follows
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS user_profiles_public_read ON public.user_profiles;
    DROP POLICY IF EXISTS "Profiles are publicly readable" ON public.user_profiles;
    CREATE POLICY "Profiles are publicly readable" ON public.user_profiles
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF to_regclass('public.user_collections') IS NOT NULL THEN
    DROP POLICY IF EXISTS user_collections_read ON public.user_collections;
    CREATE POLICY user_collections_read ON public.user_collections
      FOR SELECT TO anon, authenticated
      USING (is_public = true OR auth.uid() = user_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
