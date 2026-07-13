# Entertainment News Intelligence System - Implementation Plan

## Overview

Build an automated editorial intelligence layer for TheaterOrStream that filters entertainment news, rejects gossip/lifestyle content, clusters related stories, detects trending topics, and auto-publishes high-quality movie industry news.

**Approach**: Extend the existing RSS pipeline (`rss_sources`, `feed_articles`, `AdminArticlesPage`) rather than rebuilding.

---

## Current State Analysis

### Existing Infrastructure (~40% complete)

| Component | Status | Location |
|-----------|--------|----------|
| RSS fetching | ✅ Done | `api/_lib/rss-server.js` (993 lines) |
| Basic keyword filtering | ✅ Done | Include/exclude in rss-server |
| Source management | ✅ Done | `rss_sources` table |
| Article storage | ✅ Done | `feed_articles` table |
| Admin curation UI | ✅ Done | `AdminArticlesPage.jsx` (1133 lines) |
| Cron job | ✅ Done | `/api/cron/rss-refresh` |
| Full article extraction | ✅ Done | `fetchFullArticle()` in rss-server |

### Missing Components (~60% to build)

- AI classification (editorial scoring, category detection)
- Entity extraction (movies, people, studios)
- Semantic duplicate detection
- Story clustering
- Trend scoring algorithm
- Auto-publishing logic
- Enhanced keyword dictionaries
- Admin dashboards for clusters/trends

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     INGESTION (EXISTS)                               │
├─────────────────────────────────────────────────────────────────────┤
│  RSS Sources → rss-server.js → Candidates → feed_articles (pending) │
└────────────────────────────────────┬────────────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     INTELLIGENCE (NEW)                               │
├─────────────────────────────────────────────────────────────────────┤
│  Keyword Filter → AI Classifier → Entity Extractor                   │
│       ▼                                                              │
│  Duplicate Detection → Story Clustering → Trend Scoring              │
└────────────────────────────────────┬────────────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     PUBLISHING (ENHANCED)                            │
├─────────────────────────────────────────────────────────────────────┤
│  Trend >= 72 → Auto-publish                                          │
│  Trend 45-71 → Admin review queue                                    │
│  Trend < 45  → Archive/reject                                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database Schema Extensions

### 1.1 Extend `rss_sources` Table

```sql
ALTER TABLE rss_sources ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'news_publication';
ALTER TABLE rss_sources ADD COLUMN IF NOT EXISTS trust_score decimal(3,2) DEFAULT 0.70;
ALTER TABLE rss_sources ADD COLUMN IF NOT EXISTS region text DEFAULT 'US';
ALTER TABLE rss_sources ADD COLUMN IF NOT EXISTS language text DEFAULT 'en';
ALTER TABLE rss_sources ADD COLUMN IF NOT EXISTS auto_publish_allowed boolean DEFAULT false;
ALTER TABLE rss_sources ADD COLUMN IF NOT EXISTS default_category text;
ALTER TABLE rss_sources ADD COLUMN IF NOT EXISTS failure_count integer DEFAULT 0;
```

**Source types**: `official_studio`, `trade_publication`, `film_publication`, `major_news`, `regional_publication`, `unverified`

### 1.2 Extend `feed_articles` Table

```sql
-- Classification results
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS classification_status text DEFAULT 'pending';
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS relevant boolean;
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS relevance_score integer;
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS primary_category text;
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS secondary_categories text[];
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS professional_focus_score integer;
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS gossip_probability decimal(3,2);
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS lifestyle_probability decimal(3,2);
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS controversy_probability decimal(3,2);
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS rumour_probability decimal(3,2);
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS clickbait_probability decimal(3,2);
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS article_quality_score integer;
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS verification_level text;

-- Entity extraction
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS entities_json jsonb DEFAULT '{}';

-- Clustering
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS cluster_id uuid;
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS is_primary_source boolean DEFAULT false;

-- Keyword analysis
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS positive_keyword_score integer;
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS negative_keyword_score integer;
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS rejection_reason text;

-- AI metadata
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS ai_main_event text;
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS ai_why_it_matters text;
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS model_version text;
ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS classified_at timestamptz;
```

### 1.3 Create `news_story_clusters` Table

