-- Fix public storage URLs that were saved via the Vite DEV /supabase-proxy client.
-- Local uploads called getPublicUrl() against http://localhost:5173/supabase-proxy,
-- so avatar/banner/cover URLs broke on production.
--
-- Project URL must match VITE_SUPABASE_URL (TheaterOrStream production).

DO $$
DECLARE
  supabase_base text := 'https://kfdeyggjsmltnmszhtfk.supabase.co';
BEGIN
  UPDATE public.user_profiles
  SET avatar_url = regexp_replace(avatar_url, 'https?://[^/]+/supabase-proxy', supabase_base)
  WHERE avatar_url ~* 'https?://[^/]+/supabase-proxy/storage/';

  UPDATE public.user_profiles
  SET profile_header_url = regexp_replace(profile_header_url, 'https?://[^/]+/supabase-proxy', supabase_base)
  WHERE profile_header_url ~* 'https?://[^/]+/supabase-proxy/storage/';

  UPDATE public.feed_posts
  SET image_url = regexp_replace(image_url, 'https?://[^/]+/supabase-proxy', supabase_base)
  WHERE image_url ~* 'https?://[^/]+/supabase-proxy/storage/';

  IF to_regclass('public.user_collections') IS NOT NULL THEN
    UPDATE public.user_collections
    SET cover_image = regexp_replace(cover_image, 'https?://[^/]+/supabase-proxy', supabase_base)
    WHERE cover_image ~* 'https?://[^/]+/supabase-proxy/storage/';

    BEGIN
      UPDATE public.user_collections
      SET banner_image = regexp_replace(banner_image, 'https?://[^/]+/supabase-proxy', supabase_base)
      WHERE banner_image ~* 'https?://[^/]+/supabase-proxy/storage/';
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
  END IF;

  IF to_regclass('public.movie_boards') IS NOT NULL THEN
    UPDATE public.movie_boards
    SET cover_image = regexp_replace(cover_image, 'https?://[^/]+/supabase-proxy', supabase_base)
    WHERE cover_image ~* 'https?://[^/]+/supabase-proxy/storage/';

    BEGIN
      UPDATE public.movie_boards
      SET banner_image = regexp_replace(banner_image, 'https?://[^/]+/supabase-proxy', supabase_base)
      WHERE banner_image ~* 'https?://[^/]+/supabase-proxy/storage/';
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
  END IF;

  IF to_regclass('public.blog_posts') IS NOT NULL THEN
    UPDATE public.blog_posts
    SET cover_image = regexp_replace(cover_image, 'https?://[^/]+/supabase-proxy', supabase_base)
    WHERE cover_image ~* 'https?://[^/]+/supabase-proxy/storage/';
  END IF;
END $$;
