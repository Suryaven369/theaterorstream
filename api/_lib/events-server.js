import { getSupabaseAdmin } from './supabase-admin.js';
import { extractGenreIds } from './taste-profile-server.js';

/**
 * Behavioral learning engine.
 *
 * Records weighted interaction events and turns the recent stream into a
 * recency-decayed signal that nudges the taste profile and de-prioritises
 * already-seen / ignored titles.
 */

// Weighted scores per spec. Negative weights penalise.
// movie_watched = "I've seen it" only — never a taste / love signal.
export const EVENT_WEIGHTS = {
    movie_view: 2,
    trailer_played: 5,
    trailer_completed: 8,
    watchlisted: 10,
    watchlist_removed: -8,
    movie_watched: 0,
    rated_5: 15,
    rated_4: 10,
    rated_3: 2,
    rated_2: -4,
    rated_1: -10,
    movie_liked: 12,
    movie_disliked: -12,
    shared: 12,
    collection_added: 15,
    collection_created: 6,
    collection_updated: 3,
    search_performed: 1,
    search_result_clicked: 4,
    recommendation_clicked: 8,
    recommendation_ignored: -2,
};

// Only EXPLICIT rejections suppress a title from future recs. Passive views /
// scroll-bys must NOT suppress, or the feed reshuffles on every visit.
export const SUPPRESS_EVENTS = new Set([
    'recommendation_ignored', 'movie_disliked', 'watchlist_removed',
]);
const SUPPRESS_MIN_COUNT = 3; // must be rejected this many times to demote

// Taste map + reco affinity: likes + ratings only (not watches / views / watchlist).
export const TASTE_SIGNAL_EVENTS = new Set([
    'movie_liked', 'movie_disliked',
    'rated_5', 'rated_4', 'rated_3', 'rated_2', 'rated_1',
]);

// Events that may invalidate reco cache — watches do NOT (client drops the card;
// full reload / 3+ likes refreshes analysis). Ratings & dislikes still bust.
export const CACHE_BUST_EVENTS = new Set([
    'movie_disliked',
    'rated_5', 'rated_4', 'rated_3', 'rated_2', 'rated_1',
]);

/** Need this many hearted titles before a like triggers taste re-analysis. */
export const MIN_LIKES_FOR_TASTE_REBUILD = 3;

// Events that signal positive engagement with a specific title (for suppress logic).
const POSITIVE_EVENTS = new Set([
    'rated_5', 'rated_4', 'movie_liked', 'shared', 'collection_added',
    'recommendation_clicked',
]);

const HALF_LIFE_DAYS = 30;       // recent behaviour decays to half weight after ~30d
const SIGNAL_LOOKBACK_DAYS = 120; // ignore events older than this for taste signal
const MAX_EVENTS_SCANNED = 1500;

const VALID_EVENT_TYPES = new Set(Object.keys(EVENT_WEIGHTS));

const GENRE_NAMES = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

/** Exponential recency decay: 1.0 today → 0.5 at one half-life. */
export function recencyDecay(createdAt, halfLifeDays = HALF_LIFE_DAYS) {
    const ageMs = Date.now() - new Date(createdAt).getTime();
    const ageDays = Math.max(0, ageMs / 86_400_000);
    return Math.pow(0.5, ageDays / halfLifeDays);
}

function normalizeEvent(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const eventType = String(raw.eventType || raw.event_type || '').trim();
    if (!VALID_EVENT_TYPES.has(eventType)) return null;

    const tmdbId = raw.tmdbId ?? raw.tmdb_id ?? null;
    const weight = EVENT_WEIGHTS[eventType] ?? 0;

    return {
        event_type: eventType,
        tmdb_id: tmdbId != null ? String(tmdbId) : null,
        media_type: raw.mediaType || raw.media_type || 'movie',
        weight,
        source: raw.source || 'web',
        metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
    };
}

/**
 * Persist a batch of events. Invalid event types are silently dropped so a bad
 * client payload never blocks the good ones (fire-and-forget tracking).
 * @returns {Promise<{ recorded: number, skipped: number }>}
 */
