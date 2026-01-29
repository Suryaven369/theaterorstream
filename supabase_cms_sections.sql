-- =============================================
-- Homepage Sections CMS - Supabase Schema
-- Allows admin to create custom homepage sections
-- =============================================

-- Homepage sections table
CREATE TABLE IF NOT EXISTS homepage_sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,                    -- "Hot Right Now", "Staff Picks", etc.
  slug TEXT UNIQUE NOT NULL,             -- "hot-right-now", "staff-picks"
  description TEXT,
  icon TEXT,                             -- Emoji or icon identifier: "🔥", "⭐"
  display_order INTEGER DEFAULT 0,       -- Position on homepage (1, 2, 3...)
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,       -- System sections cannot be deleted
  
  -- Section configuration
  section_type TEXT DEFAULT 'manual',    -- 'manual', 'api', 'collection'
  api_source TEXT,                       -- For API sections: 'trending', 'now_playing', 'popular'
  collection_slug TEXT,                  -- For collection-based sections
  
  -- Manual movie assignments (array of objects)
  movies JSONB DEFAULT '[]'::jsonb,      -- [{tmdb_id, title, poster_path, media_type, order}]
  
  max_movies INTEGER DEFAULT 10,
  
  -- Styling/display options
  style_variant TEXT DEFAULT 'grid',     -- 'grid', 'horizontal', 'featured'
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_homepage_sections_display_order ON homepage_sections(display_order);
CREATE INDEX IF NOT EXISTS idx_homepage_sections_active ON homepage_sections(is_active);
CREATE INDEX IF NOT EXISTS idx_homepage_sections_slug ON homepage_sections(slug);

-- Enable RLS
ALTER TABLE homepage_sections ENABLE ROW LEVEL SECURITY;

-- Public read for active sections (frontend needs to read these)
CREATE POLICY "Allow public read active sections" ON homepage_sections
  FOR SELECT TO public
  USING (is_active = true);

-- Admin full access (allow all for authenticated users for now)
-- In production, you'd want to restrict this to admin users only
CREATE POLICY "Allow all on homepage_sections" ON homepage_sections
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);

-- =============================================
-- INSTRUCTIONS:
-- 1. Go to your Supabase project dashboard
-- 2. Click on "SQL Editor" in the sidebar
-- 3. Create a new query
-- 4. Paste this entire SQL script
-- 5. Click "Run" to execute
-- =============================================
