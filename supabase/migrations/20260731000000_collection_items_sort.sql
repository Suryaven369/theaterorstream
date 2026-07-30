-- Per-list movie sort preference (edit mode → Save).
-- Values: added_desc | added_asc | release_desc | release_asc | title_asc | title_desc

ALTER TABLE public.user_collections
  ADD COLUMN IF NOT EXISTS items_sort text;

COMMENT ON COLUMN public.user_collections.items_sort IS
  'How collection_movies are ordered: added_desc, added_asc, release_desc, release_asc, title_asc, title_desc';

ALTER TABLE public.user_collections
  DROP CONSTRAINT IF EXISTS user_collections_items_sort_check;

ALTER TABLE public.user_collections
  ADD CONSTRAINT user_collections_items_sort_check
  CHECK (
    items_sort IS NULL
    OR items_sort IN (
      'added_desc',
      'added_asc',
      'release_desc',
      'release_asc',
      'title_asc',
      'title_desc'
    )
  );

NOTIFY pgrst, 'reload schema';
