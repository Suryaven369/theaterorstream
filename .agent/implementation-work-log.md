# TheaterOrStream — Implementation Work Log

Session log for production architecture Phase 1 work (DB-first performance + Vercel Edge).

**Last synced with `main`:** May 2026 · HEAD `b42916d` · [github.com/Suryaven369/theaterorstream](https://github.com/Suryaven369/theaterorstream)

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
| 9 | `onboarding-redesign` | 5-step taste onboarding wizard | ⬜ Pending |
| 10 | `taste-profile-schema` | User taste profiles + rebuild worker | ⬜ Pending |
| 11 | `recommendation-engine` | Hybrid reco API | ⬜ Pending |
| 12 | `ux-redesign` | Watch Tonight, Family hub, personalized home | ⬜ Pending |
| 13 | `phase3-social-schema` | Diary, badges, following feed | ⬜ Pending |
| 14 | `ai-agents-stack` | Background AI agents (Gateway) | ⬜ Pending |

**Progress:** 8 complete · 0 partial · 6 pending

Full roadmap: [tos-production-architecture-plan.md](./tos-production-architecture-plan.md)

---

## Git commit history (Phase 1)

| Commit | Date | Summary |
|--------|------|---------|
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

**Next recommended task:** `onboarding-redesign` (Task #9)

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
