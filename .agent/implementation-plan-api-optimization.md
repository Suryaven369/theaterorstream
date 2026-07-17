# API & Admin Panel Optimization - Implementation Plan

**Last updated:** Jul 2026 · synced with `main` @ `0b895ea`

---

## Master Task List (cross-ref)

| # | ID | Status | Notes |
|---|-----|--------|-------|
| 1 | `fix-upcoming-db` | ✅ | See work log Task 1 |
| 2 | `slim-hydration` | ✅ | See work log Task 2 |
| 3 | `edge-read-api` | ✅ | See work log Task 3 |
| 4 | `db-migrations` | ✅ | Applied in Supabase (May 2026) |
| 5 | `server-tmdb-proxy` | ✅ | Admin `/api/tmdb/*` proxy; key off client |
| 6 | `automated-sync` | ✅ | Vercel Cron + delta sync → `movies_library` |
| 7 | `admin-control-tower` | ✅ | Control tower UI, app_settings, manual sync API |
| 8 | `unify-content-api` | ✅ | Explore + trending on Edge; all public reads unified |
| 9 | `onboarding-redesign` | ✅ | 5-step wizard + taste DB tables |
| 10 | `taste-profile-schema` | ✅ | Rebuild worker, crons, movie_logs + reco_cache migration |
| 11 | `recommendation-engine` | ✅ | Hybrid reco API + 5 endpoints + cache |
| 12 | `ux-redesign` | ✅ | Personalized Home (when deployed) |
| 13 | `phase3-social-schema` | ✅ | Diary, activity feed, badges |
| 14 | `ai-agents-stack` | ⬜ | AI agents — **next** |