```sql
CREATE TABLE IF NOT EXISTS news_story_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_title text NOT NULL,
  main_event text,
  primary_category text,
  event_type text,
  entities_json jsonb DEFAULT '{}',
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  article_count integer DEFAULT 1,
  trusted_source_count integer DEFAULT 0,
  official_source_count integer DEFAULT 0,
  verification_level text DEFAULT 'unconfirmed',
  trend_score integer DEFAULT 0,
  status text DEFAULT 'active',
  published_post_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clusters_trend ON news_story_clusters (trend_score DESC);
CREATE INDEX IF NOT EXISTS idx_clusters_status ON news_story_clusters (status, trend_score DESC);
```

### 1.4 Create `news_keyword_dictionaries` Table

```sql
CREATE TABLE IF NOT EXISTS news_keyword_dictionaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL, -- 'rejection', 'positive', 'category_indicator'
  subcategory text,       -- 'relationship', 'lifestyle', 'gossip', 'movie_term', etc.
  term text NOT NULL,
  weight integer DEFAULT 1,
  is_phrase boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(category, subcategory, term)
);
```

### 1.5 Create `news_processing_logs` Table

```sql
CREATE TABLE IF NOT EXISTS news_processing_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid REFERENCES feed_articles(id) ON DELETE CASCADE,
  cluster_id uuid,
  step text NOT NULL,  -- 'keyword_filter', 'classification', 'clustering', 'publish_decision'
  status text NOT NULL, -- 'success', 'failed', 'skipped'
  message text,
  metadata_json jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logs_article ON news_processing_logs (article_id, created_at DESC);
```

---

## Phase 2: Keyword Filtering System

### 2.1 Keyword Service

**File**: `src/lib/newsKeywords.js`

```javascript
// Load dictionaries from news_keyword_dictionaries
// Normalize text (lowercase, remove punctuation, split words)
// Calculate positive/negative scores based on term weights
// Apply hard rejection rules:
//   - negative_score > 15 AND positive_score < 5 → reject
//   - Contains 3+ rejection phrases → reject
```

### 2.2 Seed Keyword Dictionaries

**Rejection keywords (~200 terms)**:
- Relationship: dating, engaged, married, divorce, split, romance, boyfriend, girlfriend, affair, cheating...
- Lifestyle: fashion, outfit, diet, weight, workout, vacation, home, wedding, baby, pregnant...
- Gossip: allegedly, rumored, spotted, insider, sources say, close friend, anonymous...
- Controversy: feud, drama, clash, rant, slammed, blasted, fired back...
- Clickbait: shocking, you won't believe, secret, exposed, finally admits...

**Positive keywords (~120 terms)**:
- Movie terms: film, movie, sequel, prequel, trilogy, franchise, reboot, adaptation...
- Announcements: announces, confirms, reveals, greenlights, renews, orders...
- Casting: cast, joins, signs on, set to star, in talks, negotiations...
- Production: production, filming, wraps, post-production, director, cinematographer...
- Release: releases, opens, premiere, trailer, teaser, poster, first look...
- Industry: box office, streaming, theatrical, distribution, studio, network...

### 2.3 Integration Point

Modify `api/_lib/rss-server.js` `fetchAndStoreSource()`:
1. After parsing article, calculate keyword scores
2. Store `positive_keyword_score`, `negative_keyword_score` in DB
3. If hard rejection triggered, set `rejection_reason` and skip AI classification

---

## Phase 3: AI Classification Service

### 3.1 Classifier Service

**File**: `api/_lib/news-classifier.js`

```javascript
export async function classifyArticle(article) {
  const systemPrompt = `You are an editorial intelligence system for a movie/TV news platform.
Your job is to classify entertainment news articles with extreme precision.

ACCEPTANCE CRITERIA (require ALL):
- Primary focus: movie/TV industry, professional filmmaking, business decisions
- Content types: casting, production, releases, box office, awards, studio deals
- Tone: professional, factual, industry-focused

REJECTION CRITERIA (any ONE triggers rejection):
- Celebrity personal life, relationships, dating, marriage
- Fashion, lifestyle, health, fitness content
- Gossip, rumors without studio confirmation
- Social media drama, feuds between celebrities
- Tabloid-style speculation

