-- Enforce unique usernames (case-insensitive). NULL usernames allowed until set.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username_lower
  ON public.user_profiles (lower(username))
  WHERE username IS NOT NULL AND btrim(username) <> '';

NOTIFY pgrst, 'reload schema';
