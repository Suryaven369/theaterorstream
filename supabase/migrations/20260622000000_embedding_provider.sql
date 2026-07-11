-- Multi-provider embeddings: track which model produced each vector so the
-- similarity search never compares across incompatible vector spaces
-- (a Gemini vector vs a Mistral vector is meaningless). Existing embeddings
-- were all Gemini, so default them accordingly.

ALTER TABLE public.movies_library
  ADD COLUMN IF NOT EXISTS embedding_provider text;
ALTER TABLE public.user_taste_profiles
  ADD COLUMN IF NOT EXISTS embedding_provider text;

UPDATE public.movies_library
  SET embedding_provider = 'gemini'
  WHERE embedding IS NOT NULL AND embedding_provider IS NULL;
UPDATE public.user_taste_profiles
  SET embedding_provider = 'gemini'
  WHERE embedding IS NOT NULL AND embedding_provider IS NULL;

CREATE INDEX IF NOT EXISTS idx_movies_library_embedding_provider
  ON public.movies_library (embedding_provider)
  WHERE embedding IS NOT NULL AND is_active = true;

-- ---------------------------------------------------------------------------
-- Provider-aware RPCs. Drop the old signatures first so PostgREST doesn't see
-- two overloads.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.match_movies_by_embedding(vector, integer, text);
DROP FUNCTION IF EXISTS public.match_similar_to_movie(text, integer);

CREATE OR REPLACE FUNCTION public.match_movies_by_embedding(
  query_embedding vector(512),
  match_count integer DEFAULT 80,
  filter_media_type text DEFAULT NULL,
  filter_provider text DEFAULT NULL
)
RETURNS TABLE (tmdb_id text, similarity double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    m.tmdb_id::text,
    (1 - (m.embedding <=> query_embedding))::double precision AS similarity
  FROM public.movies_library m
  WHERE m.is_active = true
    AND m.embedding IS NOT NULL
    AND (filter_media_type IS NULL OR m.media_type = filter_media_type)
    AND (filter_provider IS NULL OR m.embedding_provider = filter_provider)
  ORDER BY m.embedding <=> query_embedding
  LIMIT GREATEST(COALESCE(match_count, 80), 1);
$$;

CREATE OR REPLACE FUNCTION public.match_similar_to_movie(
  target_tmdb_id text,
  match_count integer DEFAULT 32
)
RETURNS TABLE (tmdb_id text, similarity double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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
    -- only compare within the same embedding space
    AND m.embedding_provider IS NOT DISTINCT FROM src.embedding_provider
  ORDER BY m.embedding <=> src.embedding
  LIMIT GREATEST(COALESCE(match_count, 32), 1);
$$;

GRANT EXECUTE ON FUNCTION public.match_movies_by_embedding(vector, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_similar_to_movie(text, integer) TO service_role;
