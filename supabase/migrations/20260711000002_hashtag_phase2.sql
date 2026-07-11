-- Hashtag phase 2: review/blog triggers, co-occurrence related tags, analytics helpers

-- Reviews
CREATE OR REPLACE FUNCTION public.trg_sync_social_review_hashtags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_content_hashtags(
    coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, ''),
    'review',
    NEW.id,
    NEW.user_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_social_review_hashtags ON public.social_reviews;
CREATE TRIGGER trg_sync_social_review_hashtags
  AFTER INSERT OR UPDATE OF title, content ON public.social_reviews
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_social_review_hashtags();

-- Review comments (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'review_comments'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.trg_sync_review_comment_hashtags()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
      BEGIN
        PERFORM public.sync_content_hashtags(NEW.content, 'comment', NEW.id, NEW.user_id);
        RETURN NEW;
      END;
      $body$;
    $fn$;

    EXECUTE 'DROP TRIGGER IF EXISTS trg_sync_review_comment_hashtags ON public.review_comments';
    EXECUTE '
      CREATE TRIGGER trg_sync_review_comment_hashtags
        AFTER INSERT OR UPDATE OF content ON public.review_comments
        FOR EACH ROW EXECUTE FUNCTION public.trg_sync_review_comment_hashtags()
    ';
  END IF;
END $$;

-- Blogs (strip HTML before extract via sync — extract_hashtag_tokens already strips [[mentions]];
-- also strip tags in a thin wrapper)
CREATE OR REPLACE FUNCTION public.trg_sync_blog_post_hashtags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plain text;
BEGIN
  plain := regexp_replace(coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, ''), '<[^>]+>', ' ', 'g');
  PERFORM public.sync_content_hashtags(plain, 'blog', NEW.id, NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_blog_post_hashtags ON public.blog_posts;
CREATE TRIGGER trg_sync_blog_post_hashtags
  AFTER INSERT OR UPDATE OF title, content ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_blog_post_hashtags();

-- Co-occurrence related tags (tags that appear on the same content)
CREATE OR REPLACE FUNCTION public.related_hashtags_by_cooccurrence(
  p_hashtag_id uuid,
  p_limit int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  slug text,
  display_name text,
  category text,
  posts_count integer,
  followers_count integer,
  score bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH seed_content AS (
    SELECT content_type, content_id
    FROM public.content_hashtags
    WHERE hashtag_id = p_hashtag_id
    LIMIT 500
  ),
  co AS (
    SELECT ch.hashtag_id, count(*)::bigint AS score
    FROM public.content_hashtags ch
    JOIN seed_content sc
      ON sc.content_type = ch.content_type AND sc.content_id = ch.content_id
    WHERE ch.hashtag_id <> p_hashtag_id
    GROUP BY ch.hashtag_id
    ORDER BY score DESC
    LIMIT p_limit
  )
  SELECT h.id, h.slug, h.display_name, h.category, h.posts_count, h.followers_count, co.score
  FROM co
  JOIN public.hashtags h ON h.id = co.hashtag_id
  ORDER BY co.score DESC, h.trending_score DESC;
$$;

-- Analytics: trending windows
CREATE OR REPLACE FUNCTION public.hashtag_analytics_bundle(p_limit int DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today jsonb;
  week jsonb;
  rising jsonb;
  most_followed jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO today
  FROM (
    SELECT h.id, h.slug, h.display_name, h.category, h.posts_count, h.followers_count,
           count(ch.id)::int AS window_posts
    FROM public.content_hashtags ch
    JOIN public.hashtags h ON h.id = ch.hashtag_id
    WHERE ch.created_at > now() - interval '1 day'
    GROUP BY h.id
    ORDER BY window_posts DESC, h.trending_score DESC
    LIMIT p_limit
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO week
  FROM (
    SELECT h.id, h.slug, h.display_name, h.category, h.posts_count, h.followers_count,
           h.weekly_growth, h.trending_score
    FROM public.hashtags h
    WHERE h.weekly_growth > 0 OR h.trending_score > 0
    ORDER BY h.trending_score DESC, h.weekly_growth DESC
    LIMIT p_limit
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO rising
  FROM (
    SELECT h.id, h.slug, h.display_name, h.category, h.posts_count, h.followers_count,
           h.weekly_growth,
           CASE WHEN h.posts_count > 0
             THEN (h.weekly_growth::numeric / greatest(h.posts_count, 1))
             ELSE h.weekly_growth::numeric
           END AS rise_ratio
    FROM public.hashtags h
    WHERE h.weekly_growth > 0
    ORDER BY rise_ratio DESC, h.weekly_growth DESC
    LIMIT p_limit
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO most_followed
  FROM (
    SELECT h.id, h.slug, h.display_name, h.category, h.posts_count, h.followers_count
    FROM public.hashtags h
    WHERE h.followers_count > 0
    ORDER BY h.followers_count DESC, h.posts_count DESC
    LIMIT p_limit
  ) t;

  RETURN jsonb_build_object(
    'today', today,
    'week', week,
    'rising', rising,
    'most_followed', most_followed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.related_hashtags_by_cooccurrence(uuid, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hashtag_analytics_bundle(int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_content_hashtags(text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_hashtag_trending() TO authenticated;

SELECT public.recompute_hashtag_trending();