export async function recordEvents(userId, events) {
    const supabase = getSupabaseAdmin();
    const list = Array.isArray(events) ? events : [events];

    const rows = list
        .map(normalizeEvent)
        .filter(Boolean)
        .slice(0, 50)
        .map((event) => ({ user_id: userId, ...event }));

    if (!rows.length) {
        return { recorded: 0, skipped: list.length };
    }

    const { error } = await supabase.from('user_events').insert(rows);
    if (error) throw new Error(error.message);

    return { recorded: rows.length, skipped: list.length - rows.length };
}

// Event-triggered re-learning thresholds.
const RELEARN_THRESHOLD = 5;       // meaningful events needed since last rebuild
const RELEARN_DEBOUNCE_MIN = 3;    // don't rebuild more than once per few minutes

/**
 * Decide whether the user has done enough new meaningful things to warrant a
 * fresh taste-profile + embedding rebuild. "Meaningful" = |weight| >= 5
 * (rates, watchlists, trailers, shares, likes/dislikes, reco clicks), counted
 * since the last rebuild. Debounced so rapid activity can't trigger a storm.
 */
export async function shouldRelearn(userId, threshold = RELEARN_THRESHOLD) {
    const supabase = getSupabaseAdmin();

    const { data: profile } = await supabase
        .from('user_taste_profiles')
        .select('last_computed_at')
        .eq('user_id', userId)
        .maybeSingle();

    const lastComputed = profile?.last_computed_at ? new Date(profile.last_computed_at) : null;
    if (lastComputed) {
        const minsSince = (Date.now() - lastComputed.getTime()) / 60000;
        if (minsSince < RELEARN_DEBOUNCE_MIN) return false; // just rebuilt
    }

    let query = supabase
        .from('user_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .or('weight.gte.5,weight.lte.-5');

    if (lastComputed) query = query.gt('created_at', lastComputed.toISOString());

    const { count, error } = await query;
    if (error) return false;
    return (count || 0) >= threshold;
}

/**
 * Likes only trigger taste rebuild + reco cache bust once the user has
 * hearted at least MIN_LIKES_FOR_TASTE_REBUILD titles (1–2 likes are too noisy).
 */
export async function shouldRebuildForLikes(userId) {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
        .from('user_liked_movies')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
    if (error) return false;
    return (count || 0) >= MIN_LIKES_FOR_TASTE_REBUILD;
}

async function loadRecentEvents(supabase, userId, { lookbackDays = SIGNAL_LOOKBACK_DAYS } = {}) {
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);

    const { data, error } = await supabase
        .from('user_events')
        .select('event_type, tmdb_id, media_type, weight, metadata, created_at')
        .eq('user_id', userId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(MAX_EVENTS_SCANNED);

    if (error) throw new Error(error.message);
    return data || [];
}

/**
 * Turn the recent event stream into decayed per-genre signal plus the set of
 * titles to suppress (recently shown/ignored) and a reco-accuracy score.
 *
 * Returns plain numbers so callers can blend with rating-derived weights.
 */
export async function getBehavioralSignals(userId, options = {}) {
    const supabase = getSupabaseAdmin();
    const events = await loadRecentEvents(supabase, userId, options);

    if (!events.length) {
        return {
            genreSignal: {},
            moodSignal: {},
            engagedTmdbIds: [],
            suppressTmdbIds: new Set(),
            recoClicks: 0,
            recoIgnores: 0,
            accuracyScore: null,
            eventCount: 0,
        };
    }

    // Collect movie metadata for events that reference a title.
    const tmdbIds = [...new Set(events.map((e) => e.tmdb_id).filter(Boolean))];
    let movieById = new Map();
    if (tmdbIds.length) {
        const { data: movies } = await supabase
            .from('movies_library')
            .select('tmdb_id, genres, genre_ids, mood_tags')
            .in('tmdb_id', tmdbIds.slice(0, 400));
        movieById = new Map((movies || []).map((m) => [String(m.tmdb_id), m]));
    }

    const genreSignal = {};
    const moodSignal = {};
    const engagedScore = new Map(); // tmdb_id -> cumulative decayed positive weight
    const rejectCounts = new Map();  // tmdb_id -> # explicit rejections
    const engaged = new Set();
    let recoClicks = 0;
    let recoIgnores = 0;

    events.forEach((event) => {
        const decay = recencyDecay(event.created_at);
        const weightedScore = Number(event.weight) * decay;

        if (event.event_type === 'recommendation_clicked') recoClicks += 1;
        if (event.event_type === 'recommendation_ignored') recoIgnores += 1;

        // Count explicit rejections only (not passive views).
        // One dislike is enough to hide a title; ignores still need repeats.
        if (event.tmdb_id && SUPPRESS_EVENTS.has(event.event_type)) {
            const id = String(event.tmdb_id);
            if (event.event_type === 'movie_disliked') {
                rejectCounts.set(id, SUPPRESS_MIN_COUNT);
            } else {
                rejectCounts.set(id, (rejectCounts.get(id) || 0) + 1);
            }
        }

        if (!event.tmdb_id) return;
        const movie = movieById.get(String(event.tmdb_id));
        if (!movie) return;

        if (POSITIVE_EVENTS.has(event.event_type) && weightedScore > 0) {
            engagedScore.set(
                String(event.tmdb_id),
                (engagedScore.get(String(event.tmdb_id)) || 0) + weightedScore,
            );
            engaged.add(String(event.tmdb_id));
        }

        // Genre / mood taste signal: likes + ratings only.
        // Watching a film must not look like "you love this genre".
        if (!TASTE_SIGNAL_EVENTS.has(event.event_type)) return;

        extractGenreIds(movie).forEach((gid) => {
            genreSignal[gid] = (genreSignal[gid] || 0) + weightedScore;
        });
        (movie.mood_tags || []).forEach((tag) => {
            moodSignal[tag] = (moodSignal[tag] || 0) + weightedScore;
        });
    });

    // Only suppress titles rejected repeatedly AND not since engaged with.
    const suppressTmdbIds = new Set();
    rejectCounts.forEach((count, id) => {
        if (count >= SUPPRESS_MIN_COUNT && !engaged.has(id)) suppressTmdbIds.add(id);
    });

    const engagedTmdbIds = [...engagedScore.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);

    const totalReco = recoClicks + recoIgnores;
    const accuracyScore = totalReco >= 5
        ? Math.round((recoClicks / totalReco) * 100)
        : null;

    return {
        genreSignal,
        moodSignal,
        engagedTmdbIds,
        suppressTmdbIds,
        recoClicks,
        recoIgnores,
        accuracyScore,
        eventCount: events.length,
    };
}

/**
 * Normalised [0..1] genre weights derived purely from behaviour, for folding
 * into the taste profile rebuild. Only positive signal survives.
 */
export function genreSignalToWeights(genreSignal) {
    const positive = Object.entries(genreSignal).filter(([, v]) => v > 0);
    if (!positive.length) return {};
    const max = Math.max(...positive.map(([, v]) => v));
    return Object.fromEntries(
        positive.map(([id, v]) => [id, Math.round((v / max) * 100) / 100]),
    );
}

/**
 * Taste Dashboard rollup: favourite genres/moods/decades, evolving interests,
 * and a recommendation-accuracy score. Reads the profile plus the decayed
 * event stream — no new infra.
 */
export async function getTasteDashboard(userId) {
    const supabase = getSupabaseAdmin();

    const [{ data: profile }, signals] = await Promise.all([
        supabase.from('user_taste_profiles').select('*').eq('user_id', userId).maybeSingle(),
        getBehavioralSignals(userId, { lookbackDays: 120 }),
    ]);

    const genreWeights = profile?.genre_weights || {};
    const favoriteGenres = Object.entries(genreWeights)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id, weight]) => ({
            id: Number(id),
            name: GENRE_NAMES[id] || `Genre ${id}`,
            score: Math.round(Number(weight) * 100),
        }));

    const moodPrefs = { ...(profile?.mood_preferences || {}), ...(profile?.manual_mood_preferences || {}) };
    const favoriteMoods = Object.entries(moodPrefs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id, weight]) => ({ id, score: Math.round(Number(weight) * 100) }));

    // Evolving interests: recent (≤14d) genre signal vs prior period.
    const recent = await computeEvolvingInterests(supabase, userId);
    // Longer-horizon taste evolution from weekly snapshots (best-effort).
    let evolution = null;
    try { evolution = await getTasteEvolution(userId); } catch { /* no history yet */ }

    const dnaRaw = profile?.dna_preferences || {};
    const favoriteDna = Object.entries(dnaRaw)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 12)
        .map(([id, weight]) => ({
            id,
            score: Math.round(Number(weight)),
        }));

    const axisPreferences = profile?.axis_preferences || {};
    const runtimeRange = profile?.preferred_runtime_range || null;

    // Recent explicit dislikes for Taste Map history (dedupe by tmdb_id).
    let dislikedMovies = [];
    try {
        const { data: dislikeEvents } = await supabase
            .from('user_events')
            .select('tmdb_id, created_at, metadata')
            .eq('user_id', userId)
            .eq('event_type', 'movie_disliked')
            .order('created_at', { ascending: false })
            .limit(40);

        const seen = new Set();
        const ids = [];
        const metaById = new Map();
        for (const ev of dislikeEvents || []) {
            const id = String(ev.tmdb_id || '');
            if (!id || seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
            metaById.set(id, ev.metadata || {});
            if (ids.length >= 24) break;
        }
        if (ids.length) {
            const { data: movies } = await supabase
                .from('movies_library')
                .select('tmdb_id, title, poster_path, media_type')
                .in('tmdb_id', ids);
            const byId = new Map((movies || []).map((m) => [String(m.tmdb_id), m]));
            dislikedMovies = ids.map((id) => {
                const m = byId.get(id);
                const meta = metaById.get(id) || {};
                return {
                    movie_id: id,
                    movie_title: m?.title || meta.title || `Title ${id}`,
                    poster_path: m?.poster_path || meta.poster_path || null,
                    media_type: m?.media_type || 'movie',
                };
            });
        }
    } catch {
        dislikedMovies = [];
    }

    return {
        favoriteGenres,
        favoriteMoods,
        favoriteDna,
        axisPreferences,
        preferredRuntimeRange: runtimeRange,
        favoriteDecades: profile?.preferred_decades || [],
        favoriteLanguages: profile?.preferred_languages || [],
        favoriteActors: profile?.favorite_actors || [],
        favoriteDirectors: profile?.favorite_directors || [],
        evolvingInterests: recent,
        evolution,
        accuracyScore: signals.accuracyScore,
        recoClicks: signals.recoClicks,
        recoIgnores: signals.recoIgnores,
        tasteSummary: profile?.taste_summary || null,
        ratingCount: profile?.rating_count || 0,
        logCount: profile?.log_count || 0,
        eventCount: signals.eventCount,
        profileVersion: profile?.profile_version || 0,
        lastComputedAt: profile?.last_computed_at || null,
        dislikedMovies,
        discoveryLevel: profile?.onboarding_step_data?.discovery_level ?? 3,
        contentBoundaries: profile?.onboarding_step_data?.content_boundaries || {},
        viewingModes: profile?.onboarding_step_data?.viewing_modes || {},
        emotions: profile?.onboarding_step_data?.emotions || null,
        tasteFeedback: profile?.onboarding_step_data?.taste_feedback || [],
        tasteFeatureOverrides: profile?.onboarding_step_data?.taste_feature_overrides || {},
        dismissedInsights: profile?.onboarding_step_data?.dismissed_insights || [],
        confirmedInsights: profile?.onboarding_step_data?.confirmed_insights || [],
    };
}

