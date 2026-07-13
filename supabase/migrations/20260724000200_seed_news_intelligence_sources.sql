-- Seed optimal RSS sources for News Intelligence System
-- Strategy: Google Trends for trending discovery + Trade publications for quality articles

-- =============================================================================
-- 1. UPDATE EXISTING SOURCES with News Intelligence metadata
-- =============================================================================

-- Variety - Top trade publication
UPDATE public.rss_sources SET 
    source_type = 'trade_publication',
    trust_score = 0.92,
    auto_publish_allowed = true,
    region = 'US',
    language = 'en'
WHERE name ILIKE '%variety%' OR feed_url ILIKE '%variety.com%';

-- Deadline - Fast breaking news trade
UPDATE public.rss_sources SET 
    source_type = 'trade_publication',
    trust_score = 0.90,
    auto_publish_allowed = true,
    region = 'US',
    language = 'en'
WHERE name ILIKE '%deadline%' OR feed_url ILIKE '%deadline.com%';

-- /Film (SlashFilm) - Quality film journalism
UPDATE public.rss_sources SET 
    source_type = 'film_publication',
    trust_score = 0.80,
    auto_publish_allowed = false,
    region = 'US',
    language = 'en'
WHERE name ILIKE '%film%' OR feed_url ILIKE '%slashfilm.com%';

-- ScreenRant - Broad coverage
UPDATE public.rss_sources SET 
    source_type = 'film_publication',
    trust_score = 0.70,
    auto_publish_allowed = false,
    region = 'US',
    language = 'en'
WHERE name ILIKE '%screenrant%' OR feed_url ILIKE '%screenrant.com%';

-- Collider - Good general coverage
UPDATE public.rss_sources SET 
    source_type = 'film_publication',
    trust_score = 0.75,
    auto_publish_allowed = false,
    region = 'US',
    language = 'en'
WHERE name ILIKE '%collider%' OR feed_url ILIKE '%collider.com%';

-- =============================================================================
-- 2. ADD NEW HIGH-QUALITY SOURCES
-- =============================================================================

-- The Hollywood Reporter - Industry standard trade
INSERT INTO public.rss_sources (name, feed_url, site_url, source_type, trust_score, auto_publish_allowed, region, language, is_active)
VALUES ('The Hollywood Reporter', 'https://www.hollywoodreporter.com/feed/', 'https://www.hollywoodreporter.com', 'trade_publication', 0.92, true, 'US', 'en', true)
ON CONFLICT (feed_url) DO UPDATE SET
    source_type = EXCLUDED.source_type,
    trust_score = EXCLUDED.trust_score,
    auto_publish_allowed = EXCLUDED.auto_publish_allowed;

-- IndieWire - Indie & arthouse focus
INSERT INTO public.rss_sources (name, feed_url, site_url, source_type, trust_score, auto_publish_allowed, region, language, is_active)
VALUES ('IndieWire', 'https://www.indiewire.com/feed/', 'https://www.indiewire.com', 'film_publication', 0.82, false, 'US', 'en', true)
ON CONFLICT (feed_url) DO UPDATE SET
    source_type = EXCLUDED.source_type,
    trust_score = EXCLUDED.trust_score;

-- Entertainment Weekly - Major entertainment news
INSERT INTO public.rss_sources (name, feed_url, site_url, source_type, trust_score, auto_publish_allowed, region, language, is_active)
VALUES ('Entertainment Weekly', 'https://ew.com/feed/', 'https://ew.com', 'major_news', 0.75, false, 'US', 'en', true)
ON CONFLICT (feed_url) DO UPDATE SET
    source_type = EXCLUDED.source_type,
    trust_score = EXCLUDED.trust_score;

-- IGN Movies - Gaming/movies crossover
INSERT INTO public.rss_sources (name, feed_url, site_url, source_type, trust_score, auto_publish_allowed, region, language, is_active)
VALUES ('IGN', 'https://feeds.feedburner.com/ign/movies-articles', 'https://www.ign.com/movies', 'film_publication', 0.70, false, 'US', 'en', true)
ON CONFLICT (feed_url) DO UPDATE SET
    source_type = EXCLUDED.source_type,
    trust_score = EXCLUDED.trust_score;

