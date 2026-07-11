-- Seed 40+ tiered badges for social gamification

INSERT INTO public.badge_definitions (id, name, description, icon, sort_order, category, tier, threshold, unlock_message)
VALUES
  -- Watching
  ('watch_bronze', 'First Reel', 'Logged your first movie', '🎬', 10, 'watching', 'bronze', 1, 'Your cinematic journey begins!'),
  ('watch_silver', 'Film Student', 'Logged 25 movies', '📽️', 11, 'watching', 'silver', 25, 'You are building a serious watch history.'),
  ('watch_gold', 'Cinephile', 'Logged 100 movies', '🎞️', 12, 'watching', 'gold', 100, 'True cinephile status unlocked.'),
  ('watch_platinum', 'Film Historian', 'Logged 500 movies', '🏛️', 13, 'watching', 'platinum', 500, 'Legendary dedication to cinema.'),
  -- Reviewing (social_reviews)
  ('review_bronze', 'First Words', 'Published your first review', '✍️', 20, 'reviewing', 'bronze', 1, 'Your voice joins the community.'),
  ('review_silver', 'Critic', 'Published 10 reviews', '📝', 21, 'reviewing', 'silver', 10, 'Rising critic in the community.'),
  ('review_gold', 'Roger Ebert', 'Published 50 reviews', '⭐', 22, 'reviewing', 'gold', 50, 'Your reviews shape taste.'),
  ('review_platinum', 'Pauline Kael', 'Published 200 reviews', '🏆', 23, 'reviewing', 'platinum', 200, 'Elite reviewer status.'),
  -- Social graph
  ('social_bronze', 'First Follow', 'Followed your first cinephile', '👋', 30, 'social', 'bronze', 1, 'Welcome to the community.'),
  ('social_silver', 'Networker', 'Following 10 people', '🤝', 31, 'social', 'silver', 10, 'Your network is growing.'),
  ('social_gold', 'Influencer', '100 followers', '📣', 32, 'social', 'gold', 100, 'People trust your taste.'),
  ('social_platinum', 'Celebrity', '1000 followers', '🌟', 33, 'social', 'platinum', 1000, 'Taste-maker celebrity.'),
  -- Collections
  ('collection_bronze', 'Curator', 'Created your first public list', '📋', 40, 'collections', 'bronze', 1, 'Your first curated list is live.'),
  ('collection_silver', 'Archivist', 'Created 5 public lists', '🗂️', 41, 'collections', 'silver', 5, 'Master list builder.'),
  ('collection_gold', 'Museum', 'Created 25 public lists', '🏛️', 42, 'collections', 'gold', 25, 'Curatorial excellence.'),
  ('collection_platinum', 'Criterion', 'Created 100 public lists', '💎', 43, 'collections', 'platinum', 100, 'Ultimate curator.'),
  -- Streaks
  ('streak_bronze', 'Week Warrior', '7-day watch streak', '🔥', 50, 'streaks', 'bronze', 7, 'One week of consistent watching!'),
  ('streak_silver', 'Month Master', '30-day watch streak', '📅', 51, 'streaks', 'silver', 30, 'A full month on fire.'),
  ('streak_gold', 'Season King', '90-day watch streak', '👑', 52, 'streaks', 'gold', 90, 'Season-long dedication.'),
  ('streak_platinum', 'Year Legend', '365-day watch streak', '🏅', 53, 'streaks', 'platinum', 365, 'Unstoppable year-long streak.'),
  -- Genre explorer
  ('genre_bronze', 'Adventurer', 'Logged movies in 5 genres', '🗺️', 60, 'genre', 'bronze', 5, 'Exploring diverse cinema.'),
  ('genre_silver', 'Explorer', 'Logged movies in 10 genres', '🧭', 61, 'genre', 'silver', 10, 'Broad taste explorer.'),
  ('genre_gold', 'Globetrotter', 'Logged movies in 15 genres', '🌍', 62, 'genre', 'gold', 15, 'World-class genre range.'),
  ('genre_platinum', 'Polymath', 'Logged movies in 20+ genres', '🎓', 63, 'genre', 'platinum', 20, 'No genre left behind.'),
  -- Decades
  ('decade_bronze', 'Time Traveler', 'Watched films from 5 decades', '⏳', 70, 'decades', 'bronze', 5, 'Traveling through cinema history.'),
  ('decade_silver', 'Historian', 'Watched films from 8+ decades', '📜', 71, 'decades', 'silver', 8, 'Cinema historian unlocked.'),
  -- Theater
  ('theater_bronze', 'Theater Lover', '5 theater watches', '🍿', 80, 'theater', 'bronze', 5, 'Big screen enthusiast.'),
  ('theater_silver', 'Big Screen', '25 theater watches', '🎥', 81, 'theater', 'silver', 25, 'Theater regular.'),
  ('theater_gold', 'Premiere', '100 theater watches', '🌟', 82, 'theater', 'gold', 100, 'Theater devotee.'),
  -- Community (review upvotes on legacy reviews + social)
  ('community_bronze', 'Helpful', '10 helpful upvotes on your reviews', '👍', 90, 'community', 'bronze', 10, 'Your reviews help others.'),
  ('community_silver', 'Respected', '100 helpful upvotes', '🎖️', 91, 'community', 'silver', 100, 'Community respects your takes.'),
  ('community_gold', 'Legendary', '1000 helpful upvotes', '🏆', 92, 'community', 'gold', 1000, 'Legendary voice in the community.'),
  -- Ratings
  ('rating_bronze', 'First Rating', 'Rated your first film with TOS', '⭐', 100, 'rating', 'bronze', 1, 'Your taste profile is forming.'),
  ('rating_silver', 'Taste Builder', 'Rated 25 films', '📊', 101, 'rating', 'silver', 25, 'Strong taste signal.'),
  ('rating_gold', 'Axis Master', 'Rated 100 films', '🎯', 102, 'rating', 'gold', 100, 'Deep taste calibration.'),
  -- Legacy badges (keep compatibility)
  ('first_reel', 'First Reel', 'Logged your first movie', '🎬', 1, 'watching', 'bronze', 1, NULL),
  ('family_night_hero', 'Family Night Hero', '10 family watch logs', '👨‍👩‍👧', 2, 'watching', 'silver', 10, NULL),
  ('platform_explorer', 'Platform Explorer', 'Logged on 5 streaming platforms', '📺', 3, 'watching', 'silver', 5, NULL),
  ('taste_maker', 'Taste Maker', '10 reviews with strong upvotes', '⭐', 4, 'community', 'gold', 10, NULL),
  ('decisive', 'Decisive', 'Used Decision Mode 20 times', '🎯', 5, 'watching', 'silver', 20, NULL),
  ('theater_buff', 'Theater Buff', '10 theater watches', '🍿', 6, 'theater', 'silver', 10, NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  category = EXCLUDED.category,
  tier = EXCLUDED.tier,
  threshold = EXCLUDED.threshold,
  unlock_message = EXCLUDED.unlock_message;
