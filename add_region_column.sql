-- Add movies_by_region column to homepage_sections table
-- This stores movies per region: { "IN": [...], "US": [...], etc }

-- Add movies_by_region column (JSONB to store region-keyed movie arrays)
ALTER TABLE homepage_sections 
ADD COLUMN IF NOT EXISTS movies_by_region JSONB DEFAULT '{}';

-- Optional: Migrate existing movies to movies_by_region
-- This moves existing movies array to a default region (e.g., 'IN')
-- UPDATE homepage_sections 
-- SET movies_by_region = jsonb_build_object('IN', movies)
-- WHERE movies IS NOT NULL AND jsonb_array_length(movies) > 0;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_homepage_sections_movies_by_region 
ON homepage_sections USING GIN (movies_by_region);

-- Example structure of movies_by_region:
-- {
--   "IN": [
--     {"tmdb_id": 123, "title": "Movie A", "poster_path": "/abc.jpg", ...},
--     {"tmdb_id": 456, "title": "Movie B", "poster_path": "/def.jpg", ...}
--   ],
--   "US": [
--     {"tmdb_id": 789, "title": "Movie C", "poster_path": "/ghi.jpg", ...}
--   ]
-- }
