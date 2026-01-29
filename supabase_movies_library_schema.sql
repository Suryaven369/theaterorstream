-- =============================================
-- MOVIES LIBRARY - Reset & Schema Update
-- 1. CLEANUP: Drops the normalized tables if they exist
-- 2. SETUP: Ensures movies_library exists and has all columns
-- =============================================

-- 1. CLEANUP: Drop the tables from the previous attempt
-- (Using CASCADE to remove dependent tables and policies automatically)
DROP TABLE IF EXISTS 
  movie_genres, movie_cast, movie_crew, movie_keywords, movie_production_companies, 
  movie_production_countries, movie_spoken_languages, similar_movies, recommended_movies,
  videos, images, release_dates, tmdb_reviews,
  genres, people, keywords, production_companies, production_countries, spoken_languages,
  movies
CASCADE;

-- Drop the helper function if it exists
DROP FUNCTION IF EXISTS get_movie_details;

-- 2. SETUP: Ensure movies_library exists (User's Schema)
CREATE TABLE IF NOT EXISTS public.movies_library (
  id uuid not null default gen_random_uuid (),
  tmdb_id text not null,
  media_type text null default 'movie'::text,
  title text not null,
  original_title text null,
  overview text null,
  tagline text null,
  poster_path text null,
  backdrop_path text null,
  release_date date null,
  status text null,
  runtime integer null,
  vote_average numeric(3, 1) null,
  vote_count integer null,
  popularity numeric(10, 3) null,
  genres jsonb null,
  production_companies jsonb null,
  production_countries jsonb null,
  spoken_languages jsonb null,
  imdb_id text null,
  homepage text null,
  budget bigint null,
  revenue bigint null,
  is_active boolean null default true,
  featured boolean null default false,
  priority integer null default 0,
  collection_tags text[] null,
  display_sections text[] null,
  streaming_platforms jsonb null,
  custom_vibes jsonb null,
  custom_parent_guide jsonb null,
  certification text null,
  admin_notes text null,
  editor_review text null,
  editor_rating numeric(3, 1) null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  synced_at timestamp with time zone null default now(),
  constraint movies_library_pkey primary key (id),
  constraint movies_library_tmdb_id_key unique (tmdb_id)
) TABLESPACE pg_default;

-- 3. ALTER: Add detailed JSONB columns for full TMDB data
ALTER TABLE public.movies_library
ADD COLUMN IF NOT EXISTS credits JSONB,               -- Stores cast and crew
ADD COLUMN IF NOT EXISTS videos JSONB,                -- Stores trailers, teasers
ADD COLUMN IF NOT EXISTS images JSONB,                -- Stores posters, backdrops
ADD COLUMN IF NOT EXISTS reviews JSONB,               -- Stores TMDB user reviews
ADD COLUMN IF NOT EXISTS similar_movies JSONB,        -- Stores similar movies list
ADD COLUMN IF NOT EXISTS recommendations JSONB,       -- Stores recommended movies list
ADD COLUMN IF NOT EXISTS keywords JSONB,              -- Stores keywords
ADD COLUMN IF NOT EXISTS release_dates_data JSONB,    -- Stores certifications and dates (suffix to avoid conflict)
ADD COLUMN IF NOT EXISTS belongs_to_collection JSONB; -- Stores collection info

-- 4. INDICES: Ensure performance indices exist
CREATE INDEX IF NOT EXISTS idx_movies_library_tmdb_id ON public.movies_library USING btree (tmdb_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_movies_library_media_type ON public.movies_library USING btree (media_type) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_movies_library_featured ON public.movies_library USING btree (featured) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_movies_library_release_date ON public.movies_library USING btree (release_date desc) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_movies_library_popularity ON public.movies_library USING btree (popularity desc) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_movies_library_is_active ON public.movies_library USING btree (is_active) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_movies_library_collection_tags ON public.movies_library USING gin (collection_tags) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_movies_library_display_sections ON public.movies_library USING gin (display_sections) TABLESPACE pg_default;

-- 5. RLS: Enable security
ALTER TABLE public.movies_library ENABLE ROW LEVEL SECURITY;

-- Drop policies to be safe before creating/recreating
DROP POLICY IF EXISTS "Public read access" ON public.movies_library;
DROP POLICY IF EXISTS "Admin write access" ON public.movies_library;

CREATE POLICY "Public read access" ON public.movies_library
FOR SELECT TO public USING (true);

CREATE POLICY "Admin write access" ON public.movies_library
FOR ALL TO public USING (true) WITH CHECK (true);

-- =============================================
-- COMPLETED!
-- Run this script in Supabase SQL Editor.
-- =============================================
