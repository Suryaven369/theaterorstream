-- =============================================
-- Production Optimization SQL Updates
-- Adds TV series support, better indexes, and filtering
-- =============================================

-- =============================================
-- 1. ADD TV SERIES COLUMNS TO movies_library
-- =============================================

-- Add TV-specific columns if they don't exist
ALTER TABLE movies_library ADD COLUMN IF NOT EXISTS first_air_date DATE;
ALTER TABLE movies_library ADD COLUMN IF NOT EXISTS last_air_date DATE;
ALTER TABLE movies_library ADD COLUMN IF NOT EXISTS number_of_seasons INTEGER;
ALTER TABLE movies_library ADD COLUMN IF NOT EXISTS number_of_episodes INTEGER;
ALTER TABLE movies_library ADD COLUMN IF NOT EXISTS networks JSONB;
ALTER TABLE movies_library ADD COLUMN IF NOT EXISTS in_production BOOLEAN DEFAULT false;
ALTER TABLE movies_library ADD COLUMN IF NOT EXISTS episode_run_time JSONB;
ALTER TABLE movies_library ADD COLUMN IF NOT EXISTS origin_country TEXT[];
ALTER TABLE movies_library ADD COLUMN IF NOT EXISTS original_language TEXT;
ALTER TABLE movies_library ADD COLUMN IF NOT EXISTS adult BOOLEAN DEFAULT false;

-- Add content categorization columns
ALTER TABLE movies_library ADD COLUMN IF NOT EXISTS content_rating TEXT; -- PG, PG-13, R, TV-MA, etc.
ALTER TABLE movies_library ADD COLUMN IF NOT EXISTS genre_ids INTEGER[];

-- =============================================
-- 2. CREATE OPTIMIZED INDEXES
-- =============================================

-- Drop existing indexes if they exist and recreate for optimization
DROP INDEX IF EXISTS idx_movies_library_media_type_active;
DROP INDEX IF EXISTS idx_movies_library_genres_gin;
DROP INDEX IF EXISTS idx_movies_library_popularity_desc;
DROP INDEX IF EXISTS idx_movies_library_vote_average_desc;
DROP INDEX IF EXISTS idx_movies_library_release_date_desc;
DROP INDEX IF EXISTS idx_movies_library_title_search;
DROP INDEX IF EXISTS idx_movies_library_genre_ids;

-- Composite index for active content by type (most common query)
CREATE INDEX idx_movies_library_media_type_active 
ON movies_library(media_type, is_active) 
WHERE is_active = true;

-- GIN index for JSONB genres for efficient filtering
CREATE INDEX idx_movies_library_genres_gin 
ON movies_library USING gin(genres);

-- Sorting indexes
CREATE INDEX idx_movies_library_popularity_desc 
ON movies_library(popularity DESC NULLS LAST) 
WHERE is_active = true;

CREATE INDEX idx_movies_library_vote_average_desc 
ON movies_library(vote_average DESC NULLS LAST) 
WHERE is_active = true AND vote_count > 10;

CREATE INDEX idx_movies_library_release_date_desc 
ON movies_library(release_date DESC NULLS LAST) 
WHERE is_active = true;

-- Full-text search index on title
CREATE INDEX idx_movies_library_title_search 
ON movies_library USING gin(to_tsvector('english', title));

-- Array index for genre_ids filtering
CREATE INDEX idx_movies_library_genre_ids 
ON movies_library USING gin(genre_ids);

-- Region/country filtering
CREATE INDEX idx_movies_library_origin_country 
ON movies_library USING gin(origin_country);

-- =============================================
-- 3. CREATE GENRE LOOKUP TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  media_type TEXT DEFAULT 'movie' -- 'movie' or 'tv'
);

-- Insert common movie genres (TMDB genre IDs)
INSERT INTO genres (id, name, media_type) VALUES
  (28, 'Action', 'movie'),
  (12, 'Adventure', 'movie'),
  (16, 'Animation', 'movie'),
  (35, 'Comedy', 'movie'),
  (80, 'Crime', 'movie'),
  (99, 'Documentary', 'movie'),
  (18, 'Drama', 'movie'),
  (10751, 'Family', 'movie'),
  (14, 'Fantasy', 'movie'),
  (36, 'History', 'movie'),
  (27, 'Horror', 'movie'),
  (10402, 'Music', 'movie'),
  (9648, 'Mystery', 'movie'),
  (10749, 'Romance', 'movie'),
  (878, 'Science Fiction', 'movie'),
  (10770, 'TV Movie', 'movie'),
  (53, 'Thriller', 'movie'),
  (10752, 'War', 'movie'),
  (37, 'Western', 'movie')
