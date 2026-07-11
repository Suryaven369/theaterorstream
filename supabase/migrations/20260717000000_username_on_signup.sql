-- Assign username on signup when possible (same value as display handle).
-- Leaves username NULL if the derived handle is invalid or already taken.

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
  derived_username text;
BEGIN
  derived_name := coalesce(
    meta ->> 'full_name',
    meta ->> 'name',
    nullif(split_part(coalesce(NEW.email, ''), '@', 1), '')
  );
  derived_avatar := coalesce(meta ->> 'avatar_url', meta ->> 'picture');

  derived_username := lower(regexp_replace(coalesce(derived_name, ''), '[^a-zA-Z0-9_]', '', 'g'));
  derived_username := left(derived_username, 30);

  IF derived_username IS NULL OR length(derived_username) < 3 THEN
    derived_username := NULL;
  ELSIF EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE username IS NOT NULL AND lower(username) = derived_username
  ) THEN
    derived_username := NULL;
  END IF;

  INSERT INTO public.user_profiles (id, phone, display_name, avatar_url, username)
  VALUES (
    NEW.id,
    NEW.phone,
    coalesce(derived_username, derived_name),
    derived_avatar,
    derived_username
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
