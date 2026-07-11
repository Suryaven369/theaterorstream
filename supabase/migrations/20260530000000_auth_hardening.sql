-- =============================================================================
-- Auth hardening
-- 1. Stop privilege escalation: a logged-in user could previously run
--    `update user_profiles set is_admin = true where id = <self>` from the browser
--    because the UPDATE policy only checked row ownership, not which columns changed.
-- 2. Make RLS policies explicit (USING + WITH CHECK) so a user can only ever
--    read/write their own row, and can never re-point a row's id to someone else.
-- 3. Auto-populate new profiles (incl. Google OAuth) with name/avatar from the
--    auth provider metadata.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Column-level write protection (the real "can someone hack it" fix)
--    Triggers run for everyone EXCEPT they let the service_role through, so the
--    admin API (service key) can still flip is_admin, but no end-user JWT can.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_user_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  -- service_role (server-side, service key) is the only caller allowed to change
  -- these columns. auth.role() / the jwt role claim is 'authenticated' for users.
  IF coalesce(jwt_role, '') <> 'service_role' THEN
    NEW.is_admin := OLD.is_admin;
    NEW.id := OLD.id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_profile_columns ON public.user_profiles;
CREATE TRIGGER trg_protect_user_profile_columns
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_profile_privileged_columns();

-- Also block a user from inserting a row that pre-sets is_admin = true.
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_profile_insert ON public.user_profiles;
CREATE TRIGGER trg_protect_user_profile_insert
  BEFORE INSERT ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_profile_insert();

-- ---------------------------------------------------------------------------
-- 2. Explicit, hardened RLS policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Profiles are publicly readable (usernames/avatars are shown across the app).
-- is_admin being visible is fine; it can no longer be *written* by users.
DROP POLICY IF EXISTS "Public profiles are viewable" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Profiles are publicly readable" ON public.user_profiles
  FOR SELECT
  USING (true);

-- A user may only insert their OWN row (id must equal their uid).
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users insert own profile" ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- A user may only update their OWN row, and the row must STILL be theirs after
-- the update (WITH CHECK) — prevents re-assigning a row to another user.
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users update own profile" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- No client-side DELETE of profiles (cascade from auth.users handles account deletion).
DROP POLICY IF EXISTS "Users can delete own profile" ON public.user_profiles;

-- ---------------------------------------------------------------------------
-- 3. Enrich new profiles from auth metadata (email signup + Google OAuth)
--    raw_user_meta_data carries Google's full_name / name / avatar_url / picture.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  derived_name text;
  derived_avatar text;
BEGIN
  derived_name := coalesce(
    meta ->> 'full_name',
    meta ->> 'name',
    nullif(split_part(coalesce(NEW.email, ''), '@', 1), '')
  );
  derived_avatar := coalesce(meta ->> 'avatar_url', meta ->> 'picture');

  INSERT INTO public.user_profiles (id, phone, display_name, avatar_url)
  VALUES (NEW.id, NEW.phone, derived_name, derived_avatar)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
