-- Admin → Trailers (showcase_trailers) is now the single control for the
-- Feed's "New trailers" row. Before this, the row read trailer_posts.approved_at
-- (last 14 days). Copy those recent approvals into the showcase so nothing that
-- is live today disappears when the feed switches over.

INSERT INTO public.showcase_trailers (
  tmdb_id, media_type, title, poster_path, backdrop_path, release_date,
  trailer_key, trailer_name, trailer_published_at, youtube_url,
  thumbnail_url, thumbnail_fallback_url, category, display_order, is_active
)
SELECT
  tp.tmdb_id,
  tp.media_type,
  tp.title,
  tp.poster_path,
  tp.backdrop_path,
  CASE WHEN tp.release_date ~ '^\d{4}-\d{2}-\d{2}$' THEN tp.release_date::date END,
  tp.youtube_key,
  tp.trailer_name,
  tp.published_at,
  COALESCE(tp.trailer_url, 'https://www.youtube.com/watch?v=' || tp.youtube_key),
  'https://img.youtube.com/vi/' || tp.youtube_key || '/maxresdefault.jpg',
  'https://img.youtube.com/vi/' || tp.youtube_key || '/hqdefault.jpg',
  'latest',
  -- Newest approval first, ahead of anything already in the showcase.
  (SELECT COALESCE(MIN(display_order), 1) FROM public.showcase_trailers)
    - ROW_NUMBER() OVER (ORDER BY tp.approved_at ASC)::int,
  true
FROM public.trailer_posts tp
WHERE tp.is_active = true
  AND tp.youtube_key IS NOT NULL
  AND tp.approved_at >= now() - interval '14 days'
ON CONFLICT (tmdb_id, trailer_key) DO UPDATE
  SET is_active = true, updated_at = now();
