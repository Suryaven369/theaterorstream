-- Explore collection categories: regular user lists vs admin Franchise lists
-- (owned by the connected official / verified profile).

ALTER TABLE public.user_collections
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'list';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_collections_category_check'
      AND conrelid = 'public.user_collections'::regclass
  ) THEN
    ALTER TABLE public.user_collections
      ADD CONSTRAINT user_collections_category_check
      CHECK (category IN ('list', 'franchise'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_collections_category_public
  ON public.user_collections (category, created_at DESC)
  WHERE is_public = true;

-- Only admins may create or re-categorize Franchise lists.
CREATE OR REPLACE FUNCTION public.enforce_collection_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.category IS NULL OR NEW.category NOT IN ('list', 'franchise') THEN
    NEW.category := 'list';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.category = 'franchise' AND NOT public.is_admin_user() THEN
      RAISE EXCEPTION 'Only admins can create franchise collections'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.category IS DISTINCT FROM OLD.category AND NOT public.is_admin_user() THEN
      RAISE EXCEPTION 'Only admins can change collection category'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_collection_category ON public.user_collections;
CREATE TRIGGER trg_enforce_collection_category
  BEFORE INSERT OR UPDATE ON public.user_collections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_collection_category();

-- Admins manage Franchise lists as the official verified account.
DROP POLICY IF EXISTS user_collections_admin_franchise_insert ON public.user_collections;
CREATE POLICY user_collections_admin_franchise_insert ON public.user_collections
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_user()
    AND category = 'franchise'
    AND user_id = (SELECT id FROM public.user_profiles WHERE is_verified = true LIMIT 1)
  );

DROP POLICY IF EXISTS user_collections_admin_franchise_update ON public.user_collections;
CREATE POLICY user_collections_admin_franchise_update ON public.user_collections
  FOR UPDATE TO authenticated
  USING (public.is_admin_user() AND category = 'franchise')
  WITH CHECK (public.is_admin_user() AND category = 'franchise');

DROP POLICY IF EXISTS user_collections_admin_franchise_delete ON public.user_collections;
CREATE POLICY user_collections_admin_franchise_delete ON public.user_collections
  FOR DELETE TO authenticated
  USING (public.is_admin_user() AND category = 'franchise');

-- Admins can add/remove titles on Franchise lists (even when not the owner session).
DROP POLICY IF EXISTS collection_movies_admin_franchise_insert ON public.collection_movies;
CREATE POLICY collection_movies_admin_franchise_insert ON public.collection_movies
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_user()
    AND EXISTS (
      SELECT 1 FROM public.user_collections c
      WHERE c.id = collection_id AND c.category = 'franchise'
    )
  );

DROP POLICY IF EXISTS collection_movies_admin_franchise_update ON public.collection_movies;
CREATE POLICY collection_movies_admin_franchise_update ON public.collection_movies
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_user()
    AND EXISTS (
      SELECT 1 FROM public.user_collections c
      WHERE c.id = collection_id AND c.category = 'franchise'
    )
  )
  WITH CHECK (
    public.is_admin_user()
    AND EXISTS (
      SELECT 1 FROM public.user_collections c
      WHERE c.id = collection_id AND c.category = 'franchise'
    )
  );

DROP POLICY IF EXISTS collection_movies_admin_franchise_delete ON public.collection_movies;
CREATE POLICY collection_movies_admin_franchise_delete ON public.collection_movies
  FOR DELETE TO authenticated
  USING (
    public.is_admin_user()
    AND EXISTS (
      SELECT 1 FROM public.user_collections c
      WHERE c.id = collection_id AND c.category = 'franchise'
    )
  );

-- Convenience RPC: create a public Franchise list owned by the official profile.
CREATE OR REPLACE FUNCTION public.admin_create_franchise_collection(
  p_name text,
  p_description text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_official uuid;
  v_id uuid;
  v_name text := trim(both FROM coalesce(p_name, ''));
  v_desc text := trim(both FROM coalesce(p_description, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  SELECT id INTO v_official
  FROM public.user_profiles
  WHERE is_verified = true
  LIMIT 1;

  IF v_official IS NULL THEN
    RAISE EXCEPTION 'Connect an official account in Admin → Profile Connect first';
  END IF;

  INSERT INTO public.user_collections (
    user_id, name, description, is_public, category
  ) VALUES (
    v_official,
    left(v_name, 70),
    left(v_desc, 200),
    true,
    'franchise'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_franchise_collection(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
