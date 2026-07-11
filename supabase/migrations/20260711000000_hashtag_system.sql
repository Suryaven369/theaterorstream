-- Hashtag system — discovery tags for posts, reviews, comments, blogs.
-- Plain-text #Tags in content; linked via content_hashtags for counts / follow / trending.

CREATE TABLE IF NOT EXISTS public.hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN (
      'general', 'genre', 'director', 'actor', 'franchise',
      'studio', 'mood', 'event', 'award', 'country', 'collection'
    )),
  description text,
  posts_count integer NOT NULL DEFAULT 0,
  followers_count integer NOT NULL DEFAULT 0,
  trending_score numeric NOT NULL DEFAULT 0,
  weekly_growth integer NOT NULL DEFAULT 0,
  related_slugs text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hashtags_trending_idx ON public.hashtags (trending_score DESC, posts_count DESC);
CREATE INDEX IF NOT EXISTS hashtags_category_idx ON public.hashtags (category);
CREATE INDEX IF NOT EXISTS hashtags_slug_prefix_idx ON public.hashtags (slug text_pattern_ops);

CREATE TABLE IF NOT EXISTS public.hashtag_follows (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hashtag_id uuid NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hashtag_id)
);

CREATE INDEX IF NOT EXISTS hashtag_follows_hashtag_idx ON public.hashtag_follows (hashtag_id);

CREATE TABLE IF NOT EXISTS public.content_hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hashtag_id uuid NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('post', 'comment', 'review', 'blog', 'activity')),
  content_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hashtag_id, content_type, content_id)
);

