-- Franchise lists: anyone can tag a collection; admin must approve before Explore → Franchise.
-- Collaborators (e.g. official account on approve) show as stacked avatars on the collection page.

ALTER TABLE public.user_collections
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_collections_moderation_status_check'
      AND conrelid = 'public.user_collections'::regclass
  ) THEN
    ALTER TABLE public.user_collections
      ADD CONSTRAINT user_collections_moderation_status_check
      CHECK (moderation_status IN ('none', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_collections_franchise_pending
  ON public.user_collections (created_at DESC)
  WHERE category = 'franchise' AND moderation_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_user_collections_franchise_approved
  ON public.user_collections (created_at DESC)
  WHERE category = 'franchise' AND moderation_status = 'approved' AND is_public = true;

-- Collaborators (owner is always user_collections.user_id; extras live here)
CREATE TABLE IF NOT EXISTS public.collection_collaborators (
  collection_id uuid NOT NULL REFERENCES public.user_collections (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'collaborator',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_collaborators_user
  ON public.collection_collaborators (user_id);

ALTER TABLE public.collection_collaborators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS collection_collaborators_read ON public.collection_collaborators;
CREATE POLICY collection_collaborators_read ON public.collection_collaborators
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_collections c
      WHERE c.id = collection_id
        AND (c.is_public = true OR c.user_id = auth.uid() OR public.is_admin_user())
    )
  );

DROP POLICY IF EXISTS collection_collaborators_owner_write ON public.collection_collaborators;
CREATE POLICY collection_collaborators_owner_write ON public.collection_collaborators
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_collections c
      WHERE c.id = collection_id AND c.user_id = auth.uid()
    )
    OR public.is_admin_user()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_collections c
      WHERE c.id = collection_id AND c.user_id = auth.uid()
    )
    OR public.is_admin_user()
  );

-- Anyone (owner) may create franchise-tagged lists; only admins approve.
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

  IF NEW.moderation_status IS NULL OR NEW.moderation_status NOT IN ('none', 'pending', 'approved', 'rejected') THEN
    NEW.moderation_status := 'none';
  END IF;

  -- Franchise tag ⇒ pending until an admin approves (unless admin is writing).
  IF NEW.category = 'franchise' THEN
    IF TG_OP = 'INSERT' THEN
      IF public.is_admin_user() AND NEW.moderation_status = 'approved' THEN
        NULL; -- allow admin seed/approve on insert
      ELSE
        NEW.moderation_status := 'pending';
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.category IS DISTINCT FROM 'franchise' THEN
        -- Newly tagged as franchise → back to pending
        IF NOT public.is_admin_user() THEN
          NEW.moderation_status := 'pending';
        END IF;
      END IF;
    END IF;
  ELSE
    -- Leaving franchise
    IF TG_OP = 'UPDATE' AND OLD.category = 'franchise' AND NEW.category = 'list' THEN
      NEW.moderation_status := 'none';
    END IF;
  END IF;

  -- Only admins may set approved / rejected
  IF TG_OP = 'UPDATE'
     AND NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
     AND NEW.moderation_status IN ('approved', 'rejected')
     AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Only admins can approve or reject collections'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_collection_category ON public.user_collections;
CREATE TRIGGER trg_enforce_collection_category
  BEFORE INSERT OR UPDATE ON public.user_collections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_collection_category();

-- Drop admin-only "create as official" insert policy from prior migration (users own their lists).
DROP POLICY IF EXISTS user_collections_admin_franchise_insert ON public.user_collections;

-- Admins can update any franchise list (approve / reject / edit moderation).
DROP POLICY IF EXISTS user_collections_admin_franchise_update ON public.user_collections;
CREATE POLICY user_collections_admin_franchise_update ON public.user_collections
  FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS user_collections_admin_franchise_delete ON public.user_collections;
CREATE POLICY user_collections_admin_franchise_delete ON public.user_collections
  FOR DELETE TO authenticated
  USING (public.is_admin_user() AND category = 'franchise');

-- Approve a franchise list and attach the official account as collaborator.
CREATE OR REPLACE FUNCTION public.admin_set_collection_moderation(
  p_collection_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_official uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('approved', 'rejected', 'pending') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.user_collections
  SET
    moderation_status = p_status,
    category = 'franchise',
    tags = CASE
      WHEN tags IS NULL OR NOT ('franchise' = ANY (tags))
        THEN array_append(coalesce(tags, '{}'::text[]), 'franchise')
      ELSE tags
    END,
    updated_at = now()
  WHERE id = p_collection_id
    AND (
      category = 'franchise'
      OR (tags IS NOT NULL AND 'franchise' = ANY (tags))
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Franchise collection not found';
  END IF;

  IF p_status = 'approved' THEN
    SELECT id INTO v_official
    FROM public.user_profiles
    WHERE is_verified = true
    LIMIT 1;

    IF v_official IS NOT NULL THEN
      INSERT INTO public.collection_collaborators (collection_id, user_id, role)
      VALUES (p_collection_id, v_official, 'official')
      ON CONFLICT (collection_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_collection_moderation(uuid, text) TO authenticated;

-- Optional: drop old admin-create RPC (replaced by user create + moderation)
DROP FUNCTION IF EXISTS public.admin_create_franchise_collection(text, text);

NOTIFY pgrst, 'reload schema';
