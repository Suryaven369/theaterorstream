# TheaterOrStream — Implementation Work Log

Session log for production architecture Phase 1 work (DB-first performance + Vercel Edge).

**Last synced with `main`:** Jul 2026 · HEAD `f3e753c` · [github.com/Suryaven369/theaterorstream](https://github.com/Suryaven369/theaterorstream)

---

## Session: Jul 15, 2026 — Feed composer, flat layout, mobile UX

### Twitter-style feed composer + carousel & polls ✅

**Problem:** Home post composer was basic; no multi-image carousel, polls, or single-edit limit; feed used chunky card boxes.

**Files changed:**
- `src/components/social/FeedComposer.jsx` — X-style composer; grey toolbar icons; brand-yellow Post button; carousel (2+ images) with global caption; 2-option polls
- `src/components/social/PostMediaCarousel.jsx` — carousel display component
- `src/components/social/FeedPoll.jsx` — poll voting UI
- `src/components/social/FeedPostCard.jsx` — carousel/poll render, single-edit UI, flat row padding
- `src/components/social/feedItemShell.js` — shared flat feed row classes
- `src/components/social/FeedArticleCard.jsx`, `FeedTrailerCard.jsx`, `FeedActivityCard.jsx`, `FeedTweetCard.jsx`, `RedditActionBar.jsx` — flat divider styling
- `src/lib/socialFeedApi.js` — `createPost` media_items, `votePoll`, single-edit in `updatePost`
- `src/views/Home.jsx`, `src/views/ThreadPage.jsx` — poll handlers, flat `divide-y` feed column
- `supabase/migrations/20260725000000_feed_post_carousel_polls.sql` — `media_items`, `poll_data`, `post_poll_votes`
- `supabase/migrations/20260725100000_feed_post_single_edit.sql` — `edit_count` + trigger (one content edit max)

**Behavior:** Users post text, images (carousel when 2+), or polls; feed rows use line dividers; posts editable once after publish.

### Mobile navigation & header polish ✅

**Problem:** Duplicate Home/Explore/Watch tabs on mobile; bottom nav had Boards; header too high; logo not circular.

**Files changed:**
- `src/components/MobileNavigation.jsx` — Boards → Watch (`/?tab=watch`); active states
- `src/components/Header.jsx` — `rounded-full` logo; safe-area top padding
- `src/views/Home.jsx` — hide top tabs on mobile (`lg:block`); full-width feed; Everyone/Following above composer
- `src/index.css` — `.page-below-header` utility

**Behavior:** Mobile uses bottom nav only; header sits below notch; feed uses full screen width.

### Admin Hot Right Now vs Trending ✅

**Files changed:**
- `src/views/admin/AdminSectionsPage.jsx` — `trending` vs `trending_live` (24h trailers/announcements)
- `src/components/home/HomeBrowseTab.jsx` — `trending_live` hot rail
- `src/utils/hotContentTags.js` — hot content tag helpers

**Behavior:** Admin can configure normal weekly trending separately from live 24h hot rail.

### Removed MovieGlu / Now in Theaters ✅

**Files changed:** Deleted `api/_lib/movieglu-server.js`, `api/theaters/[action].js`, `src/lib/theatersApi.js`, `src/components/home/NowInTheaters.jsx`; related cleanup in `Card.jsx`, `HomeSocialSidebar.jsx`, library/sections DB helpers.

**Next recommended:** Run both new feed SQL migrations in Supabase (`20260725000000`, `20260725100000`); switch existing hot sections from `trending` to `trending_live` in admin if needed.

---

## Session: Jul 15, 2026 — Home feed UI polish

### Coming Soon + sidebar + composer tweaks ✅

**Problem:** Coming Soon used per-poster highlight cards; composer had an extra divider under the text field; trending rail sat too high; search bar corners were too square.

**Files changed:**
- `src/components/home/HomeComingSoonSidebar.jsx` — X-style single widget with `divide-y` rows (desktop + mobile)
- `src/components/social/FeedComposer.jsx` — removed toolbar `border-t` below “What’s happening?”
- `src/components/home/HomeSocialSidebar.jsx` — `mt-10` to lower Trending Now rail
- `src/components/Header.jsx` — search input `rounded-full`

**Behavior:** Coming Soon is one bordered block with line dividers; composer toolbar flows without mid-line; trending aligns lower with feed; search bar is pill-shaped.


### Integrated listicle carousel extraction into News Intelligence publisher ✅

**Problem:** Articles like "5 Reasons Why..." weren't displaying as carousels in the home feed. The carousel system existed in `FeedArticleCard.jsx` but News Intelligence publishing wasn't extracting `summary_items`.

**Files changed:**
- `api/_lib/news-publisher.js` — Added:
  - Imports for `isListicleArticle`, `parseSummaryForDisplay`, `buildListicleSummaryItems`
  - `extractListicleSummaryItems()` helper function
  - Updated `autoPublishCluster()` to extract and store carousel items
  - Updated `manualPublishCluster()` with same logic
  - Added `hasCarousel` and `carouselItems` to return values and logs
- `api/admin/[action].js` — Added `reextract-listicles` job to re-process existing approved articles without carousel data

**Behavior:** 
- When articles are published via News Intelligence, listicles automatically get carousel items
- Carousel shows: cover image → numbered list items with images (from article or TMDB posters)
- Admin can run `reextract-listicles` to backfill existing articles

---

## Session: Jul 14, 2026 — News Intelligence Fixes & Google Trends Integration

### Fixed admin authentication for News Intel page ✅

**Problem:** AdminNewsIntelPage.jsx was getting 401 Unauthorized errors.

**Files changed:**
- `src/views/admin/AdminNewsIntelPage.jsx` — Added `getAccessToken()` function and Authorization header to API calls

**Behavior:** News Intel admin page now properly authenticates with the backend API.

### Switched AI classifier to Mistral primary ✅

**Problem:** User requested Mistral as primary LLM instead of Gemini.

**Files changed:**
- `api/_lib/news-classifier.js` — Changed order to try Mistral first, Gemini fallback
- `api/_lib/news-publisher.js` — Same for headline/summary generation

**Behavior:** Classification and content generation now use Mistral API by default with Gemini as fallback.

### Added Google Trends RSS support with entertainment filter ✅

**Problem:** Google Trends RSS feeds were not being parsed correctly (nested ht:news_item structure) and returned all topics, not just entertainment.

**Files changed:**
- `api/_lib/rss-server.js` — Added:
  - `ENTERTAINMENT_KEYWORDS` array (80+ terms: movies, streaming, studios, franchises, awards, Bollywood)
  - `isEntertainmentRelated()` function for keyword matching
  - `parseGoogleTrendsItem()` and `parseGoogleTrendsFeed()` for custom Google Trends RSS format
  - Entertainment pre-filter in `parseGoogleTrendsFeed()` to skip non-entertainment trends
- `supabase/migrations/20260724000200_seed_news_intelligence_sources.sql` — Fixed Google Trends URLs from old format to new `https://trends.google.com/trending/rss?geo=XX`

**Behavior:** Google Trends now imports only entertainment-related trending topics. Console logs filter ratio (e.g., "5/30 items matched entertainment filter").

### Adjusted cron schedule for Hobby plan ✅

**Problem:** Vercel Hobby plan limits cron to once per day.

**Files changed:**
- `vercel.json` — Changed news-pipeline cron from `0 */6 * * *` (every 6 hours) to `0 8 * * *` (daily at 8 AM UTC)

**Behavior:** News pipeline runs once daily on Vercel Hobby plan. Manual refresh available anytime via admin console.

---

## Session: Jul 2026 — News Intelligence System (Phase 1: Schema)

### Database schema extensions for news intelligence ✅

**Problem:** Need automated editorial filtering for RSS news - reject gossip/lifestyle, classify articles, cluster related stories, score trends, auto-publish quality content.

**Files changed:**
- `supabase/migrations/20260724000000_news_intelligence_schema.sql` — New migration adding:
  - `rss_sources` extensions: `source_type`, `trust_score`, `region`, `language`, `auto_publish_allowed`, `default_category`, `failure_count`
  - `feed_articles` extensions: classification scores (`relevance_score`, `gossip_probability`, `lifestyle_probability`, etc.), entity extraction (`entities_json`), clustering (`cluster_id`, `is_primary_source`), keyword scores, AI metadata
  - New `news_story_clusters` table for grouping related articles by story
  - New `news_keyword_dictionaries` table for pre-AI filtering keywords
  - New `news_processing_logs` table for pipeline audit trail
  - Helper functions: `get_pending_classification_articles()`, `get_active_clusters_for_trending()`, `update_cluster_stats()`
  - RLS policies and indexes
- `src/lib/db/rss.js` — Added 20+ new functions for news intelligence CRUD operations
- `src/lib/supabase.js` — Exported new news intelligence functions

**Behavior:** Schema ready for Phase 2 (keyword filtering) through Phase 9 (background jobs). Existing RSS pipeline unchanged but extensible.

### Keyword filtering system ✅

**Problem:** Need to pre-filter articles before expensive AI classification to reject obvious gossip/lifestyle content.

**Files changed:**
- `supabase/migrations/20260724000100_news_keyword_seeds.sql` — Seeded ~320 keywords:
  - Rejection (~200): relationship (31), lifestyle (37), personal (23), gossip (25), controversy (26), clickbait (29)
  - Positive (~120): movie_term (33), announcement (23), casting (20), production (31), release (24), industry (21), awards (30)
  - Category indicators (19) for detecting article types
- `src/lib/newsKeywords.js` — Frontend keyword service with caching, normalization, scoring
- `api/_lib/news-keywords.js` — Server-side keyword analysis service
- `api/_lib/rss-server.js` — Integrated keyword analysis into article approval flow
- `api/admin/[action].js` — Added `analyze-keywords` and `keyword-stats` admin jobs

**Behavior:**
- Keyword analysis runs automatically when articles are approved
- Scores stored in `positive_keyword_score`, `negative_keyword_score` columns
- Hard rejection rules: negative > 15 + positive < 5, heavy relationship/personal, clickbait > 8
- Processing logged to `news_processing_logs` table
- Admin can test keywords via API: `POST /api/admin/rss { job: 'analyze-keywords', title: '...', text: '...' }`

### AI Classification Service ✅

**Problem:** Need LLM-based editorial classification to score articles for relevance, detect gossip/lifestyle content, extract entities, and recommend approve/review/reject actions.

**Files changed:**
- `api/_lib/news-classifier.js` — New AI classification service:
  - Editorial system prompt with strict acceptance/rejection criteria
  - Gemini + Mistral fallback chain
  - Structured JSON output with 15+ fields
  - `classifyArticle()` for direct classification
  - `classifyAndUpdateArticle()` for DB integration
  - `batchClassifyArticles()` for bulk processing
  - Processing log integration
- `api/admin/[action].js` — Added 5 new admin API actions:
  - `classify-article`: Classify single article by ID
  - `classify-text`: Test classification on any text
  - `batch-classify`: Classify multiple articles
  - `classifier-status`: Check API key availability
  - `pending-classification`: Get articles awaiting classification

**Classification Output Schema:**
```json
{
  "relevant": boolean,
  "relevance_score": 0-100,
  "primary_category": "casting_news|production_update|release_announcement|...",
  "professional_focus_score": 0-100,
  "gossip_probability": 0.00-1.00,
  "lifestyle_probability": 0.00-1.00,
  "entities": { movies: [], people: [], studios: [], ... },
  "main_event": "One sentence summary",
  "recommended_action": "approve|review|reject"
}
```

**Behavior:**
- Uses Gemini 2.0 Flash by default (fast, cheap)
- Falls back to Mistral if Gemini unavailable
- Low temperature (0.1) for consistent classification
- Results stored in feed_articles columns
- Processing logged to news_processing_logs

### Entity Extraction and Normalization ✅

**Problem:** Need to normalize entities from AI classification — match movies to TMDB IDs, standardize studio/franchise names, prepare for clustering.

**Files changed:**
- `api/_lib/news-entities.js` — New entity normalization service:
  - `normalizeStudioName()` — 50+ studio/streamer alias mappings
  - `normalizeFranchiseName()` — 35+ franchise alias mappings
  - `searchLibraryForTitle()` — Search movies_library with scoring
  - `searchTmdbForTitle()` — Fallback TMDB API search
  - `enrichMovieEntities()` — Match movies/TV to TMDB IDs
  - `normalizeEntities()` — Main normalization function
  - `normalizeAndUpdateArticleEntities()` — DB integration
  - `calculateEntityOverlap()` — For clustering support
- `api/_lib/news-classifier.js` — Integrated entity normalization into classification flow
- `api/admin/[action].js` — Added 3 new admin API actions:
  - `normalize-entities`: Normalize entities for article by ID
  - `normalize-entities-raw`: Test normalization on raw entities
  - `entity-overlap`: Calculate overlap between two entity sets

**Entity Normalization Features:**
- Studio aliases: Disney, Warner Bros, Universal, Paramount, Marvel, DC, Netflix, Amazon, etc.
- Franchise aliases: MCU, DCEU, Star Wars, Harry Potter, Fast & Furious, James Bond, etc.
- Movie matching: Tries movies_library first, falls back to TMDB search
- Enriched output includes: tmdb_id, poster_path, vote_average, in_library flag

**Behavior:**
- Entity normalization runs automatically after AI classification
- Matched movies include TMDB IDs for linking to detail pages
- Entity overlap calculation ready for Phase 5 (clustering)

### Duplicate Detection and Story Clustering ✅

**Problem:** Need to detect duplicate articles and group related articles about the same story into clusters.

**Files changed:**
- `api/_lib/news-clustering.js` — New clustering service:
  - `findExactDuplicate()` — Check by URL and title hash
  - `calculateTitleSimilarity()` — Jaccard similarity between titles
  - `findMatchingCluster()` — Score clusters by entity overlap + title similarity
  - `createClusterFromArticle()` — Initialize new cluster with article data
  - `addArticleToCluster()` — Assign article and update stats
  - `updateClusterStats()` — Recalculate article count, trusted sources, verification level
  - `clusterArticle()` — Main clustering function
  - `batchClusterArticles()` — Batch processing
  - `mergeClusters()` — Combine two clusters
  - `getClusterWithArticles()` — Fetch cluster details
- `api/admin/[action].js` — Added 7 new admin API actions:
  - `cluster-article`: Cluster a single article
  - `batch-cluster`: Cluster multiple articles
  - `unclustered-articles`: Get articles awaiting clustering
  - `get-cluster`: Get cluster with all articles
  - `merge-clusters`: Combine two clusters
  - `find-duplicate`: Check for exact duplicates
  - `title-similarity`: Calculate title similarity

**Clustering Algorithm:**
1. Check for exact duplicates (URL match, title hash)
2. Find candidate clusters (within 72-hour window)
3. Score each cluster:
   - Entity overlap: up to 60 points (threshold: 40%)
   - Title similarity: up to 30 points (threshold: 50%)
   - Category match: 10 points
   - Recency bonus: 5 points
4. Join best cluster (score ≥30) or create new

**Cluster Stats:**
- `article_count`: Total articles in cluster
- `trusted_source_count`: Articles from sources with trust_score ≥0.7
- `official_source_count`: Articles from official_studio sources
- `verification_level`: studio_confirmed | multiple_sources | trusted_source | unconfirmed

### Trend Scoring System ✅

**Problem:** Need to calculate trending scores for clusters to determine which stories are worth publishing.

**Files changed:**
- `api/_lib/news-trending.js` — New trend scoring service:
  - `calculateTrendScore()` — Weighted formula with components and penalties
  - `updateClusterTrendScore()` — Update single cluster with logging
  - `recalculateAllTrendScores()` — Batch update all active clusters
  - `getTrendingClusters()` — Get sorted by trend score
  - `getPublishReadyClusters()` — Score ≥72, ready for auto-publish
  - `getReviewQueueClusters()` — Score 45-71, needs manual review
  - `getTrendScoreBreakdown()` — Debug view of score components
  - `archiveStaleClusters()` — Clean up old, low-score clusters
- `api/admin/[action].js` — Added 7 new admin API actions:
  - `update-trend-score`: Recalculate single cluster
  - `recalculate-all-trends`: Batch recalculate all
  - `trending-clusters`: Get trending sorted
  - `publish-ready-clusters`: Get clusters ready for auto-publish
  - `review-queue-clusters`: Get clusters needing manual review
  - `trend-breakdown`: Debug score components
  - `archive-stale-clusters`: Clean up old clusters

**Trend Score Formula:**
```
Base Score = (
  sourceCount × 0.25 +
  velocity × 0.20 +
  authority × 0.15 +
  official × 0.15 +
  importance × 0.15 +
  freshness × 0.10
) × 100

Penalties:
  - gossip: -25 × avgGossipProbability
  - rumour: -15 × avgRumourProbability

Bonuses:
  - quality > 75: +5
  - official source: +10
  - 3+ trusted sources: +5
```

**Publishing Thresholds:**
- Score ≥72: Auto-publish eligible
- Score 45-71: Review queue
- Score <45: Archive candidate

### Publishing Decision Engine ✅

**Problem:** Need automated publishing decisions based on trend scores and quality thresholds.

**Files changed:**
- `api/_lib/news-publisher.js` — New publishing decision engine:
  - `evaluateForAutoPublish()` — Check all thresholds
  - `generateOriginalHeadline()` — AI headline generation to avoid plagiarism
  - `generateClusterSummary()` — AI summary generation
  - `autoPublishCluster()` — Publish eligible cluster
  - `processPublishReadyClusters()` — Batch auto-publish
  - `manualPublishCluster()` — Admin manual publish with optional custom headline
  - `rejectCluster()` — Mark cluster as rejected
  - `archiveLowScoreClusters()` — Clean up low-score clusters
  - `getPublishingDecision()` — Get decision summary for cluster
  - `getReviewQueueWithEvaluations()` — Review queue with full evaluations
- `api/admin/[action].js` — Added 8 new admin API actions:
  - `evaluate-publish`: Check auto-publish eligibility
  - `auto-publish-cluster`: Auto-publish single cluster
  - `process-publish-ready`: Batch auto-publish all eligible
  - `manual-publish-cluster`: Admin manual publish
  - `reject-cluster`: Reject a cluster
  - `archive-low-score`: Archive low-score clusters
  - `publishing-decision`: Get decision summary
  - `review-queue-detailed`: Review queue with evaluations

**Auto-Publish Thresholds:**
- Trend score ≥72
- Relevance score ≥70
- Quality score ≥65
- Gossip probability ≤10%
- Rumour probability ≤20%
- Source allows auto-publish

**Publishing Flow:**
1. Get primary article from cluster
2. Generate original headline (LLM)
3. Generate summary (LLM)
4. Update article as approved
5. Mark cluster as published
6. Log the action

### Enhanced Admin UI ✅

**Problem:** Need admin interface to manage news intelligence features - classification, clusters, trending, keywords.

**Files changed:**
- `src/views/admin/AdminNewsIntelPage.jsx` — New admin page with 4 tabs:
  - **Intelligence Tab**: Pending classification queue, batch classify, keyword/classifier stats
  - **Clusters Tab**: Story clusters grid, unclustered count, cluster details with articles
  - **Trending Tab**: Publish-ready clusters, review queue, approve/reject/publish buttons
  - **Keywords Tab**: Keyword dictionary stats, keyword tester with live analysis
- `src/components/AdminLayout.jsx` — Added "News Intel" nav item with FiCpu icon
- `src/routes/index.jsx` — Added `/admin/news-intel` route

**UI Features:**
- Score badges with color coding (green ≥72, yellow 45-71, red <45)
- Probability bars for gossip/rumour scores
- Batch operations (classify top 10, cluster pending, publish all ready)
- Cluster cards with expandable article lists
- Keyword tester with instant feedback
- Real-time refresh for all tabs

**API Integration:**
- Calls existing `/api/admin/rss` with all news intelligence jobs
- Proper loading states and error handling
- Toast notifications for actions

### Background Cron Jobs ✅

**Problem:** Need automated pipeline to run classification, clustering, trend scoring, and publishing without manual intervention.

**Files changed:**
- `api/cron/[job].js` — Added 5 news intelligence cron jobs:
  - `news-classify`: Classify pending articles through AI (batch of 10)
  - `news-cluster`: Cluster classified articles (batch of 20)
  - `news-trend`: Recalculate all cluster trend scores
  - `news-publish`: Auto-publish eligible + archive stale clusters
  - `news-pipeline`: Full pipeline run (all 4 steps combined)
- `vercel.json` — Added news-pipeline cron to run every 6 hours

**Cron Job Details:**

| Job | Purpose | Schedule |
|-----|---------|----------|
| `news-classify` | AI classification of pending articles | Manual/API |
| `news-cluster` | Group articles into story clusters | Manual/API |
| `news-trend` | Recalculate trend scores | Manual/API |
| `news-publish` | Auto-publish high-score, archive stale | Manual/API |
| `news-pipeline` | Full pipeline (all steps) | Every 6 hours |

**Pipeline Flow:**
```
1. Classify pending articles (up to 10)
        ↓
2. Cluster unclustered articles (up to 20)
        ↓
3. Recalculate all trend scores
        ↓
4. Auto-publish eligible clusters
   Archive stale low-score clusters
```

**Manual Trigger:**
```bash
curl -X GET "https://your-domain/api/cron/news-pipeline" \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## News Intelligence System - COMPLETE ✅

All 9 phases implemented:
1. ✅ Database schema extensions
2. ✅ Keyword filtering (~320 terms)
3. ✅ AI classification service
4. ✅ Entity extraction/normalization
5. ✅ Duplicate detection & clustering
6. ✅ Trend scoring system
7. ✅ Publishing decision engine
8. ✅ Admin UI (4 tabs)
9. ✅ Background cron jobs

---

## Session: Jul 2026 — UI Design System Audit & Redesign

### Aligned UI with design rules document ✅

**Problem:** UI had multiple violations of the design rules: glassmorphism in header, gradient text, neon green accent color, gradient avatar backgrounds, two font families, and inconsistent colors across components.

**Files changed:**
- `src/index.css` — replaced color system with design tokens (`--color-background`, `--color-surface`, `--color-theater`, etc.), removed glassmorphism/gradient classes, removed Instrument Serif font
- `src/components/Header.jsx` — solid header background, amber logo text, solid avatar backgrounds, neutral navigation, simplified search button, amber Sign In button
- `src/components/social/FeedPostCard.jsx` — design system colors, rounded-lg avatars, amber accent for interactions
- `src/components/social/RedditActionBar.jsx` — amber upvote color (`--color-theater`), design system surface colors
- `src/components/home/HomeSocialSidebar.jsx` — design system colors for trending and suggested users
- `src/components/social/FeedCommentThread.jsx` — amber upvote/reply/OP badge, design system colors throughout
- `src/views/ThreadPage.jsx` — design system background and text colors
- `src/components/social/FeedArticleCard.jsx` — design system colors for author row, title, slides, and external link

**Behavior:**
- Primary accent is amber (`#f59e0b` / `--color-theater`) instead of neon green
- No glassmorphism or decorative gradients
- Single font family (Inter)
- Consistent design tokens across all components
- Rounded-lg (8px) instead of rounded-full for most elements
- Semantic color usage throughout

**Next recommended:** Smoke-test on mobile/desktop; verify all pages use design system colors consistently.

---

## Session: Jul 2026 — Instant home feed + Twitter card polish

### Home feed stale-while-revalidate + localStorage cache ✅

**Problem:** Home feed took time to load on page reload because cache was in-memory only and blocked on auth.

**Files changed:**
- `src/lib/feedSessionCache.js` — localStorage persistence, stale-while-revalidate pattern
- `src/views/Home.jsx` — initialize from cache immediately, don't block on auth

**Behavior:** Feed renders instantly from localStorage on page reload, background refresh if stale.

### Twitter card skeleton + fallback ✅

**Problem:** Twitter cards showed raw blockquote while X widget loaded, looked amateur.

**Files changed:**
- `src/components/social/FeedTweetCard.jsx` — skeleton loader, styled fallback card, smooth transitions

**Behavior:** Shows animated skeleton → polished fallback card → official embed (with fade transition).

---

## Session: Jul 2026 — Reddit-style thread page + mobile optimization

### Thread page restyled to Reddit dark theme ✅

**Problem:** Thread page needed Reddit-style dark UI with polished mobile/iPad responsiveness.

**Files changed:**
- `src/views/ThreadPage.jsx` — responsive padding, 44px touch targets, safe-area aware top spacing
- `src/components/social/FeedArticleCard.jsx` — responsive author row, title sizing, media carousel border radius
- `src/components/social/FeedCommentThread.jsx` — mobile touch targets (40-44px), compact nested comments, responsive composer
- `src/components/social/RedditActionBar.jsx` — 44px pill buttons on mobile, horizontal scroll, `touch-manipulation`
- `src/components/social/RedditMediaFrame.jsx` — responsive max-height (`65vh` mobile, `520px` desktop), border radius
- `src/lib/slugUtils.js` — shortened thread URLs (8-char UUID prefix)
- `src/lib/feedSessionCache.js` — in-memory session cache for instant navigation
- `src/lib/feedLikes.js` — session-cached likes, comment upvote support
- `api/_lib/feed-likes-server.js` — comment upvote toggle endpoint
- `supabase/migrations/20260723*.sql` — thread comments + likes tables

**Behavior:**
- Thread page has dark Reddit-style UI with yellow upvote accent
- All touch targets ≥40-44px on mobile for easy tapping
- Comments have proper nested indentation with collapse/expand
- Share buttons use dropdown menus (not modals)
- Action bar scrolls horizontally on mobile
- Top bar properly clears fixed header

**Next recommended:** Smoke-test thread page on iPhone/Android and iPad.

---

## Session: Jul 2026 — Fix broken profile avatars on live

### Localhost `/supabase-proxy` URLs broke production avatars ✅

**Problem:** Live profile/feed avatars showed broken images (e.g. `@lord`). DB stored `http://localhost:5173/supabase-proxy/storage/...` from DEV uploads; files themselves were fine on Supabase Storage.

**Files changed:**
- `src/lib/storagePublicUrl.js` — rewrite proxy/localhost public URLs; mint upload URLs from `VITE_SUPABASE_URL`
- `src/lib/profileSystem.js`, `src/lib/socialFeedApi.js` — uploads no longer save proxy URLs
- `src/lib/db/profiles.js`, `src/lib/db/social.js` — normalize avatar/banner on read
- `middleware.js` — OG images rewrite proxy URLs
- `supabase/migrations/20260721000000_fix_dev_proxy_storage_urls.sql` — permanent DB cleanup

**Behavior:** Avatars/banners display on production after deploy; new uploads always save real Supabase public URLs.

**Requires:** Run `20260721000000_fix_dev_proxy_storage_urls.sql` in Supabase (optional if client rewrite is enough; recommended for permanent DB fix).

**Next recommended:** Run the storage-URL migration in Supabase; hard-refresh a profile page to confirm avatar + banner load.

---

## Session: Jul 2026 — Explore in-page panels + mobile

### Explore left nav → in-page Collections / Boards / Blogs ✅

**Problem:** Collections / Boards / Blogs left-nav links left Explore for other routes; Coming Soon only showed 5 titles and appeared on every panel; Collections panel was a plain list and broke after thumbnail query change.

**Files changed:**
- `src/components/home/HomeBrowseTab.jsx` — `?view=` panels, Coming Soon Feed-only, mobile/iPad layout
- `src/components/home/HomeExploreBrowseSidebar.jsx` — sticky segmented tabs (mobile) + sticky rail (`lg+`)
- `src/components/home/ExplorePanels.jsx` — collection/board/blog card grids
- `src/components/home/HomeComingSoonSidebar.jsx` — top 6 + mobile strip + desktop rail
- `src/components/home/HomeRegionPicker.jsx` — compact mobile picker
- `src/lib/db/social.js` — resilient `getRecentPublicCollections` (posters without emptying panel)
- Feed trailer/article cards + Admin Articles (24h filter / approve UX) + RSS tweaks

**Behavior:** Explore stays on one page; left nav switches main column; Coming Soon on Feed only; Collections show poster cards; phone/iPad get denser grids + sticky tabs + Coming Soon carousel.

**Next recommended:** Confirm username + official-profile migrations applied; smoke-test Explore panels on phone.

---

## Session: Jul 2026 — Official profile, usernames, Explore tab

### Official Profile Connect + verified badge ✅

**Problem:** Need an official TheaterOrStream account with blue verified badge for trailers/articles on home.

**Files changed:**
- `supabase/migrations/20260715000000_official_verified_profile.sql`
- `supabase/migrations/20260720000000_admin_connect_official_profile.sql` — admin RPC (avoids local `/api/admin` 401)
- `src/views/admin/AdminProfileConnectPage.jsx`, `VerifiedBadge.jsx`, feed trailer/article attribution
- `src/lib/adminSyncApi.js` — connect via RPC

**Requires:** Run `20260715000000` + `20260720000000` in Supabase.

### Username = display name (required, a-z0-9_ only) ✅

**Problem:** Creating an account set display name but not username; special chars / null allowed.

**Files changed:**
- `src/lib/db/profiles.js` — normalize, uniqueness, backfill, never null
- Profile edit UI → Username field; avatar upload persists immediately
- Migrations `20260716000000` … `20260719000000` (unique, signup, backfill, NOT NULL + format check)
- Feed cards/composer show `avatar_url` immediately after profile refresh

**Requires:** Run username migrations `20260716`–`20260719` in Supabase.

### Explore tab (was My Feed) + trim OTT rails ✅

**Problem:** My Feed showed many “Trending on OTT” rows; tab name should be Explore.

**Files changed:**
- `Home.jsx` / `MobileNavigation.jsx` — Explore tab (`?tab=explore`, legacy `my-feed` still works)
- `HomeBrowseTab.jsx` — only Hot Right Now, In Theaters, Editor’s Pick

**Next recommended:** Confirm Supabase migrations applied; connect official username in Admin → Profile Connect.

---

## Session: Jul 2026 — Cinema Feed Following = people lists

### Following tab shows Followers / Following ✅

**Problem:** Cinema Feed → Following showed activity from followed users + entity-follow CTA, not the user's people lists.

**Files changed:**
- `src/components/social/FollowersFollowingPanel.jsx` — Followers/Following toggles, follow/unfollow
- `src/components/social/SocialFeedPanel.jsx` — Following tab uses people panel (no activity feed)
- `src/views/FeedPage.jsx` — subtitle tweak
- `src/lib/db/social.js` — hydrate follow profiles with `avatar_url`

**Behavior:** Following tab lists people you follow / who follow you. Recent/Diary/For You unchanged.

---

## Session: Jul 2026 — Guest public profiles + polish

### Guests see empty profiles after search ✅

**Problem:** Searching a user worked, but opening `/:username/profile` while signed out showed "USER", all zeros, and empty sections. RLS policies labeled "Public read" were actually `TO authenticated` only.

**Also fixed:**
- Profile posts render `MovieMentionText` (no raw `[[movie|…]]` tokens)
- Theater system list helper text owner-only (`CollectionsPage`, `CollectionDetails`)

**Files changed:**
- `supabase/migrations/20260714000000_anon_public_profile_read.sql`
- Profile/social/routes/diary/watchlist/blogs/activity/achievements guest-safe loads
- Mention + theater-list UI polish

**Requires:** Run `20260714000000_anon_public_profile_read.sql` in Supabase.

---

## Session: Jul 2026 — Movie Boards (standalone)

### Boards separate from Lists/Collections ✅

**Problem:** Boards were incorrectly rebranded on top of `user_collections`. User wants Lists unchanged; Boards as their own cinematic product.

**Approach:** New `boards` / `board_items` / `board_likes` / `board_comments` / `board_activity` tables. Lists stay on `user_collections`.

**Files added:**
- `supabase/migrations/20260712000000_movie_boards_phase1.sql` — standalone boards schema (rewritten)
- `src/lib/db/boards.js` — CRUD, reorder, likes, comments, explore, followed activity
- `src/views/BoardDetailsPage.jsx` — cinematic UI, owner DnD, movies/TV/directors/actors, comments
- `src/views/UserBoardsPage.jsx` — per-user boards index
- `src/views/BoardsExplorePage.jsx` — explore (amber cinematic aesthetic)

**Files changed:**
- Collections restored as Lists (`CollectionsPage`, `CollectionDetails`, `CollectionsModal`, Profile/Search labels)
- Routes: `/boards`, `/boards/:slug`, `/:user/boards`, `/:user/boards/:slug` → board pages; `/collection` + `/:user/collections` → lists
- `following-feed-server.js` + `FollowingFeed.jsx` — board follow activity
- `middleware.js` — OG for boards table
- `profileSystem.js` — `ENTITY_TYPES` includes `board`

**Behavior:**
- Lists/Collections unchanged
- Boards: movies, TV, directors, actors; owner-only drag reorder; like/follow/comments; following feed board updates
- No collaborators (deferred)

**Requires:** Re-run `20260712000000_movie_boards_phase1.sql` in Supabase (creates `boards*` tables). If you already ran the old collections-based version, this migration still creates the new tables safely.

**Next recommended:** Mobile DnD polish, board delete UI, AI suggestions, sections.

**Paused:** Hashtag Phase 3 · Board collaborators

---

## Session: Jul 2026 — OG / social link sharing

### Crawler OG meta for movies, profiles, posts + public share routes ✅

**Problem:** Twitter/Instagram/Facebook only got homepage meta for most links; collections/blogs required login; `/post/:id` 404.

**Files changed:**
- `middleware.js` — bot HTML for `/movies`, `/tv`, `/movie`, `/collection`, `/blog`, `/:user/profile`, `/post`
- `src/routes/index.jsx` — collections/blogs/posts public
- `src/views/PostDetails.jsx` — new share landing page
- `socialFeedApi.js` — `getFeedPostById`
- `Details.jsx`, `ProfilePage.jsx` — client SeoHead
- `index.html` — www canonical + `name="twitter:*"`
- `collections.js` — public-only slug fetch for guests

**Behavior:** Shared links show title/image/description in social previews; guests can open collection/blog/post URLs.

**Next recommended:** Deploy + validate with Facebook Sharing Debugger / Twitter Card Validator; optional `@vercel/og` branded cards.

---

## Session: Jul 2026 — supabase split + admin sections dedupe

### Split supabase.js; retire legacy Admin sections tab ✅

**Problem:** `supabase.js` god-module; AdminPanel duplicated `/admin/sections`.

**Files added:**
- `src/lib/supabaseClient.js`
- `src/lib/db/{profiles,ratings,library,sections,rss,userLists,collections,social,adminOps}.js`

**Files changed:**
- `src/lib/supabase.js` — barrel re-exports only (~143 lines)
- `AdminPanel.jsx` — sections tab → link to `/admin/sections`
- `AdminSectionsPage.jsx` — uses shared `REGIONS`
- `adminLibraryApi.js` — imports client from `supabaseClient`

**Behavior:** Same APIs via `from '../lib/supabase'`; sections CMS only at `/admin/sections`.

**Next recommended:** Further shrink AdminPanel browse/bulk; optional ProfilePage split.

---

## Session: Jul 2026 — Home browse extract + delete onboarding

### HomeBrowseTab / sidebars + remove onboarding subtree ✅

**Problem:** My Feed CMS UI + region picker bloated Home; unused onboarding still in repo.

**Files added:**
- `src/constants/regions.js`
- `src/components/home/HomeRegionPicker.jsx`, `HomeBrowseTab.jsx`, `HomeComingSoonSidebar.jsx`, `HomeSocialSidebar.jsx`

**Files changed:**
- `Home.jsx` (~760 lines)
- `upcoming.jsx`, `TVSeries.jsx` — shared `REGIONS` helpers
- `supabase.js` — removed unused onboarding completion helpers (kept `getUserTasteProfile`)
- `WatchPage.jsx` — copy tweak

**Deleted:** OnboardingPage, onboarding components/constants/utils, tasteIdentity, tastePreferences

**Next recommended:** Dedupe AdminSectionsPage REGIONS; further supabase.js split.

---

## Session: Jul 2026 — Split Home feed cards (pass 2)

### Extract activity card, composer, comment/share modals ✅

**Problem:** Home still owned composer + modals + activity JSX after card split.

**Files added:**
- `FeedActivityCard.jsx`, `FeedComposer.jsx`, `FeedCommentModal.jsx`, `FeedShareModal.jsx`

**Files changed:** `src/views/Home.jsx` (~1,075 lines; was ~1,463)

**Behavior:** Same feed UX; composer/comments/share own their state.

**Next recommended:** Extract CMS browse sidebar / region picker; or delete onboarding if abandoned.

---

## Session: Jul 2026 — Split Home feed cards

### Extract FeedPostCard / FeedTrailerCard / FeedArticleCard ✅

**Problem:** `Home.jsx` inlined ~400 lines of feed card JSX (`renderPost` / `renderTrailer` / `renderArticle`).

**Files changed:**
- Added `src/components/social/FeedPostCard.jsx`, `FeedTrailerCard.jsx`, `FeedArticleCard.jsx`
- `src/views/Home.jsx` — uses components; activity row stays inline

**Behavior:** Same feed UI; Home is thinner orchestrator.

**Next recommended:** Extract `FeedActivityCard` or composer/modals next; or delete onboarding if abandoned.

---

## Session: Jul 2026 — Dead-code cleanup + audit

### Removed unused files/exports; audited heavy modules ✅

**Problem:** Unused components/API after article-page removal; large god-files hard to maintain.

**Deleted (orphaned):**
- `HomeSocialFeed.jsx`, `BannerHome.jsx`, `BadgeGrid.jsx`, `BadgeList.jsx`, `StatsRow.jsx`

**Removed dead API/exports:**
- `/api/content/article/:id` + `fetchArticleById` + duplicate `fetchMovieDetail` in content-server
- Unused edge wrappers: showcase/coming-soon/new-releases/popular/now-playing/stats clients
- `downvoteReview`, `getSimilarRecommendations` (client), `trackRating`, `normalizeSearchQuery`

**Kept (unused but feature-sized):** full onboarding subtree (~1.5k lines) — confirm before delete

**Heavy files (refactor later, not this pass):**
- `AdminPanel.jsx` ~2.6k, `supabase.js` ~2.5k, `Home.jsx` ~1.8k, `ProfilePage.jsx` ~1.4k

**Next recommended:** Confirm delete onboarding; split Home feed cards; retire AdminPanel sections tab in favor of AdminSectionsPage.

---

## Session: Jul 2026 — Remove in-app article page

### Article cards open source URL only ✅

**Problem:** Clicking a news article opened a separate `/article/:id` page; not needed.

**Files changed:**
- `src/views/Home.jsx` — article cards use external `link`; “Read on {source} ↗”
- `src/routes/index.jsx` — removed `article/:id` route
- Deleted `src/views/ArticleDetails.jsx`
- `src/lib/contentEdgeApi.js` — removed unused `getArticleFromEdge`

**Behavior:** Feed articles open the publisher URL in a new tab. No in-app full-article page.

**Next recommended:** Smoke-test Home news cards open external links.

---

## Session: Jul 2026 — Public feed browse (guest access)

### Guest can browse feed; lock AI / collections / blogs ✅

**Problem:** Entire app required login; Supabase Auth outages blocked all browsing.

**Files changed:**
- `src/routes/index.jsx` — App shell public; `RequireAuth` wraps watch, collections, blogs, diary, watchlist, settings
- `src/components/RequireAuth.jsx`, `SignInGate.jsx` — nested auth gate + inline CTA
- `src/views/WatchPage.jsx` — AI reco gated for guests
- `src/views/Home.jsx` — public feed; sign-in for post/like/save/comment
- `src/components/MobileNavigation.jsx` — Sign in tab for guests

**Behavior:** Guests browse Home feed, movies, TV, search, upcoming, public profiles. Sign-in required for Watch (AI), collections, blogs, diary, watchlist, settings, and feed write actions.

**Next recommended:** Smoke-test guest `/` feed + locked `/watch` redirect; keep Supabase Auth healthy for sign-in.

---

## Session: May 2026 — Admin CMS Enhancement

### Admin panel modularization + security hardening (uncommitted) ✅

**Problem:** AdminPanel.jsx was 150K+ char monolith; no audit logging; limited sync jobs; missing trailer/coming-soon APIs.

**Files changed:**
- `supabase/migrations/20260528100000_admin_audit_logs.sql` — `admin_audit_logs`, `admin_rate_limits`, `admin_sessions` tables + indexes + RLS
- `api/_lib/admin-auth.js` — enhanced with rate limiting, IP whitelist, audit logging integration
- `api/_lib/rate-limit.js` — sliding window rate limiter (DB + memory fallback)
- `api/_lib/audit-log.js` — admin action audit trail helper
- `api/_lib/tmdb-sync-server.js` — new sync jobs: `popular-weekly`, `top-rated-monthly`, `trending-weekly`, `new-releases-weekly`, `upcoming-trailers`
- `api/_lib/content-server.js` — `fetchTrailers`, `fetchComingSoon`, `fetchNewReleases`, `fetchPopularByPeriod`, `fetchNowPlaying`, `fetchAdminStats`
- `api/content/[...route].js` — `/trailers`, `/coming-soon`, `/new-releases`, `/popular`, `/now-playing`, `/stats` endpoints
- `src/lib/contentEdgeApi.js` — client wrappers for new endpoints
- `src/views/admin/AdminDashboardPage.jsx` — new modular dashboard with stats, health, quick actions
- `src/routes/index.jsx` — `/admin` now shows new dashboard; legacy at `/admin/legacy`
- `src/components/AdminLayout.jsx` — updated sidebar nav
- `vercel.json` — new cron schedules (trending/now-playing now daily)
- `.env.example` — `ADMIN_IP_WHITELIST` documentation

**Behavior:** 
- New admin dashboard at `/admin` with stats, sync job status, quick links
- Rate limiting: 100 reads/min, 30 writes/min per IP
- Audit logs capture all admin actions with IP + user agent
- Trailers endpoint returns YouTube keys + thumbnails for recent movies
- Coming soon returns future releases; new releases returns last 30 days
- Cron jobs now run daily for trending/now-playing

**Next recommended:** Run `20260528100000_admin_audit_logs.sql` migration; test `/api/content/trailers`; optionally set `ADMIN_IP_WHITELIST` for production.

---

## Session: May 2026 — Social Media Transformation

### Social platform layer (uncommitted) ✅

**Problem:** Home was catalog-only; limited retention (5 badges); no global social feed or Letterboxd-style reviews.

**Files changed:**
- `supabase/migrations/20260528000000_social_media_phase.sql` — `social_reviews`, `review_comments`, `review_likes`, `collection_likes`, `user_streaks`, profile/collection/badge extensions
- `supabase/migrations/20260528000100_social_badges_seed.sql` — 40+ tiered badges
- `api/feed/[...route].js`, `api/_lib/feed-server.js` — global / for-you / suggestions feeds
- `api/_lib/social-server.js` — expanded badge checks, reviews, likes, streaks
- `api/_lib/streak-server.js`, `api/_lib/embedding-server.js` — HF free embeddings
- `src/components/social/*` — ReviewCard, BadgeGrid, StatsRow, HomeSocialFeed, WhoToFollow, WriteReviewModal
- `src/views/Home.jsx`, `ProfilePage.jsx`, `Details.jsx`, `src/index.css`

**Behavior:** Home has Feed (Popular/Recent/Following/For You) + Browse tabs; users publish social reviews from movie details; streaks update on diary log; profiles show taste identity, stats row, badge grid; who-to-follow sidebar uses taste overlap.

**Next recommended:** Run both new SQL migrations in Supabase; set `HF_API_KEY` on Vercel; smoke-test `/api/feed/global` after deploy.

---

## Session sync protocol

**On push (agent):** Update this file with session notes + git history row + HEAD **before** every `git push`. See [`.cursor/rules/task-list-sync.mdc`](../.cursor/rules/task-list-sync.mdc).

**On pull (phone/desktop):** Read this file first after `git pull origin main` — it is the handoff source of truth.

1. **Inspect git:** `git log --oneline -15` + diff vs `origin/main` for task-related commits.
2. **Ask about off-git work:** SQL in Supabase Editor, env vars, deploys — these won't show in commits.
3. **Update all four sources in one pass** when task status changes:
   - `.agent/implementation-work-log.md` (this file)
   - `.agent/tos-production-architecture-plan.md`
   - `.agent/implementation-plan-api-optimization.md`
   - `~/.cursor/plans/tos_production_architecture_e5360011.plan.md`
4. **Tick marks:** ✅ done · 🔄 partial · ⬜ pending
5. **Set HEAD** to latest `git log -1` short hash

---

## Master Task List

| # | ID | Task | Status |
|---|-----|------|--------|
| 1 | `fix-upcoming-db` | Upcoming page DB-first (`getUpcomingFromDb` / Edge) | ✅ Done |
| 2 | `slim-hydration` | Slim card hydration; no base64 in admin sync | ✅ Done |
| 3 | `edge-read-api` | Vercel Edge `/api/content/*` + `contentEdgeApi.js` | ✅ Done |
| 4 | `db-migrations` | Snapshots, sync tables, RLS, production SQL | ✅ Done |
| 5 | `server-tmdb-proxy` | TMDB key server-side; admin proxy | ✅ Done |
| 6 | `automated-sync` | Cron + delta TMDB sync | ✅ Done |
| 7 | `admin-control-tower` | Sync history, events queue, DB settings | ✅ Done |
| 8 | `unify-content-api` | Full Edge adoption; remove Explore/Details TMDB | ✅ Done |
| 9 | `onboarding-redesign` | 5-step taste onboarding wizard | ✅ Done |
| 10 | `taste-profile-schema` | Profile rebuild worker + embedding backfill | ✅ Done |
| 11 | `recommendation-engine` | Hybrid reco API | ✅ Done |
| 12 | `ux-redesign` | Watch Tonight, Family hub, personalized home | ✅ Done |
| 13 | `phase3-social-schema` | Diary, badges, following feed | ✅ Done |
| 14 | `ai-agents-stack` | Background AI agents (Gateway) | ⬜ Pending |

**Progress:** 13 complete · 0 partial · 1 pending

Full roadmap: [tos-production-architecture-plan.md](./tos-production-architecture-plan.md)

---

## Git commit history (Phase 1)

| Commit | Date | Summary |
|--------|------|---------|
| `f3e753c` | Jul 2026 | Coming Soon divided widget, composer line removed, trending offset, pill search |
| `ac1496b` | Jul 2026 | Feed carousel/polls, flat layout, mobile nav Watch, admin trending_live |
| `138b5a9` | Jul 2026 | Fix profile avatar/banner URLs saved via Vite supabase-proxy |
| `e5a2d32` | Jul 2026 | Explore in-page Collections/Boards/Blogs, Coming Soon Feed-only, mobile/iPad |
| `dd05fdb` | Jul 2026 | Official profile connect, username rules, Explore tab, feed avatars |
| `d1ba0ab` | Jul 2026 | Social phase, boards, guest public profiles, Cinema Feed people lists |
| `ba262d9` | May 2026 | Consolidate 25 API routes → 8 functions (Vercel Hobby 12-fn limit) |
| `5894c1d` | May 2026 | Agent docs HEAD sync |
| `0517a64` | May 2026 | Fix Vercel Hobby maxDuration (60s cap on taste admin + crons) |
| `14461a7` | May 2026 | Work log HEAD sync |
| `f1328ae` | May 2026 | Work log HEAD sync |
| `46cf628` | May 2026 | Tasks #10–13 APIs; admin library upsert; search/diary/theater UX; dedupe migrations |
| `4488dab` | May 2026 | Task #9 onboarding wizard + user_taste_profiles SQL migration |
| `b210481` | May 2026 | Agent docs HEAD sync — Tasks 7–8 checkmarks |
| `b42916d` | May 2026 | Task #7 control tower + Task #8 Explore Edge + auth overhaul |
| `6c0f3d4` | May 2026 | Agent docs HEAD sync after automated-sync push |
| `5484d87` | May 2026 | Weekly Vercel Cron jobs for automated TMDB library sync |
| `86f2a84` | May 2026 | Task #5 server-tmdb-proxy + unify-content-api |
| `348a9a9` | May 2026 | Agent docs HEAD sync after detail poster fix |
| `def1998` | May 2026 | Fix mobile detail page poster/backdrop/cast image loading |
| `9f73fe0` | May 2026 | Agent docs HEAD sync to 75b67e2 |
| `4a35fb9` | May 2026 | Supabase CLI init + migrations db push to tos project |
| `03659ec` | May 2026 | Work log git history + HEAD sync (post-merge) |
| `a176952` | May 2026 | Work log HEAD sync to 2775166 |
| `2775166` | May 2026 | Work log HEAD sync to 2a7ef03 |
| `2a7ef03` | May 2026 | Work log HEAD sync after merge handoff push |
| `8fbcd11` | May 2026 | Agent HEAD sync after merge handoff |
| `601e837` | May 2026 | Merge handoff session notes (intermediate) |
| `55e507a` | May 2026 | Merge handoff docs + branch merge to main |
| `efc6c79` | May 2026 | Merge rating re-update (upsert + RLS UPDATE) |
| `fc68884` | May 2026 | Merge db-migrations (`supabase_phase1_content_pipeline.sql`) |
| `b8f20da` | May 2026 | Work log HEAD sync (pre-merge) |
| `32e3a8e` | May 2026 | Fix share card text clipping; larger modal preview |
| `8da7637` | May 2026 | Share card polish: logo, yellow border, compact modal, no backdrop |
| `5dce9b3` | May 2026 | TOS home card badge + share card UI/sharing + work log |
| `22eceed` | May 2026 | Sync HEAD refs + align 14-task lists across agent docs |
| `424b999` | May 2026 | Mark Task 4 `db-migrations` complete in docs |
| `6b79231` | May 2026 | Sync master task list across all agent docs |
| `786207a` | May 2026 | Updated agent docs — Phase 1 status |
| `027f1d9` | May 2026 | Vercel Edge `/api/content/*` routes + `contentEdgeApi.js` |
| `99c54f3` | May 2026 | Added TOS production architecture plan (`.agent/`) |
| `1e2f319` | May 2026 | Upcoming DB-first, slim hydration, remove base64 admin sync |

---

## Session: May 2026 — Movie detail 404 on Vercel ✅

**Problem:** `/api/content/movie/:id` returned 404 in production. Vercel non-Next catch-all routes only match single path segments (`/api/content/trending` works; `/api/content/movie/1726` does not).

**Fix:**
- Restored `api/content/movie/[tmdbId].js` and `api/recommendations/similar/[tmdbId].js` (10 functions total, still under Hobby 12 cap)
- `getAdvancedMovieFromLibrary` uses `MOVIE_DETAIL_SELECT` instead of full library select (fixes Supabase 400 fallback when optional columns missing)

---

## Session: May 2026 — Vercel Hobby 12-function limit ✅

**Problem:** Deploy failed — Hobby allows max 12 Serverless Functions; project had ~25 (`api/content/*`, `api/cron/*`, `api/recommendations/*`, etc.).

**Fix:** Consolidated into catch-all routers (URLs unchanged):
- `api/content/[...route].js` — trending, explore, search, homepage, tv-sections, upcoming, movie/:id
- `api/admin/[action].js` — library, sync, taste
- `api/cron/[job].js` — all 5 cron jobs
- `api/recommendations/[...route].js` — for-you, tonight, family, trending-personalized, similar/:id
- `api/social/[action].js` — check-badges, decision-pick

**Total functions:** 10 (content catch-all + movie/:id, admin, cron, reco catch-all + similar/:id, social, taste/rebuild, tmdb, sitemap)

**Next recommended task:** `ai-agents-stack` (Task #14)

---

## Session: May 2026 — Vercel Hobby maxDuration fix ✅

**Problem:** Deploy failed — `api/admin/taste` had `maxDuration: 300`; Hobby plan allows max 60s.

**Files changed:** `api/admin/taste.js`, `api/cron/taste-profile-weekly.js`, `api/cron/embedding-backfill.js` — capped at 60s; reduced default batch sizes (10 profiles / 5 embeds / 10 backfill).

**Next recommended task:** `ai-agents-stack` (Task #14)

---

## Session: May 2026 — Social, admin library, search & diary UX ✅

### Post-rating diary log
- `QuickLogModal` — no rating slider; “In theater” tag; opens right after Submit Rating
- `Details.jsx` + `UserRatingSystem.jsx` — immediate log modal on rating success

### Admin `movies_library` save (bulk + TMDB browse)
- `api/admin/library.js` — service-role upsert (bypasses RLS); chunked batches
- `src/lib/adminLibraryApi.js`, `persistLibraryRecords` — API first, direct fallback
- `src/lib/libraryDedupe.js` — batch dedupe + upsert with `ON CONFLICT` fallback (`tmdb_id,media_type` → `tmdb_id`)
- `supabase/migrations/20260526300000_movies_library_dedupe_unique.sql`, `20260526310000_fix_library_upsert_constraint.sql`

### Search
- `src/lib/searchUtils.js` — “antman” matches “Ant-Man”; `search_movies_library` SQL migration
- `Search.jsx` — `URLSearchParams` for `?q=`

### Theater watch
- `supabase/migrations/20260526200000_theater_watch_feed_and_collection.sql` — `watched_in_theater` on logs/feed; system collection per user
- `src/lib/theaterWatch.js` — auto “Watched in Theaters” collection; editable description/public

**Apply migrations:** `supabase db push` (or run `20260526310000_fix_library_upsert_constraint.sql` if upsert ON CONFLICT errors)

**Env:** `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` for local admin saves

**Next recommended task:** `ai-agents-stack` (Task #14)

---

## Session: May 2026 — Phase 1 Foundation

### Goals

1. Stop runtime TMDB usage on public pages where possible
2. Fix slow page loads (especially Upcoming + Homepage hydration)
3. Add Vercel Edge cached read layer for shared CDN performance

---

### Task 1 — Upcoming page DB-first ✅

**Task ID:** `fix-upcoming-db` · **Commit:** `1e2f319`

**Files changed:**
- `src/views/upcoming.jsx` — Replaced TMDB axios loop with `getUpcomingFromDb()` / Edge
- `src/lib/contentApi.js` — Extended `getUpcomingFromDb()` (year range, `fetchAll`, slim select, `normalizeLibraryItem`)

**Before:** ~25 TMDB API calls per Upcoming page visit (2026–2030 discover loop)  
**After:** 1 Supabase query (Edge-cached in production); zero TMDB on that page

---

### Task 2 — Slim hydration + remove base64 storage ✅

**Task ID:** `slim-hydration` · **Commit:** `1e2f319`

**Files changed:**
- `src/lib/supabase.js` — `LIBRARY_CARD_SELECT`; slim hydration; strip base64 on save
- `src/views/AdminPanel.jsx` — Removed base64 from Sync Upcoming
- `src/views/admin/AdminSectionsPage.jsx` — Removed base64 on section import
- `src/components/Card.jsx` — TMDB CDN posters first
- `src/views/Home.jsx`, `TVSeries.jsx`, `Search.jsx` — Stop passing `images` JSONB

---

### Task 3 — Vercel Edge content routes ✅

**Task ID:** `edge-read-api` · **Commit:** `027f1d9`

**New files:**
| File | URL | Cache |
|------|-----|-------|
| `api/_lib/content-server.js` | (internal) | — |
| `api/content/homepage.js` | `GET /api/content/homepage` | 5 min + SWR |
| `api/content/tv-sections.js` | `GET /api/content/tv-sections` | 5 min + SWR |
| `api/content/upcoming.js` | `GET /api/content/upcoming` | 10 min + SWR |
| `api/content/search.js` | `GET /api/content/search?q=` | 2 min + SWR |
| `api/content/movie/[tmdbId].js` | `GET /api/content/movie/:id` | 1 hr + SWR |
| `src/lib/contentEdgeApi.js` | (client wrapper) | — |

**Frontend wired:** Home, TVSeries, Upcoming, Search, Details → Edge API (DB fallback on local dev)

---

### Task 4 — Database migrations + RLS ✅

**Task ID:** `db-migrations` · **Completed:** May 2026 (Supabase SQL Editor, from phone)

**Applied in Supabase:**
- [x] `content_snapshots` table
- [x] `tmdb_sync_runs`, `tmdb_sync_state`, `content_events` tables
- [x] RLS policy updates on `movies_library`, `homepage_sections`, `tv_sections`
- [x] `supabase_production_optimization.sql` (indexes, `tv_sections`, search functions)

**Repo SQL:** `supabase_phase1_content_pipeline.sql` (content_snapshots, sync tables, admin-gated RLS). Apply in Supabase SQL Editor if not already run. Code can use these tables in Tasks #6–7 (automated sync, admin tower).

---

### Task 8 — Unify content API ✅ Done

**Task ID:** `unify-content-api` · **Completed:** May 2026

| Page | Read path | TMDB fallback? |
|------|-----------|----------------|
| Home | Edge ✅ | No |
| TV Series | Edge ✅ | No |
| Upcoming | Edge ✅ | No |
| Search | Edge ✅ | No |
| Details | Edge ✅ | No |
| Explore | Edge ✅ (`/api/content/explore`, `/api/content/trending`) | No |
| CollectionDetails | Edge search/detail ✅ | No |

**Delivered:**
- `api/content/explore.js` — category/genre browse with pagination
- `api/content/trending.js` — popularity-sorted trending feed
- `api/_lib/content-server.js` — `fetchExploreContent`, `fetchTrendingContent`
- `src/lib/contentEdgeApi.js` — `getExploreContentFromEdge`, `getTrendingContentFromEdge`
- `src/views/Explore.jsx` — wired to Edge client (genres still from `contentApi` constants)

TMDB remains **admin-only** (`AdminPanel`, `AdminSectionsPage`, cron sync).

---

## Deploy checklist (Vercel)

1. **Env vars** (Production + Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
2. Redeploy after env changes
3. **Verify:** `https://www.theaterorstream.com/api/content/homepage` → JSON `{ data: [...] }`
4. **Local dev:** `npm run dev` → DB fallback; `vercel dev` → Edge routes

---

## Architecture (current)

```
Browser (React SPA)
    │
    ├── GET /api/content/*  →  Vercel Edge (cached)  →  Supabase   [production]
    │
    └── Direct Supabase                                         [local dev fallback]
```

TMDB still used: **admin panel** (import/sync) and **cron sync** only.

---

## Session: May 2026 — UX fixes (ratings + share card)

### Home page TOS badge on movie cards ✅

**Problem:** After rating a movie, home cards still showed TMDB star instead of orange TOS badge.

**Root cause:** Homepage Redux cache wasn’t updated after rating; Card didn’t read user’s rated movies directly.

**Files changed:**
- `src/store/movieSlice.jsx` — `userRatedMovieIds`, `markUserRatedMovie`, `patchHomepageMovieTosRating`
- `src/lib/ratingUtils.js` — overall score helpers
- `src/components/UserRatingSystem.jsx` — sync rating to Redux on submit
- `src/components/Card.jsx` — show TOS badge only when signed-in user has rated that movie
- `src/views/Home.jsx` — load user ratings on mount + refresh on tab focus

**Behavior:** TMDB star by default → orange **TOS** badge immediately after you rate (and on return to Home).

---

### Share review card redesign + cross-platform sharing ✅

**Problem:** Share card had poster not rendering (html2canvas captured before base64 load), title overlap, weak layout.

**Files changed:**
- `src/components/ShareMovie.jsx` — simple vertical layout (poster → title → score → categories); two-step image prep then capture
- `src/lib/shareUtils.js` — Instagram Stories, WhatsApp, X, Facebook, Telegram, Reddit, native share helpers

**Share options:** Quick Share (native sheet), Instagram, WhatsApp, X, Facebook, Telegram, Reddit, Copy Image, Copy Link, Download.

---

### Agent docs + task sync rule ✅

- `.cursor/rules/task-list-sync.mdc` — sync all 4 task lists after pull / phone work
- `.agent/implementation-work-log.md` — session sync protocol + this session log

---

### Work log on every push (agent rule) ✅

**Updated:** `.cursor/rules/task-list-sync.mdc` — agents must update `.agent/implementation-work-log.md` before every `git push` so phone `git pull` includes handoff notes.

---

### Share card UI polish (layout + branding + speed) ✅

**Problem:** Old share card had green poster glow, TOS text instead of logo, green score dash, backdrop slow-load, desktop modal scrolled.

**Files changed:** `src/components/ShareMovie.jsx`

**Fixes:**
- TOS **logo** (Cloudinary, same as header) instead of "TOS" text badge
- Poster: **fine yellow border**, no green glow
- Score: **yellow**, no underline/dash
- **No backdrop image** — solid gradient BG + subtle `theaterorstream.com` watermark
- Poster only at **w500** (faster generation)
- Desktop modal: compact **720×560px**, no scroll

---

### Share card text clipping + larger modal preview ✅

**Problem:** Brand name and movie title cut off in exported PNG. Modal preview too small.

**Files changed:** `src/components/ShareMovie.jsx`

**Fixes:**
- Removed `line-clamp` / `truncate` (html2canvas clipping bug)
- `onclone` overflow cleanup; card captured in-layout not off-screen
- Modal preview **380px** tall; dialog **860×620px** max

---

## Session: May 2026 — Fix rating re-update not saving

### Rating update (re-rate) ✅

**Problem:** First rating saved; changing the rating again did not persist (2nd+ updates).

**Root cause:** Supabase RLS on `ratings` allowed `INSERT` and `SELECT` but had **no `UPDATE` policy**, so `submitRating` update path failed after the first insert.

**Files changed:**
- `supabase_schema.sql` — unique index `(user_id, movie_id)` + public UPDATE policy
- `supabase/migrations/20260521_ratings_update_policy.sql` — production SQL (dedupe + index + policy)
- `src/lib/supabase.js` — normalize `movie_id`, upsert + update fallback, `maybeSingle` fetch
- `src/components/UserRatingSystem.jsx` — notify parent on submit; pass saved row to callback
- `src/views/Details.jsx` — optimistic `userRating` sync on re-rate (both modals)

**Off-git required:** Run `supabase/migrations/20260521_ratings_update_policy.sql` in Supabase SQL Editor once.

**Behavior:** Re-opening the rating modal shows your latest scores; submitting again updates the same row.

---

## Session: May 2026 — Merge branches to main (desktop handoff)

### Branch merge ✅

**Problem:** Work lived on `cursor/db-migrations-phase1-2b4b` and `cursor/fix-rating-reupdate-708f` while `main` had share-card + agent-doc commits ahead.

**Merged into `main`:**
- `supabase_phase1_content_pipeline.sql` — snapshots, sync tables, admin-gated RLS
- Rating re-update — upsert path, `20260521_ratings_update_policy.sql`, Details optimistic sync

**Off-git (run once on Supabase if not done):**
1. ~~`supabase/migrations/20260521_ratings_update_policy.sql`~~ ✅ Applied via `supabase db push` (May 2026, desktop)
2. ~~`supabase_phase1_content_pipeline.sql`~~ ✅ Applied as `20260520000000_phase1_content_pipeline.sql` via `supabase db push`

---

## Session: May 2026 — Pull merge + Supabase CLI db push ✅

### Git pull ✅

**Pulled:** `b8f20da` → `03659ec` (17 commits) — rating re-update + Phase 1 SQL + work log merge.

### Supabase CLI ✅

- `npx supabase init` + `link --project-ref kfdeyggjsmltnmszhtfk` (project **tos**)
- Committed `supabase/config.toml`, `.gitignore`, `migrations/20260520000000_phase1_content_pipeline.sql`
- **`npx supabase db push`** — both migrations applied to production DB

---

## Session: May 2026 — Mobile detail page poster fix ✅

### Problem
On mobile, movie detail page showed no poster/backdrop/cast images after tapping a card from home.

### Root cause
`Details.jsx` preferred stale `images.poster_base64` over TMDB `poster_path`, and lacked the CDN fallback used by `Card.jsx`.

### Fix
- `src/utils/imageHelper.js` — `resolveTmdbImageUrl()` (path first, valid base64 fallback, TMDB CDN default)
- `src/views/Details.jsx` — poster, backdrop, cast use shared helper
- `api/_lib/content-server.js` — removed `is_active` filter on detail fetch so homepage movies resolve

---

## Session: May 2026 — Task #5 server-tmdb-proxy ✅

### Server
- `api/_lib/tmdb-server.js` — TMDB fetch helper (`TMDB_API_KEY` env)
- `api/_lib/admin-auth.js` — Supabase JWT + `user_profiles.is_admin` gate
- `api/tmdb/[...path].js` — admin-only GET proxy for TMDB v3 paths

### Client
- `src/lib/tmdbApi.js` — admin client via `/api/tmdb/*` (dev fallback if proxy unavailable)
- Removed TMDB axios setup from `src/main.jsx`
- `App.jsx` — static TMDB image base URL (no `/configuration` call)
- **Admin:** `AdminPanel.jsx`, `AdminSectionsPage.jsx` → `tmdbApi`
- **Public:** removed client TMDB from `Details`, `Explore`, `ParentGuide`, `VideoPlay`, `CollectionDetails`, `Search`

### Deploy note
Add **`TMDB_API_KEY`** (no `VITE_` prefix) to Vercel project env. Optional `VITE_MOVIE_API_KEY` only for local vite admin dev.

**Next recommended task:** `onboarding-redesign` (Task #9)

---

## Session: May 2026 — Task #7 admin-control-tower ✅

### Admin UI
- `src/views/admin/AdminControlTowerPage.jsx` — sync jobs, run history, content events queue
- `/admin/pipeline` route + **Pipeline** nav item in `AdminLayout`
- `AdminPanel` dashboard — sync pipeline summary + link to control tower
- `AdminSettingsPage` — settings persisted to Supabase `app_settings` (not localStorage)

### API + data
- `supabase/migrations/20260521000000_app_settings.sql` — `app_settings` table + admin RLS
- `api/admin/sync.js` — admin-authenticated manual sync trigger (`POST { jobName }`)
- `src/lib/adminSyncApi.js` — client helper for manual runs
- `src/lib/supabase.js` — `getSyncState`, `getSyncRuns`, `getContentEvents`, `createContentEvent`, `getAppSettings`, `saveAppSettings`

### Apply migration
```bash
supabase db push
```

**Next recommended task:** `onboarding-redesign` (Task #9)

---

## Session: May 2026 — Task #8 unify-content-api ✅

### Edge routes
- `api/content/explore.js` — browse by mediaType, category, genre, pagination
- `api/content/trending.js` — popularity-sorted trending feed
- `api/_lib/content-server.js` — `fetchExploreContent`, `fetchTrendingContent`

### Client
- `src/lib/contentEdgeApi.js` — `getExploreContentFromEdge`, `getTrendingContentFromEdge`
- `src/views/Explore.jsx` — all reads via Edge (genres from static constants)

**Verify:** `/api/content/explore?mediaType=movie&category=popular&limit=24` and `/api/content/trending?limit=24`

**Next recommended task:** `recommendation-engine` (Task #11)

---

## Session: May 2026 — Task #9 onboarding-redesign ✅

### 5-step taste wizard
- `src/views/OnboardingPage.jsx` — identity → streaming → genres/moods → seed ratings → family mode
- `src/constants/onboarding.js` — OTT platforms (IN/US/GB), moods, certifications
- `src/components/onboarding/OnboardingUI.jsx` — progress bar + step shell
- `src/lib/onboardingUtils.js` — draft persistence, quick-rating → 7-axis mapping

### Database (AI-ready)
- `supabase/migrations/20260522000000_user_taste_onboarding.sql`
  - `user_streaming_services`, `user_taste_profiles` (pgvector + HNSW)
  - Profile extensions + `movies_library` mood/embedding columns

### Save path
- `completeTasteOnboarding()` → `user_profiles` + streaming + taste profile + seed `ratings`

**Apply migration:** `supabase db push`

**Next recommended task:** `ux-redesign` (Task #12)

---

## Session: May 2026 — Task #11 recommendation-engine ✅

### Hybrid scoring API + cache

**Problem:** No server-side personalized rankings; onboarding used local heuristics only.

**Files changed:**
- `supabase/migrations/20260524100000_recommendation_vector_rpc.sql` — `match_movies_by_embedding`, `match_similar_to_movie`
- `api/_lib/recommendation-server.js` — hybrid scorer (content/genre/axis/collab/popularity), hard OTT/family filters, 6h cache
- `api/_lib/recommendation-handler.js` — auth + query parsing
- `api/recommendations/for-you.js`, `tonight.js`, `family.js`, `trending-personalized.js`, `similar/[tmdbId].js`
- `src/lib/recommendationApi.js` — client wrapper with session Bearer token
- `scripts/vite-local-api-plugin.js` — `/api/recommendations/` dev routing

**Scoring (hot path, no LLM):**
- With embeddings: 40% content · 25% genre · 15% axis · 10% collab · 10% popularity
- Without embeddings: genre/axis/popularity weighted fallback
- Hard filters: `is_active`, OTT platforms, family mode + cert + parent guide limits

**Endpoints (GET, auth required):**
| Route | Use case |
|-------|----------|
| `/api/recommendations/for-you` | Personalized library rank |
| `/api/recommendations/tonight` | ≤120min, unwatched, on your OTT |
| `/api/recommendations/family` | Family-safe picks |
| `/api/recommendations/similar/:tmdbId` | Because you liked X |
| `/api/recommendations/trending-personalized` | Trending re-ranked by taste |

**Apply migration:** `supabase db push` (RPC functions required for embedding similarity pool)

**Next recommended task:** `ux-redesign` (Task #12 — wire reco into Home / Watch Tonight UI)

---

## Session: May 2026 — Task #13 phase3-social-schema ✅

### Diary, badges, following feed

**Problem:** `movie_logs` table existed but no diary UI; activity merged legacy watched+ratings only.

**Files changed:**
- `supabase/migrations/20260525100000_phase3_social_schema.sql` — `activity_feed`, badges, public RLS
- `api/_lib/social-server.js`, `api/social/check-badges.js`, `api/social/decision-pick.js`
- `src/lib/movieDiary.js`, `src/lib/socialApi.js`
- `src/components/social/*` — QuickLogModal, ActivityFeedList, BadgeList
- `src/views/DiaryPage.jsx`, `FeedPage.jsx`; routes `/diary`, `/feed`
- `MovieActionButtons`, `UserRatingSystem`, `ProfilePage`, `ActivityFeedPage`

**Apply migration:** `supabase db push` (includes `20260525100000`)

**Next recommended task:** `ai-agents-stack` (Task #14)

---

## Session: May 2026 — Task #10 taste-profile-schema ✅

### Profile rebuild worker + embeddings

**Problem:** Onboarding wrote cold-start taste data, but ratings/logs never recomputed `genre_weights`, axis prefs, or vectors for similarity search.

**Files changed:**
- `supabase/migrations/20260524000000_taste_profile_worker.sql` — `movie_logs`, `recommendation_cache`, worker indexes
- `api/_lib/taste-profile-server.js` — rebuild from ratings + library metadata; stale batch; movie embed backfill
- `api/_lib/embedding-server.js` — Voyage `voyage-3-lite` (512-d) with OpenAI fallback
- `api/_lib/user-auth.js` — signed-in user auth for taste routes
- `api/taste/rebuild.js` — `POST` rebuild for current user
- `api/cron/taste-profile-weekly.js`, `api/cron/embedding-backfill.js` — weekly batch jobs
- `api/admin/taste.js` — admin jobs: `rebuild-user`, `rebuild-stale`, `embed-movies`
- `src/lib/tasteProfileApi.js` — client fire-and-forget rebuild
- `src/components/UserRatingSystem.jsx`, `src/lib/supabase.js` — trigger rebuild after rating / onboarding
- `vercel.json` — Sunday crons; `.env.example` — `VOYAGE_API_KEY`; `scripts/vite-local-api-plugin.js` — `/api/taste/`

**Behavior:**
- Rebuild merges onboarding genre weights (30%) with rating-derived weights (70%)
- Computes axis averages, runtime/decade/language patterns, `rating_count`, `log_count`
- Invalidates `recommendation_cache` on each rebuild
- Optional user/movie embeddings when `VOYAGE_API_KEY` or `OPENAI_API_KEY` is set

**Deploy checklist:**
1. `supabase db push` (or run migration SQL in Supabase Editor)
2. Vercel env: `VOYAGE_API_KEY` (or `OPENAI_API_KEY`), existing `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET`
3. Commit + deploy; test `POST /api/taste/rebuild` while signed in

**Next recommended task:** `recommendation-engine` (Task #11)

---

## Session: May 2026 — Task #6 automated-sync ✅

### Server cron routes
- `api/_lib/supabase-admin.js` — service-role Supabase client
- `api/_lib/cron-auth.js` — `CRON_SECRET` verification (Vercel Cron Bearer)
- `api/_lib/movie-library-server.js` — TMDB → `movies_library` mapping + delta upsert
- `api/_lib/tmdb-sync-server.js` — `runSyncJob()`, job config, `createCronHandler()`
- `api/cron/trending-daily.js` — Fridays 06:00 UTC
- `api/cron/now-playing-daily.js` — Fridays 06:30 UTC
- `api/cron/upcoming-weekly.js` — Fridays 07:00 UTC

### Sync behavior
- Fetches TMDB list endpoints (trending / now_playing / upcoming) for region `IN`
- Delta strategy: full detail fetch for new titles or large popularity/vote drift; lightweight upsert otherwise
- Writes audit rows to `tmdb_sync_runs` and watermarks in `tmdb_sync_state`

### Vercel config
- `vercel.json` — `crons` array for the three routes above

### Deploy env (Vercel)
| Variable | Purpose |
|----------|---------|
| `TMDB_ACCESS_TOKEN` or `TMDB_API_KEY` | TMDB fetch (already set) |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypass RLS for cron upserts |
| `CRON_SECRET` | Auth for cron + manual trigger |

### Manual trigger (after deploy)
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://www.theaterorstream.com/api/cron/trending-daily
```

**Next recommended task:** `onboarding-redesign` (Task #9)

---
