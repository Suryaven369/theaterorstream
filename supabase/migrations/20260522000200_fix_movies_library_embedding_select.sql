-- Fix movies_library HNSW index (null-safe) + document embedding column
-- PostgREST cannot serialize vector in SELECT * — app uses explicit column lists

DROP INDEX IF EXISTS public.idx_movies_library_embedding_hnsw;

CREATE INDEX IF NOT EXISTS idx_movies_library_embedding_hnsw
  ON public.movies_library
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN public.movies_library.embedding IS
  '512-dim vector for ANN search. Do not SELECT * from movies_library via PostgREST.';