-- ComicBook.com - Superhero/franchise focus
INSERT INTO public.rss_sources (name, feed_url, site_url, source_type, trust_score, auto_publish_allowed, region, language, is_active)
VALUES ('ComicBook.com', 'https://comicbook.com/movies/feed/', 'https://comicbook.com', 'film_publication', 0.65, false, 'US', 'en', true)
ON CONFLICT (feed_url) DO UPDATE SET
    source_type = EXCLUDED.source_type,
    trust_score = EXCLUDED.trust_score;

-- =============================================================================
-- 3. ADD GOOGLE TRENDS FOR TRENDING DISCOVERY
-- =============================================================================
-- Note: Google Trends RSS returns ALL trending searches (no category filter).
-- The News Intelligence keyword filter and AI classifier will filter out
-- non-entertainment content automatically.

-- Clean up any old incorrect Google Trends URLs
DELETE FROM public.rss_sources WHERE feed_url LIKE '%trends.google.com/trends/trendingsearches%';

-- Google Trends - US (Primary trending signal)
INSERT INTO public.rss_sources (name, feed_url, site_url, source_type, trust_score, auto_publish_allowed, region, language, is_active)
VALUES ('Google Trends - US', 'https://trends.google.com/trending/rss?geo=US', 'https://trends.google.com', 'aggregator', 0.55, false, 'US', 'en', true)
ON CONFLICT (feed_url) DO UPDATE SET
    source_type = EXCLUDED.source_type,
    trust_score = EXCLUDED.trust_score,
    is_active = true;

-- Google Trends - India (For Bollywood coverage)
INSERT INTO public.rss_sources (name, feed_url, site_url, source_type, trust_score, auto_publish_allowed, region, language, is_active)
VALUES ('Google Trends - India', 'https://trends.google.com/trending/rss?geo=IN', 'https://trends.google.com', 'aggregator', 0.55, false, 'IN', 'en', true)
ON CONFLICT (feed_url) DO UPDATE SET
    source_type = EXCLUDED.source_type,
    trust_score = EXCLUDED.trust_score,
    region = 'IN',
    is_active = true;

-- Google Trends - UK
INSERT INTO public.rss_sources (name, feed_url, site_url, source_type, trust_score, auto_publish_allowed, region, language, is_active)
VALUES ('Google Trends - UK', 'https://trends.google.com/trending/rss?geo=GB', 'https://trends.google.com', 'aggregator', 0.55, false, 'GB', 'en', true)
ON CONFLICT (feed_url) DO UPDATE SET
    source_type = EXCLUDED.source_type,
    trust_score = EXCLUDED.trust_score,
    is_active = true;

-- =============================================================================
-- 4. ADD INTERNATIONAL SOURCES
-- =============================================================================

-- Screen Daily - International film industry
INSERT INTO public.rss_sources (name, feed_url, site_url, source_type, trust_score, auto_publish_allowed, region, language, is_active)
VALUES ('Screen Daily', 'https://www.screendaily.com/feed', 'https://www.screendaily.com', 'trade_publication', 0.85, false, 'GB', 'en', true)
ON CONFLICT (feed_url) DO UPDATE SET
    source_type = EXCLUDED.source_type,
    trust_score = EXCLUDED.trust_score;

-- =============================================================================
-- 5. SUMMARY OF SOURCE TIERS
-- =============================================================================
-- 
-- TIER 1 - Trade Publications (trust: 0.85-0.92, auto-publish: YES)
--   - Variety, Deadline, The Hollywood Reporter, Screen Daily
--   - These are authoritative industry sources
--
-- TIER 2 - Film Publications (trust: 0.70-0.82, auto-publish: NO)
--   - IndieWire, /Film, Collider, ScreenRant, IGN, ComicBook.com, EW
--   - Good coverage but needs review before publishing
--
-- TIER 3 - Aggregators/Trends (trust: 0.55, auto-publish: NO)
--   - Google Trends feeds
--   - Used for trending signal, not content
--   - Low trust score means they boost trend detection but don't auto-publish alone
--
-- The system works best when:
--   1. Google Trends shows something is trending
--   2. Multiple trade publications cover the same story
--   3. Combined trend score exceeds threshold → auto-publish
-- =============================================================================
