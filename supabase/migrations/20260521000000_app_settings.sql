-- App settings (admin control tower — persist config in DB, not localStorage)

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.app_settings IS
  'Site-wide admin settings (keyed JSON documents).';

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage app_settings" ON public.app_settings;

CREATE POLICY "Admins manage app_settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

INSERT INTO public.app_settings (key, value) VALUES
  ('site', '{
    "siteName": "TheaterOrStream",
    "siteDescription": "Discover what to watch and where to stream it",
    "defaultRegion": "IN",
    "maxSectionsHome": 10,
    "cacheTimeout": 3600,
    "enableReviews": true,
    "enableRatings": true,
    "enableWatchlist": true,
    "enableCollections": true
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

DROP TRIGGER IF EXISTS app_settings_set_updated_at ON public.app_settings;
CREATE TRIGGER app_settings_set_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
