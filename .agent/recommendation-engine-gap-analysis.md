# Recommendation Engine — Gap Analysis & Extension Plan

Maps the "build a complete recommendation engine" spec onto what's already running in production, and lays out what to build next. This is a planning doc, not a build — nothing here is implemented yet.

## 1. What already exists (don't rebuild)

| Spec ask | Reality |
|---|---|
| Content-based matching | `recommendation-server.js` — embedding similarity via `match_movies_by_embedding` / `match_similar_to_movie` RPCs (pgvector HNSW) |
| Collaborative filtering | `collaborativeScore()` — Jaccard similarity of genre sets from movies the user rated ≥7 |
| Trending layer | `getTrendingPersonalized()` |
| Scoring formula (weighted blend) | `WEIGHTS_WITH_EMBEDDING` = content 40 / genre 25 / axis 15 / collaborative 10 / popularity 10 — already close to spec's 40/25/15/10/10 |
| Movie DNA | `movies_library`: genres, genre_ids, mood_tags, runtime, certification, popularity, streaming_platforms, custom_parent_guide, embedding |
| Taste vector | `user_taste_profiles`: genre_weights, axis_preferences (7-axis instead of generic mood axes), preferred_decades/languages/runtime, embedding, taste_summary |
| Manual taste input | Onboarding flow (`OnboardingUI.jsx`) — declared genre/mood/OTT prefs, blended 30/70 against computed weights once ratings exist (`mergeGenreWeights`) — i.e. behavioral already outweighs manual, matching the spec's priority rule |
| Recommendation cache | `recommendation_cache` table, 6h TTL, keyed by `user_id + cache_key` |
| Background jobs | `taste-profile-weekly`, `embedding-backfill` crons already scheduled |
| Family/safety filtering | `passesFamilyFilter`, `passesCertification`, `passesParentGuideLimits` |
| Some explainability | `buildReason()` generates one of 4 templated reasons per recommendation already |

This is a legitimate rule-based engine with an embedding layer already wired in — it's past "MVP" on several fronts the spec treats as future work.

## 2. Real gaps

1. **No behavioral event tracking.** No `user_events` table exists. Taste only updates from `ratings` and `movie_logs` (watched + rated). Views, trailer plays, shares, rec-clicks, rec-ignores, searches are invisible to the model.
2. **No decay.** `rebuildUserTasteProfile` uses a flat 90-day lookback window (hard cutoff), not exponential recency weighting.
3. **No post-onboarding Settings UI.** Taste prefs are set once at onboarding; there's no `/settings/taste` page to edit genres/moods/languages/eras/actors/directors later.
4. **No favorite actors/directors signal at all** — not in `user_taste_profiles`, not in scoring.
5. **Explainability is templated, not data-driven** — `buildReason` picks from 4 fixed strings rather than naming the actual matched genre/mood/actor.
6. **No mood-browse pages** (`/mood/feel-good`, `/mood/dark-thriller`, etc.) — `mood_tags` exists on movies and `mood_preferences` on profiles, just no UI entry point.
7. **No Taste Dashboard** — no page surfacing favorite genres/moods/decades, evolving interests, or a "recommendation accuracy" signal.
8. **No exploration/diversity quota** — current ranking is pure top-N by score; no enforced 80/20 relevance/exploration split, so recs can ossify into a bubble.
9. **No freshness/repeat-suppression** beyond `excludeRated` (already-rated movies). Movies shown-but-ignored aren't tracked or de-prioritized.

## 3. Binding constraint

Vercel Hobby plan caps serverless functions; the repo is already consolidated to ~10 functions via dynamic catch-all routers (`api/recommendations/[...route].js`, `api/content/[...route].js`, etc. — see commit `ba262d9`). **Any new endpoint must be added as a case inside an existing `[...route].js` handler, not a new top-level `api/*.js` file.** Event tracking, mood browse, and settings APIs all need to ride on existing routers.

## 4. Proposed extension plan (in build order)

