-- Run this in your Supabase SQL Editor to fix collection_movies table

-- Drop existing policies first (if they exist)
DROP POLICY IF EXISTS "View collection movies for own or public" ON collection_movies;
DROP POLICY IF EXISTS "Add to own collections" ON collection_movies;
DROP POLICY IF EXISTS "Remove from own collections" ON collection_movies;

-- Create the collection_movies table if it doesn't exist
CREATE TABLE IF NOT EXISTS collection_movies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id UUID NOT NULL REFERENCES user_collections(id) ON DELETE CASCADE,
  movie_id TEXT NOT NULL,
  movie_title TEXT NOT NULL,
  poster_path TEXT,
  media_type TEXT DEFAULT 'movie',
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(collection_id, movie_id)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_collection_movies_collection ON collection_movies(collection_id);

-- Enable RLS
ALTER TABLE collection_movies ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "View collection movies for own or public" ON collection_movies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_collections c 
      WHERE c.id = collection_id 
      AND (c.user_id = auth.uid() OR c.is_public = true)
    )
  );

CREATE POLICY "Add to own collections" ON collection_movies
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_collections c 
      WHERE c.id = collection_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Remove from own collections" ON collection_movies
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_collections c 
      WHERE c.id = collection_id AND c.user_id = auth.uid()
    )
  );

-- Grant access to authenticated users
GRANT ALL ON collection_movies TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
