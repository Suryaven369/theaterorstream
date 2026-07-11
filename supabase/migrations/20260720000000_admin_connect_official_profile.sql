-- Allow admins (not only service_role) to set is_verified for Profile Connect.
-- Also provide an RPC so the admin UI can connect without /api/admin auth issues.

CREATE OR REPLACE FUNCTION public.protect_user_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  -- Service role can change anything privileged
  IF coalesce(jwt_role, '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Never allow clients to change these
  NEW.is_admin := OLD.is_admin;
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;

  -- is_verified: admins may flip it (Profile Connect); everyone else locked
  IF NOT public.is_admin_user() THEN
    NEW.is_verified := OLD.is_verified;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_connect_official_profile(
  p_username text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_disconnect boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.user_profiles%ROWTYPE;
  payload jsonb;
  uname text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_disconnect THEN
    UPDATE public.user_profiles
    SET is_verified = false
    WHERE is_verified = true;

    payload := jsonb_build_object(
      'userId', null,
      'username', null,
      'displayName', null,
      'avatarUrl', null,
      'connectedAt', null
    );

    INSERT INTO public.app_settings (key, value, updated_by, updated_at)
    VALUES ('official_profile', payload, auth.uid(), now())
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_by = EXCLUDED.updated_by,
          updated_at = EXCLUDED.updated_at;

    RETURN jsonb_build_object('ok', true, 'connected', false);
  END IF;

  uname := nullif(lower(regexp_replace(coalesce(p_username, ''), '^@', '')), '');

  IF p_user_id IS NULL AND uname IS NULL THEN
    RAISE EXCEPTION 'username or userId is required' USING ERRCODE = '22023';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT * INTO target FROM public.user_profiles WHERE id = p_user_id;
  ELSE
    SELECT * INTO target
    FROM public.user_profiles
    WHERE lower(username) = uname
    LIMIT 1;
  END IF;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found. Create the account first, then connect it.'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.user_profiles
  SET is_verified = false
  WHERE is_verified = true
    AND id <> target.id;

  UPDATE public.user_profiles
  SET is_verified = true
  WHERE id = target.id;

  payload := jsonb_build_object(
    'userId', target.id,
    'username', target.username,
    'displayName', coalesce(target.display_name, target.username),
    'avatarUrl', target.avatar_url,
    'connectedAt', now()
  );

  INSERT INTO public.app_settings (key, value, updated_by, updated_at)
  VALUES ('official_profile', payload, auth.uid(), now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object('ok', true, 'connected', true, 'profile', payload);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_connect_official_profile(text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_connect_official_profile(text, uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