ON CONFLICT (id) DO NOTHING;

-- Insert TV genres
INSERT INTO genres (id, name, media_type) VALUES
  (10759, 'Action & Adventure', 'tv'),
  (16, 'Animation', 'tv'),
  (35, 'Comedy', 'tv'),
  (80, 'Crime', 'tv'),
  (99, 'Documentary', 'tv'),
  (18, 'Drama', 'tv'),
  (10751, 'Family', 'tv'),
  (10762, 'Kids', 'tv'),
  (9648, 'Mystery', 'tv'),
  (10763, 'News', 'tv'),
  (10764, 'Reality', 'tv'),
  (10765, 'Sci-Fi & Fantasy', 'tv'),
  (10766, 'Soap', 'tv'),
  (10767, 'Talk', 'tv'),
  (10768, 'War & Politics', 'tv'),
  (37, 'Western', 'tv')
ON CONFLICT (id) DO UPDATE SET media_type = EXCLUDED.media_type;

-- =============================================
-- 4. ADD movies_by_region TO homepage_sections
-- =============================================

-- Add movies_by_region if it doesn't exist (stores movies per region)
ALTER TABLE homepage_sections 
ADD COLUMN IF NOT EXISTS movies_by_region JSONB DEFAULT '{}'::jsonb;

-- =============================================
-- 5. CREATE TV SECTIONS TABLE (mirrors homepage_sections)
-- =============================================

CREATE TABLE IF NOT EXISTS tv_sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  
  section_type TEXT DEFAULT 'manual',
  api_source TEXT,
  
  -- TV shows stored per region (same format as homepage_sections for consistency)
  movies_by_region JSONB DEFAULT '{}'::jsonb,
  
  max_movies INTEGER DEFAULT 10,
  style_variant TEXT DEFAULT 'grid',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for tv_sections
CREATE INDEX IF NOT EXISTS idx_tv_sections_display_order ON tv_sections(display_order);
CREATE INDEX IF NOT EXISTS idx_tv_sections_active ON tv_sections(is_active);

-- Enable RLS
ALTER TABLE tv_sections ENABLE ROW LEVEL SECURITY;

-- Policies (drop if exists to recreate)
DROP POLICY IF EXISTS "Allow public read active tv_sections" ON tv_sections;
DROP POLICY IF EXISTS "Allow all on tv_sections" ON tv_sections;

CREATE POLICY "Allow public read active tv_sections" ON tv_sections
  FOR SELECT TO public
  USING (is_active = true);

CREATE POLICY "Allow all on tv_sections" ON tv_sections
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);

-- Insert default TV sections
INSERT INTO tv_sections (name, slug, icon, section_type, api_source, display_order) VALUES
  ('Trending TV Shows', 'trending-tv', '📺', 'api', 'trending_tv', 1),
  ('Trending on Netflix', 'trending-netflix', '🔴', 'api', 'provider_8', 2),
  ('Trending on Prime', 'trending-prime', '💠', 'api', 'provider_119', 3),
  ('Trending on Hotstar', 'trending-hotstar', '⭐', 'api', 'provider_122', 4),
  ('Top Rated Series', 'top-rated-tv', '🏆', 'api', 'top_rated_tv', 5),
  ('Airing Today', 'airing-today', '📡', 'api', 'airing_today', 6)
ON CONFLICT (slug) DO NOTHING;

-- =============================================
-- 6. CREATE FUNCTION FOR EFFICIENT MOVIE SEARCH
-- =============================================

CREATE OR REPLACE FUNCTION search_movies_library(
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
) AS $$
BEGIN
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
    AND (search_term IS NULL OR search_term = '' OR m.title ILIKE '%' || search_term || '%')
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
$$ LANGUAGE plpgsql;

-- =============================================
-- 7. UPDATE EXISTING MOVIES - EXTRACT GENRE IDS
-- =============================================

-- Function to extract genre IDs from JSONB genres array
CREATE OR REPLACE FUNCTION extract_genre_ids(genres_json JSONB)
RETURNS INTEGER[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT (elem->>'id')::INTEGER
    FROM jsonb_array_elements(COALESCE(genres_json, '[]'::jsonb)) AS elem
    WHERE elem->>'id' IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update existing records to populate genre_ids
UPDATE movies_library 
SET genre_ids = extract_genre_ids(genres)
WHERE genre_ids IS NULL AND genres IS NOT NULL;

-- =============================================
-- COMPLETE!
-- Run this script in Supabase SQL Editor
-- =============================================
