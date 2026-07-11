-- Official TheaterOrStream profile: blue verified badge + protected column.
-- Admins connect an existing user_profiles row via Admin → Settings → Profile Connect.
-- Only service_role can flip is_verified (same pattern as is_admin).

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.is_verified IS
  'Blue checkmark for the official TheaterOrStream account (set only via admin Profile Connect).';

CREATE INDEX IF NOT EXISTS idx_user_profiles_is_verified
  ON public.user_profiles (id)
  WHERE is_verified = true;

-- Extend privileged-column protectors to include is_verified.
CREATE OR REPLACE FUNCTION public.protect_user_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF coalesce(jwt_role, '') <> 'service_role' THEN
    NEW.is_admin := OLD.is_admin;
    NEW.is_verified := OLD.is_verified;
    NEW.id := OLD.id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_user_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF coalesce(jwt_role, '') <> 'service_role' THEN
    NEW.is_admin := false;
    NEW.is_verified := false;
  END IF;
  RETURN NEW;
END;
$$;

-- Seed app_settings key for official profile linkage (admin-managed).
INSERT INTO public.app_settings (key, value)
VALUES (
  'official_profile',
  jsonb_build_object(
    'userId', null,
    'username', null,
    'displayName', null,
    'connectedAt', null
  )
)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
