-- =============================================
-- TheaterOrStream — Admin-curated "Showcase Trailers"
--
-- Lets an admin pick which trailers (sourced from movies_library.videos via the
-- /api/content/trailers candidate browser) actually appear on the Home feed.
-- The public read path only ever queries this table — never TMDB/the heavy
-- full-library trailer scan — so homepage loads stay fast.
-- =============================================

CREATE TABLE IF NOT EXISTS public.showcase_trailers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id text NOT NULL,
  media_type text NOT NULL DEFAULT 'movie',
  title text NOT NULL,
  poster_path text,
  backdrop_path text,
  release_date date,
  trailer_key text NOT NULL,
  trailer_name text,
  trailer_published_at timestamptz,
  youtube_url text,
  thumbnail_url text,
  thumbnail_fallback_url text,
  category text NOT NULL DEFAULT 'latest' CHECK (category IN ('latest', 'popular', 'trending')),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tmdb_id, trailer_key)
);

CREATE INDEX IF NOT EXISTS idx_showcase_trailers_display_order ON public.showcase_trailers (display_order);
CREATE INDEX IF NOT EXISTS idx_showcase_trailers_active ON public.showcase_trailers (is_active);
CREATE INDEX IF NOT EXISTS idx_showcase_trailers_category ON public.showcase_trailers (category);

ALTER TABLE public.showcase_trailers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active showcase_trailers" ON public.showcase_trailers
  FOR SELECT TO public USING (is_active = true OR public.is_admin_user());

CREATE POLICY "Admins insert showcase_trailers" ON public.showcase_trailers
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins update showcase_trailers" ON public.showcase_trailers
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins delete showcase_trailers" ON public.showcase_trailers
  FOR DELETE TO authenticated USING (public.is_admin_user());
