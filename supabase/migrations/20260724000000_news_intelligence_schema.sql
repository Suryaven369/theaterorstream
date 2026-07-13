-- News Intelligence System: Schema extensions for automated editorial filtering,
-- AI classification, story clustering, trend scoring, and auto-publishing.
-- Extends existing rss_sources and feed_articles tables.

-- =============================================================================
-- 1. EXTEND rss_sources TABLE
-- =============================================================================

-- Source type classification for trust/authority weighting
ALTER TABLE public.rss_sources ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'news_publication';
COMMENT ON COLUMN public.rss_sources.source_type IS 'Source classification: official_studio, trade_publication, film_publication, major_news, regional_publication, unverified';

-- Trust score (0.00-1.00) affects trend scoring weight
ALTER TABLE public.rss_sources ADD COLUMN IF NOT EXISTS trust_score decimal(3,2) DEFAULT 0.70;
COMMENT ON COLUMN public.rss_sources.trust_score IS 'Editorial trust score 0.00-1.00, affects trend weighting';

-- Geographic and language metadata
ALTER TABLE public.rss_sources ADD COLUMN IF NOT EXISTS region text DEFAULT 'US';
ALTER TABLE public.rss_sources ADD COLUMN IF NOT EXISTS language text DEFAULT 'en';

-- Auto-publish control (opt-in per source)
ALTER TABLE public.rss_sources ADD COLUMN IF NOT EXISTS auto_publish_allowed boolean DEFAULT false;
COMMENT ON COLUMN public.rss_sources.auto_publish_allowed IS 'If true, articles from this source can be auto-published when trend threshold met';

-- Default category assignment
ALTER TABLE public.rss_sources ADD COLUMN IF NOT EXISTS default_category text;

-- Failure tracking for reliability monitoring
ALTER TABLE public.rss_sources ADD COLUMN IF NOT EXISTS failure_count integer DEFAULT 0;

-- =============================================================================
-- 2. EXTEND feed_articles TABLE
-- =============================================================================

-- Classification status tracking
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS classification_status text DEFAULT 'pending';
COMMENT ON COLUMN public.feed_articles.classification_status IS 'pending, processing, completed, failed, skipped';

-- Core relevance scoring
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS relevant boolean;
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS relevance_score integer;
COMMENT ON COLUMN public.feed_articles.relevance_score IS 'AI-assessed relevance 0-100';

-- Category classification
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS primary_category text;
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS secondary_categories text[];
COMMENT ON COLUMN public.feed_articles.primary_category IS 'e.g. casting_news, release_announcement, box_office, production_update';

-- Professional vs gossip scoring
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS professional_focus_score integer;
COMMENT ON COLUMN public.feed_articles.professional_focus_score IS 'Industry/professional focus 0-100';

-- Content quality probability scores (0.00-1.00)
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS gossip_probability decimal(3,2);
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS lifestyle_probability decimal(3,2);
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS controversy_probability decimal(3,2);
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS rumour_probability decimal(3,2);
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS clickbait_probability decimal(3,2);

-- Article quality assessment
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS article_quality_score integer;
COMMENT ON COLUMN public.feed_articles.article_quality_score IS 'Overall quality 0-100';

ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS verification_level text;
COMMENT ON COLUMN public.feed_articles.verification_level IS 'studio_confirmed, multiple_sources, single_source, rumour, unverified';

-- Entity extraction (stored as JSONB for flexibility)
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS entities_json jsonb DEFAULT '{}';
COMMENT ON COLUMN public.feed_articles.entities_json IS 'Extracted entities: {movies: [], people: [], studios: [], franchises: [], awards: []}';

-- Clustering
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS cluster_id uuid;
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS is_primary_source boolean DEFAULT false;
COMMENT ON COLUMN public.feed_articles.is_primary_source IS 'True if this article is the authoritative source for its cluster';

-- Keyword analysis scores
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS positive_keyword_score integer DEFAULT 0;
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS negative_keyword_score integer DEFAULT 0;
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS rejection_reason text;

-- AI-generated content
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS ai_main_event text;
COMMENT ON COLUMN public.feed_articles.ai_main_event IS 'One-line event description from AI';

ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS ai_why_it_matters text;
COMMENT ON COLUMN public.feed_articles.ai_why_it_matters IS 'Editorial significance explanation';

