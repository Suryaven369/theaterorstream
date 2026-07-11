-- RSS-sourced news articles: admin manages source feeds, curates which
-- fetched articles go live on the public Home feed (mirrors showcase_trailers).

CREATE TABLE IF NOT EXISTS public.rss_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  feed_url text NOT NULL UNIQUE,
  site_url text,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  last_fetched_at timestamptz,
  last_fetch_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feed_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.rss_sources(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  source_logo_url text,
  guid text NOT NULL,
  title text NOT NULL,
  link text NOT NULL,
  author text,
  summary text,
  body_html text,
  image_url text,
  published_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, guid)
);

CREATE INDEX IF NOT EXISTS idx_feed_articles_status ON public.feed_articles (status);
CREATE INDEX IF NOT EXISTS idx_feed_articles_published_at ON public.feed_articles (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_articles_live ON public.feed_articles (status, is_active, published_at DESC);

ALTER TABLE public.rss_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_articles ENABLE ROW LEVEL SECURITY;

-- rss_sources is internal admin configuration — no public read needed.
CREATE POLICY "Admins read rss_sources" ON public.rss_sources
  FOR SELECT TO authenticated USING (public.is_admin_user());
CREATE POLICY "Admins insert rss_sources" ON public.rss_sources
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins update rss_sources" ON public.rss_sources
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins delete rss_sources" ON public.rss_sources
  FOR DELETE TO authenticated USING (public.is_admin_user());

-- feed_articles: public can read approved + active rows; admins can read everything
-- (including pending, for the review queue) and manage status/visibility.
CREATE POLICY "Public read live feed_articles" ON public.feed_articles
  FOR SELECT TO public USING (
    (status = 'approved' AND is_active = true) OR public.is_admin_user()
  );
CREATE POLICY "Admins insert feed_articles" ON public.feed_articles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins update feed_articles" ON public.feed_articles
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "Admins delete feed_articles" ON public.feed_articles
  FOR DELETE TO authenticated USING (public.is_admin_user());

-- Seed a starter set of well-known movie/TV news RSS feeds. Admin can add/remove
-- more from the Articles admin panel — this just avoids an empty list on first load.
INSERT INTO public.rss_sources (name, feed_url, site_url) VALUES
  ('Variety', 'https://variety.com/v/film/feed/', 'https://variety.com'),
  ('Deadline', 'https://deadline.com/feed/', 'https://deadline.com'),
  ('/Film', 'https://www.slashfilm.com/feed/', 'https://www.slashfilm.com'),
  ('ScreenRant', 'https://screenrant.com/feed/', 'https://screenrant.com'),
  ('Collider', 'https://collider.com/feed/', 'https://collider.com')
ON CONFLICT (feed_url) DO NOTHING;
