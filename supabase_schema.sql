-- =============================================
-- TheaterOrStream - Supabase Database Schema
-- Reddit-inspired Rating & Review System + Movie Library
-- =============================================

-- =============================================
-- USER PROFILES - Store user profile data
-- =============================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_id TEXT,
  date_of_birth DATE,
  is_onboarded BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Users can update their own profile  
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Allow public read for username lookups (for profile pages)
CREATE POLICY "Public can read profiles" ON user_profiles
  FOR SELECT USING (true);

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);

-- =============================================

-- Create ratings table
CREATE TABLE IF NOT EXISTS ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  movie_id TEXT NOT NULL,
  movie_title TEXT NOT NULL,
  user_id TEXT DEFAULT 'anonymous',
  
  -- TOS Rating Categories (0-10 scale)
  acting DECIMAL(3,1),
  screenplay DECIMAL(3,1),
  sound DECIMAL(3,1),
  direction DECIMAL(3,1),
  entertainment DECIMAL(3,1),
  pacing DECIMAL(3,1),
  cinematography DECIMAL(3,1),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create reviews table (Reddit-style with upvotes/downvotes and threading)
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  movie_id TEXT NOT NULL,
  movie_title TEXT NOT NULL,
  user_id TEXT DEFAULT 'anonymous',
  username TEXT DEFAULT 'Anonymous',
  
  -- Parent reference for threaded replies (NULL = top-level comment)
  parent_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
  
  review_text TEXT NOT NULL,
  
  -- Reddit-style voting
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- MOVIES LIBRARY - Admin Curated Content
-- =============================================
CREATE TABLE IF NOT EXISTS movies_library (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tmdb_id TEXT UNIQUE NOT NULL,
  media_type TEXT DEFAULT 'movie', -- 'movie' or 'tv'
  
  -- Basic Info (from TMDB)
  title TEXT NOT NULL,
  original_title TEXT,
  overview TEXT,
  tagline TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  
  -- Release Info
  release_date DATE,
  status TEXT, -- Released, Upcoming, etc.
  runtime INTEGER,
  
  -- Ratings
  vote_average DECIMAL(3,1),
  vote_count INTEGER,
  popularity DECIMAL(10,3),
  
  -- Categories
  genres JSONB, -- Array of genre objects
  
  -- Production
  production_companies JSONB,
  production_countries JSONB,
  spoken_languages JSONB,
  
  -- Custom Admin Fields
  admin_notes TEXT,
  featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- For ordering
  custom_tags TEXT[], -- Custom tags like 'staff_pick', 'trending', etc.
  
  -- Additional TMDB data
  imdb_id TEXT,
  homepage TEXT,
  budget BIGINT,
  revenue BIGINT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() -- Last TMDB sync
);

-- Create index for threaded replies
CREATE INDEX IF NOT EXISTS idx_reviews_parent_id ON reviews(parent_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_ratings_movie_id ON ratings(movie_id);
CREATE INDEX IF NOT EXISTS idx_reviews_movie_id ON reviews(movie_id);
CREATE INDEX IF NOT EXISTS idx_reviews_upvotes ON reviews(upvotes DESC);

-- Movies library indexes
CREATE INDEX IF NOT EXISTS idx_movies_library_tmdb_id ON movies_library(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_movies_library_media_type ON movies_library(media_type);
CREATE INDEX IF NOT EXISTS idx_movies_library_featured ON movies_library(featured);
CREATE INDEX IF NOT EXISTS idx_movies_library_release_date ON movies_library(release_date DESC);
CREATE INDEX IF NOT EXISTS idx_movies_library_popularity ON movies_library(popularity DESC);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE movies_library ENABLE ROW LEVEL SECURITY;

-- Policy to allow anyone to read ratings and reviews
CREATE POLICY "Allow public read access on ratings" ON ratings
  FOR SELECT TO public
  USING (true);

CREATE POLICY "Allow public read access on reviews" ON reviews
  FOR SELECT TO public
  USING (true);

CREATE POLICY "Allow public read on movies_library" ON movies_library
  FOR SELECT TO public
  USING (is_active = true);

-- Policy to allow anyone to insert ratings and reviews (for anonymous users)
CREATE POLICY "Allow public insert on ratings" ON ratings
  FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "Allow public insert on reviews" ON reviews
  FOR INSERT TO public
  WITH CHECK (true);

-- Policy to allow updating reviews (for upvotes/downvotes)
CREATE POLICY "Allow public update on reviews" ON reviews
  FOR UPDATE TO public
  USING (true);

-- Admin policies for movies_library (full access)
CREATE POLICY "Allow all on movies_library" ON movies_library
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

-- =============================================
-- USER MOVIE INTERACTIONS
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
-- INDEXES FOR NEW TABLES
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
-- RLS POLICIES FOR NEW TABLES
-- =============================================

ALTER TABLE user_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_liked_movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_watched_movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

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
