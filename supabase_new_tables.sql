-- =============================================
-- NEW TABLES FOR USER MOVIE INTERACTIONS
-- Run this in Supabase SQL Editor
-- =============================================

-- Watchlist - Movies user wants to watch
CREATE TABLE IF NOT EXISTS user_watchlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id TEXT NOT NULL,
  movie_title TEXT NOT NULL,
  poster_path TEXT,
  media_type TEXT DEFAULT 'movie',
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, movie_id)
);

-- Liked Movies - Movies user has liked
CREATE TABLE IF NOT EXISTS user_liked_movies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id TEXT NOT NULL,
  movie_title TEXT NOT NULL,
  poster_path TEXT,
  media_type TEXT DEFAULT 'movie',
  liked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, movie_id)
);

-- Watched Movies - Movies user has marked as watched
CREATE TABLE IF NOT EXISTS user_watched_movies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id TEXT NOT NULL,
  movie_title TEXT NOT NULL,
  poster_path TEXT,
  media_type TEXT DEFAULT 'movie',
  watched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, movie_id)
);

-- User Collections - Custom lists (public/private)
CREATE TABLE IF NOT EXISTS user_collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  cover_image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Collection Movies - Movies in collections
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

-- User Follows - Social following
CREATE TABLE IF NOT EXISTS user_follows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- =============================================
-- INDEXES FOR BETTER PERFORMANCE
-- =============================================

CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON user_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_movie_id ON user_watchlist(movie_id);
CREATE INDEX IF NOT EXISTS idx_liked_movies_user_id ON user_liked_movies(user_id);
CREATE INDEX IF NOT EXISTS idx_watched_movies_user_id ON user_watched_movies(user_id);
CREATE INDEX IF NOT EXISTS idx_collections_user_id ON user_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collections_public ON user_collections(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_collection_movies_collection ON collection_movies(collection_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON user_follows(following_id);

-- =============================================
-- ENABLE ROW LEVEL SECURITY
-- =============================================

ALTER TABLE user_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_liked_movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_watched_movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Watchlist policies
CREATE POLICY "Users can view own watchlist" ON user_watchlist
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can add to watchlist" ON user_watchlist
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove from watchlist" ON user_watchlist
  FOR DELETE USING (auth.uid() = user_id);

-- Liked movies policies
CREATE POLICY "Users can view own liked" ON user_liked_movies
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can like movies" ON user_liked_movies
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike movies" ON user_liked_movies
  FOR DELETE USING (auth.uid() = user_id);

-- Watched movies policies
CREATE POLICY "Users can view own watched" ON user_watched_movies
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can mark watched" ON user_watched_movies
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unmark watched" ON user_watched_movies
  FOR DELETE USING (auth.uid() = user_id);

-- Collections policies
CREATE POLICY "Users can view own collections" ON user_collections
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Public can view public collections" ON user_collections
  FOR SELECT USING (is_public = true);
CREATE POLICY "Users can create collections" ON user_collections
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own collections" ON user_collections
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own collections" ON user_collections
  FOR DELETE USING (auth.uid() = user_id);

-- Collection movies policies
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

-- Follows policies
CREATE POLICY "Anyone can view follows" ON user_follows
  FOR SELECT USING (true);
CREATE POLICY "Users can follow others" ON user_follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow" ON user_follows
  FOR DELETE USING (auth.uid() = follower_id);
