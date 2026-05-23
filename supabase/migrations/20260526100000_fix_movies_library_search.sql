-- Flexible title search: "antman" matches "Ant-Man" via normalized comparison

CREATE OR REPLACE FUNCTION public.search_movies_library(
  search_term TEXT,
  p_media_type TEXT DEFAULT NULL,
  p_genres INTEGER[] DEFAULT NULL,
  p_min_rating NUMERIC DEFAULT NULL,
  p_max_rating NUMERIC DEFAULT NULL,
  p_year_from INTEGER DEFAULT NULL,
  p_year_to INTEGER DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'popularity',
  p_sort_order TEXT DEFAULT 'desc',
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  tmdb_id TEXT,
  media_type TEXT,
  title TEXT,
  overview TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  release_date DATE,
  vote_average NUMERIC,
  vote_count INTEGER,
  popularity NUMERIC,
  genres JSONB,
  runtime INTEGER
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  normalized_term TEXT;
BEGIN
  normalized_term := regexp_replace(lower(trim(COALESCE(search_term, ''))), '[^a-z0-9]', '', 'g');

  RETURN QUERY
  SELECT
    m.id,
    m.tmdb_id,
    m.media_type,
    m.title,
    m.overview,
    m.poster_path,
    m.backdrop_path,
    m.release_date,
    m.vote_average,
    m.vote_count,
    m.popularity,
    m.genres,
    m.runtime
  FROM movies_library m
  WHERE
    m.is_active = true
    AND (
      search_term IS NULL
      OR trim(search_term) = ''
      OR m.title ILIKE '%' || search_term || '%'
      OR COALESCE(m.original_title, '') ILIKE '%' || search_term || '%'
      OR (
        length(normalized_term) >= 2
        AND regexp_replace(lower(m.title), '[^a-z0-9]', '', 'g') LIKE '%' || normalized_term || '%'
      )
      OR (
        length(normalized_term) >= 2
        AND regexp_replace(lower(COALESCE(m.original_title, '')), '[^a-z0-9]', '', 'g') LIKE '%' || normalized_term || '%'
      )
    )
    AND (p_media_type IS NULL OR m.media_type = p_media_type)
    AND (p_min_rating IS NULL OR m.vote_average >= p_min_rating)
    AND (p_max_rating IS NULL OR m.vote_average <= p_max_rating)
    AND (p_year_from IS NULL OR EXTRACT(YEAR FROM m.release_date) >= p_year_from)
    AND (p_year_to IS NULL OR EXTRACT(YEAR FROM m.release_date) <= p_year_to)
    AND (p_genres IS NULL OR m.genre_ids && p_genres)
  ORDER BY
    CASE WHEN p_sort_by = 'popularity' AND p_sort_order = 'desc' THEN m.popularity END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'popularity' AND p_sort_order = 'asc' THEN m.popularity END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'vote_average' AND p_sort_order = 'desc' THEN m.vote_average END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'vote_average' AND p_sort_order = 'asc' THEN m.vote_average END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'release_date' AND p_sort_order = 'desc' THEN m.release_date END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'release_date' AND p_sort_order = 'asc' THEN m.release_date END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'title' AND p_sort_order = 'asc' THEN m.title END ASC,
    CASE WHEN p_sort_by = 'title' AND p_sort_order = 'desc' THEN m.title END DESC,
    m.popularity DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
