-- =============================================
-- TheaterOrStream - Complete Admin Schema
-- Run this to set up all admin features
-- =============================================

-- Drop existing movies_library if exists (to update schema)
DROP TABLE IF EXISTS movies_library CASCADE;
DROP TABLE IF EXISTS collections CASCADE;

-- =============================================
-- MOVIES LIBRARY - Full curated content
-- =============================================
CREATE TABLE movies_library (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tmdb_id TEXT UNIQUE NOT NULL,
  media_type TEXT DEFAULT 'movie',
  
  -- Basic Info (from TMDB)
  title TEXT NOT NULL,
  original_title TEXT,
  overview TEXT,
  tagline TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  
  -- Release Info
  release_date DATE,
  status TEXT,
  runtime INTEGER,
  
  -- Ratings
  vote_average DECIMAL(3,1),
  vote_count INTEGER,
  popularity DECIMAL(10,3),
  
  -- Categories
  genres JSONB,
  
  -- Production
  production_companies JSONB,
  production_countries JSONB,
  spoken_languages JSONB,
  
  -- Additional TMDB data
  imdb_id TEXT,
  homepage TEXT,
  budget BIGINT,
  revenue BIGINT,
  
  -- ========== CUSTOM ADMIN FIELDS ==========
  
  -- Visibility & Display
  is_active BOOLEAN DEFAULT true,
  featured BOOLEAN DEFAULT false,
  priority INTEGER DEFAULT 0,
  
  -- Collections (for grouping on frontend)
  collection_tags TEXT[], -- e.g., ['editors_choice', 'this_week', 'staff_pick', 'trending']
  display_sections TEXT[], -- e.g., ['home_banner', 'home_trending', 'home_nowplaying']
  
  -- Streaming Platforms
  streaming_platforms JSONB, -- [{"name": "Netflix", "url": "...", "available": true}, ...]
  
  -- Custom Vibe Meter (override auto-generated)
  custom_vibes JSONB, -- {"emotional": 30, "thrilling": 50, "funny": 10, ...}
  
  -- Custom Parent Guide (override auto-generated)
  custom_parent_guide JSONB, -- {"violence": "moderate", "nudity": "mild", ...}
  certification TEXT, -- "PG-13", "R", etc.
  
  -- Editor Notes
  admin_notes TEXT,
  editor_review TEXT, -- Public-facing editor review
  editor_rating DECIMAL(3,1), -- Editor's personal rating
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- COLLECTIONS - Organize content into groups
-- =============================================
CREATE TABLE collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL, -- e.g., 'editors_choice', 'this_week_features'
  name TEXT NOT NULL, -- Display name
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  display_location TEXT, -- 'home', 'browse', 'sidebar', etc.
  style JSONB, -- Custom styling options
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_movies_library_tmdb_id ON movies_library(tmdb_id);
CREATE INDEX idx_movies_library_media_type ON movies_library(media_type);
CREATE INDEX idx_movies_library_featured ON movies_library(featured);
CREATE INDEX idx_movies_library_release_date ON movies_library(release_date DESC);
CREATE INDEX idx_movies_library_popularity ON movies_library(popularity DESC);
CREATE INDEX idx_movies_library_is_active ON movies_library(is_active);
CREATE INDEX idx_movies_library_collection_tags ON movies_library USING GIN(collection_tags);
CREATE INDEX idx_movies_library_display_sections ON movies_library USING GIN(display_sections);
CREATE INDEX idx_collections_slug ON collections(slug);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE movies_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Allow public read on movies_library" ON movies_library;
DROP POLICY IF EXISTS "Allow all on movies_library" ON movies_library;
DROP POLICY IF EXISTS "Allow public read on collections" ON collections;
DROP POLICY IF EXISTS "Allow all on collections" ON collections;

-- Public read (only active content)
CREATE POLICY "Allow public read on movies_library" ON movies_library
  FOR SELECT TO public
  USING (is_active = true);

CREATE POLICY "Allow public read on collections" ON collections
  FOR SELECT TO public
  USING (is_active = true);

-- Full access for all operations (admin)
CREATE POLICY "Allow all on movies_library" ON movies_library
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all on collections" ON collections
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);

-- =============================================
-- INSERT DEFAULT COLLECTIONS
-- =============================================
INSERT INTO collections (slug, name, description, display_location, display_order) VALUES
  ('editors_choice', 'Editor''s Choice', 'Hand-picked favorites by our editors', 'home', 1),
  ('this_week', 'This Week''s Features', 'Featured content for this week', 'home', 2),
  ('staff_picks', 'Staff Picks', 'Recommended by our team', 'home', 3),
  ('hidden_gems', 'Hidden Gems', 'Underrated movies worth watching', 'browse', 4),
  ('classic_must_watch', 'Classic Must-Watch', 'Timeless classics everyone should see', 'browse', 5),
  ('trending_now', 'Trending Now', 'What everyone is watching', 'home', 0)
ON CONFLICT (slug) DO NOTHING;

-- =============================================
-- Add parent_id to reviews if missing
-- =============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'reviews' AND column_name = 'parent_id'
    ) THEN
        ALTER TABLE reviews ADD COLUMN parent_id UUID REFERENCES reviews(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_reviews_parent_id ON reviews(parent_id);
    END IF;
END $$;

-- =============================================
-- DONE! Database is ready for admin panel.
-- =============================================