const SNAPSHOT_MIN_GAP_DAYS = 3;     // don't snapshot more than once per few days
const EVOLUTION_BASELINE_DAYS = 21;  // compare "now" against ~3 weeks ago

/** Write a taste snapshot for one user (deduped against very recent ones). */
export async function captureTasteSnapshot(userId, profile = null) {
    const supabase = getSupabaseAdmin();

    let prof = profile;
    if (!prof) {
        const { data } = await supabase
            .from('user_taste_profiles')
            .select('genre_weights, dna_preferences, mood_preferences')
            .eq('user_id', userId).maybeSingle();
        prof = data;
    }
    if (!prof) return { ok: false, reason: 'no_profile' };

    const { data: recent } = await supabase
        .from('taste_snapshots')
        .select('captured_at')
        .eq('user_id', userId)
        .order('captured_at', { ascending: false })
        .limit(1);

    if (recent?.[0]) {
        const days = (Date.now() - new Date(recent[0].captured_at).getTime()) / 86_400_000;
        if (days < SNAPSHOT_MIN_GAP_DAYS) return { ok: false, reason: 'too_soon' };
    }

    const { error } = await supabase.from('taste_snapshots').insert({
        user_id: userId,
        genre_weights: prof.genre_weights || {},
        dna_preferences: prof.dna_preferences || {},
        mood_preferences: prof.mood_preferences || {},
    });
    return { ok: !error, error: error?.message };
}

