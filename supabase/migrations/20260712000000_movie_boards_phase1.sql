-- Movie Boards (standalone) — separate from user_collections / Lists
-- Boards are curated cinematic collections of movies, TV, directors, and actors.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Boards ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  description text DEFAULT '',
  cover_image text,
  banner_image text,
  is_public boolean NOT NULL DEFAULT true,
  show_notes boolean NOT NULL DEFAULT true,
  layout_mode text NOT NULL DEFAULT 'grid'
    CHECK (layout_mode IN ('grid', 'masonry', 'compact')),
  likes_count integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  followers_count integer NOT NULL DEFAULT 0,
  views_count integer NOT NULL DEFAULT 0,
  items_count integer NOT NULL DEFAULT 0,
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_boards_public_trending
  ON public.boards (likes_count DESC, updated_at DESC)
  WHERE is_public = true;

CREATE INDEX IF NOT EXISTS idx_boards_slug ON public.boards (slug) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_boards_user ON public.boards (user_id, updated_at DESC);

-- ── Items (movie | tv | director | actor) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.board_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('movie', 'tv', 'director', 'actor', 'still', 'image')),
  item_id text NOT NULL,                 -- tmdb id (movie/tv/person); stills use "movie:123:/path"; images use uuid
  title text NOT NULL,
  subtitle text,                         -- year, known_for, job, "Still", etc.
  image_path text,                       -- poster, profile, still, or uploaded URL
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  is_pinned boolean NOT NULL DEFAULT false,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_board_items_board
  ON public.board_items (board_id, is_pinned DESC, sort_order ASC);

-- ── Likes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.board_likes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, board_id)
);

CREATE OR REPLACE FUNCTION public.sync_board_likes_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.boards SET likes_count = (
    SELECT count(*)::int FROM public.board_likes WHERE board_id = coalesce(NEW.board_id, OLD.board_id)
  ) WHERE id = coalesce(NEW.board_id, OLD.board_id);
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_board_likes_count ON public.board_likes;
CREATE TRIGGER trg_board_likes_count
  AFTER INSERT OR DELETE ON public.board_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_board_likes_count();

