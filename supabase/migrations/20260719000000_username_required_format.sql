-- Username is required: letters, numbers, underscore only (3–30 chars). No NULL / empty / special chars.

-- 1) Clean any existing usernames that contain invalid characters
UPDATE public.user_profiles
SET username = lower(left(regexp_replace(coalesce(username, ''), '[^a-zA-Z0-9_]', '', 'g'), 30))
WHERE username IS NOT NULL
  AND username !~ '^[a-z0-9_]{3,30}$';

-- Empty after clean → treat as missing
UPDATE public.user_profiles
SET username = NULL
WHERE username IS NOT NULL
  AND (btrim(username) = '' OR length(username) < 3);

-- 2) Backfill still-missing usernames from display_name (same rules)
WITH candidates AS (
  SELECT
    id,
    lower(
      left(
        regexp_replace(coalesce(display_name, ''), '[^a-zA-Z0-9_]', '', 'g'),
        30
      )
    ) AS suggested
  FROM public.user_profiles
  WHERE username IS NULL
),
eligible AS (
  SELECT DISTINCT ON (c.suggested)
    c.id,
    c.suggested
  FROM candidates c
  WHERE length(c.suggested) >= 3
    AND NOT EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.username IS NOT NULL
        AND lower(p.username) = c.suggested
        AND p.id <> c.id
    )
  ORDER BY c.suggested, c.id::text
)
UPDATE public.user_profiles AS up
SET
  username = e.suggested,
  display_name = coalesce(nullif(btrim(up.display_name), ''), e.suggested),
  updated_at = now()
FROM eligible e
WHERE up.id = e.id;

-- 3) Last resort: unique user_<hex> so NOT NULL can be applied
UPDATE public.user_profiles
SET
  username = 'user_' || substr(replace(id::text, '-', ''), 1, 12),
  display_name = coalesce(nullif(btrim(display_name), ''), 'user_' || substr(replace(id::text, '-', ''), 1, 12)),
  updated_at = now()
WHERE username IS NULL
   OR btrim(username) = ''
   OR length(username) < 3;

-- Resolve any remaining duplicates on the fallback pattern (extremely rare)
DO $$
DECLARE
  r record;
  candidate text;
  n int;
BEGIN
  FOR r IN
    SELECT id, username
    FROM public.user_profiles
    WHERE username IS NOT NULL
    ORDER BY created_at NULLS LAST, id
  LOOP
    candidate := lower(r.username);
    n := 0;
    WHILE EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE lower(p.username) = candidate AND p.id <> r.id
    ) LOOP
      n := n + 1;
      candidate := left(lower(r.username), 24) || '_' || n::text;
    END LOOP;
    IF candidate <> lower(r.username) THEN
      UPDATE public.user_profiles
      SET username = candidate, updated_at = now()
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- 4) Enforce format + NOT NULL
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_username_format_chk;

ALTER TABLE public.user_profiles
  ALTER COLUMN username SET NOT NULL;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_username_format_chk
  CHECK (username ~ '^[a-z0-9_]{3,30}$');

-- 5) Full unique index (no NULL path anymore)
DROP INDEX IF EXISTS idx_user_profiles_username_lower;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username_lower
  ON public.user_profiles (lower(username));

-- 6) Signup trigger: always assign a valid username (never NULL)
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
  base text;
  candidate text;
  n int := 0;
BEGIN
  derived_name := coalesce(
    meta ->> 'full_name',
    meta ->> 'name',
    nullif(split_part(coalesce(NEW.email, ''), '@', 1), '')
  );
  derived_avatar := coalesce(meta ->> 'avatar_url', meta ->> 'picture');

  base := lower(regexp_replace(coalesce(derived_name, ''), '[^a-zA-Z0-9_]', '', 'g'));
  base := left(base, 30);
  IF base IS NULL OR length(base) < 3 THEN
    base := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 12);
  END IF;

  candidate := base;
  WHILE EXISTS (
    SELECT 1 FROM public.user_profiles WHERE lower(username) = candidate
  ) LOOP
    n := n + 1;
    candidate := left(base, 24) || '_' || n::text;
  END LOOP;
  derived_username := candidate;

  INSERT INTO public.user_profiles (id, phone, display_name, avatar_url, username)
  VALUES (
    NEW.id,
    NEW.phone,
    derived_username,
    derived_avatar,
    derived_username
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
