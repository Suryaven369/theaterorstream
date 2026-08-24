-- Watch Party / Marathon mode on user collections (invite-link join + per-title progress).

ALTER TABLE public.user_collections
  ADD COLUMN IF NOT EXISTS is_watch_party boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_collections.is_watch_party IS
  'When true, list acts as a watch party: members join and mark titles watched.';

CREATE TABLE IF NOT EXISTS public.collection_party_members (
  collection_id uuid NOT NULL REFERENCES public.user_collections (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_party_members_user
  ON public.collection_party_members (user_id);

CREATE TABLE IF NOT EXISTS public.collection_party_watched (
  collection_id uuid NOT NULL REFERENCES public.user_collections (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  movie_id text NOT NULL,
  watched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, user_id, movie_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_party_watched_collection_movie
  ON public.collection_party_watched (collection_id, movie_id);

-- ---------------------------------------------------------------------------
-- RLS: private watch parties readable via invite link; members can join/mark
-- ---------------------------------------------------------------------------

ALTER TABLE public.collection_party_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_party_watched ENABLE ROW LEVEL SECURITY;

-- Broaden collection SELECT: parties visible by link (incl. anon for CTA)
DROP POLICY IF EXISTS user_collections_read ON public.user_collections;
CREATE POLICY user_collections_read ON public.user_collections
  FOR SELECT USING (
    is_public = true
    OR auth.uid() = user_id
    OR is_watch_party = true
  );

DROP POLICY IF EXISTS collection_movies_read ON public.collection_movies;
CREATE POLICY collection_movies_read ON public.collection_movies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_collections c
      WHERE c.id = collection_movies.collection_id
        AND (
          c.is_public = true
          OR c.user_id = auth.uid()
          OR c.is_watch_party = true
        )
    )
  );

DROP POLICY IF EXISTS collection_party_members_read ON public.collection_party_members;
CREATE POLICY collection_party_members_read ON public.collection_party_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_collections c
      WHERE c.id = collection_party_members.collection_id
        AND (
          c.is_public = true
          OR c.user_id = auth.uid()
          OR c.is_watch_party = true
        )
    )
  );

DROP POLICY IF EXISTS collection_party_members_insert ON public.collection_party_members;
CREATE POLICY collection_party_members_insert ON public.collection_party_members
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.user_collections c
      WHERE c.id = collection_id
        AND c.is_watch_party = true
        AND c.is_system IS DISTINCT FROM true
    )
  );

DROP POLICY IF EXISTS collection_party_members_delete ON public.collection_party_members;
CREATE POLICY collection_party_members_delete ON public.collection_party_members
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.user_collections c
      WHERE c.id = collection_id
        AND c.user_id IS DISTINCT FROM auth.uid()
    )
  );

DROP POLICY IF EXISTS collection_party_watched_read ON public.collection_party_watched;
CREATE POLICY collection_party_watched_read ON public.collection_party_watched
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_collections c
      WHERE c.id = collection_party_watched.collection_id
        AND (
          c.is_public = true
          OR c.user_id = auth.uid()
          OR c.is_watch_party = true
        )
    )
  );

DROP POLICY IF EXISTS collection_party_watched_write ON public.collection_party_watched;
CREATE POLICY collection_party_watched_write ON public.collection_party_watched
  FOR ALL TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.collection_party_members m
      WHERE m.collection_id = collection_party_watched.collection_id
        AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.collection_party_members m
      WHERE m.collection_id = collection_party_watched.collection_id
        AND m.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
