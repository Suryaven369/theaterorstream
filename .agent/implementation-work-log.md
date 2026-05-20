# TheaterOrStream — Implementation Work Log

Session log for production architecture Phase 1 work (DB-first performance + Vercel Edge).

---

## Session: May 2026 — Phase 1 Foundation

### Goals

1. Stop runtime TMDB usage on public pages where possible
2. Fix slow page loads (especially Upcoming + Homepage hydration)
3. Add Vercel Edge cached read layer for shared CDN performance

---

### Task 1 — Upcoming page DB-first ✅

**Commit:** `1e2f319` — *Switch upcoming page and homepage hydration to DB-first reads.*

**Files changed:**
- `src/views/upcoming.jsx` — Replaced TMDB axios loop with `getUpcomingFromDb()`
- `src/lib/contentApi.js` — Extended `getUpcomingFromDb()` (year range, `fetchAll`, slim select, `normalizeLibraryItem`)

**Before:** ~25 TMDB API calls per Upcoming page visit (2026–2030 discover loop)  
**After:** 1 Supabase query, cached 2 min in client; zero TMDB on that page

**Notes:**
- Empty library shows admin hint to run **Sync Upcoming**
- Cards use slug URLs (`/movies/...`, `/tv/...`)

---

### Task 2 — Slim hydration + remove base64 storage ✅

**Included in commit:** `1e2f319`

**Files changed:**
- `src/lib/supabase.js` — `LIBRARY_CARD_SELECT`; slim `getHomepageSections` / `getTVSections`; strip base64 in `saveFullMovieToLibrary`
- `src/views/AdminPanel.jsx` — Removed base64 conversion from Sync Upcoming
- `src/views/admin/AdminSectionsPage.jsx` — Removed base64 + cast image embedding on section import
- `src/components/Card.jsx` — TMDB CDN poster first; base64 legacy fallback only
- `src/views/Home.jsx`, `TVSeries.jsx`, `Search.jsx` — Stop passing `images` JSONB to cards

**Before:** Homepage hydration fetched heavy `images` JSONB (often base64) for every card  
**After:** ~12-field card projection; new saves use TMDB paths only

---

### Task 3 — Vercel Edge content routes ✅

**Commit:** *(this push)*

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

**Frontend wired:**
- `Home.jsx` → `getHomepageSectionsFromEdge`
- `TVSeries.jsx` → `getTVSectionsFromEdge`
- `upcoming.jsx` → `getUpcomingFromEdge`
- `Search.jsx` → `searchContentFromEdge`
- `Details.jsx` → `getMovieDetailFromEdge`

**Fallback:** If Edge API unavailable (local `npm run dev`), auto-falls back to direct Supabase via dynamic import.

---

## Deploy checklist (Vercel)

1. **Env vars** (Production + Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Redeploy after env changes
3. **Verify after deploy:**
   - `https://www.theaterorstream.com/api/content/homepage` → JSON `{ data: [...] }`
   - Homepage Network tab shows `/api/content/homepage` (200)
4. **Local dev:** `npm run dev` uses DB fallback; use `vercel dev` to test Edge routes locally

---

## Architecture after this session

```
Browser (React SPA)
    │
    ├── GET /api/content/*  →  Vercel Edge (cached)  →  Supabase
    │       (production)
    │
    └── Direct Supabase     (local dev fallback)
```

TMDB is still used from the **admin panel** for import/sync — not from public Upcoming page.

---

### Task 4 — Database migrations + RLS ✅

**Commit:** *(this push)* — `supabase_phase1_content_pipeline.sql`

**New tables:**
| Table | Purpose |
|-------|---------|
| `content_snapshots` | Precomputed JSON for Edge reads (homepage, upcoming, etc.) |
| `tmdb_sync_runs` | Sync job audit log (status, counts, errors) |
| `tmdb_sync_state` | Per-job watermarks for delta sync |
| `content_events` | Admin queue (ingest, enrich, snapshot rebuild) |

**Security:**
- `is_admin_user()` helper (checks `user_profiles.is_admin`)
- `movies_library`, `homepage_sections`, `tv_sections`: public read active rows; writes admin-only
- New pipeline tables: admin-only (service_role used by future Cron workers)

**Manual step (Supabase SQL Editor):**
1. Run `supabase_production_optimization.sql` if not already applied
2. Run `supabase_phase1_content_pipeline.sql`

---

## Remaining (from master plan)

- [ ] Apply SQL migrations in Supabase dashboard (see Task 4)
- [ ] TMDB API key server-side only
- [ ] Vercel Cron + automated delta sync
- [ ] Admin control tower dashboard
- [ ] Onboarding + taste profiles + recommendations (Phase 3+)

See [tos-production-architecture-plan.md](./tos-production-architecture-plan.md) for full roadmap.
