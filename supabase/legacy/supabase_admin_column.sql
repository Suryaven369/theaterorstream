-- =============================================
-- Add is_admin column to user_profiles
-- Run this in Supabase SQL Editor
-- =============================================

-- Add is_admin column
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- =============================================
-- IMPORTANT: To make yourself an admin, run:
-- UPDATE user_profiles SET is_admin = true WHERE username = 'YOUR_USERNAME';
-- =============================================