Return JSON with scores 0-100 and probabilities 0.00-1.00`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Classify:\n\nTitle: ${article.title}\n\nContent: ${article.body || article.summary}` }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1
  });

  return JSON.parse(response.choices[0].message.content);
}
```

### 3.2 Expected JSON Output

```json
{
  "relevant": true,
  "relevance_score": 85,
  "primary_category": "casting_news",
  "secondary_categories": ["marvel", "superhero"],
  "professional_focus_score": 90,
  "gossip_probability": 0.05,
  "lifestyle_probability": 0.02,
  "controversy_probability": 0.10,
  "rumour_probability": 0.15,
  "clickbait_probability": 0.08,
  "article_quality_score": 75,
  "verification_level": "studio_confirmed",
  "entities": {
    "movies": ["Avengers: Secret Wars"],
    "people": [{"name": "Robert Downey Jr.", "role": "actor"}],
    "studios": ["Marvel Studios", "Disney"]
  },
  "main_event": "Robert Downey Jr. returns to MCU as Doctor Doom",
  "why_it_matters": "Major casting announcement for upcoming Avengers film",
  "recommended_action": "approve"
}
```

### 3.3 Classification API Endpoint

**File**: `api/admin/[action].js`

Add action `classify-article`:
```javascript
case 'classify-article':
  const article = await getArticleById(body.articleId);
  const result = await classifyArticle(article);
  await updateArticleClassification(body.articleId, result);
  return { success: true, classification: result };
```

---

## Phase 4: Entity Extraction

### 4.1 Entity Service

**File**: `api/_lib/news-entities.js`

```javascript
export async function extractAndNormalizeEntities(classificationResult, article) {
  const entities = classificationResult.entities || {};
  
  // Normalize movie titles → match to movies_library by TMDB
  // Normalize person names → use alias mapping
  // Normalize studio names → canonical list
  
  return {
    movies: normalizedMovies,
    people: normalizedPeople,
    studios: normalizedStudios,
    franchises: extractedFranchises,
    awards: extractedAwards
  };
}
```

### 4.2 TMDB Matching

For extracted movie titles:
1. Search `movies_library` by title similarity
2. If no match, optionally search TMDB API
3. Store `tmdb_id` in entities_json for linking

---

## Phase 5: Duplicate Detection & Clustering

### 5.1 Duplicate Detection

**File**: `api/_lib/news-duplicates.js`

```javascript
export async function findDuplicates(article) {
  // Level 1: Exact URL/GUID match (already exists in DB unique constraint)
  // Level 2: Title hash match (normalize + hash)
  // Level 3: Content similarity (Jaccard on word sets)
  
  const titleHash = hashNormalizedTitle(article.title);
  const existing = await findByTitleHash(titleHash);
  
  if (existing) {
    return { isDuplicate: true, originalId: existing.id };
  }
  
  return { isDuplicate: false };
}
```

### 5.2 Story Clustering

**File**: `api/_lib/news-clustering.js`

```javascript
export async function clusterArticle(article) {
  // Find matching cluster by:
  // 1. Entity overlap (same movie + same event type)
  // 2. Title similarity (Jaccard > 0.5)
  // 3. Time window (within 72 hours)
  
  const candidates = await findClusterCandidates(article.entities_json, article.published_at);
  
  for (const cluster of candidates) {
    const entityOverlap = calculateEntityOverlap(article.entities_json, cluster.entities_json);
    if (entityOverlap > 0.6) {
      await addArticleToCluster(article.id, cluster.id);
      await updateClusterStats(cluster.id);
      return cluster.id;
    }
  }
  
  // No match → create new cluster
  const newCluster = await createCluster(article);
  return newCluster.id;
}
```

---

## Phase 6: Trend Scoring

### 6.1 Trend Scorer

**File**: `api/_lib/news-trending.js`

```javascript
export async function calculateTrendScore(cluster) {
  // Component weights (sum = 1.0)
  const weights = {
    sourceCount: 0.30,      // More sources = bigger story
    velocity: 0.20,         // Articles per hour
    sourceAuthority: 0.15,  // Average trust_score of sources
    officialConfirm: 0.15,  // Has official studio source?
    editorialImportance: 0.15, // Avg relevance_score
    freshness: 0.05         // How recent
  };
  
  const sourceCount = Math.min(cluster.article_count / 10, 1) * 100;
  const velocity = calculateVelocity(cluster) * 100;
  const authority = (cluster.trusted_source_count / cluster.article_count) * 100;
  const official = cluster.official_source_count > 0 ? 100 : 0;
  const importance = await getAvgRelevanceScore(cluster.id);
  const freshness = calculateFreshness(cluster.last_seen_at);
  
  let score = (
    sourceCount * weights.sourceCount +
    velocity * weights.velocity +
    authority * weights.sourceAuthority +
    official * weights.officialConfirm +
    importance * weights.editorialImportance +
    freshness * weights.freshness
  );
  
  // Penalties
  const avgGossip = await getAvgGossipProbability(cluster.id);
  const avgRumour = await getAvgRumourProbability(cluster.id);
  score -= (avgGossip * 20) + (avgRumour * 15);
  
  return Math.max(0, Math.min(100, Math.round(score)));
}
```

### 6.2 Scheduled Recalculation

Cron job every 20 minutes:
```javascript
// Recalculate trend scores for active clusters
// Update cluster.trend_score
// Trigger publish decisions for newly-qualified clusters
```

---

## Phase 7: Publishing Decision Engine

### 7.1 Decision Engine

**File**: `api/_lib/news-publisher.js`

```javascript
export async function evaluateForPublishing(cluster) {
  const score = cluster.trend_score;
  const articles = await getClusterArticles(cluster.id);
  const primary = articles.find(a => a.is_primary_source) || articles[0];
  
  // Auto-publish thresholds
  if (score >= 72 && 
      primary.relevance_score >= 70 && 
      primary.article_quality_score >= 65 &&
      primary.gossip_probability <= 0.10 &&
      primary.source?.auto_publish_allowed) {
    
    return { action: 'auto_publish', article: primary };
  }
  
  // Review queue
  if (score >= 45) {
    return { action: 'review', cluster };
  }
  
  // Archive
  return { action: 'archive', reason: 'Low trend score' };
}

