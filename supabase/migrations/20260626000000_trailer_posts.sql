-- Clean, ready-to-display trailer posts. When a YouTube trailer is verified
-- against TMDB during RSS ingestion, the CLEAN post (TMDB title/poster + the
-- trailer video) is persisted here. The public Home feed reads ONLY this table —
-- never the raw RSS entry, never a live TMDB API call. One post per title
-- (newest trailer wins).

CREATE TABLE IF NOT EXISTS public.trailer_posts (
  tmdb_id       text NOT NULL,
  media_type    text NOT NULL DEFAULT 'movie',
  title         text NOT NULL,
  poster_path   text,
  backdrop_path text,
  release_date  text,
  overview      text,
  vote_average  numeric,
  youtube_key   text,
  trailer_name  text,
  trailer_type  text,
  trailer_url   text,
  source_name   text,
  published_at  timestamptz,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (media_type, tmdb_id)
);

ALTER TABLE public.trailer_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read trailer_posts" ON public.trailer_posts;
CREATE POLICY "Public read trailer_posts" ON public.trailer_posts
  FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage trailer_posts" ON public.trailer_posts;
CREATE POLICY "Admins manage trailer_posts" ON public.trailer_posts
  FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE INDEX IF NOT EXISTS idx_trailer_posts_published
  ON public.trailer_posts (published_at DESC) WHERE is_active = true;

NOTIFY pgrst, 'reload schema';