### Phase A — Event tracking foundation
- New table `user_events` (user_id, event_type, tmdb_id nullable, weight, metadata jsonb, created_at). One migration, indexed on (user_id, created_at).
- Add `events` case to `api/recommendations/[...route].js` (or `api/content/[...route].js`) to accept fire-and-forget event writes from the client.
- Client: a single `trackEvent(type, payload)` helper called from existing interaction points (trailer play, watchlist add/remove, share, rec click/impression-ignored, search-result click) — wires into UI you already have, no new pages.
- Weight table per spec (view +2, trailer played +5, trailer completed +8, watchlisted +10, shared +12, rec clicked +8, rec ignored -2, etc.) lives as a constant map next to the new server module.

### Phase B — Decay + behavioral scoring
- Replace the flat 90-day cutoff in `rebuildUserTasteProfile` with exponential decay: weight = `base_weight * exp(-age_days / half_life)`, half-life ~30-45 days, applied to both `ratings` and the new `user_events`.
- Fold decayed event scores into `genre_weights`/`axis_preferences` alongside existing rating-derived signals — same merge function, new input source.

### Phase C — Settings page (manual override surface)
- New `/settings/taste` route + `TasteSettingsPage.jsx`, reusing the onboarding UI's genre/mood/language/era pickers as form components instead of one-time wizard steps.
- Add favorite actors/directors fields — requires extending `user_taste_profiles` schema (`favorite_actor_ids`, `favorite_director_ids` int[] columns) and a small scoring bonus in `scoreAndRankMovies` (cast/crew overlap, cheap lookup against `movies_library` credits if stored, or TMDB on read).
- Manual edits write through the existing taste-profile update path, merged at the existing 30/70 (declared/computed) ratio — already enforces "behavioral wins."

### Phase D — Explainability upgrade
- Make `buildReason()` cite the actual matched signal: top overlapping genre name, matched mood tag, or "movies you rated like X" with the specific title — data already available in `breakdown` and `context`, just needs richer string assembly instead of 4 fixed templates.

### Phase E — Mood browse + diversity/freshness
- Mood browse: thin route added to existing content/recommendations router, filtering `movies_library.mood_tags` + reusing `scoreAndRankMovies`. No new table needed.
- Diversity: in `scoreAndRankMovies`, reserve ~20% of the returned slice for items outside the user's top-2 genres/moods (exploration bucket), sampled by popularity rather than pure score.
- Freshness: track `recommendation_cache` impressions already shown (cache payload has `items` — diff against previous payload before overwrite) and penalize repeats in scoring.

### Phase F — Taste Dashboard
- New `/profile/taste` (or section on existing `ProfilePage.jsx`) reading `user_taste_profiles` + a rollup query over `user_events`/`ratings` for "recently evolving interests" (compare last-30-day genre weight deltas vs. prior period).
- "Recommendation accuracy score" = rec-click-through rate on `user_events` (`recommendation_clicked` / `recommendation_ignored` ratio) — purely derived from Phase A data, no new infra.

## 5. What I'd skip from the original spec

- **Next.js / fresh schema rewrite** — the app is Vite + Vercel functions + Supabase; redoing this would throw away a working system for no functional gain.
- **Separate `similar_users` table** — collaborative filtering already works off live genre-set intersection at query time; a precomputed similarity table only earns its cost past tens of thousands of active users (see scaling note below).
- **`movie_vectors` as a separate table** — embeddings already live as a `vector` column directly on `movies_library`/`user_taste_profiles`, which is the right call at this scale (avoids a join).

## 6. Scaling note (100k+ users)

Current design holds up to a meaningful scale because expensive work (taste rebuild, embedding backfill) is already off the request path via cron. The first thing to break at scale is `getCommunityAxisMap` and `collaborativeScore`, which scan raw `ratings` per request — at high request volume these should move to a materialized/cached per-movie aggregate refreshed on the same cron cadence as taste rebuilds, rather than a new architecture.

## 7. Open decision for you

Phase A (events) and Phase C (settings) are the two with real new UI/schema surface — everything else extends existing files. Suggest starting with **A → B → C** since decay needs event data to be meaningful before the Settings page is worth shipping.