/** Snapshot every user with a taste profile (weekly cron). */
export async function captureAllTasteSnapshots({ limit = 500 } = {}) {
    const supabase = getSupabaseAdmin();
    const { data: profiles } = await supabase
        .from('user_taste_profiles')
        .select('user_id, genre_weights, dna_preferences, mood_preferences')
        .limit(limit);

    let captured = 0;
    for (const p of profiles || []) {
        // eslint-disable-next-line no-await-in-loop
        const res = await captureTasteSnapshot(p.user_id, p);
        if (res.ok) captured += 1;
    }
    return { processed: (profiles || []).length, captured };
}

/**
 * Taste evolution: how genre/DNA affinities shifted vs ~3 weeks ago.
 * Returns rising/falling movers (delta in 0-100 points), or null if no history.
 */
export async function getTasteEvolution(userId) {
    const supabase = getSupabaseAdmin();

    const baseline = new Date();
    baseline.setDate(baseline.getDate() - EVOLUTION_BASELINE_DAYS);

    const [{ data: current }, { data: past }] = await Promise.all([
        supabase.from('user_taste_profiles')
            .select('genre_weights, dna_preferences').eq('user_id', userId).maybeSingle(),
        supabase.from('taste_snapshots')
            .select('genre_weights, dna_preferences, captured_at')
            .eq('user_id', userId)
            .lte('captured_at', baseline.toISOString())
            .order('captured_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

    if (!current || !past) return null;

    const movers = (curr, prev, scale) => {
        const keys = new Set([...Object.keys(curr || {}), ...Object.keys(prev || {})]);
        return [...keys]
            .map((k) => ({ key: k, delta: Math.round(((Number(curr?.[k]) || 0) - (Number(prev?.[k]) || 0)) * scale) }))
            .filter((d) => d.delta !== 0)
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    };

    return {
        sinceDays: Math.round((Date.now() - new Date(past.captured_at).getTime()) / 86_400_000),
        genres: movers(current.genre_weights, past.genre_weights, 100).slice(0, 6)
            .map((g) => ({ ...g, name: GENRE_NAMES[g.key] || `Genre ${g.key}` })),
        dna: movers(current.dna_preferences, past.dna_preferences, 1).slice(0, 6)
            .map((d) => ({ ...d, name: d.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) })),
    };
}

async function computeEvolvingInterests(supabase, userId) {
    const now = new Date();
    const recentSince = new Date(now); recentSince.setDate(now.getDate() - 14);
    const priorSince = new Date(now); priorSince.setDate(now.getDate() - 45);

    const tasteTypes = [...TASTE_SIGNAL_EVENTS].filter((t) => t !== 'movie_disliked');
    const { data: events } = await supabase
        .from('user_events')
        .select('tmdb_id, weight, created_at, event_type')
        .eq('user_id', userId)
        .in('event_type', tasteTypes)
        .gte('created_at', priorSince.toISOString())
        .gt('weight', 0)
        .order('created_at', { ascending: false })
        .limit(800);

    if (!events?.length) return [];

    const tmdbIds = [...new Set(events.map((e) => e.tmdb_id).filter(Boolean))];
    if (!tmdbIds.length) return [];

    const { data: movies } = await supabase
        .from('movies_library')
        .select('tmdb_id, genres, genre_ids')
        .in('tmdb_id', tmdbIds.slice(0, 400));
    const movieById = new Map((movies || []).map((m) => [String(m.tmdb_id), m]));

    const recent = {};
    const prior = {};
    events.forEach((e) => {
        const movie = movieById.get(String(e.tmdb_id));
        if (!movie) return;
        const bucket = new Date(e.created_at) >= recentSince ? recent : prior;
        extractGenreIds(movie).forEach((gid) => {
            bucket[gid] = (bucket[gid] || 0) + Number(e.weight);
        });
    });

    return Object.keys(recent)
        .map((gid) => ({
            id: Number(gid),
            name: GENRE_NAMES[gid] || `Genre ${gid}`,
            delta: (recent[gid] || 0) - (prior[gid] || 0),
        }))
        .filter((g) => g.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 4);
}
