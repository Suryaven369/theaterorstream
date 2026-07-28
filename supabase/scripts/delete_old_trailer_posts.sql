-- =============================================================================
-- Delete OLD trailer data (release year before current year)
-- Run in Supabase SQL Editor. Preview first (Step 1), then delete (Step 2).
--
-- Matches app logic in api/_lib/rss-server.js → isEligibleTrailerRelease()
-- Keeps: release_date year >= current year, OR title tags (2026)+ e.g. revivals
-- =============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1 — PREVIEW (safe, read-only): rows that WOULD be deleted
-- ---------------------------------------------------------------------------
WITH current_year AS (
  SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y
),
old_trailer_posts AS (
  SELECT
    tp.media_type,
    tp.tmdb_id,
    tp.title,
    tp.release_date,
    tp.trailer_name,
    tp.is_active,
    tp.published_at
  FROM public.trailer_posts tp
  CROSS JOIN current_year cy
  WHERE
    (
      -- TMDB release / first-air year is in the past
      (
        tp.release_date IS NOT NULL
        AND tp.release_date ~ '^\d{4}'
        AND left(tp.release_date, 4)::int < cy.y
      )
      -- OR title explicitly tags an old year, e.g. "(1981)"
      OR coalesce(tp.trailer_name, '') ~ '\(19\d{2}\)'
      OR (
        coalesce(tp.trailer_name, '') ~ '\(20\d{2}\)'
        AND (
          SELECT max(2000 + (m)[1]::int)
          FROM regexp_matches(tp.trailer_name, '\(20(\d{2})\)', 'g') AS m
        ) < cy.y
      )
    )
    -- Revival exception: keep if title tags current year or later
    AND NOT coalesce(tp.trailer_name, '') ~ (
      '\(('
      || cy.y::text
      || '|' || (cy.y + 1)::text
      || '|' || (cy.y + 2)::text
      || '|' || (cy.y + 3)::text
      || ')\)'
    )
)
SELECT 'trailer_posts' AS table_name, count(*) AS rows_to_delete
FROM old_trailer_posts
UNION ALL
SELECT 'feed_articles (trailer sources)', count(*)
FROM public.feed_articles fa
JOIN public.rss_sources rs ON rs.id = fa.source_id AND rs.source_kind = 'trailer'
WHERE fa.tmdb_id IN (SELECT tmdb_id FROM old_trailer_posts)
UNION ALL
SELECT 'showcase_trailers', count(*)
FROM public.showcase_trailers st
CROSS JOIN current_year cy
WHERE st.release_date IS NOT NULL
  AND EXTRACT(YEAR FROM st.release_date)::int < cy.y
UNION ALL
SELECT 'feed_item_likes (trailer)', count(*)
FROM public.feed_item_likes fl
WHERE fl.subject_kind = 'trailer'
  AND fl.subject_id IN (SELECT tmdb_id FROM old_trailer_posts)
UNION ALL
SELECT 'feed_thread_comments (trailer)', count(*)
FROM public.feed_thread_comments fc
WHERE fc.subject_kind = 'trailer'
  AND fc.subject_id IN (SELECT tmdb_id FROM old_trailer_posts);

-- Detail list (optional)
-- SELECT * FROM old_trailer_posts ORDER BY release_date NULLS LAST, title;


-- ---------------------------------------------------------------------------
-- STEP 2 — DELETE (run only after preview looks correct)
-- Uncomment the block below, or run it as a separate query.
-- ---------------------------------------------------------------------------

/*
BEGIN;

WITH current_year AS (
  SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y
),
old_trailer_posts AS (
  SELECT tp.media_type, tp.tmdb_id
  FROM public.trailer_posts tp
  CROSS JOIN current_year cy
  WHERE
    (
      (
        tp.release_date IS NOT NULL
        AND tp.release_date ~ '^\d{4}'
        AND left(tp.release_date, 4)::int < cy.y
      )
      OR coalesce(tp.trailer_name, '') ~ '\(19\d{2}\)'
      OR (
        coalesce(tp.trailer_name, '') ~ '\(20\d{2}\)'
        AND (
          SELECT max(2000 + (m)[1]::int)
          FROM regexp_matches(tp.trailer_name, '\(20(\d{2})\)', 'g') AS m
        ) < cy.y
      )
    )
    AND NOT coalesce(tp.trailer_name, '') ~ (
      '\(('
      || cy.y::text
      || '|' || (cy.y + 1)::text
      || '|' || (cy.y + 2)::text
      || '|' || (cy.y + 3)::text
      || ')\)'
    )
),
deleted_likes AS (
  DELETE FROM public.feed_item_likes fl
  WHERE fl.subject_kind = 'trailer'
    AND fl.subject_id IN (SELECT tmdb_id FROM old_trailer_posts)
  RETURNING 1
),
deleted_comments AS (
  DELETE FROM public.feed_thread_comments fc
  WHERE fc.subject_kind = 'trailer'
    AND fc.subject_id IN (SELECT tmdb_id FROM old_trailer_posts)
  RETURNING 1
),
deleted_feed_articles AS (
  DELETE FROM public.feed_articles fa
  USING public.rss_sources rs
  WHERE rs.id = fa.source_id
    AND rs.source_kind = 'trailer'
    AND fa.tmdb_id IN (SELECT tmdb_id FROM old_trailer_posts)
  RETURNING 1
),
deleted_showcase AS (
  DELETE FROM public.showcase_trailers st
  CROSS JOIN current_year cy
  WHERE st.release_date IS NOT NULL
    AND EXTRACT(YEAR FROM st.release_date)::int < cy.y
  RETURNING 1
),
deleted_posts AS (
  DELETE FROM public.trailer_posts tp
  WHERE (tp.media_type, tp.tmdb_id) IN (
    SELECT media_type, tmdb_id FROM old_trailer_posts
  )
  RETURNING 1
)
SELECT
  (SELECT count(*) FROM deleted_likes) AS feed_item_likes_deleted,
  (SELECT count(*) FROM deleted_comments) AS feed_thread_comments_deleted,
  (SELECT count(*) FROM deleted_feed_articles) AS feed_articles_deleted,
  (SELECT count(*) FROM deleted_showcase) AS showcase_trailers_deleted,
  (SELECT count(*) FROM deleted_posts) AS trailer_posts_deleted;

COMMIT;
*/


-- ---------------------------------------------------------------------------
-- STEP 3 — OPTIONAL: deactivate instead of delete (safer rollback)
-- ---------------------------------------------------------------------------

/*
UPDATE public.trailer_posts tp
SET is_active = false, updated_at = now()
FROM (
  -- same old_trailer_posts CTE as above
) old
WHERE tp.media_type = old.media_type AND tp.tmdb_id = old.tmdb_id;
*/
