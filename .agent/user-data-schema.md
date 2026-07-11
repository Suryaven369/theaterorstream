# User Data & Preferences — Schema Reference

The canonical map of every user-owned table: what it stores, who owns it, and
which system reads/writes it. Keep this updated when user tables change.

> Maintenance is enforced by `supabase/migrations/20260621000000_user_data_maintenance.sql`:
> a taste profile is auto-created on signup, `updated_at` stays fresh via triggers,
> deleting a user cascades to all their rows, and RLS gives owner-only writes
> with public reads only where the app already shows data cross-user.

---

## Account

### `user_profiles` — the account record
- **Owner key:** `id` (= `auth.users.id`)
- **Account:** `username`, `display_name`, `avatar_url`/`avatar_id`, `bio`, `phone`,
  `date_of_birth`, `is_admin`, `profile_header_url`
- **Declared preferences (set at onboarding):** `favorite_genres`, `mood_preferences`,
  `family_mode_enabled`, `family_max_certification`, `preferred_region`, `favorite_films`
- **Onboarding:** `is_onboarded`, `onboarding_completed_at`
- **Stats:** `total_watch_time_minutes`, `films_this_year`, `pinned_review_id`
- **RLS:** public read, owner insert/update.

> ⚠️ **Preference duplication:** `mood_preferences`, `family_mode_enabled`,
> `family_max_certification`, `preferred_region` exist on BOTH `user_profiles`
> and `user_taste_profiles`. **`user_taste_profiles` is canonical for the
> recommendation engine.** `user_profiles` holds the values as the user declared
> them at onboarding; onboarding/Settings should write through to
> `user_taste_profiles` (manual_* columns), which the engine actually reads.

---

## Taste & Preferences (the recommendation core)

### `user_taste_profiles` — canonical taste store *(auto-provisioned on signup)*
- **Owner key:** `user_id` → `auth.users` · **one row per user**
- **Declared (cold-start):** `genre_weights`, `mood_preferences`, `preferred_languages`,
  `preferred_region`
- **Manual overrides (Settings → Taste Preferences):** `manual_genre_weights`,
  `manual_mood_preferences`, `manual_languages`, `manual_preferred_eras`,
  `favorite_actor_ids` / `favorite_actors`, `favorite_director_ids` / `favorite_directors`,
  `manual_updated_at`
- **Computed (rebuild worker):** `axis_preferences` (7-axis), `avg_rating_given`,
  `rating_count`, `log_count`, `preferred_runtime_range`, `preferred_decades`
- **Family-safe:** `family_mode_enabled`, `family_max_certification`, `family_content_limits`
- **AI:** `embedding vector(512)` (Gemini), `taste_summary`, `profile_version`, `last_computed_at`
- **Read by:** recommendation engine (`loadUserContext`), dashboard, Settings.
- **Written by:** onboarding, Settings PUT, the rebuild worker (`rebuildUserTasteProfile`).
- **Priority rule:** behavioural signal > computed weights > manual prefs (floor).
- **RLS:** owner-only (private).

### `user_streaming_services` — OTT subscriptions
- **Owner key:** `user_id` · `service_id`, `region`, `is_active`, `source`
- Used by the "Tonight on your streaming" / OTT filtering. **RLS:** owner-only.

---

## Behaviour & History (feeds the taste engine)

### `user_events` — weighted behavioural stream
- **Owner key:** `user_id` · `event_type`, `tmdb_id`, `weight`, `metadata`, `created_at`
- Views, trailers, watchlists, shares, reco clicks/ignores. Recency-decayed into
  the taste profile + freshness layer + reco-accuracy. **RLS:** owner-only.

### `ratings` — 7-axis ratings
- **Owner key:** `user_id` · `movie_id`, `acting`, `screenplay`, `sound`, `direction`,
  `entertainment`, `pacing`, `cinematography`
- Strongest taste signal; also community (TOS) score. **RLS:** public read, owner write.

### `movie_logs` — watch diary
- **Owner key:** `user_id` · `tmdb_id`, `watched_on`, `rating`, `review_text`,
  `rewatch_count`, `watched_with`, `visibility`
- **RLS:** owner-managed (visibility-gated reads handled in app).

### `user_watched_movies` / `user_liked_movies` / `user_watchlist`
- **Owner key:** `user_id` · `movie_id`, `movie_title`, `poster_path`, `media_type`, timestamp
- Quick-engagement lists, shown on profile pages; all three excluded from
  recommendations as "already seen". **RLS:** public read, owner write.

---

## Collections

### `user_collections` — a user's personal lists  *(owner: `user_id`)*
`name`, `description`, `is_public`, `cover_image`/`cover_tmdb_id`, `collection_kind`,
`is_system`, `likes_count`, `saves_count`, `tags`. **RLS:** public read, owner write.

### `collection_movies` — items in a collection  *(owner via `collection_id`)*
Cascades when its parent `user_collections` row is deleted.

> **Not a user table:** `collections` (no `user_id`) is the **admin/CMS** curated
> collection set (homepage curation: `slug`, `display_location`, `style`). Don't
> confuse it with `user_collections`.

---

## Derived / cache

### `recommendation_cache`  *(owner: `user_id`, 6h TTL)*
Precomputed feed payloads (`for_you`, `tonight`, `mood_*`, `similar_*`). Written by
the engine (service role); invalidated on any taste rebuild. **RLS:** owner read.

---

## Social & notifications (brief)
- `user_follows` (`follower_id` → `following_id`) — public read, follower writes.
- `notifications` (`recipient_id`, `actor_id`) — recipient-scoped.
- `user_streaks`, `user_badges`, `social_reviews`/`review_*`, `feed_posts`/`post_*`,
  `saved_posts`, `activity_feed`, `blog_*` — community layer (own RLS).

---

## How a preference flows
1. **Signup** → trigger creates an empty `user_taste_profiles` row.
2. **Onboarding / Settings** → declared genres/moods/languages/eras/region land in
   `user_profiles` (declared) and `user_taste_profiles.manual_*` (engine input).
3. **Behaviour** → every meaningful action writes `user_events` (+ `ratings`,
   `user_watched_movies`, etc.).
4. **Rebuild worker** (weekly cron + event-triggered after ~5 actions, + on rating)
   → recomputes `genre_weights`/`axis_preferences`, regenerates `embedding` and
   `taste_summary`, then invalidates `recommendation_cache`.
5. **Engine** reads the effective profile (behaviour > computed > manual) to rank.
