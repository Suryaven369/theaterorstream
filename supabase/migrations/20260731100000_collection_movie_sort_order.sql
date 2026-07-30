-- Custom drag order for collection titles (edit mode).

ALTER TABLE public.collection_movies
  ADD COLUMN IF NOT EXISTS sort_order integer;

COMMENT ON COLUMN public.collection_movies.sort_order IS
  'Manual display order when user_collections.items_sort = custom (0-based).';

CREATE INDEX IF NOT EXISTS idx_collection_movies_sort_order
  ON public.collection_movies (collection_id, sort_order ASC NULLS LAST);

-- Allow items_sort = custom (extends 20260731000000 check)
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
      'title_desc',
      'custom'
    )
  );

NOTIFY pgrst, 'reload schema';