export async function autoPublish(article, cluster) {
  // Generate original headline (avoid plagiarism)
  const headline = await generateOriginalHeadline(article);
  
  // Generate summary
  const summary = await generateSummary(article);
  
  // Update article status
  await updateFeedArticle(article.id, {
    status: 'approved',
    title: headline,
    ai_summary: summary,
    is_primary_source: true
  });
  
  // Link cluster to published article
  await updateCluster(cluster.id, {
    published_post_id: article.id,
    status: 'published'
  });
  
  return article.id;
}
```

---

## Phase 8: Enhanced Admin UI

### 8.1 New Tabs in AdminArticlesPage

**Existing tabs**: Sources, Pending, Live, Rejected
**New tabs**: Intelligence, Clusters, Trending

### 8.2 Intelligence Tab

```jsx
// Show articles with classification details
// Filter by: classification_status, relevance_score range, category
// Inline display:
//   - All probability scores (gossip, lifestyle, etc.)
//   - Extracted entities
//   - Keyword scores
//   - Rejection reason if applicable
// Actions:
//   - Reclassify (re-run AI)
//   - Override (approve/reject manually)
//   - View full classification JSON
```

### 8.3 Clusters Tab

```jsx
// List of story clusters
// Show: canonical_title, article_count, trend_score, verification_level
// Expand to see all articles in cluster
// Actions:
//   - Set primary source
//   - Merge clusters
//   - Split cluster
//   - Publish cluster
//   - Archive cluster
```

### 8.4 Trending Tab

```jsx
// Live dashboard of trending stories
// Sort by trend_score DESC
// Show velocity indicator (↑ rising, → stable, ↓ falling)
// Quick publish button for qualified clusters
// Chart: Trend scores over time
```

### 8.5 Keyword Dictionary Editor

```jsx
// CRUD for keyword terms
// Organized by category/subcategory
// Test input: paste text, see calculated scores
// Import/export as JSON
```

---

## Phase 9: Background Jobs

### 9.1 Cron Jobs

Add to `vercel.json` or use existing cron infrastructure:

```json
{
  "crons": [
    {
      "path": "/api/cron/news-classify",
      "schedule": "*/5 * * * *"  // Every 5 minutes
    },
    {
      "path": "/api/cron/news-cluster",
      "schedule": "*/10 * * * *" // Every 10 minutes
    },
    {
      "path": "/api/cron/news-trend",
      "schedule": "*/20 * * * *" // Every 20 minutes
    },
    {
      "path": "/api/cron/news-publish",
      "schedule": "*/30 * * * *" // Every 30 minutes
    }
  ]
}
```

### 9.2 Job Implementations

**news-classify**: Process `feed_articles` where `classification_status = 'pending'`
**news-cluster**: Cluster articles where `cluster_id IS NULL AND classification_status = 'completed'`
**news-trend**: Recalculate `trend_score` for all active clusters
**news-publish**: Run `evaluateForPublishing()` on clusters with score changes

---

## File Structure

```
api/
├── _lib/
│   ├── rss-server.js           # ENHANCE: add keyword pre-filter
│   ├── news-classifier.js      # NEW: AI classification
│   ├── news-entities.js        # NEW: Entity extraction
│   ├── news-duplicates.js      # NEW: Duplicate detection
│   ├── news-clustering.js      # NEW: Story clustering
│   ├── news-trending.js        # NEW: Trend scoring
│   └── news-publisher.js       # NEW: Publishing decisions
├── admin/
│   └── [action].js             # ENHANCE: add classification actions
└── cron/
    ├── rss-refresh.js          # EXISTS
    ├── news-classify.js        # NEW
    ├── news-cluster.js         # NEW
    ├── news-trend.js           # NEW
    └── news-publish.js         # NEW

