# TheaterOrStream — Implementation Work Log

Session log for production architecture Phase 1 work (DB-first performance + Vercel Edge).

**Last synced with `main`:** May 2026 · HEAD `22eceed` · [github.com/Suryaven369/theaterorstream](https://github.com/Suryaven369/theaterorstream)

---

## Session sync protocol

**Run at session start** — especially after `git pull` or when work was done from phone (Supabase SQL, Vercel, GitHub mobile).

1. **Inspect git:** `git log --oneline -15` + diff vs `origin/main` for task-related commits.
2. **Ask about off-git work:** SQL in Supabase Editor, env vars, deploys — these won't show in commits.
3. **Update all four sources in one pass:**
   - `.agent/tos-production-architecture-plan.md` (YAML todos + master table + HEAD + progress)
   - `.agent/implementation-work-log.md` (this file)
   - `.agent/implementation-plan-api-optimization.md` (cross-ref table)
   - `~/.cursor/plans/tos_production_architecture_e5360011.plan.md` (Cursor plan — copy from repo plan if drifted)
4. **Tick marks:** ✅ done · 🔄 partial · ⬜ pending — in YAML `status`, tables, and Phase 1 checkboxes.
5. **Set HEAD** to latest `git log -1` short hash; update progress count (e.g. `5 / 14`).

Cursor rule: [`.cursor/rules/task-list-sync.mdc`](../.cursor/rules/task-list-sync.mdc)

---

## Master Task List

| # | ID | Task | Status |
|---|-----|------|--------|
| 1 | `fix-upcoming-db` | Upcoming page DB-first (`getUpcomingFromDb` / Edge) | ✅ Done |
| 2 | `slim-hydration` | Slim card hydration; no base64 in admin sync | ✅ Done |
| 3 | `edge-read-api` | Vercel Edge `/api/content/*` + `contentEdgeApi.js` | ✅ Done |
| 4 | `db-migrations` | Snapshots, sync tables, RLS, production SQL | ✅ Done |
| 5 | `server-tmdb-proxy` | TMDB key server-side; admin proxy | ⬜ Pending |
| 6 | `automated-sync` | Cron + delta TMDB sync | ⬜ Pending |
| 7 | `admin-control-tower` | Sync history, events queue, DB settings | ⬜ Pending |
| 8 | `unify-content-api` | Full Edge adoption; remove Explore/Details TMDB | 🔄 Partial |
| 9 | `onboarding-redesign` | 5-step taste onboarding wizard | ⬜ Pending |
| 10 | `taste-profile-schema` | User taste profiles + rebuild worker | ⬜ Pending |
| 11 | `recommendation-engine` | Hybrid reco API | ⬜ Pending |
| 12 | `ux-redesign` | Watch Tonight, Family hub, personalized home | ⬜ Pending |
| 13 | `phase3-social-schema` | Diary, badges, following feed | ⬜ Pending |
| 14 | `ai-agents-stack` | Background AI agents (Gateway) | ⬜ Pending |

**Progress:** 4 complete · 1 partial · 9 pending

Full roadmap: [tos-production-architecture-plan.md](./tos-production-architecture-plan.md)

---

## Git commit history (Phase 1)

| Commit | Date | Summary |
|--------|------|---------|
| *(this push)* | May 2026 | TOS home card badge + share card UI/sharing + work log |
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

**Note:** SQL run directly in Supabase — not yet committed as a repo migration file. Code can now use these tables in Tasks #6–7 (automated sync, admin tower).

---

### Task 8 — Unify content API 🔄 Partial

**Task ID:** `unify-content-api` · **Not started fully**

| Page | Read path | TMDB fallback? |
|------|-----------|----------------|
| Home | Edge ✅ | No |
| TV Series | Edge ✅ | No |
| Upcoming | Edge ✅ | No |
| Search | Edge ✅ | No |
| Details | Edge ✅ | Yes — if not in library |
| Explore | `contentApi.js` | Yes — user toggle |

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

TMDB still used: **admin panel** (import/sync), **Explore** (optional toggle), **Details** (missing library fallback).

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

**Next recommended task:** `server-tmdb-proxy` (Task #5)

---