CREATE INDEX IF NOT EXISTS content_hashtags_content_idx ON public.content_hashtags (content_type, content_id);
CREATE INDEX IF NOT EXISTS content_hashtags_hashtag_created_idx ON public.content_hashtags (hashtag_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_hashtags_created_idx ON public.content_hashtags (created_at DESC);

-- Normalize: #SciFi / #sci-fi / #sci_fi → scifi
CREATE OR REPLACE FUNCTION public.normalize_hashtag_slug(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(coalesce(raw, ''), '[^a-zA-Z0-9]+', '', 'g'));
$$;

-- Extract unique hashtag tokens from free text (skips [[mention]] blocks)
CREATE OR REPLACE FUNCTION public.extract_hashtag_tokens(content text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned text;
  matches text[];
BEGIN
  IF content IS NULL OR content = '' THEN
    RETURN '{}';
  END IF;
  -- Strip mention tokens so # inside them never matches
  cleaned := regexp_replace(content, '\[\[[^\]]+\]\]', ' ', 'g');
  SELECT coalesce(array_agg(DISTINCT m[1]), '{}')
  INTO matches
  FROM regexp_matches(cleaned, '#([A-Za-z][A-Za-z0-9_]{0,49})', 'g') AS m;
  RETURN matches;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_hashtag_counts(p_hashtag_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.hashtags h
  SET
    posts_count = (SELECT count(*)::int FROM public.content_hashtags ch WHERE ch.hashtag_id = p_hashtag_id),
    followers_count = (SELECT count(*)::int FROM public.hashtag_follows hf WHERE hf.hashtag_id = p_hashtag_id),
    updated_at = now()
  WHERE h.id = p_hashtag_id;
END;
$$;

-- Upsert tags found in text and link them to a content row
CREATE OR REPLACE FUNCTION public.sync_content_hashtags(
  p_content text,
  p_content_type text,
  p_content_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_ids uuid[];
  token text;
  v_slug text;
  tag_id uuid;
  new_ids uuid[] := '{}';
BEGIN
  SELECT coalesce(array_agg(hashtag_id), '{}') INTO old_ids
  FROM public.content_hashtags
  WHERE content_type = p_content_type AND content_id = p_content_id;

  DELETE FROM public.content_hashtags
  WHERE content_type = p_content_type AND content_id = p_content_id;

  FOR token IN SELECT unnest(public.extract_hashtag_tokens(p_content))
  LOOP
    v_slug := public.normalize_hashtag_slug(token);
    IF v_slug IS NULL OR length(v_slug) < 2 THEN CONTINUE; END IF;

    INSERT INTO public.hashtags AS h (slug, display_name)
    VALUES (v_slug, token)
    ON CONFLICT (slug) DO UPDATE SET updated_at = now()
    RETURNING h.id INTO tag_id;

    INSERT INTO public.content_hashtags (hashtag_id, content_type, content_id, user_id)
    VALUES (tag_id, p_content_type, p_content_id, p_user_id)
    ON CONFLICT DO NOTHING;

    new_ids := array_append(new_ids, tag_id);
  END LOOP;

  PERFORM public.refresh_hashtag_counts(hid)
  FROM unnest(old_ids || new_ids) AS hid;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_feed_post_hashtags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_content_hashtags(NEW.content, 'post', NEW.id, NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_feed_post_hashtags ON public.feed_posts;
CREATE TRIGGER trg_sync_feed_post_hashtags
  AFTER INSERT OR UPDATE OF content ON public.feed_posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_feed_post_hashtags();

CREATE OR REPLACE FUNCTION public.trg_sync_post_comment_hashtags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_content_hashtags(NEW.content, 'comment', NEW.id, NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_post_comment_hashtags ON public.post_comments;
CREATE TRIGGER trg_sync_post_comment_hashtags
  AFTER INSERT OR UPDATE OF content ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_post_comment_hashtags();

-- Follow count maintenance
CREATE OR REPLACE FUNCTION public.trg_hashtag_follow_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.hashtags SET followers_count = followers_count + 1, updated_at = now() WHERE id = NEW.hashtag_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.hashtags SET followers_count = greatest(followers_count - 1, 0), updated_at = now() WHERE id = OLD.hashtag_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_hashtag_follow_counts ON public.hashtag_follows;
CREATE TRIGGER trg_hashtag_follow_counts
  AFTER INSERT OR DELETE ON public.hashtag_follows
  FOR EACH ROW EXECUTE FUNCTION public.trg_hashtag_follow_counts();

-- Trending score: recent usage weighted
CREATE OR REPLACE FUNCTION public.recompute_hashtag_trending()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.hashtags h SET
    weekly_growth = (
      SELECT count(*)::int FROM public.content_hashtags ch
      WHERE ch.hashtag_id = h.id AND ch.created_at > now() - interval '7 days'
    ),
    trending_score = (
      SELECT coalesce(
        sum(
          CASE
            WHEN ch.created_at > now() - interval '1 day' THEN 5
            WHEN ch.created_at > now() - interval '7 days' THEN 2
            ELSE 0.5
          END
        ), 0
      ) + (h.followers_count * 0.25)
      FROM public.content_hashtags ch
      WHERE ch.hashtag_id = h.id AND ch.created_at > now() - interval '14 days'
    ),
    updated_at = now();
END;
$$;

-- RLS
ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashtag_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_hashtags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read hashtags" ON public.hashtags;
CREATE POLICY "Public read hashtags" ON public.hashtags FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Auth insert hashtags" ON public.hashtags;
CREATE POLICY "Auth insert hashtags" ON public.hashtags FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Auth update hashtags" ON public.hashtags;
CREATE POLICY "Auth update hashtags" ON public.hashtags FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read content_hashtags" ON public.content_hashtags;
CREATE POLICY "Public read content_hashtags" ON public.content_hashtags FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Auth insert content_hashtags" ON public.content_hashtags;
CREATE POLICY "Auth insert content_hashtags" ON public.content_hashtags
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Auth delete own content_hashtags" ON public.content_hashtags;
CREATE POLICY "Auth delete own content_hashtags" ON public.content_hashtags
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public read hashtag_follows" ON public.hashtag_follows;
CREATE POLICY "Public read hashtag_follows" ON public.hashtag_follows FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Auth manage own hashtag follows" ON public.hashtag_follows;
CREATE POLICY "Auth manage own hashtag follows" ON public.hashtag_follows
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed cinema-focused starter tags
INSERT INTO public.hashtags (slug, display_name, category, description) VALUES
  ('action', 'Action', 'genre', 'High-energy action films and series'),
  ('drama', 'Drama', 'genre', 'Character-driven drama'),
  ('comedy', 'Comedy', 'genre', 'Laughs, satire, and feel-good comedy'),
  ('thriller', 'Thriller', 'genre', 'Suspense and tension'),
  ('scifi', 'SciFi', 'genre', 'Science fiction worlds and ideas'),
  ('romance', 'Romance', 'genre', 'Love stories on screen'),
  ('horror', 'Horror', 'genre', 'Horror and the supernatural'),
  ('feelgood', 'FeelGood', 'mood', 'Uplifting comfort watches'),
  ('mindbending', 'MindBending', 'mood', 'Twisty, cerebral storytelling'),
  ('comfortmovie', 'ComfortMovie', 'mood', 'Movies you return to'),
  ('weekendwatch', 'WeekendWatch', 'mood', 'Perfect for the weekend'),
  ('hiddengem', 'HiddenGem', 'mood', 'Under-the-radar favorites'),
  ('mustwatch', 'MustWatch', 'mood', 'Essential viewing'),
  ('underrated', 'Underrated', 'mood', 'Better than the buzz suggests'),
  ('marvel', 'Marvel', 'franchise', 'Marvel Cinematic Universe and comics'),
  ('dc', 'DC', 'franchise', 'DC films and series'),
  ('starwars', 'StarWars', 'franchise', 'A galaxy far, far away'),
  ('harrypotter', 'HarryPotter', 'franchise', 'Wizarding World'),
  ('a24', 'A24', 'studio', 'A24 films'),
  ('pixar', 'Pixar', 'studio', 'Pixar Animation'),
  ('studioghibli', 'StudioGhibli', 'studio', 'Studio Ghibli'),
  ('christophernolan', 'ChristopherNolan', 'director', 'Films by Christopher Nolan'),
  ('denisvilleneuve', 'DenisVilleneuve', 'director', 'Films by Denis Villeneuve'),
  ('quentintarantino', 'QuentinTarantino', 'director', 'Films by Quentin Tarantino'),
  ('martinscorsese', 'MartinScorsese', 'director', 'Films by Martin Scorsese'),
  ('leonardodicaprio', 'LeonardoDiCaprio', 'actor', NULL),
  ('tomcruise', 'TomCruise', 'actor', NULL),
  ('emmastone', 'EmmaStone', 'actor', NULL),
  ('ryangosling', 'RyanGosling', 'actor', NULL),
  ('oscars', 'Oscars', 'award', 'Academy Awards conversation'),
  ('cannes', 'Cannes', 'event', 'Cannes Film Festival'),
  ('movienight', 'MovieNight', 'event', 'Movie night picks'),
  ('weekendmarathon', 'WeekendMarathon', 'event', 'Binge-worthy marathons')
ON CONFLICT (slug) DO NOTHING;

-- Related tags for a few hubs
UPDATE public.hashtags SET related_slugs = ARRAY['space','timetravel','cyberpunk','aliens','mindbending','christophernolan']
WHERE slug = 'scifi';
UPDATE public.hashtags SET related_slugs = ARRAY['denisvilleneuve','scifi','timetravel','mindbending','hanszimmer']
WHERE slug = 'christophernolan';
UPDATE public.hashtags SET related_slugs = ARRAY['dc','superhero','comicbook']
WHERE slug = 'marvel';

SELECT public.recompute_hashtag_trending();
