-- =============================================
-- Add Default Homepage Sections
-- Run this in Supabase SQL Editor
-- =============================================

-- First, add the is_system column if it doesn't exist
ALTER TABLE homepage_sections ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

-- Insert default sections (will skip if slug already exists)
INSERT INTO homepage_sections (name, slug, icon, section_type, api_source, display_order, is_active, is_system)
VALUES 
    ('Hot Right Now', 'hot-right-now', '🔥', 'api', 'trending', 1, true, true),
    ('In Theaters', 'in-theaters', '🎬', 'api', 'now_playing', 2, true, true),
    ('Trending on Netflix', 'netflix-trending', '📺', 'api', 'provider_8', 3, true, true),
    ('Trending on Prime', 'prime-trending', '📦', 'api', 'provider_119', 4, true, true),
    ('Trending on Hotstar', 'hotstar-trending', '⭐', 'api', 'provider_122', 5, true, true)
ON CONFLICT (slug) DO NOTHING;

-- Update display order for Editor Pick to be after the defaults
UPDATE homepage_sections SET display_order = 10 WHERE slug = 'editor-pick' OR name ILIKE '%editor%';

-- Verify
SELECT name, slug, icon, section_type, display_order, is_active, is_system FROM homepage_sections ORDER BY display_order;
