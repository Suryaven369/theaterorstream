-- Backfill username from display_name for existing accounts that never got a handle.
-- Example: display_name "TheaterorStream" → username "theaterorstream"

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
  WHERE (username IS NULL OR btrim(username) = '')
    AND display_name IS NOT NULL
    AND btrim(display_name) <> ''
),
eligible AS (
  -- One row per suggested handle (lowest uuid text wins if collisions)
  SELECT DISTINCT ON (c.suggested)
    c.id,
    c.suggested
  FROM candidates c
  WHERE length(c.suggested) >= 3
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_profiles p
      WHERE p.username IS NOT NULL
        AND lower(p.username) = c.suggested
        AND p.id <> c.id
    )
  ORDER BY c.suggested, c.id::text
)
UPDATE public.user_profiles AS up
SET
  username = e.suggested,
  display_name = e.suggested,
  updated_at = now()
FROM eligible e
WHERE up.id = e.id;

NOTIFY pgrst, 'reload schema';