-- ── Comments ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.board_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  parent_id uuid REFERENCES public.board_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_comments_board
  ON public.board_comments (board_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.sync_board_comments_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.boards SET comments_count = (
    SELECT count(*)::int FROM public.board_comments WHERE board_id = coalesce(NEW.board_id, OLD.board_id)
  ) WHERE id = coalesce(NEW.board_id, OLD.board_id);
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_board_comments_count ON public.board_comments;
CREATE TRIGGER trg_board_comments_count
  AFTER INSERT OR DELETE ON public.board_comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_board_comments_count();

-- ── Activity (for following feed + board timeline) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.board_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,              -- created | item_added | items_reordered | description_updated | cover_updated
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_activity_board
  ON public.board_activity (board_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_activity_created
  ON public.board_activity (created_at DESC);

-- ── Items count sync ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_board_items_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.boards
  SET items_count = (SELECT count(*)::int FROM public.board_items WHERE board_id = coalesce(NEW.board_id, OLD.board_id)),
      updated_at = now()
  WHERE id = coalesce(NEW.board_id, OLD.board_id);
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_board_items_count ON public.board_items;
CREATE TRIGGER trg_board_items_count
  AFTER INSERT OR DELETE ON public.board_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_board_items_count();

-- Drop legacy board helpers from the earlier collections-based draft
-- (parameter names / targets changed — CREATE OR REPLACE cannot rename args).
DROP TRIGGER IF EXISTS trg_sync_board_slug ON public.user_collections;
DROP TRIGGER IF EXISTS trg_board_followers_count ON public.entity_follows;
DROP FUNCTION IF EXISTS public.increment_board_views(uuid);
DROP FUNCTION IF EXISTS public.sync_board_followers_count();
DROP FUNCTION IF EXISTS public.sync_board_slug();
DROP FUNCTION IF EXISTS public.slugify_board_name(text);
DROP FUNCTION IF EXISTS public.slugify_board_title(text);

-- ── Slug helper ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.slugify_board_title(raw text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(both '-' FROM regexp_replace(
    regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9\s-]', '', 'g'),
    '\s+', '-', 'g'
  ));
$$;

CREATE OR REPLACE FUNCTION public.sync_board_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base text;
  candidate text;
  n int := 0;
BEGIN
  IF NEW.slug IS NOT NULL AND btrim(NEW.slug) <> '' AND (TG_OP = 'UPDATE' AND NEW.slug IS DISTINCT FROM OLD.slug) THEN
    NEW.slug := public.slugify_board_title(NEW.slug);
    IF NEW.slug = '' THEN NEW.slug := 'board'; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.title IS DISTINCT FROM OLD.title OR NEW.slug IS NULL OR btrim(NEW.slug) = '' THEN
    base := public.slugify_board_title(NEW.title);
    IF base IS NULL OR base = '' THEN base := 'board'; END IF;
    candidate := base;
    WHILE EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.user_id = NEW.user_id AND b.slug = candidate AND b.id IS DISTINCT FROM NEW.id
    ) LOOP
      n := n + 1;
      candidate := base || '-' || n::text;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_board_slug ON public.boards;
CREATE TRIGGER trg_sync_board_slug
  BEFORE INSERT OR UPDATE OF title, slug ON public.boards
  FOR EACH ROW EXECUTE FUNCTION public.sync_board_slug();

CREATE OR REPLACE FUNCTION public.increment_board_views(p_board_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.boards
  SET views_count = coalesce(views_count, 0) + 1
  WHERE id = p_board_id AND is_public = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_board_views(uuid) TO anon, authenticated;

-- Followers via entity_follows target_type = 'board'
CREATE OR REPLACE FUNCTION public.sync_board_followers_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tid text;
  ttype text;
BEGIN
  ttype := coalesce(NEW.target_type, OLD.target_type);
  tid := coalesce(NEW.target_id, OLD.target_id);
  IF ttype <> 'board' THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  UPDATE public.boards
  SET followers_count = (
    SELECT count(*)::int FROM public.entity_follows
    WHERE target_type = 'board' AND target_id = tid
  )
  WHERE id::text = tid;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_board_followers_count ON public.entity_follows;
CREATE TRIGGER trg_board_followers_count
  AFTER INSERT OR DELETE ON public.entity_follows
  FOR EACH ROW EXECUTE FUNCTION public.sync_board_followers_count();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS boards_select ON public.boards;
CREATE POLICY boards_select ON public.boards
  FOR SELECT USING (is_public = true OR user_id = auth.uid());

DROP POLICY IF EXISTS boards_insert ON public.boards;
CREATE POLICY boards_insert ON public.boards
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS boards_update ON public.boards;
CREATE POLICY boards_update ON public.boards
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS boards_delete ON public.boards;
CREATE POLICY boards_delete ON public.boards
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS board_items_select ON public.board_items;
CREATE POLICY board_items_select ON public.board_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = board_items.board_id AND (b.is_public OR b.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS board_items_write ON public.board_items;
CREATE POLICY board_items_write ON public.board_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.boards b WHERE b.id = board_items.board_id AND b.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.boards b WHERE b.id = board_items.board_id AND b.user_id = auth.uid())
  );

DROP POLICY IF EXISTS board_likes_select ON public.board_likes;
CREATE POLICY board_likes_select ON public.board_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS board_likes_write ON public.board_likes;
CREATE POLICY board_likes_write ON public.board_likes
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS board_comments_select ON public.board_comments;
CREATE POLICY board_comments_select ON public.board_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = board_comments.board_id AND (b.is_public OR b.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS board_comments_insert ON public.board_comments;
CREATE POLICY board_comments_insert ON public.board_comments
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS board_comments_delete ON public.board_comments;
CREATE POLICY board_comments_delete ON public.board_comments
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS board_activity_select ON public.board_activity;
CREATE POLICY board_activity_select ON public.board_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = board_activity.board_id AND (b.is_public OR b.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS board_activity_insert ON public.board_activity;
CREATE POLICY board_activity_insert ON public.board_activity
  FOR INSERT WITH CHECK (actor_id = auth.uid());

NOTIFY pgrst, 'reload schema';
