-- Taste Map accuracy: store what the rebuild learns that has no home yet.
--   learned_people: { directors: [{id,name,profile_path,count,titles}], actors: [...] }
--                   (favorite_actors / favorite_directors stay the user's manual picks)
--   taste_stats:    { mean, sd, ratedCount, likedCount, dislikedCount, filmCount, positiveCount }

ALTER TABLE public.user_taste_profiles
  ADD COLUMN IF NOT EXISTS learned_people jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS taste_stats jsonb NOT NULL DEFAULT '{}'::jsonb;