Full table: [tos-production-architecture-plan.md](./tos-production-architecture-plan.md#master-task-list)

---

## ✅ COMPLETED

### Phase 1: Database Schema Updates
- [x] Created `supabase_production_optimization.sql` with:
  - TV series columns (first_air_date, networks, seasons, episodes, etc.)
  - Optimized indexes for filtering (media_type, genres, popularity, etc.)
  - Genre lookup table with TMDB genre IDs
  - **TV sections table** (`tv_sections`) for dedicated TV management
  - Search function `search_movies_library` for efficient filtering
  - `extract_genre_ids()` function for extracting genre IDs from JSONB
  - **Default TV sections**: Trending TV Shows, Netflix, Prime, Hotstar, etc.

### Phase 2: Production-Ready Content API
- [x] Created `src/lib/contentApi.js` with:
  - Caching layer with configurable TTLs
  - `getMoviesFromDb()` - Paginated, filtered queries
  - `getTVSeriesFromDb()` - TV-specific queries
  - `getTrendingTVFromDb()` - Trending TV shows
  - `getTVByGenreFromDb()` - Filter by genre
  - `getHomepageSectionsOptimized()` - Cached section queries
  - `searchContentFromDb()` - Database-driven search
  - `getExploreContent()` - Category and genre filtering
  - Genre constants (MOVIE_GENRES, TV_GENRES)

### Phase 3: Frontend Updates - Database-Driven

#### TVSeries.jsx ✅ (Now "Series" page)
- **Completely rewritten** to match Home.jsx structure
- Fetches sections from `tv_sections` table (falls back to `homepage_sections`)
- Region selector with support for 10 regions
- Displays sections: Trending TV, Netflix, Prime, Hotstar, etc.
- Same grid layout and styling as homepage

#### Navigation Updates ✅
- Renamed "TV Series" → "Series" in desktop navigation
- Renamed "TV Shows" → "Series" in mobile navigation
- Route remains `/tv-series` for URL stability

#### Search.jsx ✅
- Added database as primary search source
- Source toggle (Library vs TMDB) 
- Falls back to TMDB for broader search
- Clear indication of data source

#### Explore.jsx ✅
- Database as primary source with TMDB fallback
- Source toggle UI
- Genre filtering with pills
- Support for all explore categories (popular, top_rated, trending, etc.)

### Phase 4: Admin Panel Optimization

#### Library Tab ✅
- Added comprehensive filtering:
  - Media type filter (All/Movies/TV)
  - Sort by (Date Added, Popularity, Rating, Release Date, Title)
  - Sort order toggle (Asc/Desc)
  - Featured filter (All/Featured/Not Featured)
  - Active filter (All/Active/Hidden)
- Results count indicator with applied filters
- Increased fetch limit to 500 for better filtering

#### AdminSectionsPage ✅ (Major Update)
- **Added Movies/TV toggle** at the top of the page
- Toggle switches between managing:
  - 🎬 **Movies** → Sections for the homepage/In Theaters
  - 📺 **TV Series** → Sections for the Series page
- Loads from appropriate table based on mode:
  - Movies mode → `homepage_sections`
  - TV mode → `tv_sections`
- Dynamic page title and description based on mode

#### saveFullMovieToLibrary() ✅
- Enhanced to properly detect and save TV series
- Extracts genre_ids for efficient filtering
- Saves all TV-specific fields (seasons, episodes, networks, etc.)
- Supports origin_country, original_language, adult flag

---

## 📋 REMAINING / OPTIONAL

### Master plan tasks — pending (see full list in architecture plan)

- [x] **#4** `db-migrations` — snapshots, sync tables, RLS ✅ (Supabase, May 2026)
- [x] **#5** `server-tmdb-proxy` — TMDB key off client ✅
- [x] **#6** `automated-sync` — Vercel Cron + delta sync
- [x] **#7** `admin-control-tower` — sync history, events queue, DB settings
- [x] **#8** `unify-content-api` — Explore/trending Edge routes; public pages on `contentEdgeApi.js`
- [x] **#9** `onboarding-redesign` — 5-step wizard; saves to user_taste_profiles + streaming + ratings
- [x] **#10** `taste-profile-schema` — profile rebuild API, embedding backfill crons, `movie_logs` + `recommendation_cache`
- [x] **#11** `recommendation-engine` — for-you, tonight, family, similar, trending-personalized
- [ ] **#12–14** — UX redesign, social, AI

### Phase 1 follow-up (completed ✅)
- [x] Upcoming page → DB-first (`getUpcomingFromDb`)
- [x] Slim homepage/TV hydration (no base64 blobs)
- [x] Vercel Edge routes `/api/content/*` + `contentEdgeApi.js`

### Database (REQUIRED)
- [x] Run `supabase_production_optimization.sql` in Supabase SQL Editor ✅ (May 2026)
- [x] `content_snapshots`, `tmdb_sync_runs`, `content_events` + RLS ✅ (May 2026)
- [ ] Backfill genre_ids for existing records (if not done during migration)

### Optional Enhancements
- [ ] Add bulk operations UI (feature/hide multiple items)
- [ ] Export/Import functionality for library
- [ ] Add caching indicators in admin
- [ ] Real-time sync status for homepage sections

---

## Files Changed

### New Files (Phase 1 — May 2026)
1. `api/_lib/content-server.js` — Shared Edge Supabase queries + hydration
2. `api/content/homepage.js` — Cached homepage sections API
3. `api/content/tv-sections.js` — Cached TV sections API
4. `api/content/upcoming.js` — Cached upcoming calendar API
5. `api/content/search.js` — Cached library search API
6. `api/content/movie/[tmdbId].js` — Cached movie detail API
7. `src/lib/contentEdgeApi.js` — Frontend client with DB fallback
8. `.agent/implementation-work-log.md` — Session work log
9. `.agent/tos-production-architecture-plan.md` — Full product + architecture roadmap

### New Files (earlier)
1. `supabase_production_optimization.sql` - Schema updates with TV sections

### Modified Files (Phase 1 — May 2026)
1. `src/views/upcoming.jsx` - DB-first upcoming calendar
2. `src/lib/contentApi.js` - Extended `getUpcomingFromDb()`
3. `src/lib/supabase.js` - Slim hydration, strip base64 on save
4. `src/views/AdminPanel.jsx` - No base64 on sync upcoming
5. `src/views/admin/AdminSectionsPage.jsx` - No base64 on section import
6. `src/components/Card.jsx` - TMDB CDN posters first
7. `src/views/Home.jsx`, `TVSeries.jsx`, `Search.jsx`, `Details.jsx` - Edge API reads

### Modified Files (earlier)
1. `src/views/TVSeries.jsx` - **Complete rewrite** - Database-driven, matches Home.jsx
2. `src/views/Search.jsx` - Dual-source search
3. `src/views/Explore.jsx` - Database-driven explore
4. `src/views/AdminPanel.jsx` - Enhanced library filters
5. `src/views/admin/AdminSectionsPage.jsx` - **Movies/TV toggle** added
6. `src/lib/supabase.js` - Enhanced saveFullMovieToLibrary()
7. `src/constants/navigation.jsx` - Renamed "TV Series" → "Series"
8. `src/components/MobileNavigation.jsx` - Renamed "TV Shows" → "Series"

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND PAGES                         │
├─────────────────────────────────────────────────────────────┤
│  Home.jsx          │  TVSeries.jsx       │  Explore.jsx     │
│  (In Theaters)     │  (Series)           │  (Browse)        │
│  ↓                 │  ↓                  │  ↓               │
│  homepage_sections │  tv_sections        │  movies_library  │
└────────────────────┴────────────────────┴───────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      ADMIN PANEL                            │
├─────────────────────────────────────────────────────────────┤
│  AdminSectionsPage.jsx                                      │
│  ┌──────────────┬──────────────┐                           │
│  │ 🎬 Movies    │ 📺 TV Series │  ← Toggle between modes    │
│  └──────────────┴──────────────┘                           │
│  ↓ Movies mode          ↓ TV mode                          │
│  homepage_sections      tv_sections                        │
└─────────────────────────────────────────────────────────────┘
```

---

## How to Use

### For Frontend (Database-Driven)
```javascript
import { 
    getMoviesFromDb, 
    getTVSeriesFromDb, 
    searchContentFromDb,
    getExploreContent 
} from './lib/contentApi';

// Get movies with filters
const { data, total } = await getMoviesFromDb({
    mediaType: 'movie',
    genreIds: [28, 12], // Action, Adventure
    minRating: 7.0,
    sortBy: 'popularity',
    limit: 20
});

// Search content
const results = await searchContentFromDb('inception');
```

### For Admin (TMDB Import still works)
- Browse TMDB tab still uses TMDB API for importing
- Bulk Import uses TMDB for fetching and saves to database
- Library tab shows database content with filters
- **Sections tab**: Use Movies/TV toggle to manage either page's sections

### Run SQL Script
1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Open your project
3. Go to **SQL Editor**
4. Create a new query
5. Paste the contents of `supabase_production_optimization.sql`
6. Click **Run**

This will:
- Add TV-specific columns to movies_library
- Create optimized indexes
- Create the `tv_sections` table
- Insert default TV sections (Trending, Netflix, Prime, Hotstar)
- Create the search function
