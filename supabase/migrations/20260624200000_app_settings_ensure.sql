-- Ensure app_settings exists (key-value JSON store used by admin settings,
-- the control tower, and the global RSS keyword filters). Idempotent — safe to
-- run even if an earlier app_settings migration already created it.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage app_settings" ON public.app_settings;
CREATE POLICY "Admins manage app_settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP TRIGGER IF EXISTS app_settings_set_updated_at ON public.app_settings;
CREATE TRIGGER app_settings_set_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed the global RSS keyword filters so the Trailers space works out of the box.
INSERT INTO public.app_settings (key, value) VALUES
  ('rss_filters', '{
    "trailer": { "include": ["trailer", "teaser"], "exclude": [] },
    "article": { "include": [], "exclude": [] }
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Tell PostgREST to refresh its schema cache so the new table is queryable
-- immediately (avoids the "table not found in schema cache" error).
NOTIFY pgrst, 'reload schema';
