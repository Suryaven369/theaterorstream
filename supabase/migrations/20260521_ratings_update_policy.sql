-- Fix: re-rating a movie failed because RLS allowed INSERT but not UPDATE.
-- Run in Supabase SQL Editor if ratings already exist in production.

-- Remove duplicate rows before adding unique index (keeps newest per user/movie)
DELETE FROM ratings a
USING ratings b
WHERE a.user_id = b.user_id
  AND a.movie_id = b.movie_id
  AND a.created_at < b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_user_movie
  ON ratings(user_id, movie_id);

DROP POLICY IF EXISTS "Allow public update on ratings" ON ratings;
CREATE POLICY "Allow public update on ratings" ON ratings
  FOR UPDATE TO public
  USING (true)
  WITH CHECK (true);
