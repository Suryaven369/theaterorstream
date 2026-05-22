-- Repair migration if 20260522000000 failed at movies_library embedding index
-- Safe to run multiple times (idempotent)

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.movies_library
  ADD COLUMN IF NOT EXISTS mood_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS family_score numeric(4, 2),
  ADD COLUMN IF NOT EXISTS embedding vector(512);

CREATE INDEX IF NOT EXISTS idx_movies_library_mood_tags
  ON public.movies_library USING gin (mood_tags);

CREATE INDEX IF NOT EXISTS idx_user_taste_profiles_embedding_hnsw
  ON public.user_taste_profiles
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_movies_library_embedding_hnsw
  ON public.movies_library
  USING hnsw (embedding vector_cosine_ops);
