-- Task #11: pgvector RPCs for recommendation engine (service role / SECURITY DEFINER)

CREATE OR REPLACE FUNCTION public.match_movies_by_embedding(
  query_embedding vector(512),
  match_count integer DEFAULT 80,
  filter_media_type text DEFAULT NULL
)
RETURNS TABLE (
  tmdb_id text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.tmdb_id::text,
    (1 - (m.embedding <=> query_embedding))::double precision AS similarity
  FROM public.movies_library m
  WHERE m.is_active = true
    AND m.embedding IS NOT NULL
    AND (filter_media_type IS NULL OR m.media_type = filter_media_type)
  ORDER BY m.embedding <=> query_embedding
  LIMIT GREATEST(COALESCE(match_count, 80), 1);
$$;

CREATE OR REPLACE FUNCTION public.match_similar_to_movie(
  target_tmdb_id text,
  match_count integer DEFAULT 32
)
RETURNS TABLE (
  tmdb_id text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.tmdb_id::text,
    (1 - (m.embedding <=> src.embedding))::double precision AS similarity
  FROM public.movies_library src
  CROSS JOIN public.movies_library m
  WHERE src.tmdb_id = target_tmdb_id
    AND src.embedding IS NOT NULL
    AND m.is_active = true
    AND m.embedding IS NOT NULL
    AND m.tmdb_id <> target_tmdb_id
  ORDER BY m.embedding <=> src.embedding
  LIMIT GREATEST(COALESCE(match_count, 32), 1);
$$;

COMMENT ON FUNCTION public.match_movies_by_embedding IS
  'ANN candidate pool for personalized recommendations (cosine similarity).';
COMMENT ON FUNCTION public.match_similar_to_movie IS
  'Because-you-liked-X similarity from movie embedding.';

GRANT EXECUTE ON FUNCTION public.match_movies_by_embedding(vector, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_similar_to_movie(text, integer) TO service_role;