-- AI metadata
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS model_version text;
ALTER TABLE public.feed_articles ADD COLUMN IF NOT EXISTS classified_at timestamptz;

-- Indexes for classification queries
CREATE INDEX IF NOT EXISTS idx_feed_articles_classification_status 
  ON public.feed_articles (classification_status);
CREATE INDEX IF NOT EXISTS idx_feed_articles_cluster 
  ON public.feed_articles (cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feed_articles_relevance 
  ON public.feed_articles (relevance_score DESC) WHERE relevance_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feed_articles_gossip 
  ON public.feed_articles (gossip_probability) WHERE gossip_probability IS NOT NULL;

-- =============================================================================
-- 3. CREATE news_story_clusters TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.news_story_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Story identification
  canonical_title text NOT NULL,
  main_event text,
  primary_category text,
  event_type text,
  
  -- Aggregated entities from all articles
  entities_json jsonb DEFAULT '{}',
  
  -- Timing
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  
  -- Coverage metrics
  article_count integer DEFAULT 1,
  trusted_source_count integer DEFAULT 0,
  official_source_count integer DEFAULT 0,
  
  -- Verification status
  verification_level text DEFAULT 'unconfirmed',
  
  -- Trend scoring
  trend_score integer DEFAULT 0,
  trend_velocity decimal(5,2) DEFAULT 0,
  peak_trend_score integer DEFAULT 0,
  
  -- Status management
  status text DEFAULT 'active' CHECK (status IN ('active', 'published', 'merged', 'archived', 'rejected')),
  
  -- Link to published article if auto-published
  published_post_id uuid,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.news_story_clusters IS 'Groups related news articles about the same story/event';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clusters_trend_score 
  ON public.news_story_clusters (trend_score DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_clusters_status 
  ON public.news_story_clusters (status, trend_score DESC);
CREATE INDEX IF NOT EXISTS idx_clusters_last_seen 
  ON public.news_story_clusters (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_clusters_category 
  ON public.news_story_clusters (primary_category);

-- Add foreign key from feed_articles to clusters
ALTER TABLE public.feed_articles 
  ADD CONSTRAINT fk_feed_articles_cluster 
  FOREIGN KEY (cluster_id) 
  REFERENCES public.news_story_clusters(id) 
  ON DELETE SET NULL;

-- RLS policies
ALTER TABLE public.news_story_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage clusters" ON public.news_story_clusters
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

CREATE POLICY "Public read active clusters" ON public.news_story_clusters
  FOR SELECT TO public USING (status IN ('active', 'published'));

-- =============================================================================
-- 4. CREATE news_keyword_dictionaries TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.news_keyword_dictionaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Categorization
  category text NOT NULL,
  subcategory text,
  
  -- The keyword/phrase
  term text NOT NULL,
  
  -- Weighting (higher = stronger signal)
  weight integer DEFAULT 1 CHECK (weight >= 1 AND weight <= 10),
  
  -- Whether this is a multi-word phrase
  is_phrase boolean DEFAULT false,
  
  -- Active flag for soft-disable
  is_active boolean DEFAULT true,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Prevent duplicate terms in same category
  UNIQUE(category, subcategory, term)
);

COMMENT ON TABLE public.news_keyword_dictionaries IS 'Keyword dictionaries for pre-AI content filtering';
COMMENT ON COLUMN public.news_keyword_dictionaries.category IS 'rejection, positive, category_indicator';
COMMENT ON COLUMN public.news_keyword_dictionaries.subcategory IS 'relationship, lifestyle, gossip, movie_term, casting, etc.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_keywords_category 
  ON public.news_keyword_dictionaries (category, is_active);
CREATE INDEX IF NOT EXISTS idx_keywords_term 
  ON public.news_keyword_dictionaries (term) WHERE is_active = true;

-- RLS policies
ALTER TABLE public.news_keyword_dictionaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage keywords" ON public.news_keyword_dictionaries
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

CREATE POLICY "Public read keywords" ON public.news_keyword_dictionaries
  FOR SELECT TO public USING (is_active = true);

-- =============================================================================
-- 5. CREATE news_processing_logs TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.news_processing_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References (nullable for system-level logs)
  article_id uuid REFERENCES public.feed_articles(id) ON DELETE CASCADE,
  cluster_id uuid REFERENCES public.news_story_clusters(id) ON DELETE CASCADE,
  
  -- Processing step identification
  step text NOT NULL,
  
  -- Outcome
  status text NOT NULL CHECK (status IN ('success', 'failed', 'skipped', 'warning')),
  message text,
  
  -- Additional context (scores, reasons, etc.)
  metadata_json jsonb,
  
  -- Processing duration in ms
  duration_ms integer,
  
  -- Timestamp
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.news_processing_logs IS 'Audit log for news intelligence pipeline steps';
COMMENT ON COLUMN public.news_processing_logs.step IS 'keyword_filter, classification, entity_extraction, clustering, trend_scoring, publish_decision';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_logs_article 
  ON public.news_processing_logs (article_id, created_at DESC) WHERE article_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_logs_cluster 
  ON public.news_processing_logs (cluster_id, created_at DESC) WHERE cluster_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_logs_step_status 
  ON public.news_processing_logs (step, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_recent 
  ON public.news_processing_logs (created_at DESC);

-- RLS policies
ALTER TABLE public.news_processing_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage logs" ON public.news_processing_logs
  FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

-- =============================================================================
-- 6. UPDATE TRIGGERS
-- =============================================================================

-- Auto-update updated_at for clusters
CREATE OR REPLACE FUNCTION public.update_cluster_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cluster_updated_at ON public.news_story_clusters;
CREATE TRIGGER trigger_cluster_updated_at
  BEFORE UPDATE ON public.news_story_clusters
  FOR EACH ROW EXECUTE FUNCTION public.update_cluster_updated_at();

-- Auto-update updated_at for keywords
DROP TRIGGER IF EXISTS trigger_keyword_updated_at ON public.news_keyword_dictionaries;
CREATE TRIGGER trigger_keyword_updated_at
  BEFORE UPDATE ON public.news_keyword_dictionaries
  FOR EACH ROW EXECUTE FUNCTION public.update_cluster_updated_at();

-- =============================================================================
-- 7. HELPER FUNCTIONS
-- =============================================================================

-- Function to get articles pending classification
CREATE OR REPLACE FUNCTION public.get_pending_classification_articles(
  p_limit integer DEFAULT 50
)
RETURNS SETOF public.feed_articles AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.feed_articles
  WHERE classification_status = 'pending'
    AND status = 'pending'
    AND (rejection_reason IS NULL OR rejection_reason = '')
  ORDER BY published_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active clusters for trend recalculation
CREATE OR REPLACE FUNCTION public.get_active_clusters_for_trending(
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.news_story_clusters AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.news_story_clusters
  WHERE status = 'active'
    AND last_seen_at > now() - interval '7 days'
  ORDER BY last_seen_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update cluster stats after article assignment
CREATE OR REPLACE FUNCTION public.update_cluster_stats(p_cluster_id uuid)
RETURNS void AS $$
DECLARE
  v_article_count integer;
  v_trusted_count integer;
  v_official_count integer;
BEGIN
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE rs.trust_score >= 0.70),
    COUNT(*) FILTER (WHERE rs.source_type = 'official_studio')
  INTO v_article_count, v_trusted_count, v_official_count
  FROM public.feed_articles fa
  LEFT JOIN public.rss_sources rs ON fa.source_id = rs.id
  WHERE fa.cluster_id = p_cluster_id;
  
  UPDATE public.news_story_clusters
  SET 
    article_count = v_article_count,
    trusted_source_count = v_trusted_count,
    official_source_count = v_official_count,
    last_seen_at = now(),
    updated_at = now()
  WHERE id = p_cluster_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 8. UPDATE EXISTING SOURCE TRUST SCORES
-- =============================================================================

-- Set trust scores for known quality sources
UPDATE public.rss_sources SET 
  source_type = 'trade_publication',
  trust_score = 0.90
WHERE name IN ('Variety', 'Deadline', 'The Hollywood Reporter');

UPDATE public.rss_sources SET 
  source_type = 'film_publication',
  trust_score = 0.80
WHERE name IN ('/Film', 'Collider', 'ScreenRant', 'IGN');

UPDATE public.rss_sources SET 
  source_type = 'major_news',
  trust_score = 0.75
WHERE name IN ('Entertainment Weekly', 'IndieWire');

-- =============================================================================
-- DONE
-- =============================================================================