src/
├── lib/
│   ├── supabase.js             # ENHANCE: add news intelligence queries
│   └── newsKeywords.js         # NEW: Keyword filtering
└── views/admin/
    └── AdminArticlesPage.jsx   # ENHANCE: add Intelligence/Clusters/Trending tabs

supabase/migrations/
├── 20260714000000_news_intelligence_schema.sql     # NEW
└── 20260714000100_news_keyword_seeds.sql           # NEW
```

---

## Implementation Order & Effort

| # | Phase | Effort | Dependencies | Deliverable |
|---|-------|--------|--------------|-------------|
| 1 | Database Schema | 1 day | None | All new tables & columns |
| 2 | Keyword Filtering | 1 day | Phase 1 | Pre-AI rejection working |
| 3 | AI Classification | 2 days | Phase 1, 2 | Articles get scores |
| 4 | Entity Extraction | 1 day | Phase 3 | Entities linked to library |
| 5 | Clustering | 2 days | Phase 4 | Articles grouped by story |
| 6 | Trend Scoring | 1 day | Phase 5 | Clusters have trend scores |
| 7 | Publishing Engine | 1 day | Phase 6 | Auto-publish working |
| 8 | Admin UI | 2 days | Phase 7 | Intelligence dashboard |
| 9 | Background Jobs | 1 day | Phase 8 | Fully automated pipeline |

**Total MVP**: ~12-14 days

---

## Key Design Decisions

1. **Extend existing tables** rather than create parallel systems - maintains backward compatibility
2. **Keyword filtering runs BEFORE AI** - saves API costs by rejecting obvious gossip early
3. **Clustering uses entity matching first** - semantic embeddings are enhancement for Phase 2
4. **Trend score is deterministic** - no external APIs required, fully reproducible
5. **Auto-publish requires source opt-in** - `auto_publish_allowed` flag prevents surprises
6. **Admin always has override** - manual approve/reject always available
7. **Browser-side candidate inbox remains** - existing manual curation path unchanged

---

## Environment Variables Required

```env
# Existing (should already have)
OPENAI_API_KEY=sk-...

# Optional enhancements
NEWS_CLASSIFICATION_MODEL=gpt-4o-mini  # or gpt-4o for higher accuracy
NEWS_AUTO_PUBLISH_ENABLED=true
NEWS_MIN_TREND_SCORE_PUBLISH=72
NEWS_MIN_TREND_SCORE_REVIEW=45
```

---

## Success Metrics

After implementation, measure:

- **Rejection accuracy**: % of rejected articles that were correctly gossip/lifestyle
- **False negatives**: % of good movie news incorrectly rejected
- **Cluster quality**: % of articles correctly grouped
- **Auto-publish accuracy**: % of auto-published articles that would have been manually approved
- **Admin time saved**: Reduction in manual review queue

---

## Future Enhancements (Phase 2+)

1. **Semantic embeddings**: pgvector for title/summary similarity clustering
2. **Social signal integration**: Twitter/Reddit mentions as trend factor
3. **Personalization**: User topic preferences affect feed ranking
4. **Multi-language support**: Classify non-English sources
5. **Source discovery**: Auto-suggest new RSS feeds to add
6. **Fact verification**: Cross-reference claims against studio official feeds
