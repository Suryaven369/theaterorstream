import { getSupabaseAdmin } from './supabase-admin.js';
import {
    extractGenreIds,
    computeOverallFromRatingRow,
} from './taste-profile-server.js';
import { getBehavioralSignals, genreSignalToWeights, recencyDecay } from './events-server.js';
import { isLlmEnabled, rerankRecommendations, generateRecoMessage, generateStructured } from './llm-server.js';
import { dnaMatchScore } from './movie-dna-server.js';
import { fetchTmdbApi } from './tmdb-server.js';
import { ensureLibraryCardsForCandidates } from './content-server.js';
import {
    attachAvailability,
    publicAvailability,
    normalizeRegion,
    DEFAULT_REGION,
} from './watch-providers-server.js';
import { getUserStreamingSetup } from './streaming-services-server.js';
import { generateCandidates, passesDealbreakers } from './reco/candidates.js';
import { effectiveMaxRuntime } from '../../src/lib/tasteQuiz.js';
import { attachVectors, computeUserVector, VECTOR_PROVIDER } from './reco/embeddings.js';
import { scoreCandidates, mmrSelect, cosine } from './reco/scoring.js';
import { buildVerdict, fetchCriticScores } from './reco/tos-verdict.js';
import { TONIGHT_MOODS, TONIGHT_COMPANY, RECO_CONFIG } from './reco/config.js';
import { z } from 'zod';

const AXIS_KEYS = [
    'acting', 'screenplay', 'sound', 'direction',
    'entertainment', 'pacing', 'cinematography',
];

const GENRE_NAMES = {
    28: 'action', 12: 'adventure', 16: 'animation', 35: 'comedy', 80: 'crime',
    99: 'documentary', 18: 'drama', 10751: 'family', 14: 'fantasy', 36: 'history',
    27: 'horror', 10402: 'music', 9648: 'mystery', 10749: 'romance', 878: 'sci-fi',
    10770: 'TV movie', 53: 'thriller', 10752: 'war', 37: 'western',
};

const MOOD_LABELS = {
    mind_bending: 'mind-bending', feel_good: 'feel-good', emotional: 'emotional',
    dark: 'dark', suspenseful: 'suspenseful', action_packed: 'action-packed',
    family_friendly: 'family-friendly', romantic: 'romantic', cozy: 'cozy',
    intense: 'intense', funny: 'funny', thoughtful: 'thoughtful',
};

// Share of each result page reserved for exploration (diversity layer).
const EXPLORATION_RATIO = 0.2;
// Gentle demote for titles the user explicitly rejected repeatedly (freshness).
const FRESHNESS_PENALTY = 0.85;

const WEIGHTS_WITH_EMBEDDING = {
    content: 0.42,
    genre: 0.28,
    axis: 0.15,
    collaborative: 0.10,
    popularity: 0.05,
};

const WEIGHTS_NO_EMBEDDING = {
    content: 0,
    genre: 0.50,
    axis: 0.25,
    collaborative: 0.20,
    popularity: 0.05,
};

/** Seed-similar rows ("Because you loved X") — prioritize likeness to the seed, not general taste. */
const WEIGHTS_SEED_SIMILAR = {
    content: 0.50,
    genre: 0.35,
    axis: 0.05,
    collaborative: 0.05,
    popularity: 0.05,
};

// Drama alone is too broad to justify "like The Witch → Moana".
const BROAD_GENRE_IDS = new Set(['18']);
// Dark / tense seed genres vs light family tones (hard clash when no dark overlap).
const DARK_GENRE_IDS = new Set(['27', '53', '9648', '80', '10752', '37']); // horror, thriller, mystery, crime, war, western
const LIGHT_GENRE_IDS = new Set(['10751', '16', '10749', '10402']); // family, animation, romance, music

const CACHE_TTL_HOURS = 6;

// Ranking nudges (added to the 0–1 weighted score).
const ON_YOUR_SERVICES_BONUS = 0.08;  // streams on a service the user pays for
const WATCHABLE_NOW_BONUS = 0.03;     // streams somewhere in the user's region (no services set)
const FRESH_RELEASE_BONUS = 0.06;     // max bonus for brand-new titles, decays over FRESH_WINDOW_DAYS
const FRESH_WINDOW_DAYS = 180;
// Provider lookups per request (TMDB calls) — results persist for 72h.
const AVAILABILITY_FETCH_BUDGET = 45;

function todayIso() {
    return new Date().toISOString().split('T')[0];
}

function isoDaysAgo(days) {
    return new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
}

/** Released (or premiered) on or before today. Dateless titles are treated as unreleased. */
function isReleased(movie, today = todayIso()) {
    const date = movie.release_date || movie.first_air_date;
    if (!date) return false;
    return String(date).slice(0, 10) <= today;
}

function freshnessBonus(movie) {
    const date = movie.release_date || movie.first_air_date;
    if (!date) return 0;
    const ageDays = (Date.now() - new Date(date).getTime()) / 86400000;
    if (ageDays < 0 || ageDays > FRESH_WINDOW_DAYS) return 0;
    return FRESH_RELEASE_BONUS * (1 - ageDays / FRESH_WINDOW_DAYS);
}

export const RECO_MOVIE_SELECT =
    'tmdb_id, title, poster_path, backdrop_path, media_type, release_date, first_air_date, '
    + 'runtime, vote_average, vote_count, popularity, genres, genre_ids, streaming_platforms, '
    + 'certification, custom_parent_guide, mood_tags, family_score, movie_dna, '
    + 'number_of_seasons, number_of_episodes, original_language, keywords';

/** TMDB watch-provider id → name fragments for matching movies_library.streaming_platforms */
const TMDB_PROVIDER_ALIASES = {
    8: ['netflix'],
    9: ['prime', 'amazon prime', 'prime video', 'amazon'],
    337: ['disney+', 'disney plus', 'disney'],
    122: ['hotstar', 'disney+ hotstar'],
    350: ['apple tv', 'apple tv+'],
    15: ['hulu'],
    1899: ['max', 'hbo max', 'hbo'],
    531: ['paramount', 'paramount+'],
    386: ['peacock'],
    283: ['crunchyroll'],
};

const CERT_RANK = {
    U: 0,
    G: 0,
    PG: 1,
    UA: 2,
    'PG-13': 3,
    '12A': 3,
    '12': 3,
    '13': 3,
    A: 5,
    R: 5,
    '15': 4,
    '18': 5,
    'NC-17': 5,
};

const PARENT_SEVERITY = { none: 0, mild: 1, moderate: 2, severe: 3 };

function parseEmbeddingVector(value) {
    if (!value) return null;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : null;
        } catch {
            const trimmed = value.replace(/^\[|\]$/g, '');
            if (!trimmed) return null;
            return trimmed.split(',').map((n) => parseFloat(n.trim()));
        }
    }
    return null;
}

function embeddingToRpcLiteral(vector) {
    if (!vector?.length) return null;
    return `[${vector.join(',')}]`;
}

function normalizeLibraryItem(item) {
    if (!item) return null;
    return {
        ...item,
        id: item.tmdb_id,
        release_date: item.release_date || item.first_air_date || null,
    };
}

function certRank(cert) {
    if (!cert) return 99;
    const key = String(cert).trim().toUpperCase();
    return CERT_RANK[key] ?? CERT_RANK[String(cert)] ?? 4;
}

function passesCertification(movieCert, maxCert) {
    if (!maxCert) return true;
    return certRank(movieCert) <= certRank(maxCert);
}

function passesParentGuideLimits(guide, limits) {
    if (!limits || typeof limits !== 'object' || !Object.keys(limits).length) return true;
    if (!guide || typeof guide !== 'object') return true;

    return Object.entries(limits).every(([category, maxLevel]) => {
        const movieLevel = guide[category] || guide[category?.toLowerCase()];
        if (!movieLevel || !maxLevel) return true;
        const maxSev = PARENT_SEVERITY[String(maxLevel).toLowerCase()] ?? 2;
        const movieSev = PARENT_SEVERITY[String(movieLevel).toLowerCase()] ?? 2;
        return movieSev <= maxSev;
    });
}

/**
 * Is this title on one of the user's services (in their region)?
 * Uses real TMDB provider data when we have it; falls back to curated
 * streaming_platforms only for titles without provider data.
 */
function movieOnUserPlatforms(movie, context) {
    const providerIds = context.providerIds || [];
    if (!providerIds.length) return true;
    if (movie.onYourServices?.length) return true;
    if (movie._availabilityKnown) return false;
    return movieOnTmdbProviders(movie, providerIds);
}

/** Match library/TMDB rows against one or more TMDB watch-provider ids. */
function movieOnTmdbProviders(movie, providerIds) {
    const ids = (providerIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) return true;

    const platforms = movie.streaming_platforms;
    if (!Array.isArray(platforms) || !platforms.length) return false;

    return platforms.some((p) => {
        const pid = Number(p?.provider_id ?? p?.id);
        if (ids.includes(pid)) return true;
        const name = String(p?.name || p?.provider_name || '').toLowerCase();
        if (!name) return false;
        return ids.some((id) => {
            const aliases = TMDB_PROVIDER_ALIASES[id] || [];
            return aliases.some((alias) => name.includes(alias));
        });
    });
}

function passesFamilyFilter(movie, profile) {
    if (!profile?.family_mode_enabled) return true;

    if (movie.family_score != null && Number(movie.family_score) < 7) {
        return false;
    }

    if (!passesCertification(movie.certification, profile.family_max_certification)) {
        return false;
    }

    return passesParentGuideLimits(
        movie.custom_parent_guide,
        profile.family_content_limits,
    );
}

function genreMatchScore(genreWeights, movie) {
    const weights = genreWeights || {};
    const ids = extractGenreIds(movie);
    if (!ids.length) return 0.35;

    let posSum = 0;
    let posHits = 0;
    let negSum = 0;
    let negHits = 0;
    ids.forEach((id) => {
        const w = Number(weights[id]);
        if (w > 0) {
            posSum += w;
            posHits += 1;
        } else if (w < 0) {
            negSum += w;
            negHits += 1;
        }
    });

    if (!posHits && !negHits) return 0.2;
    const positive = posHits ? Math.min(1, posSum / posHits) : 0.15;
    const negative = negHits ? Math.min(1, Math.abs(negSum) / negHits) : 0;
    return Math.max(0, Math.min(1, positive - negative * 0.65));
}

/** Soft demote when candidate shares many genres with recently disliked titles. */
function dislikedGenreOverlapPenalty(movie, dislikedGenreSets) {
    if (!dislikedGenreSets?.length) return 0;
    const ids = extractGenreIds(movie).map(String);
    if (!ids.length) return 0;

    let worst = 0;
    dislikedGenreSets.forEach((disliked) => {
        const set = new Set((disliked || []).map(String));
        const hits = ids.filter((id) => set.has(id)).length;
        if (hits >= 2) worst = Math.max(worst, Math.min(0.4, 0.12 * hits));
    });
    return worst;
}

/** High quality + low reach → gem bonus (0–0.1). */
function hiddenGemBonus(movie) {
    const vote = Number(movie.vote_average) || 0;
    const votes = Number(movie.vote_count) || 0;
    const pop = Number(movie.popularity) || 0;
    if (vote < 7.2 || votes < 80 || pop > 45) return 0;
    const quality = Math.min(1, (vote - 7) / 2);
    const obscurity = Math.min(1, Math.max(0, (40 - pop) / 40));
    return Math.round(quality * obscurity * 0.1 * 1000) / 1000;
}

/** Core (non-drama) genres that define a seed title's identity. */
function coreGenreIds(genreIds) {
    return (genreIds || []).map(String).filter((id) => !BROAD_GENRE_IDS.has(id));
}

/**
 * Overlap with the seed movie's genres — used for "Because you loved X".
 * Prefers shared horror/mystery/etc. over a lonely Drama match.
 */
function seedGenreOverlapScore(seedGenreIds, movie) {
    const seed = (seedGenreIds || []).map(String);
    const seedSet = new Set(seed);
    const ids = extractGenreIds(movie).map(String);
    if (!seed.length || !ids.length) return 0;

    const seedCore = coreGenreIds(seed);
    const overlap = ids.filter((id) => seedSet.has(id));
    if (!overlap.length) return 0;

    // Seed has specific genres (e.g. Horror) but candidate only shares Drama → near-zero.
    if (seedCore.length && !ids.some((id) => seedCore.includes(id))) {
        return 0.05;
    }

    const unionSize = new Set([...seed, ...ids]).size;
    const jaccard = overlap.length / Math.max(unionSize, 1);
    const coreHits = ids.filter((id) => seedCore.includes(id)).length;
    return Math.min(1, 0.3 + jaccard * 0.55 + Math.min(coreHits, 2) * 0.1);
}

/** True when candidate shares a defining genre with the seed (not Drama-only). */
function passesSeedGenreGate(seedGenreIds, movie) {
    const seed = (seedGenreIds || []).map(String);
    const seedCore = coreGenreIds(seed);
    const ids = extractGenreIds(movie).map(String);
    if (!ids.length) return false;
    if (!seedCore.length) {
        return ids.some((id) => seed.includes(id));
    }
    return ids.some((id) => seedCore.includes(id));
}

/**
 * Soft penalty when a dark seed (horror/thriller) is paired with family/animation
 * that has no dark-genre overlap — blocks Moana-next-to-The-Witch style noise.
 */
function seedToneMultiplier(seedGenreIds, movie) {
    const seed = (seedGenreIds || []).map(String);
    const ids = extractGenreIds(movie).map(String);
    const seedDark = seed.some((id) => DARK_GENRE_IDS.has(id));
    if (!seedDark) return 1;

    const movieDark = ids.some((id) => DARK_GENRE_IDS.has(id));
    const movieLight = ids.some((id) => LIGHT_GENRE_IDS.has(id));
    if (movieLight && !movieDark) return 0.12;
    return 1;
}

/** TMDB similar + recommendations IDs to reinforce weak/missing embeddings. */
async function fetchTmdbNeighborIds(tmdbId, mediaType, limit = 40) {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const id = String(tmdbId);
    try {
        const [similar, recs] = await Promise.all([
            fetchTmdbApi(`/${type}/${id}/similar`, { page: 1 }).catch(() => null),
            fetchTmdbApi(`/${type}/${id}/recommendations`, { page: 1 }).catch(() => null),
        ]);
        const out = [];
        const seen = new Set();
        for (const list of [similar?.results, recs?.results]) {
            for (const item of list || []) {
                const tid = String(item.id);
                if (!tid || seen.has(tid) || tid === id) continue;
                seen.add(tid);
                out.push(tid);
                if (out.length >= limit) return out;
            }
        }
        return out;
    } catch (err) {
        console.warn('[reco] tmdb neighbors failed:', err.message);
        return [];
    }
}

function moodMatchScore(moodPreferences, movie) {
    const prefs = moodPreferences || {};
    const tags = movie.mood_tags || [];
    if (!tags.length || !Object.keys(prefs).length) return 0.5;

    let hits = 0;
    tags.forEach((tag) => {
        if (prefs[tag] > 0 || prefs[`vibe_${tag}`] > 0) hits += 1;
    });

    return Math.min(1, hits / Math.max(tags.length, 1) + 0.25);
}

function collaborativeScore(movie, lovedGenreSets) {
    if (!lovedGenreSets?.length) return 0.45;

    const candidateGenres = extractGenreIds(movie);
    if (!candidateGenres.length) return 0.3;

    let best = 0;
    lovedGenreSets.forEach((loved) => {
        const intersection = candidateGenres.filter((g) => loved.includes(g)).length;
        const union = new Set([...candidateGenres, ...loved]).size;
        if (union > 0) best = Math.max(best, intersection / union);
    });

    return best;
}

function popularityScore(popularity, maxPopularity) {
    const max = maxPopularity > 0 ? maxPopularity : 100;
    return Math.min(1, (popularity || 0) / max);
}

async function getCommunityAxisMap(supabase, movieIds) {
    if (!movieIds?.length) return new Map();

    const { data, error } = await supabase
        .from('ratings')
        .select('movie_id, acting, screenplay, sound, direction, entertainment, pacing, cinematography')
        .in('movie_id', movieIds.map((id) => String(id)));

    if (error || !data?.length) return new Map();

    const byMovie = new Map();
    data.forEach((row) => {
        const id = String(row.movie_id);
        if (!byMovie.has(id)) byMovie.set(id, []);
        byMovie.get(id).push(row);
    });

    const result = new Map();
    byMovie.forEach((rows, movieId) => {
        const axis = {};
        AXIS_KEYS.forEach((key) => {
            const vals = rows.map((r) => r[key]).filter((v) => v != null);
            if (vals.length) {
                axis[key] = vals.reduce((a, b) => a + Number(b), 0) / vals.length;
            }
        });
        result.set(movieId, axis);
    });

    return result;
}

function axisMatchScore(userAxis, communityAxis) {
    if (!userAxis || !communityAxis) return 0.5;

    let sum = 0;
    let count = 0;

    AXIS_KEYS.forEach((key) => {
        const userVal = Number(userAxis[key]);
        const commVal = Number(communityAxis[key]);
        if (Number.isNaN(userVal) || Number.isNaN(commVal)) return;

        const diff = Math.abs(userVal - commVal);
        sum += Math.max(0, 1 - diff / 5);
        count += 1;
    });

    return count ? sum / count : 0.5;
}

function buildReason(profile, movie, breakdown, extra = {}) {
    const weights = profile.genre_weights || {};
    const genreIds = extractGenreIds(movie);
    // Name the strongest genre this title shares with the user's taste.
    const matchedGenre = genreIds
        .map((id) => ({ id, w: Number(weights[id]) || 0 }))
        .filter((g) => g.w >= 0.45 && GENRE_NAMES[g.id])
        .sort((a, b) => b.w - a.w)[0];

    const moodPrefs = profile.mood_preferences || {};
    const matchedMood = (movie.mood_tags || [])
        .find((tag) => (moodPrefs[tag] > 0 || moodPrefs[`vibe_${tag}`] > 0) && MOOD_LABELS[tag]);

    let lead;
    if (extra.seedMode) {
        const seedCore = coreGenreIds(extra.seedGenreIds || []);
        const shared = genreIds
            .map(String)
            .filter((id) => seedCore.includes(id) && GENRE_NAMES[id])
            .map((id) => GENRE_NAMES[id]);
        if (shared.length) {
            lead = `Same ${shared.slice(0, 2).join(' / ')} vibe as a film you loved`;
        } else if (breakdown.content >= 0.55) {
            lead = 'Closely related to a film you loved';
        } else {
            lead = 'Similar to a film you loved';
        }
    } else if (extra.isExploration) {
        lead = 'A fresh pick to broaden your taste';
    } else if (matchedGenre && matchedMood) {
        lead = `Because you love ${MOOD_LABELS[matchedMood]} ${GENRE_NAMES[matchedGenre.id]}`;
    } else if (matchedGenre) {
        lead = `Matches your taste for ${GENRE_NAMES[matchedGenre.id]}`;
    } else if (breakdown.content >= 0.62) {
        lead = 'Closely matches your taste profile';
    } else if (breakdown.collaborative >= 0.55) {
        lead = 'Loved by people with similar taste';
    } else if (breakdown.axis >= 0.65) {
        lead = 'Crafted the way you like films made';
    } else if (matchedMood) {
        lead = `A ${MOOD_LABELS[matchedMood]} pick for you`;
    } else if (breakdown.popularity >= 0.75) {
        lead = 'Trending right now';
    } else {
        lead = 'Picked for you based on your ratings';
    }

    // Kept short: where it streams is shown by the card's service badge.
    const tags = [];
    if (profile.family_mode_enabled && movie.family_score >= 7) tags.push('family-safe');

    return tags.length ? `${lead} — ${tags.join(' · ')}.` : `${lead}.`;
}

/**
 * Build the effective taste profile used for scoring.
 *
 * Priority: behavioural genre signal > computed (rating-derived) weights >
 * manual Settings prefs (baseline floor). Manual prefs only lift a genre/mood
 * that behaviour hasn't spoken to yet, so they nudge without overriding.
 */
function buildEffectiveProfile(profile, signals) {
    const computedGenres = profile.genre_weights || {};
    const behavioralGenres = genreSignalToWeights(signals.genreSignal || {});
    const manualGenres = profile.manual_genre_weights || {};

    const genreIds = new Set([
        ...Object.keys(computedGenres),
        ...Object.keys(behavioralGenres),
        ...Object.keys(manualGenres),
    ]);

    const effectiveGenres = {};
    genreIds.forEach((id) => {
        const computed = Number(computedGenres[id]) || 0;
        const behavioral = Number(behavioralGenres[id]) || 0;
        const manualFloor = (Number(manualGenres[id]) || 0) * 0.5; // floor, never dominates
        // Likes/ratings lead; behavioural supports. Preserve negative (dislike) weights.
        const blended = 0.55 * computed + 0.45 * behavioral;
        if (blended < 0) {
            effectiveGenres[id] = Math.round(blended * 100) / 100;
        } else {
            effectiveGenres[id] = Math.round(Math.max(blended, manualFloor) * 100) / 100;
        }
    });

    const computedMoods = profile.mood_preferences || {};
    const manualMoods = profile.manual_mood_preferences || {};
    const behavioralMoods = signals.moodSignal || {};
    const effectiveMoods = { ...computedMoods };
    Object.keys(manualMoods).forEach((m) => {
        effectiveMoods[m] = Math.max(Number(effectiveMoods[m]) || 0, 0.5);
    });
    Object.entries(behavioralMoods).forEach(([m, v]) => {
        if (v > 0) effectiveMoods[m] = Math.max(Number(effectiveMoods[m]) || 0, 0.7);
    });

    return { ...profile, genre_weights: effectiveGenres, mood_preferences: effectiveMoods };
}

/**
 * Everything the user has already seen or rejected — watched, diary logs,
 * ratings, likes, dislikes. Cheap (ids only); used to re-check cached rows so
 * a title watched after a row was cached never comes back.
 */
export async function loadSeenSet(supabase, userId) {
    const [watched, logs, ratings, liked, disliked, quizRow] = await Promise.all([
        supabase.from('user_watched_movies').select('movie_id').eq('user_id', userId).limit(5000),
        supabase.from('movie_logs').select('tmdb_id').eq('user_id', userId).limit(5000),
        supabase.from('ratings').select('movie_id').eq('user_id', userId).limit(5000),
        supabase.from('user_liked_movies').select('movie_id').eq('user_id', userId).limit(5000),
        supabase.from('user_events').select('tmdb_id').eq('user_id', userId)
            .in('event_type', ['movie_disliked', 'movie_meh', 'not_interested']).limit(1000),
        supabase.from('user_taste_profiles').select('onboarding_step_data').eq('user_id', userId).maybeSingle(),
    ]);
    const seen = new Set();
    (watched.data || []).forEach((r) => seen.add(String(r.movie_id)));
    (logs.data || []).forEach((r) => seen.add(String(r.tmdb_id)));
    (ratings.data || []).forEach((r) => seen.add(String(r.movie_id)));
    (liked.data || []).forEach((r) => seen.add(String(r.movie_id)));
    (disliked.data || []).forEach((r) => { if (r.tmdb_id) seen.add(String(r.tmdb_id)); });
    const quiz = quizRow?.data?.onboarding_step_data?.quiz;
    [...(quiz?.lovedIds || []), ...(quiz?.dislikedIds || [])].forEach((id) => seen.add(String(id)));
    return seen;
}

/** Drop seen titles from a cached payload (keeps meta.count accurate). */
async function filterCachedPayload(supabase, userId, payload) {
    if (!payload?.items?.length) return payload;
    try {
        const seen = await loadSeenSet(supabase, userId);
        const items = payload.items.filter((m) => !seen.has(String(m.tmdb_id ?? m.id)));
        if (items.length === payload.items.length) return payload;
        return { ...payload, items, meta: { ...(payload.meta || {}), count: items.length, cacheFiltered: true } };
    } catch (err) {
        console.warn('[reco] cached seen-filter failed:', err.message);
        return payload;
    }
}

async function loadUserContext(supabase, userId, { regionHint = null } = {}) {
    const [
        { data: profile, error: profileError },
        streaming,
        { data: ratings, error: ratingsError },
        { data: watchedRows },
        { data: logRows },
        { data: likedRows },
        { data: dislikeEvents },
        { data: account },
    ] = await Promise.all([
        supabase.from('user_taste_profiles').select('*').eq('user_id', userId).maybeSingle(),
        // Services + region drive OTT filtering; never let a failure here break recs.
        getUserStreamingSetup(userId, supabase).catch((err) => {
            console.warn('[reco] streaming setup unavailable:', err.message);
            return { region: DEFAULT_REGION, providerIds: [], services: [] };
        }),
        supabase.from('ratings').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(200),
        // "Seen" history — never recommend these back. Best-effort (missing tables ignored).
        supabase.from('user_watched_movies').select('movie_id').eq('user_id', userId).limit(2000),
        supabase.from('movie_logs').select('tmdb_id').eq('user_id', userId).limit(2000),
        supabase
            .from('user_liked_movies')
            .select('movie_id, media_type, liked_at')
            .eq('user_id', userId)
            .order('liked_at', { ascending: false })
            .limit(500),
        supabase
            .from('user_events')
            .select('tmdb_id, event_type, created_at')
            .eq('user_id', userId)
            .in('event_type', ['movie_disliked', 'movie_meh', 'not_interested', 'recommendation_ignored'])
            .order('created_at', { ascending: false })
            .limit(120),
        supabase.from('user_profiles').select('display_name, username').eq('id', userId).maybeSingle(),
    ]);

    if (profileError) throw new Error(profileError.message);
    if (ratingsError) throw new Error(ratingsError.message);

    // Behavioural signals are best-effort: never let them break core recs.
    let signals = {
        genreSignal: {}, moodSignal: {}, suppressTmdbIds: new Set(), engagedTmdbIds: [],
    };
    try {
        signals = await getBehavioralSignals(userId);
    } catch (err) {
        console.warn('behavioral signals unavailable:', err.message);
    }

    const baseProfile = profile || {};
    const effectiveProfile = buildEffectiveProfile(baseProfile, signals);

    const providerIds = streaming?.providerIds || [];
    // Saved services fix the country; otherwise use where the viewer actually is.
    const region = (streaming?.hasServices ? normalizeRegion(streaming?.region) : null)
        || normalizeRegion(regionHint)
        || normalizeRegion(streaming?.region)
        || DEFAULT_REGION;
    const serviceIds = providerIds.map(String);
    const ratedIds = new Set((ratings || []).map((r) => String(r.movie_id)));
    const likedIds = new Set((likedRows || []).map((r) => String(r.movie_id)));

    // Seen ≠ loved: watches/logs/ratings/likes all exclude from recs,
    // but only high ratings + likes feed lovedGenreSets / taste affinity.
    const quiz = baseProfile.onboarding_step_data?.quiz || null;
    const quizLoved = (quiz?.lovedIds || []).map(String);
    const quizDisliked = (quiz?.dislikedIds || []).map(String);

    const seenIds = new Set(ratedIds);
    likedIds.forEach((id) => seenIds.add(id));
    quizLoved.forEach((id) => seenIds.add(id));
    quizDisliked.forEach((id) => seenIds.add(id));
    (watchedRows || []).forEach((r) => seenIds.add(String(r.movie_id)));
    (logRows || []).forEach((r) => seenIds.add(String(r.tmdb_id)));

    const lovedGenreSets = [];
    const lovedTmdbIds = [];
    const lovedSet = new Set();
    /** @type {{ tmdbId: string, mediaType: string, score: number }[]} */
    const tasteSeeds = [];

    (likedRows || []).slice(0, 12).forEach((row, index) => {
        const id = String(row.movie_id);
        tasteSeeds.push({
            tmdbId: id,
            mediaType: row.media_type === 'tv' ? 'tv' : 'movie',
            // Recent likes rank ahead of older ones for TMDB seeding.
            score: 100 - index,
        });
    });

    (ratings || []).forEach((rating) => {
        const overall = computeOverallFromRatingRow(rating);
        if (overall != null && overall >= 7) {
            const id = String(rating.movie_id);
            if (!lovedSet.has(id)) {
                lovedSet.add(id);
                lovedTmdbIds.push(id);
            }
            if (!tasteSeeds.some((s) => s.tmdbId === id)) {
                tasteSeeds.push({
                    tmdbId: id,
                    mediaType: 'movie',
                    score: overall,
                });
            }
        }
    });
    likedIds.forEach((id) => {
        if (!lovedSet.has(id)) {
            lovedSet.add(id);
            lovedTmdbIds.push(id);
        }
    });
    // Quiz favourites: strong seeds until real likes/ratings take over.
    quizLoved.forEach((id, index) => {
        if (!lovedSet.has(id)) {
            lovedSet.add(id);
            lovedTmdbIds.push(id);
        }
        if (!tasteSeeds.some((s) => s.tmdbId === id)) {
            tasteSeeds.push({ tmdbId: id, mediaType: 'movie', score: 90 - index });
        }
    });

    tasteSeeds.sort((a, b) => b.score - a.score);

    if (lovedTmdbIds.length) {
        const { data: lovedMovies } = await supabase
            .from('movies_library')
            .select('tmdb_id, genres, genre_ids, media_type')
            .in('tmdb_id', lovedTmdbIds.slice(0, 40));

        (lovedMovies || []).forEach((m) => {
            const ids = extractGenreIds(m);
            if (ids.length) lovedGenreSets.push(ids);
            const seed = tasteSeeds.find((s) => s.tmdbId === String(m.tmdb_id));
            if (seed && m.media_type) seed.mediaType = m.media_type === 'tv' ? 'tv' : 'movie';
        });
    }

    const dislikedGenreSets = [];
    // Strong negatives (dislike / meh / not interested) vs skipped picks (weak).
    const strongNegative = (dislikeEvents || []).filter((e) => e.event_type !== 'recommendation_ignored');
    const skippedEvents = (dislikeEvents || []).filter((e) => e.event_type === 'recommendation_ignored');
    const dislikedIds = [...new Set([
        ...strongNegative.map((e) => String(e.tmdb_id)).filter(Boolean),
        ...quizDisliked,
    ])].slice(0, 30);
    if (dislikedIds.length) {
        const { data: dislikedMovies } = await supabase
            .from('movies_library')
            .select('tmdb_id, genres, genre_ids')
            .in('tmdb_id', dislikedIds);
        (dislikedMovies || []).forEach((m) => {
            const ids = extractGenreIds(m);
            if (ids.length >= 2) dislikedGenreSets.push(ids);
        });
    }

    // Phase 3: taste vector = mean(loved) − 0.5·mean(disliked) over movie embeddings.
    const lowRatedIds = (ratings || [])
        .filter((r) => {
            const o = computeOverallFromRatingRow(r);
            return o != null && o <= 5;
        })
        .map((r) => String(r.movie_id));
    // Phase 5: recency-weighted — newer likes/ratings/feedback count more (floor
    // keeps long-time favourites in the picture). Skipped picks are a weak negative.
    const halfLife = RECO_CONFIG.feedbackHalfLifeDays;
    const weightAt = (when, base = 1) => base * Math.max(0.3, recencyDecay(when || Date.now(), halfLife));
    const lovedAt = new Map();
    (likedRows || []).forEach((row) => lovedAt.set(String(row.movie_id), row.liked_at));
    (ratings || []).forEach((row) => { if (!lovedAt.has(String(row.movie_id))) lovedAt.set(String(row.movie_id), row.updated_at); });
    quizLoved.forEach((id) => { if (!lovedAt.has(id)) lovedAt.set(id, quiz?.savedAt); });
    const negAt = new Map();
    strongNegative.forEach((e) => { if (!negAt.has(String(e.tmdb_id))) negAt.set(String(e.tmdb_id), e.created_at); });
    (ratings || []).forEach((row) => { if (lowRatedIds.includes(String(row.movie_id))) negAt.set(String(row.movie_id), row.updated_at); });

    const negativeItems = [...new Set([...dislikedIds, ...lowRatedIds])].slice(0, 40)
        .map((id) => ({ id, weight: weightAt(negAt.get(id) || quiz?.savedAt) }));
    const skippedItems = [...new Set(skippedEvents.map((e) => String(e.tmdb_id)).filter(Boolean))]
        .filter((id) => !negativeItems.some((n) => n.id === id) && !lovedAt.has(id))
        .slice(0, 30)
        .map((id) => ({ id, weight: weightAt(skippedEvents.find((e) => String(e.tmdb_id) === id)?.created_at, 0.2) }));

    let userVectorInfo = null;
    try {
        userVectorInfo = await computeUserVector(supabase, {
            loved: lovedTmdbIds.slice(0, 60).map((id) => ({ id, weight: weightAt(lovedAt.get(id)) })),
            disliked: [...negativeItems, ...skippedItems],
        });
    } catch (err) {
        console.warn('[reco] user vector unavailable:', err.message);
    }

    return {
        profile: effectiveProfile,
        userVector: userVectorInfo?.vector || null,
        userVectorStats: userVectorInfo ? { loved: userVectorInfo.lovedUsed, disliked: userVectorInfo.dislikedUsed } : null,
        serviceIds,
        providerIds,
        region,
        // Quiz preferences used for candidate generation + hard filters.
        prefs: {
            platformIds: providerIds,
            region,
            languages: quiz?.languages?.length ? quiz.languages : (baseProfile.manual_languages || []),
            dealbreakers: quiz?.dealbreakers || [],
            maxRuntime: effectiveMaxRuntime(quiz),
            pattern: quiz?.pattern || null,
        },
        lovedTmdbIds,
        services: streaming?.services || [],
        ratedIds,
        seenIds,
        lovedGenreSets,
        dislikedGenreSets,
        tasteSeeds: tasteSeeds.slice(0, 8),
        suppressTmdbIds: signals.suppressTmdbIds || new Set(),
        userEmbedding: userVectorInfo?.vector || parseEmbeddingVector(baseProfile.embedding),
        userEmbeddingProvider: userVectorInfo?.vector ? VECTOR_PROVIDER : (baseProfile.embedding_provider || null),
        userName: account?.display_name || account?.username || null,
    };
}

/** TMDB Discover: high-rated, low-popularity titles in the user's top genres. */
async function fetchTasteGemIdsFromTmdb(context, { mediaType = 'movie', limit = 60 } = {}) {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const genreIds = topGenreIds(context.profile?.genre_weights, 3)
        .map((id) => Number(id))
        .filter((n) => Number.isFinite(n) && n > 0);
    if (!genreIds.length) return [];

    const out = [];
    const seen = new Set();
    try {
        for (let page = 1; page <= 2 && out.length < limit; page += 1) {
            // eslint-disable-next-line no-await-in-loop
            const data = await fetchTmdbApi(`/discover/${type}`, {
                with_genres: genreIds.join('|'),
                sort_by: 'vote_average.desc',
                'vote_average.gte': '7.2',
                'vote_count.gte': '80',
                'vote_count.lte': '8000',
                include_adult: 'false',
                page: String(page),
            });
            for (const m of data?.results || []) {
                const id = String(m.id);
                if (!id || seen.has(id)) continue;
                const pop = Number(m.popularity) || 0;
                if (pop > 40) continue;
                if (context.seenIds?.has(id) || context.suppressTmdbIds?.has(id)) continue;
                seen.add(id);
                out.push({ tmdbId: id, mediaType: type, popularity: pop, vote_average: m.vote_average });
                if (out.length >= limit) break;
            }
        }
    } catch (err) {
        console.warn('[reco] gem discover failed:', err.message);
    }
    return out;
}

/**
 * Titles that stream on the user's services in their region, straight from
 * TMDB Discover (provider-filtered at the source — the most reliable OTT pool).
 * Two flavours: taste-matched (top genres) and fresh arrivals (last 6 months).
 * Records each id in context._knownAvailable so availability is trusted even
 * before the per-title provider lookup runs.
 */
async function fetchOttDiscoverPool(context, { mediaType = null } = {}) {
    const providerIds = context.providerIds || [];
    if (!providerIds.length) return [];
    const genres = topGenreIds(context.profile?.genre_weights, 3);
    const types = mediaType ? [mediaType] : ['movie', 'tv'];
    const from = isoDaysAgo(FRESH_WINDOW_DAYS);
    const today = todayIso();

    const jobs = [];
    types.forEach((type) => {
        const base = {
            with_watch_providers: providerIds.join('|'),
            watch_region: context.region || DEFAULT_REGION,
            with_watch_monetization_types: 'flatrate|free|ads',
            include_adult: 'false',
            ...(genres.length ? { with_genres: genres.join('|') } : {}),
        };
        const dateGte = type === 'tv' ? 'first_air_date.gte' : 'primary_release_date.gte';
        const dateLte = type === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte';
        const pages = type === 'movie' ? 2 : 1;
        for (let page = 1; page <= pages; page += 1) {
            jobs.push({ type, params: { ...base, sort_by: 'popularity.desc', 'vote_count.gte': type === 'tv' ? '30' : '60', page: String(page) } });
        }
        jobs.push({ type, params: { ...base, sort_by: 'popularity.desc', [dateGte]: from, [dateLte]: today, 'vote_count.gte': '10', page: '1' }, fresh: true });
    });

    const results = await Promise.all(jobs.map((job) => fetchTmdbApi(`/discover/${job.type}`, job.params)
        .then((data) => ({ job, data }))
        .catch((err) => {
            console.warn('[reco] ott discover failed:', err.message);
            return { job, data: null };
        })));

    const known = context._knownAvailable || new Map();
    context._knownAvailable = known;
    const out = [];
    results.forEach(({ job, data }) => {
        (data?.results || []).forEach((m) => {
            const id = String(m.id);
            if (!id || context.seenIds?.has(id) || context.suppressTmdbIds?.has(id)) return;
            known.set(id, providerIds.map(Number));
            out.push({ tmdbId: id, mediaType: job.type, fresh: !!job.fresh });
        });
    });
    return out;
}

/**
 * Recent digital / streaming releases in the user's top genres — keeps picks
 * current for users who haven't linked services yet.
 */
async function fetchFreshReleasePool(context, { mediaType = null } = {}) {
    const genres = topGenreIds(context.profile?.genre_weights, 3);
    const types = mediaType ? [mediaType] : ['movie', 'tv'];
    const from = isoDaysAgo(FRESH_WINDOW_DAYS);
    const today = todayIso();
    const region = context.region || DEFAULT_REGION;

    const jobs = types.map((type) => {
        const params = type === 'tv'
            ? { 'first_air_date.gte': from, 'first_air_date.lte': today, 'vote_count.gte': '10' }
            : {
                'primary_release_date.gte': from,
                'primary_release_date.lte': today,
                with_release_type: '4|5|6', // digital | physical | TV
                region,
                'vote_count.gte': '20',
            };
        return fetchTmdbApi(`/discover/${type}`, {
            ...params,
            ...(genres.length ? { with_genres: genres.join('|') } : {}),
            sort_by: 'popularity.desc',
            include_adult: 'false',
            page: '1',
        }).then((data) => ({ type, data })).catch(() => ({ type, data: null }));
    });

    const out = [];
    (await Promise.all(jobs)).forEach(({ type, data }) => {
        (data?.results || []).forEach((m) => {
            const id = String(m.id);
            if (!id || context.seenIds?.has(id) || context.suppressTmdbIds?.has(id)) return;
            out.push({ tmdbId: id, mediaType: type });
        });
    });
    return out;
}

async function fetchCandidateMovies(supabase, context, options) {
    const {
        mediaType = null,
        candidateLimit = 200,
        seedTmdbId = null,
        useEmbeddingPool = true,
        seedMediaType = null,
        includeGemPool = false,
        maxImport = 30,
    } = options;

    const tmdbIdSet = new Set();
    const embeddingSimilarity = new Map();
    const mediaTypeById = new Map();
    const isSeedMode = !!seedTmdbId;

    const remember = (id, mt, similarity = null) => {
        const tid = String(id);
        if (!tid) return;
        tmdbIdSet.add(tid);
        if (mt) mediaTypeById.set(tid, mt === 'tv' ? 'tv' : 'movie');
        if (similarity != null && !embeddingSimilarity.has(tid)) {
            embeddingSimilarity.set(tid, similarity);
        }
    };

    if (seedTmdbId) {
        const { data: similarRows, error } = await supabase.rpc('match_similar_to_movie', {
            target_tmdb_id: String(seedTmdbId),
            match_count: candidateLimit,
        });

        if (!error && similarRows?.length) {
            similarRows.forEach((row) => {
                remember(row.tmdb_id, seedMediaType || mediaType, Number(row.similarity) || 0);
            });
        }

        // TMDB genre/keyword neighbors — fills gaps when embeddings are sparse or noisy.
        const tmdbNeighbors = await fetchTmdbNeighborIds(
            seedTmdbId,
            seedMediaType || mediaType || 'movie',
            Math.min(candidateLimit, 50),
        );
        tmdbNeighbors.forEach((id) => {
            remember(id, seedMediaType || mediaType || 'movie', 0.42);
        });
    } else if (useEmbeddingPool) {
        if (context.userEmbedding) {
            const literal = embeddingToRpcLiteral(context.userEmbedding);
            if (literal) {
                const { data: matchRows, error } = await supabase.rpc('match_movies_by_embedding', {
                    query_embedding: literal,
                    match_count: candidateLimit,
                    filter_media_type: mediaType,
                    filter_provider: context.userEmbeddingProvider,
                });

                if (!error && matchRows?.length) {
                    matchRows.forEach((row) => {
                        remember(row.tmdb_id, mediaType, Number(row.similarity) || 0);
                    });
                }
            }
        }

        // Phase 2 candidate generator: loved-film neighbours, shared-keyword
        // discover and platform/language/runtime-filtered discover (all TMDB).
        if (mediaType !== 'tv') {
            const lovedIds = (context.tasteSeeds || [])
                .filter((seed) => (seed.mediaType || 'movie') === 'movie')
                .map((seed) => seed.tmdbId);
            let lovedKeywords = [];
            if (lovedIds.length) {
                const { data: kwRows } = await supabase
                    .from('movies_library')
                    .select('tmdb_id, keywords')
                    .in('tmdb_id', lovedIds.slice(0, 20));
                lovedKeywords = (kwRows || []).map((row) => row.keywords || []);
                // Loved films missing from the library: read keywords from TMDB (cached).
                const missing = lovedIds.filter((id) => !(kwRows || []).some((row) => String(row.tmdb_id) === String(id)));
                const fetched = await Promise.all(missing.slice(0, 8).map((id) => fetchTmdbApi(`/movie/${id}/keywords`)
                    .then((d) => d?.keywords || []).catch(() => [])));
                lovedKeywords = lovedKeywords.concat(fetched);
            }
            try {
                const generated = await generateCandidates({
                    lovedIds,
                    lovedKeywords,
                    prefs: context.prefs || {},
                    topGenreIds: topGenreIds(context.profile?.genre_weights, 3).map(Number),
                    exclude: new Set([...(context.seenIds || []), ...(context.suppressTmdbIds || [])]),
                });
                const pseudo = { neighbours: 0.46, keywords: 0.42, platforms: 0.38 };
                generated.cards.forEach((card, id) => remember(id, 'movie', pseudo[card._source] ?? 0.38));
                context._liteCards = generated.cards;
                const known = context._knownAvailable || new Map();
                generated.knownAvailable.forEach((ids, id) => known.set(id, ids));
                context._knownAvailable = known;
                context._candidateSources = generated.sources;
            } catch (err) {
                console.warn('[reco] candidate generator failed:', err.message);
            }
        }

        const [gems, ottPool, freshPool] = await Promise.all([
            includeGemPool
                ? fetchTasteGemIdsFromTmdb(context, {
                    mediaType: mediaType || 'movie',
                    limit: Math.min(80, Math.round(candidateLimit * 0.35)),
                })
                : Promise.resolve([]),
            // On the user's services — the pool that makes OTT filtering accurate.
            fetchOttDiscoverPool(context, { mediaType }),
            // Fresh releases when no services are linked (OTT pool covers fresh otherwise).
            context.providerIds?.length
                ? Promise.resolve([])
                : fetchFreshReleasePool(context, { mediaType }),
        ]);
        gems.forEach((g) => remember(g.tmdbId, g.mediaType, 0.38));
        ottPool.forEach((c) => remember(c.tmdbId, c.mediaType, c.fresh ? 0.38 : 0.40));
        freshPool.forEach((c) => remember(c.tmdbId, c.mediaType, 0.36));
    }

    // Popularity backfill only when the taste pool is thin — avoid crowding with blockbusters.
    const popularityCap = 40;
    if (!isSeedMode && tmdbIdSet.size < 60) {
        let popularityQuery = supabase
            .from('movies_library')
            .select(RECO_MOVIE_SELECT)
            .eq('is_active', true)
            .lte('release_date', todayIso())
            .order('popularity', { ascending: false, nullsFirst: false })
            .limit(popularityCap);

        if (mediaType) popularityQuery = popularityQuery.eq('media_type', mediaType);

        const { data: popularRows, error: popError } = await popularityQuery;
        if (popError) throw new Error(popError.message);

        (popularRows || []).forEach((m) => remember(m.tmdb_id, m.media_type || mediaType));
    } else if (isSeedMode && !tmdbIdSet.size) {
        let popularityQuery = supabase
            .from('movies_library')
            .select(RECO_MOVIE_SELECT)
            .eq('is_active', true)
            .order('vote_average', { ascending: false, nullsFirst: false })
            .limit(Math.min(candidateLimit, 120));
        if (seedMediaType || mediaType) {
            popularityQuery = popularityQuery.eq('media_type', seedMediaType || mediaType);
        }
        const { data: fallbackRows } = await popularityQuery;
        (fallbackRows || []).forEach((m) => remember(m.tmdb_id, m.media_type || seedMediaType || mediaType));
    }

    if (!tmdbIdSet.size) return [];

    const idList = Array.from(tmdbIdSet);

    // Import missing titles into the library (bounded) so posters/details work.
    try {
        const importCandidates = idList.slice(0, Math.min(idList.length, maxImport * 3)).map((id) => ({
            id,
            media_type: mediaTypeById.get(id) || mediaType || 'movie',
        }));
        await ensureLibraryCardsForCandidates(importCandidates, { maxImport });
    } catch (err) {
        console.warn('[reco] library import skipped:', err.message);
    }

    let hydrateQuery = supabase
        .from('movies_library')
        .select(RECO_MOVIE_SELECT)
        .eq('is_active', true)
        .in('tmdb_id', idList);

    if (mediaType === 'tv' || mediaType === 'movie') {
        hydrateQuery = hydrateQuery.eq('media_type', mediaType);
    }

    const { data: movies, error: moviesError } = await hydrateQuery;

    if (moviesError) throw new Error(moviesError.message);

    const hydrated = (movies || []).map((m) => ({
        ...normalizeLibraryItem(m),
        _embeddingSimilarity: embeddingSimilarity.get(String(m.tmdb_id)) ?? null,
    }));
    // Candidates TMDB gave us that aren't in the library yet still compete,
    // as lightweight cards built from TMDB's own data.
    const have = new Set(hydrated.map((m) => String(m.tmdb_id)));
    (context._liteCards || new Map()).forEach((card, id) => {
        if (have.has(id) || (mediaType && mediaType !== 'movie')) return;
        hydrated.push({ ...card, _embeddingSimilarity: embeddingSimilarity.get(id) ?? null });
    });
    return hydrated;
}

function applyHardFilters(movies, context, filters) {
    const {
        requireOtt = false,
        excludeRated = false,
        maxRuntime = null,
        familyOnly = false,
        minFamilyScore = null,
        ignoreSeen = false,
        allowUnreleased = false,
    } = filters;
    const today = todayIso();

    return movies.filter((movie) => {
        // Never recommend something you can't watch yet.
        if (!allowUnreleased && !isReleased(movie, today)) return false;

        // Never recommend something the user has already seen (watched/logged/rated).
        // Mood+OTT browse can opt out — otherwise popular Prime catalogs go empty.
        if (!ignoreSeen && context.seenIds?.has(String(movie.tmdb_id))) return false;

        // Explicit dislikes / repeated ignores — hard exclude.
        if (context.suppressTmdbIds?.has(String(movie.tmdb_id))) return false;

        if (excludeRated && context.ratedIds.has(String(movie.tmdb_id))) return false;

        if (maxRuntime != null) {
            const runtime = Number(movie.runtime) || 0;
            if (runtime > maxRuntime) return false;
        }

        if (familyOnly || context.profile.family_mode_enabled) {
            if (!passesFamilyFilter(movie, {
                ...context.profile,
                family_mode_enabled: familyOnly || context.profile.family_mode_enabled,
            })) {
                return false;
            }
        }

        if (minFamilyScore != null) {
            const score = Number(movie.family_score);
            if (score == null || score < minFamilyScore) return false;
        }

        if (requireOtt && context.providerIds?.length) {
            if (!movieOnUserPlatforms(movie, context)) return false;
        }

        return true;
    });
}

function topGenreIds(genreWeights, count = 2) {
    return Object.entries(genreWeights || {})
        .filter(([, w]) => Number(w) > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(([id]) => String(id));
}

/**
 * Diversity layer: reserve ~20% of the page for exploration picks whose genres
 * sit outside the user's top-2, sampled by popularity, so recs don't ossify
 * into a single-genre bubble. The 80% majority stays purely relevance-ranked.
 */
function diversifyRanking(scored, limit, dominantGenres) {
    if (scored.length <= limit) return scored.slice(0, limit);

    const exploreSlots = Math.max(0, Math.round(limit * EXPLORATION_RATIO));
    const relevantSlots = limit - exploreSlots;

    const relevant = scored.slice(0, relevantSlots);
    const chosen = new Set(relevant.map((m) => String(m.tmdb_id)));

    const explorePool = scored
        .slice(relevantSlots)
        .filter((m) => {
            const ids = extractGenreIds(m);
            return !ids.some((id) => dominantGenres.includes(String(id)));
        })
        .sort((a, b) => (Number(b.popularity) || 0) - (Number(a.popularity) || 0));

    const exploration = [];
    for (const movie of explorePool) {
        if (exploration.length >= exploreSlots) break;
        if (chosen.has(String(movie.tmdb_id))) continue;
        chosen.add(String(movie.tmdb_id));
        exploration.push({ ...movie, _isExploration: true });
    }

    // Backfill any unfilled explore slots with the next best relevant items.
    const result = [...relevant, ...exploration];
    if (result.length < limit) {
        for (const movie of scored.slice(relevantSlots)) {
            if (result.length >= limit) break;
            if (chosen.has(String(movie.tmdb_id))) continue;
            chosen.add(String(movie.tmdb_id));
            result.push(movie);
        }
    }

    return result.slice(0, limit);
}

/** Filters that are never relaxed: seen, suppressed, already rated, unreleased. */
function passesBaseFilters(movie, context, filters) {
    const id = String(movie.tmdb_id);
    if (!filters.ignoreSeen && context.seenIds?.has(id)) return false;
    if (context.suppressTmdbIds?.has(id)) return false;
    if (filters.excludeRated && context.ratedIds?.has(id)) return false;
    if (!filters.allowUnreleased && !isReleased(movie)) return false;
    if (!passesDealbreakers(movie, context.prefs)) return false;
    return true;
}

/**
 * Base filters → provider lookup (best candidates first, bounded) → full
 * filters with fallback. Running the cheap filters first means the TMDB
 * provider budget is spent only on titles that can actually be shown.
 */
async function prepareCandidates(supabase, movies, context, filters, minCount, {
    maxFetch = AVAILABILITY_FETCH_BUDGET,
    knownAvailable = context._knownAvailable || null,
} = {}) {
    const prelim = movies.filter((m) => passesBaseFilters(m, context, filters));
    prelim.sort((a, b) => ((b._embeddingSimilarity ?? 0) - (a._embeddingSimilarity ?? 0))
        || ((Number(b.popularity) || 0) - (Number(a.popularity) || 0)));
    try {
        await attachAvailability(supabase, prelim, {
            region: context.region || DEFAULT_REGION,
            providerIds: context.providerIds || [],
            maxFetch,
            knownAvailable,
        });
    } catch (err) {
        console.warn('[reco] availability lookup failed:', err.message);
    }
    if (process.env.RECO_DEBUG) {
        const why = {};
        const bump = (k) => { why[k] = (why[k] || 0) + 1; };
        movies.forEach((m) => {
            const id = String(m.tmdb_id);
            if (!filters.ignoreSeen && context.seenIds?.has(id)) return bump('seen');
            if (context.suppressTmdbIds?.has(id)) return bump('suppressed');
            if (filters.excludeRated && context.ratedIds?.has(id)) return bump('rated');
            if (!filters.allowUnreleased && !isReleased(m)) return bump('unreleased');
            if (!passesDealbreakers(m, context.prefs)) return bump('dealbreaker');
            if (filters.maxRuntime != null && (Number(m.runtime) || 0) > filters.maxRuntime) return bump('runtime');
            if ((filters.familyOnly || context.profile.family_mode_enabled) && !passesFamilyFilter(m, { ...context.profile, family_mode_enabled: true })) return bump('family');
            if (filters.requireOtt && context.providerIds?.length && !movieOnUserPlatforms(m, context)) return bump(m._lite ? 'ott(lite)' : 'ott');
            return bump('ok');
        });
        console.log('[prepare]', JSON.stringify(why));
    }
    return applyFiltersWithFallback(prelim, context, filters, minCount);
}

/**
 * Apply hard filters, but progressively relax them if they leave too few
 * candidates — so missing catalog metadata (no streaming_platforms / no
 * certification) never yields an empty page. Relaxation order:
 *   1) drop the OTT requirement (convenience, not safety)
 *   2) drop family-mode (only for non-family feeds, i.e. familyOnly !== true)
 *   3) drop the runtime cap
 * The dedicated family feed (familyOnly: true) keeps family filtering always.
 */
function applyFiltersWithFallback(candidates, context, filters, minCount) {
    const relaxed = [];
    let out = applyHardFilters(candidates, context, filters);
    if (out.length >= minCount) return { items: out, relaxed };

    if (filters.requireOtt) {
        relaxed.push('ott');
        out = applyHardFilters(candidates, context, { ...filters, requireOtt: false });
        if (out.length >= minCount) return { items: out, relaxed };
    }

    if (!filters.familyOnly && context.profile.family_mode_enabled) {
        relaxed.push('family');
        const noFamilyCtx = {
            ...context,
            profile: { ...context.profile, family_mode_enabled: false },
        };
        out = applyHardFilters(candidates, noFamilyCtx, { ...filters, requireOtt: false });
        if (out.length >= minCount) return { items: out, relaxed };
    }

    if (filters.maxRuntime != null) {
        relaxed.push('runtime');
        const ctx = filters.familyOnly
            ? context
            : { ...context, profile: { ...context.profile, family_mode_enabled: false } };
        out = applyHardFilters(candidates, ctx, { ...filters, requireOtt: false, maxRuntime: null });
    }

    return { items: out, relaxed };
}

async function scoreAndRankMovies(supabase, movies, context, options = {}) {
    const {
        limit = 24,
        seedGenreIds = null,
        skipDiversity = false,
        tonight = null,
    } = options;
    const isSeedMode = Array.isArray(seedGenreIds) && seedGenreIds.length > 0;

    // Phase 3 path: 0.6·similarity + 0.2·quality + 0.2·contextFit (reco/config.js).
    if (context.userVector && !isSeedMode && movies.length) {
        await attachVectors(supabase, movies);
        movies.forEach((m) => { m._fresh = freshnessBonus(m) > 0; });
        const scored = scoreCandidates(movies, context.userVector, {
            pattern: context.prefs?.pattern,
            ...(tonight || {}),
        });
        const ranked = skipDiversity
            ? scored.slice(0, limit)
            : diversifyRanking(scored, limit, topGenreIds(context.profile.genre_weights, 2));
        return ranked.map((movie) => toPublicItem(movie, {
            reason: buildReason(context.profile, movie, {
                content: movie.scores.similarity,
                genre: movie.scores.similarity,
                axis: 0,
                collaborative: 0,
                popularity: 0,
            }, { isExploration: movie._isExploration }),
        }));
    }
    const hasEmbedding = !!context.userEmbedding;
    const weights = isSeedMode
        ? WEIGHTS_SEED_SIMILAR
        : (hasEmbedding ? WEIGHTS_WITH_EMBEDDING : WEIGHTS_NO_EMBEDDING);
    const suppress = context.suppressTmdbIds || new Set();

    const movieIds = movies.map((m) => String(m.tmdb_id));
    const communityAxisMap = await getCommunityAxisMap(supabase, movieIds);

    const maxPopularity = Math.max(
        ...movies.map((m) => Number(m.popularity) || 0),
        1,
    );

    const scored = movies.map((movie) => {
        const tmdbId = String(movie.tmdb_id);
        const content = movie._embeddingSimilarity != null
            ? Math.max(0, Math.min(1, movie._embeddingSimilarity))
            : 0;

        const dna = dnaMatchScore(context.profile.dna_preferences, movie.movie_dna);
        const tasteGenre = Math.max(
            genreMatchScore(context.profile.genre_weights, movie),
            moodMatchScore(context.profile.mood_preferences, movie) * 0.85,
            dna != null ? dna : 0,
        );
        const genre = isSeedMode
            ? Math.max(seedGenreOverlapScore(seedGenreIds, movie), tasteGenre * 0.25)
            : tasteGenre;

        const axis = axisMatchScore(
            context.profile.axis_preferences,
            communityAxisMap.get(tmdbId),
        );

        const collaborative = collaborativeScore(movie, context.lovedGenreSets);
        const popularity = popularityScore(movie.popularity, maxPopularity);

        const breakdown = { content, genre, axis, collaborative, popularity };

        let finalScore =
            weights.content * content
            + weights.genre * genre
            + weights.axis * axis
            + weights.collaborative * collaborative
            + weights.popularity * popularity;

        if (isSeedMode) {
            finalScore *= seedToneMultiplier(seedGenreIds, movie);
        }

        // Freshness layer: demote titles recently shown and ignored.
        if (suppress.has(tmdbId)) finalScore *= FRESHNESS_PENALTY;

        const dislikePenalty = dislikedGenreOverlapPenalty(movie, context.dislikedGenreSets);
        if (dislikePenalty > 0) finalScore *= (1 - dislikePenalty);

        finalScore += hiddenGemBonus(movie);

        // Watchability: prefer what the user can stream tonight, and what is new.
        if (context.providerIds?.length) {
            if (movie.onYourServices?.length) finalScore += ON_YOUR_SERVICES_BONUS;
        } else if (movie.availability?.length) {
            finalScore += WATCHABLE_NOW_BONUS;
        }
        finalScore += freshnessBonus(movie);

        return {
            ...movie,
            score: Math.round(finalScore * 1000) / 1000,
            scores: breakdown,
        };
    });

    // Stable order: ties break by tmdb_id so equal-scored titles don't shuffle.
    scored.sort((a, b) => (b.score - a.score)
        || (Number(a.tmdb_id) - Number(b.tmdb_id)));

    // Seed-similar rows must stay on-theme — do not inject off-genre "exploration" hits.
    const ranked = (skipDiversity || isSeedMode)
        ? scored.slice(0, limit)
        : diversifyRanking(scored, limit, topGenreIds(context.profile.genre_weights, 2));

    return ranked.map((movie) => toPublicItem(movie, {
        reason: buildReason(context.profile, movie, movie.scores, {
            isExploration: movie._isExploration,
            seedMode: isSeedMode,
            seedGenreIds,
        }),
    }));
}

/** Drop internal fields; expose availability ({id,name,logo}) for cards. */
function toPublicItem(movie, extra = {}) {
    const {
        _embeddingSimilarity, _isExploration, _watchProviders, _watchProvidersSyncedAt,
        _availabilityKnown, _fromProviderDiscover, availability, onYourServices,
        vector, _lite, _source, _fresh, ...rest
    } = movie;
    return {
        ...rest,
        ...publicAvailability(movie),
        ...extra,
    };
}

/**
 * Optional LLM re-rank of the engine's shortlist. Returns the items reordered
 * (with LLM-written reasons attached), or the original items unchanged on any
 * failure / when the LLM is disabled. Never adds or drops titles.
 */
async function applyLlmRerank(profile, items) {
    if (!isLlmEnabled() || items.length < 3) return items;

    const topGenres = topGenreIds(profile.genre_weights, 4)
        .map((id) => GENRE_NAMES[id])
        .filter(Boolean);

    const candidates = items.map((m) => ({
        id: String(m.tmdb_id ?? m.id),
        title: m.title || m.name || '',
        year: (m.release_date || m.first_air_date || '').slice(0, 4),
        genres: extractGenreIds(m).map((gid) => GENRE_NAMES[gid]).filter(Boolean),
        score: m.score,
    }));

    let result;
    try {
        result = await rerankRecommendations({
            tasteSummary: profile.taste_summary,
            topGenres,
            candidates,
        });
    } catch (err) {
        console.warn('[reco] llm rerank failed:', err.message);
        return items;
    }
    if (!result?.order?.length) return items;

    const byId = new Map(items.map((m) => [String(m.tmdb_id ?? m.id), m]));
    const reordered = [];
    result.order.forEach((id) => {
        const movie = byId.get(id);
        if (!movie) return;
        byId.delete(id);
        const llmReason = result.reasons?.[id];
        reordered.push(llmReason ? { ...movie, reason: llmReason, llmRanked: true } : movie);
    });
    // Append anything the model omitted, preserving engine order.
    byId.forEach((movie) => reordered.push(movie));

    return reordered;
}

async function readCache(supabase, userId, cacheKey) {
    const { data, error } = await supabase
        .from('recommendation_cache')
        .select('payload, expires_at')
        .eq('user_id', userId)
        .eq('cache_key', cacheKey)
        .maybeSingle();

    if (error || !data) return null;
    if (new Date(data.expires_at) <= new Date()) return null;
    return data.payload;
}

async function writeCache(supabase, userId, cacheKey, payload, ttlHours = CACHE_TTL_HOURS) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);

    const { error } = await supabase
        .from('recommendation_cache')
        .upsert({
            user_id: userId,
            cache_key: cacheKey,
            payload,
            expires_at: expiresAt.toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,cache_key' });

    if (error) {
        console.warn('recommendation_cache write failed:', error.message);
    }
}

export async function getRecommendations(userId, baseCacheKey, options = {}) {
    const supabase = getSupabaseAdmin();
    const cacheKey = options.regionHint ? `${baseCacheKey}_${options.regionHint}` : baseCacheKey;
    const {
        limit = 24,
        mediaType = null,
        refresh = false,
        requireOtt = false,
        excludeRated = false,
        maxRuntime = null,
        familyOnly = false,
        minFamilyScore = null,
        seedTmdbId = null,
        candidateLimit = 200,
        useLlm = false,
        ttlHours = CACHE_TTL_HOURS,
    } = options;

    if (!refresh) {
        const cached = await readCache(supabase, userId, cacheKey);
        if (cached?.items?.length) {
            // Serve cached analysis (fast), minus anything seen since it was cached.
            const filtered = await filterCachedPayload(supabase, userId, cached);
            // Too few left after filtering — rebuild instead of serving a thin row.
            if ((filtered.items?.length || 0) >= Math.min(limit, 4)) {
                return { ...filtered, fromCache: true };
            }
        }
    }

    const context = await loadUserContext(supabase, userId, { regionHint: options?.regionHint });

    let seedGenreIds = null;
    let seedMediaType = mediaType;
    if (seedTmdbId) {
        const { data: seedRow } = await supabase
            .from('movies_library')
            .select('genres, genre_ids, media_type, mood_tags')
            .eq('tmdb_id', String(seedTmdbId))
            .maybeSingle();
        if (seedRow) {
            seedGenreIds = extractGenreIds(seedRow);
            seedMediaType = seedRow.media_type || mediaType || 'movie';
        }
    }

    let candidates = await fetchCandidateMovies(supabase, context, {
        mediaType: seedTmdbId ? (seedMediaType || mediaType) : mediaType,
        candidateLimit,
        seedTmdbId,
        seedMediaType,
        useEmbeddingPool: !seedTmdbId,
        includeGemPool: !seedTmdbId && (
            options.includeGemPool === true
            || String(cacheKey).startsWith('for_you')
        ),
        maxImport: options.maxImport ?? 30,
    });

    // Keep "Because you loved X" on-theme: drop titles that don't share a core genre.
    if (seedTmdbId && seedGenreIds?.length) {
        const gated = candidates.filter((m) => passesSeedGenreGate(seedGenreIds, m));
        if (gated.length >= Math.min(limit, 4)) {
            candidates = gated;
        } else if (gated.length) {
            candidates = gated;
        }
        // Prefer same media type as the seed (movie→movie), with soft fallback.
        const sameType = candidates.filter(
            (m) => !seedMediaType || (m.media_type || 'movie') === seedMediaType,
        );
        if (sameType.length >= Math.min(limit, 4)) {
            candidates = sameType;
        }
    }

    const filterResult = await prepareCandidates(supabase, candidates, context, {
        requireOtt,
        excludeRated,
        maxRuntime,
        familyOnly,
        minFamilyScore,
    }, Math.min(limit, 8));
    candidates = filterResult.items;

    let items = await scoreAndRankMovies(supabase, candidates, context, {
        limit,
        seedGenreIds: seedTmdbId ? seedGenreIds : null,
        skipDiversity: !!seedTmdbId,
    });

    // Optional LLM polish — never block Watch rails. Hard budget so Vercel
    // cold starts + Mistral/Gemini latency cannot empty the page.
    let personalMessage = null;
    if (useLlm && !seedTmdbId && isLlmEnabled()) {
        const LLM_BUDGET_MS = 3500;
        try {
            await Promise.race([
                (async () => {
                    items = await applyLlmRerank(context.profile, items);
                    try {
                        personalMessage = await generateRecoMessage({
                            name: context.userName,
                            tasteSummary: context.profile.taste_summary,
                            topGenres: topGenreIds(context.profile.genre_weights, 3)
                                .map((id) => GENRE_NAMES[id]).filter(Boolean),
                            sampleTitles: items.slice(0, 3).map((m) => m.title || m.name).filter(Boolean),
                        });
                    } catch (err) {
                        console.warn('[reco] personal message failed:', err.message);
                    }
                })(),
                new Promise((resolve) => setTimeout(resolve, LLM_BUDGET_MS)),
            ]);
        } catch (err) {
            console.warn('[reco] llm polish skipped:', err.message);
        }
    }

    const payload = {
        cacheKey,
        generatedAt: new Date().toISOString(),
        items,
        meta: {
            count: items.length,
            candidatePool: candidates.length,
            hasUserEmbedding: !!context.userEmbedding,
            ottFiltered: requireOtt && context.providerIds.length > 0 && !filterResult.relaxed.includes('ott'),
            relaxedFilters: filterResult.relaxed,
            region: context.region,
            hasServices: context.providerIds.length > 0,
            onYourServicesCount: items.filter((m) => m.onYourServices?.length).length,
            llmRanked: useLlm && !seedTmdbId && isLlmEnabled() && items.some((m) => m.llmRanked),
            message: personalMessage,
            seedTmdbId: seedTmdbId || null,
            seedGenreGate: !!seedTmdbId,
        },
    };

    await writeCache(supabase, userId, cacheKey, payload, ttlHours);

    return { ...payload, fromCache: false };
}

/**
 * One Perfect Movie Tonight — a single, high-confidence pick that's stable for
 * the whole day (cache key is date-stamped, 24h TTL). Reduces decision fatigue.
 */
export async function getOnePerfectMovie(userId, options = {}) {
    const day = new Date().toISOString().split('T')[0];
    const result = await getRecommendations(userId, `perfect_v2_${day}`, {
        // Tonight's single pick should be something you can stream now.
        requireOtt: true,
        excludeRated: true,
        limit: 1,
        candidateLimit: 150,
        ttlHours: 24,
        ...options,
        // Deterministic by default — LLM polish is opt-in (same as For You / Tonight).
        useLlm: options?.useLlm === true,
    });
    return {
        day,
        movie: result.items?.[0] || null,
        message: result.meta?.message || null,
        fromCache: result.fromCache,
        generatedAt: result.generatedAt,
    };
}

// ---- Discovery Feed sections -------------------------------------------------

async function cachedSection(userId, baseKey, builder, ttl = CACHE_TTL_HOURS, regionHint = null) {
    const cacheKey = regionHint ? `${baseKey}_${regionHint}` : baseKey;
    const supabase = getSupabaseAdmin();
    const cached = await readCache(supabase, userId, cacheKey);
    if (cached?.items?.length) {
        const filtered = await filterCachedPayload(supabase, userId, cached);
        if ((filtered.items?.length || 0) >= 4) return { ...filtered, fromCache: true };
    }
    const payload = await builder(supabase);
    if (payload?.items?.length) await writeCache(supabase, userId, cacheKey, payload, ttl);
    return { ...payload, fromCache: false };
}

/** "Because you loved X" — similar to the user's single highest-rated title. */
export async function getBecauseYouLoved(userId, options = {}) {
    const supabase = getSupabaseAdmin();
    const [
        { data: ratings },
        { data: likes },
    ] = await Promise.all([
        supabase.from('ratings').select('*').eq('user_id', userId)
            .order('updated_at', { ascending: false }).limit(60),
        supabase.from('user_liked_movies').select('movie_id, media_type, liked_at')
            .eq('user_id', userId)
            .order('liked_at', { ascending: false }).limit(20),
    ]);

    // Prefer a recent high score, then fall back to a recent like.
    let seed = null;
    let seedMediaType = null;
    let best = 0;
    const recentHigh = (ratings || []).slice(0, 15);
    recentHigh.forEach((r) => {
        const o = computeOverallFromRatingRow(r);
        if (o != null && o >= 7 && o > best) {
            best = o;
            seed = String(r.movie_id);
            seedMediaType = 'movie';
        }
    });

    // Sometimes prefer the most recent loved title over the all-time highest score.
    if ((ratings || []).length && Math.random() < 0.45) {
        const recent = recentHigh.find((r) => {
            const o = computeOverallFromRatingRow(r);
            return o != null && o >= 7;
        });
        if (recent) {
            seed = String(recent.movie_id);
            seedMediaType = 'movie';
            best = computeOverallFromRatingRow(recent) || best;
        }
    }

    if ((!seed || best < 7) && likes?.length) {
        seed = String(likes[0].movie_id);
        seedMediaType = likes[0].media_type === 'tv' ? 'tv' : 'movie';
        best = 8;
    }

    if (!seed || best < 7) return null;

    const { data: seedMovie } = await supabase
        .from('movies_library')
        .select('title, genres, genre_ids, media_type')
        .eq('tmdb_id', seed)
        .maybeSingle();

    const res = await getSimilarRecommendations(userId, seed, {
        regionHint: options.regionHint,
        limit: options.limit || 18,
        excludeRated: true,
        mediaType: seedMovie?.media_type || seedMediaType || null,
    });
    return {
        ...res,
        seedTitle: seedMovie?.title || null,
        heading: seedMovie?.title ? `Because you loved ${seedMovie.title}` : 'Because you loved',
    };
}

/** "Hidden Gems You Missed" — TMDB Discover + library gems, scored to taste. */
export async function getHiddenGems(userId, options = {}) {
    return cachedSection(userId, 'hidden_gems_v3', async (supabase) => {
        const context = await loadUserContext(supabase, userId, { regionHint: options?.regionHint });
        const limit = options.limit || 18;

        const [libPoolRes, tmdbGems] = await Promise.all([
            supabase
                .from('movies_library').select(RECO_MOVIE_SELECT)
                .eq('is_active', true)
                .gte('vote_average', 7.3).gte('vote_count', 50).lte('popularity', 40)
                .order('vote_average', { ascending: false }).limit(options.candidateLimit || 200),
            fetchTasteGemIdsFromTmdb(context, {
                mediaType: options.mediaType || 'movie',
                limit: 80,
            }),
        ]);

        const idSet = new Set((libPoolRes.data || []).map((m) => String(m.tmdb_id)));
        tmdbGems.forEach((g) => idSet.add(String(g.tmdbId)));

        if (tmdbGems.length) {
            try {
                await ensureLibraryCardsForCandidates(
                    tmdbGems.slice(0, 40).map((g) => ({
                        id: g.tmdbId,
                        media_type: g.mediaType || 'movie',
                    })),
                    { maxImport: 25 },
                );
            } catch (err) {
                console.warn('[reco] hidden gems import:', err.message);
            }
        }

        const { data: hydrated } = await supabase
            .from('movies_library')
            .select(RECO_MOVIE_SELECT)
            .in('tmdb_id', Array.from(idSet).slice(0, 280));

        const pool = (hydrated || [])
            .map(normalizeLibraryItem)
            .filter((m) => {
                const pop = Number(m.popularity) || 0;
                const vote = Number(m.vote_average) || 0;
                return vote >= 7.2 && pop <= 45;
            });

        const { items: candidates } = await prepareCandidates(
            supabase, pool, context, { excludeRated: true }, 6);
        const items = await scoreAndRankMovies(supabase, candidates, context, {
            limit,
            skipDiversity: false,
        });
        return {
            cacheKey: 'hidden_gems_v3',
            heading: 'Hidden Gems You Missed',
            items,
            meta: { count: items.length },
        };
    }, CACHE_TTL_HOURS, options.regionHint || null);
}

/** "Underrated Masterpieces" — top-rated, modest reach. */
export async function getUnderratedMasterpieces(userId, options = {}) {
    return cachedSection(userId, 'underrated_v2', async (supabase) => {
        const context = await loadUserContext(supabase, userId, { regionHint: options?.regionHint });
        const { data: pool } = await supabase
            .from('movies_library').select(RECO_MOVIE_SELECT)
            .eq('is_active', true)
            .gte('vote_average', 8).gte('vote_count', 80).lte('popularity', 60)
            .order('vote_average', { ascending: false }).limit(options.candidateLimit || 200);

        const { items: candidates } = await prepareCandidates(
            supabase, (pool || []).map(normalizeLibraryItem), context, { excludeRated: true }, 6);
        const items = await scoreAndRankMovies(supabase, candidates, context, { limit: options.limit || 18 });
        return { cacheKey: 'underrated_v2', heading: 'Underrated Masterpieces', items, meta: { count: items.length } };
    }, CACHE_TTL_HOURS, options.regionHint || null);
}

/** "Outside Your Comfort Zone" — quality picks outside the user's top genres. */
export async function getOutsideComfortZone(userId, options = {}) {
    return cachedSection(userId, 'outside_comfort_v2', async (supabase) => {
        const context = await loadUserContext(supabase, userId, { regionHint: options?.regionHint });
        const dominant = topGenreIds(context.profile.genre_weights, 2);
        const { data: pool } = await supabase
            .from('movies_library').select(RECO_MOVIE_SELECT)
            .eq('is_active', true).gte('vote_average', 6.6)
            .order('popularity', { ascending: false, nullsFirst: false })
            .limit(options.candidateLimit || 300);

        const candidates = (pool || [])
            .map(normalizeLibraryItem)
            .filter((m) => {
                const ids = extractGenreIds(m);
                return ids.length && !ids.some((id) => dominant.includes(String(id)));
            });

        const { items: filtered } = await prepareCandidates(supabase, candidates, context, { excludeRated: true }, 6);
        let items = await scoreAndRankMovies(supabase, filtered, context, { limit: options.limit || 18 });
        items = items.map((m) => ({ ...m, reason: 'A fresh pick to broaden your taste.' }));
        return { cacheKey: 'outside_comfort_v2', heading: 'Outside Your Comfort Zone', items, meta: { count: items.length } };
    }, CACHE_TTL_HOURS, options.regionHint || null);
}

export async function getForYouRecommendations(userId, options = {}) {
    return getRecommendations(userId, 'for_you_v4', {
        requireOtt: options?.ottMode !== false,
        // seenIds always excludes watched/logged/liked/rated; excludeRated is redundant.
        excludeRated: true,
        includeGemPool: true,
        ...options,
        // Watch list rails stay deterministic on Vercel (LLM optional opt-in only).
        useLlm: options?.useLlm === true,
    });
}

export async function getTonightRecommendations(userId, options = {}) {
    return getRecommendations(userId, 'tonight_v2', {
        requireOtt: true,
        excludeRated: true,
        maxRuntime: 120,
        mediaType: options?.mediaType || 'movie',
        ...options,
        useLlm: options?.useLlm === true,
    });
}

export async function getFamilyRecommendations(userId, options) {
    return getRecommendations(userId, 'family_v2', {
        familyOnly: true,
        minFamilyScore: 7,
        requireOtt: options?.ottMode !== false,
        ...options,
    });
}

export async function getSimilarRecommendations(userId, tmdbId, options) {
    // Cache key v2 busts stale pools that mixed popular off-genre titles into seed rows.
    return getRecommendations(userId, `similar_v3_${tmdbId}`, {
        seedTmdbId: tmdbId,
        excludeRated: options?.excludeRated ?? true,
        requireOtt: options?.ottMode === true,
        candidateLimit: 80,
        useLlm: false,
        ...options,
    });
}

// Mood-based discovery — genre-first, mood-scored (not "For You" taste ranking).
// - genres: TMDB discover + hard require (at least one)
// - withoutGenres: block off-mood genres (e.g. horror in Feel Good)
// - requireGenres: must have ALL of these (Date Night → Romance)
// - tags / vibeKeys: boost when library mood_tags / custom_vibes match
export const MOOD_CONFIG = {
    mind_bending: {
        label: 'Mind Bending',
        genres: [878, 9648],
        withoutGenres: [10751, 16],
        tags: ['mind_bending', 'thoughtful'],
        vibeKeys: ['thoughtful'],
    },
    dark_thriller: {
        label: 'Dark Thriller',
        genres: [53],
        withoutGenres: [10751, 16, 35, 10749],
        tags: ['dark', 'intense', 'suspenseful'],
        vibeKeys: ['intense', 'thrilling'],
    },
    feel_good: {
        label: 'Feel Good',
        genres: [35, 10751],
        withoutGenres: [27, 53, 80, 10752],
        tags: ['feel_good', 'cozy', 'funny'],
        vibeKeys: ['funny'],
    },
    emotional: {
        label: 'Emotional',
        genres: [18],
        withoutGenres: [27, 28, 53],
        tags: ['emotional'],
        vibeKeys: ['emotional'],
    },
    date_night: {
        label: 'Date Night',
        genres: [10749],
        requireGenres: [10749],
        withoutGenres: [27, 53, 80],
        tags: ['romantic', 'feel_good'],
        vibeKeys: ['romantic'],
    },
    action_packed: {
        label: 'Action Packed',
        genres: [28],
        withoutGenres: [10751, 16, 10749],
        tags: ['action_packed', 'intense'],
        vibeKeys: ['intense', 'thrilling'],
    },
    family_night: {
        label: 'Family Night',
        genres: [10751, 16],
        withoutGenres: [27, 53, 80, 10752],
        tags: ['family_friendly', 'feel_good'],
        vibeKeys: ['funny'],
    },
    crime_mystery: {
        label: 'Crime Mystery',
        genres: [80, 9648],
        withoutGenres: [10751, 16, 10749],
        tags: ['suspenseful', 'dark'],
        vibeKeys: ['thrilling', 'thoughtful'],
    },
    horror_night: {
        label: 'Horror Night',
        genres: [27],
        withoutGenres: [10751, 16, 10749],
        tags: ['dark', 'intense'],
        vibeKeys: ['intense', 'thrilling'],
    },
    comedy_night: {
        label: 'Comedy Night',
        genres: [35],
        withoutGenres: [27, 53, 80, 10752],
        tags: ['funny', 'feel_good'],
        vibeKeys: ['funny'],
    },
    sci_fi: {
        label: 'Sci-Fi',
        genres: [878],
        withoutGenres: [10751, 16],
        tags: ['mind_bending', 'thoughtful'],
        vibeKeys: ['thoughtful', 'thrilling'],
    },
    epic_fantasy: {
        label: 'Epic Fantasy',
        genres: [14],
        withoutGenres: [27, 99],
        tags: ['mind_bending', 'feel_good'],
        vibeKeys: ['thoughtful', 'thrilling'],
    },
    adventure: {
        label: 'Adventure',
        genres: [12],
        withoutGenres: [27, 99],
        tags: ['action_packed', 'feel_good'],
        vibeKeys: ['thrilling'],
    },
    animation: {
        label: 'Animation',
        genres: [16],
        withoutGenres: [27, 53, 80],
        tags: ['family_friendly', 'feel_good'],
        vibeKeys: ['funny'],
    },
    documentary: {
        label: 'Documentary',
        genres: [99],
        withoutGenres: [27, 16],
        tags: ['thoughtful'],
        vibeKeys: ['thoughtful', 'emotional'],
    },
    war_history: {
        label: 'War & History',
        genres: [10752, 36],
        withoutGenres: [16, 10751, 10749],
        tags: ['intense', 'emotional'],
        vibeKeys: ['intense', 'emotional'],
    },
};

/** True if title fits the mood genre rules (require + any + excludes). */
function movieMatchesMoodGenres(movie, config, { softSecondary = false } = {}) {
    const ids = extractGenreIds(movie).map(Number);
    if (!ids.length) return false;

    const required = config.requireGenres || [];
    if (required.length && !required.every((g) => ids.includes(g))) return false;

    const allowed = config.genres || [];
    if (allowed.length && !ids.some((id) => allowed.includes(id))) return false;

    const banned = config.withoutGenres || [];
    if (!banned.length) return true;

    // Family + Animation are hard off-mood when listed (never for Family Night itself).
    const HARD = new Set([10751, 16]);
    const hardBanned = banned.filter((g) => HARD.has(g));
    const softBanned = banned.filter((g) => !HARD.has(g));

    if (hardBanned.some((g) => ids.includes(g))) return false;

    if (!softSecondary) {
        return !softBanned.some((g) => ids.includes(g));
    }

    // Soft: allow Comedy/Romance/etc. as secondary only if a mood genre ranks
    // higher (earlier) in TMDB genre_ids — keeps Action Packed actually action-led.
    const moodIdx = Math.min(
        ...allowed.map((g) => {
            const i = ids.indexOf(g);
            return i === -1 ? 999 : i;
        }),
    );
    for (const g of softBanned) {
        const bi = ids.indexOf(g);
        if (bi === -1) continue;
        if (bi <= moodIdx) return false;
    }
    return true;
}

/**
 * 0–1 mood fitness: genre hits + mood_tags + custom_vibes.
 * Primary sort for mood rows (taste is only a light tiebreaker).
 */
function moodFitnessScore(config, movie) {
    const ids = extractGenreIds(movie).map(Number);
    const allowed = config.genres || [];
    const genreHits = allowed.filter((g) => ids.includes(g)).length;
    const genreScore = allowed.length
        ? Math.min(1, genreHits / Math.max(1, Math.min(allowed.length, 2)))
        : 0.5;
    // Prefer titles whose lead TMDB genre is the mood genre (accuracy signal).
    const primaryBoost = allowed.length && allowed.includes(ids[0]) ? 0.2 : 0;

    const tags = Array.isArray(movie.mood_tags) ? movie.mood_tags : [];
    const wantTags = config.tags || [];
    const tagHits = wantTags.filter((t) => tags.includes(t)).length;
    const tagScore = wantTags.length ? Math.min(1, tagHits / wantTags.length) : 0;

    const vibes = movie.custom_vibes && typeof movie.custom_vibes === 'object'
        ? movie.custom_vibes
        : {};
    const vibeKeys = config.vibeKeys || [];
    let vibeScore = 0;
    if (vibeKeys.length) {
        const vals = vibeKeys.map((k) => Number(vibes[k]) || 0);
        const avg = vals.reduce((a, b) => a + b, 0) / vibeKeys.length;
        vibeScore = Math.min(1, avg / 70);
    }

    return Math.min(1, genreScore * 0.5 + primaryBoost + tagScore * 0.2 + vibeScore * 0.15);
}

/** Hard without-genres for TMDB discover (Family/Animation when mood excludes them). */
function hardWithoutGenres(config) {
    const HARD = new Set([10751, 16]);
    return (config.withoutGenres || []).filter((g) => HARD.has(g));
}

/** Pull popular titles that match the mood genre rules from TMDB Discover. */
async function fetchMoodPoolFromTmdb(config, {
    pages = 3,
    mediaType = 'movie',
    providerIds = [],
    watchRegion = DEFAULT_REGION,
    strictWithout = true,
    knownAvailable = null,
} = {}) {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const out = [];
    const withGenres = (config.requireGenres?.length
        ? config.requireGenres
        : config.genres).join('|');
    const ids = (providerIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    const hasProvider = ids.length > 0;
    const without = strictWithout
        ? (config.withoutGenres || [])
        : hardWithoutGenres(config);

    for (let page = 1; page <= pages; page += 1) {
        let data;
        try {
            const params = {
                with_genres: withGenres,
                sort_by: 'popularity.desc',
                'vote_count.gte': hasProvider ? '25' : '80',
                include_adult: 'false',
                page: String(page),
            };
            // Always ask TMDB to exclude off-mood genres for accuracy.
            if (without.length) {
                params.without_genres = without.join(',');
            }
            if (hasProvider) {
                params.with_watch_providers = ids.join('|');
                params.watch_region = watchRegion || DEFAULT_REGION;
                params.with_watch_monetization_types = 'flatrate|free|ads';
            }
            // eslint-disable-next-line no-await-in-loop
            data = await fetchTmdbApi(`/discover/${type}`, params);
        } catch (err) {
            console.warn('mood tmdb discover failed:', err.message);
            break;
        }
        (data?.results || []).forEach((m) => {
            const genreIds = (m.genre_ids || []).map(Number);
            const card = {
                tmdb_id: String(m.id),
                id: String(m.id),
                title: m.title || m.name,
                poster_path: m.poster_path,
                backdrop_path: m.backdrop_path || null,
                media_type: type,
                release_date: type === 'movie' ? m.release_date : m.first_air_date,
                first_air_date: type === 'tv' ? m.first_air_date : null,
                runtime: null,
                vote_average: m.vote_average ?? null,
                vote_count: m.vote_count ?? null,
                popularity: m.popularity ?? 0,
                genre_ids: genreIds,
                genres: genreIds.map((gid) => ({ id: gid })),
                streaming_platforms: [],
                certification: null,
                custom_parent_guide: null,
                mood_tags: [],
                custom_vibes: null,
                family_score: null,
                movie_dna: {},
                overview: m.overview || null,
                _fromProviderDiscover: hasProvider,
            };
            // Enforce genre accuracy on every discover hit (soft secondary for OTT).
            if (!movieMatchesMoodGenres(card, config, { softSecondary: hasProvider })) return;
            if (hasProvider && knownAvailable) knownAvailable.set(card.tmdb_id, ids);
            out.push(card);
        });
        if (page >= (data?.total_pages || 1)) break;
    }
    return out;
}

/** Library titles that match mood genres (tags alone are not enough). */
async function fetchMoodPoolFromLibrary(supabase, config, { limit = 200 } = {}) {
    const { data: rows } = await supabase
        .from('movies_library')
        .select(`${RECO_MOVIE_SELECT}, custom_vibes`)
        .eq('is_active', true)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(Math.min(800, Math.max(limit * 3, 300)));

    const matched = [];
    for (const row of rows || []) {
        const m = normalizeLibraryItem(row);
        if (row.custom_vibes) m.custom_vibes = row.custom_vibes;
        if (!movieMatchesMoodGenres(m, config, { softSecondary: false })) continue;
        matched.push(m);
        if (matched.length >= limit) break;
    }
    return matched;
}

function mergeMoodPools(primary, secondary) {
    const seen = new Set();
    const out = [];
    for (const m of [...primary, ...secondary]) {
        const id = String(m.tmdb_id ?? m.id);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(m);
    }
    return out;
}

export async function getMoodRecommendations(userId, moodId, options = {}) {
    const config = MOOD_CONFIG[moodId];
    if (!config) {
        const err = new Error(`Unknown mood: ${moodId}`);
        err.statusCode = 400;
        throw err;
    }

    const supabase = getSupabaseAdmin();
    const explicitProvider = options.providerId != null && options.providerId !== ''
        ? Number(options.providerId)
        : null;
    const hasExplicitProvider = Number.isFinite(explicitProvider) && explicitProvider > 0;
    const wantMyOtt = !hasExplicitProvider && options.ottMode === true;
    const regionOverride = normalizeRegion(options.watchRegion);
    const ottKey = hasExplicitProvider ? `p${explicitProvider}` : (wantMyOtt ? 'my' : 'any');
    // v7: real provider data + the user's own region/services.
    const cacheKey = `mood_v8_${moodId}_${ottKey}_${regionOverride || options.regionHint || 'home'}`;
    const limit = Math.min(24, Math.max(1, Number(options.limit) || 12));

    if (!options.refresh) {
        const cached = await readCache(supabase, userId, cacheKey);
        if (cached?.items?.length) {
            const filtered = await filterCachedPayload(supabase, userId, cached);
            if ((filtered.items?.length || 0) >= Math.min(limit, 4)) return { ...filtered, fromCache: true };
        }
    }

    const context = await loadUserContext(supabase, userId, { regionHint: options?.regionHint });
    const watchRegion = regionOverride || context.region || DEFAULT_REGION;
    const providerIds = hasExplicitProvider
        ? [explicitProvider]
        : (wantMyOtt ? (context.providerIds || []) : []);
    const hasProvider = providerIds.length > 0;
    // Mood rows filter on the chosen provider(s), in the chosen region. With
    // "Any OTT" the user's own services still drive the "on your services" badge.
    const moodContext = {
        ...context,
        providerIds: hasProvider ? providerIds : (context.providerIds || []),
        region: watchRegion,
    };
    const knownAvailable = new Map();

    const mediaType = options.mediaType === 'tv' || options.mediaType === 'movie'
        ? options.mediaType
        : null;
    const discoverPages = hasProvider ? 5 : 3;

    const discoverOpts = (type, strictWithout) => ({
        pages: type === 'tv' ? Math.max(2, discoverPages - 1) : discoverPages,
        mediaType: type,
        providerIds,
        watchRegion,
        strictWithout,
        knownAvailable,
    });

    const runDiscover = async (strictWithout) => {
        const jobs = mediaType
            ? [fetchMoodPoolFromTmdb(config, discoverOpts(mediaType, strictWithout))]
            : [
                fetchMoodPoolFromTmdb(config, discoverOpts('movie', strictWithout)),
                fetchMoodPoolFromTmdb(config, discoverOpts('tv', strictWithout)),
            ];
        return (await Promise.all(jobs)).flat();
    };

    // Pass 1: full genre excludes. Pass 2 (OTT only): hard excludes if the pool is thin.
    let tmdbPool = await runDiscover(true);
    if (hasProvider && tmdbPool.length < Math.min(8, limit)) {
        tmdbPool = mergeMoodPools(tmdbPool, await runDiscover(false));
    }

    const libPool = await fetchMoodPoolFromLibrary(supabase, config, { limit: 240 });
    const discoverIds = new Set(tmdbPool.map((m) => String(m.tmdb_id)));
    let pool = mergeMoodPools(tmdbPool, libPool);

    // Enrich Discover hits with library metadata (mood tags, family score, runtime…).
    if (pool.length) {
        const ids = pool.map((m) => m.tmdb_id).slice(0, 280);
        const { data: libRows } = await supabase
            .from('movies_library')
            .select('tmdb_id, media_type, movie_dna, streaming_platforms, mood_tags, custom_vibes, family_score, certification, custom_parent_guide, runtime, genre_ids, genres, release_date, first_air_date')
            .in('tmdb_id', ids);
        const byKey = new Map((libRows || []).map((r) => [`${r.media_type || 'movie'}:${r.tmdb_id}`, r]));
        pool = pool.map((m) => {
            const lib = byKey.get(`${m.media_type || 'movie'}:${m.tmdb_id}`);
            if (!lib) return m;
            const fromDiscover = discoverIds.has(String(m.tmdb_id));
            return {
                ...m,
                ...Object.fromEntries(Object.entries(lib).filter(([, v]) => v != null)),
                // TMDB Discover genres are the freshest source of truth.
                genre_ids: fromDiscover && m.genre_ids?.length ? m.genre_ids : (lib.genre_ids || m.genre_ids),
                genres: fromDiscover && m.genres?.length ? m.genres : (lib.genres || m.genres),
                release_date: m.release_date || lib.release_date || lib.first_air_date || null,
            };
        });
    }

    // Genre gate — every title must match mood genres (soft secondary only for OTT).
    pool = pool.filter((m) => movieMatchesMoodGenres(m, config, { softSecondary: hasProvider }));

    // Seen titles are always excluded — including single-service mood rows.
    const filterResult = await prepareCandidates(supabase, pool, moodContext, {
        requireOtt: hasProvider,
        excludeRated: true,
        familyOnly: moodId === 'family_night',
    }, hasProvider ? 1 : Math.min(limit, 8), { maxFetch: 36, knownAvailable });

    let finalCandidates = filterResult.items;
    if (hasProvider && filterResult.relaxed.includes('ott')) {
        // Never pass off titles from other services as "on Netflix".
        finalCandidates = finalCandidates.filter((m) => m.onYourServices?.length);
    }

    const moodGenreLabel = (() => {
        const map = {
            28: 'Action', 53: 'Thriller', 35: 'Comedy', 18: 'Drama', 27: 'Horror',
            878: 'Sci-Fi', 10749: 'Romance', 80: 'Crime', 9648: 'Mystery',
            10751: 'Family', 16: 'Animation', 14: 'Fantasy',
        };
        const g = (config.genres || [])[0];
        return map[g] || config.label;
    })();

    const maxPop = finalCandidates.length
        ? Math.max(...finalCandidates.map((m) => Number(m.popularity) || 0), 1)
        : 1;
    const scored = finalCandidates.map((movie) => {
        const fitness = moodFitnessScore(config, movie);
        const taste = genreMatchScore(context.profile?.genre_weights, movie);
        const pop = popularityScore(movie.popularity, maxPop);
        const ids = extractGenreIds(movie).map(Number);
        const primaryIsMood = (config.genres || []).includes(ids[0]);
        const finalScore = fitness * 0.78 + taste * 0.1 + pop * 0.1 + freshnessBonus(movie) * 0.33;
        const tagHit = (config.tags || []).find((t) => (movie.mood_tags || []).includes(t));
        const base = primaryIsMood
            ? `${moodGenreLabel} · ${config.label}`
            : (tagHit && MOOD_LABELS[tagHit]
                ? `A ${MOOD_LABELS[tagHit]} ${config.label.toLowerCase()} pick`
                : `Matches ${config.label}`);
        return {
            ...movie,
            score: Math.round(finalScore * 1000) / 1000,
            scores: { mood: fitness, genre: taste, popularity: pop },
            reason: base,
        };
    });

    scored.sort((a, b) => {
        const aIds = extractGenreIds(a).map(Number);
        const bIds = extractGenreIds(b).map(Number);
        const aPrimary = (config.genres || []).includes(aIds[0]) ? 1 : 0;
        const bPrimary = (config.genres || []).includes(bIds[0]) ? 1 : 0;
        return (bPrimary - aPrimary)
            || (b.score - a.score)
            || ((Number(b.popularity) || 0) - (Number(a.popularity) || 0))
            || (Number(a.tmdb_id) - Number(b.tmdb_id));
    });

    const items = scored.slice(0, limit).map((m) => toPublicItem(m));

    const payload = {
        cacheKey,
        mood: moodId,
        moodLabel: config.label,
        generatedAt: new Date().toISOString(),
        items,
        meta: {
            count: items.length,
            candidatePool: finalCandidates.length,
            moodFirst: true,
            genreAccurate: true,
            ott: ottKey,
            providerId: hasExplicitProvider ? explicitProvider : null,
            region: watchRegion,
            noServices: wantMyOtt && !hasProvider,
            tmdbPool: tmdbPool.length,
        },
    };

    if (items.length) {
        await writeCache(supabase, userId, cacheKey, payload);
    }
    return { ...payload, fromCache: false };
}

/**
 * "Trending for your taste" — live TMDB trending (this week), personalised.
 * Library popularity goes stale between syncs, so the live list leads and the
 * library only backfills.
 */
export async function getTrendingPersonalized(userId, options = {}) {
    const supabase = getSupabaseAdmin();
    const context = await loadUserContext(supabase, userId, { regionHint: options?.regionHint });
    const mediaType = options.mediaType === 'tv' || options.mediaType === 'movie'
        ? options.mediaType
        : null;
    const limit = options.limit || 24;
    const types = mediaType ? [mediaType] : ['movie', 'tv'];

    const lists = await Promise.all(types.flatMap((type) => [1, 2].map((page) => (
        fetchTmdbApi(`/trending/${type}/week`, { page: String(page) })
            .then((d) => (d?.results || []).map((m) => ({
                id: String(m.id),
                media_type: type,
                popularity: Number(m.popularity) || 0,
            })))
            .catch(() => [])
    ))));
    const live = lists.flat();
    const livePopularity = new Map(live.map((m) => [`${m.media_type}:${m.id}`, m.popularity]));

    if (live.length) {
        try {
            await ensureLibraryCardsForCandidates(live.slice(0, 60), { maxImport: 20 });
        } catch (err) {
            console.warn('[reco] trending import skipped:', err.message);
        }
    }

    const pool = [];
    const seen = new Set();
    const push = (row) => {
        const key = `${row.media_type || 'movie'}:${row.tmdb_id}`;
        if (seen.has(key)) return;
        seen.add(key);
        const m = normalizeLibraryItem(row);
        // Fresh popularity from TMDB beats the stored snapshot.
        if (livePopularity.has(key)) m.popularity = livePopularity.get(key);
        pool.push(m);
    };

    if (live.length) {
        const { data: liveRows } = await supabase
            .from('movies_library')
            .select(RECO_MOVIE_SELECT)
            .eq('is_active', true)
            .in('tmdb_id', [...new Set(live.map((m) => m.id))]);
        (liveRows || [])
            .filter((row) => livePopularity.has(`${row.media_type || 'movie'}:${row.tmdb_id}`))
            .forEach(push);
    }

    if (pool.length < limit * 2) {
        let query = supabase
            .from('movies_library')
            .select(RECO_MOVIE_SELECT)
            .eq('is_active', true)
            .lte('release_date', todayIso())
            .order('popularity', { ascending: false, nullsFirst: false })
            .limit(options.candidateLimit || 60);
        if (mediaType) query = query.eq('media_type', mediaType);
        const { data: libRows, error } = await query;
        if (error) throw new Error(error.message);
        (libRows || []).forEach(push);
    }

    const { items: candidates } = await prepareCandidates(
        supabase,
        pool,
        context,
        { requireOtt: options.ottMode !== false },
        Math.min(limit, 8),
    );

    const items = await scoreAndRankMovies(supabase, candidates, context, { limit });

    return {
        cacheKey: 'trending_personalized',
        generatedAt: new Date().toISOString(),
        items,
        meta: {
            count: items.length,
            candidatePool: candidates.length,
            live: live.length > 0,
            region: context.region,
            hasServices: context.providerIds.length > 0,
        },
        fromCache: false,
    };
}

// ---- Phase 4: "Tonight" — 3 taps in, exactly 3 picks out -----------------

const TONIGHT_SHORTLIST = 20;
const TONIGHT_PICKS = 3;

const TonightPicksSchema = z.object({
    picks: z.array(z.object({
        tmdbId: z.number().int().positive(),
        why: z.string().min(3).max(240),
    })).min(1).max(TONIGHT_PICKS),
});

// JSON Schema for OpenAI structured output (strict mode).
const TONIGHT_JSON_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['picks'],
    properties: {
        picks: {
            type: 'array',
            minItems: TONIGHT_PICKS,
            maxItems: TONIGHT_PICKS,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['tmdbId', 'why'],
                properties: {
                    tmdbId: { type: 'integer', description: 'Must be one of the candidate ids' },
                    why: { type: 'string', description: 'One line (max ~20 words) on why this fits them tonight' },
                },
            },
        },
    },
};

function runtimeLabel(min) {
    const m = Number(min);
    if (!m) return null;
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** Template "why" when the LLM is unavailable or returns invalid ids. */
function templateWhy(movie, context, tonight) {
    const genreNames = genreIdsOf(movie).map((id) => GENRE_NAMES[id]).filter(Boolean);
    const topTaste = topGenreIds(context.profile?.genre_weights, 3).map((id) => GENRE_NAMES[id]).filter(Boolean);
    const shared = genreNames.find((g) => topTaste.includes(g));
    const mood = TONIGHT_MOODS[tonight.mood];
    const where = movie.onYourServices?.find((p) => p.name)?.name;
    const parts = [];
    if (shared) parts.push(`Fits your love of ${shared}`);
    else if (movie.scores?.similarity >= 0.7) parts.push('Close to the films you loved');
    else parts.push(`A strong ${genreNames[0] || 'film'} pick`);
    if (tonight.mood !== 'any' && mood) parts.push(`${mood.label.toLowerCase()} for tonight`);
    if (where) parts.push(`on ${where}`);
    return `${parts.join(', ')}.`;
}

/**
 * Tonight-specific pool: Discover on the user's services (or region) in the
 * mood's genres, without banned genres, under the time cap. Guarantees enough
 * watchable, on-mood options for the taste ranking to choose from.
 */
async function tonightDiscoverPool(context, { moodDef, banned, runtimeCap, family = false }) {
    const providerIds = context.providerIds || [];
    const base = {
        watch_region: context.region || DEFAULT_REGION,
        with_watch_monetization_types: 'flatrate|free|ads',
        'vote_count.gte': '100',
        include_adult: 'false',
        sort_by: 'popularity.desc',
    };
    if (providerIds.length) base.with_watch_providers = providerIds.join('|');
    if (moodDef.fits?.length) base.with_genres = moodDef.fits.join('|');
    if (banned.size) base.without_genres = [...banned].join(',');
    if (runtimeCap) base['with_runtime.lte'] = String(runtimeCap);
    // Family: let TMDB filter by US rating (within the user's family cap) and
    // stamp it on the card so the family filter can verify it.
    let familyCert = null;
    if (family) {
        const capRank = context.profile?.family_max_certification ? certRank(context.profile.family_max_certification) : 3;
        familyCert = capRank <= 0 ? 'G' : capRank <= 2 ? 'PG' : 'PG-13';
        base.certification_country = 'US';
        base['certification.lte'] = familyCert;
    }
    if (context.prefs?.languages?.length && context.prefs.dealbreakers?.includes('subtitles')) {
        base.with_original_language = context.prefs.languages.join('|');
    }
    const pages = await Promise.all([1, 2, 3].map((page) => fetchTmdbApi('/discover/movie', { ...base, page: String(page) })
        .catch(() => null)));
    return pages.flatMap((d) => d?.results || []).map((m) => ({
        tmdb_id: String(m.id), id: String(m.id), media_type: 'movie',
        title: m.title, poster_path: m.poster_path || null, backdrop_path: m.backdrop_path || null,
        release_date: m.release_date || null, vote_average: m.vote_average ?? null, vote_count: m.vote_count ?? null,
        popularity: m.popularity ?? 0, genre_ids: (m.genre_ids || []).map(Number),
        genres: (m.genre_ids || []).map((id) => ({ id })), original_language: m.original_language || null,
        overview: m.overview || null, runtime: null, streaming_platforms: [], mood_tags: [], movie_dna: {},
        certification: familyCert, _lite: true, _embeddingSimilarity: 0.4,
    }));
}

/** Fill runtime/genres for TMDB-only candidates near the top (cached TMDB calls). */
async function fillRuntimes(movies) {
    const lite = movies.filter((m) => !Number(m.runtime));
    await Promise.all(lite.map(async (m) => {
        try {
            const d = await fetchTmdbApi(`/movie/${m.tmdb_id}`);
            if (d?.runtime) m.runtime = d.runtime;
            if (d?.genres?.length && !m.genres?.[0]?.name) m.genres = d.genres;
            if (d?.overview && !m.overview) m.overview = d.overview;
        } catch { /* keep unknown */ }
    }));
}

function genreIdsOf(movie) {
    if (Array.isArray(movie?.genre_ids) && movie.genre_ids.length) return movie.genre_ids.map(Number);
    return (movie?.genres || []).map((g) => Number(g?.id ?? g)).filter(Boolean);
}

/**
 * @param {string} userId
 * @param {{ mood?: string, minutes?: number, company?: string, regionHint?: string }} options
 * @returns {Promise<{ picks: Array, meta: object }>}
 */
export async function getTonightPicks(userId, options = {}) {
    const supabase = getSupabaseAdmin();
    const mood = TONIGHT_MOODS[options.mood] ? options.mood : 'any';
    const company = TONIGHT_COMPANY[options.company] ? options.company : 'solo';
    const minutesRaw = Number(options.minutes);
    const minutes = Number.isFinite(minutesRaw) && minutesRaw >= 60 ? Math.min(minutesRaw, 300) : null;

    const loaded = await loadUserContext(supabase, userId, { regionHint: options.regionHint });
    // The "who's watching" tap decides family filtering here, not the global
    // family-mode setting (otherwise "with partner" silently goes family-safe).
    const context = { ...loaded, profile: { ...loaded.profile, family_mode_enabled: company === 'family' } };
    const tonight = { mood, company, minutes: minutes || undefined, pattern: context.prefs?.pattern };

    let candidates = await fetchCandidateMovies(supabase, context, {
        mediaType: 'movie',
        candidateLimit: 200,
        useEmbeddingPool: true,
        includeGemPool: false,
        maxImport: 20,
    });

    // Hard filters: seen, dealbreakers, on the user's services, a runtime cap with
    // a little slack ("No rush" = none), family-safe when watching with family.
    const runtimeCap = minutes && minutes < 240 ? minutes + 20 : null;
    const moodDef = TONIGHT_MOODS[mood];
    const companyDef = TONIGHT_COMPANY[company];
    const banned = new Set([...(companyDef.avoid || []), ...(moodDef.clashes || [])]);

    // Add on-service, on-mood titles straight from TMDB Discover.
    const tonightPool = await tonightDiscoverPool(context, { moodDef, banned, runtimeCap, family: company === 'family' });
    const known = context._knownAvailable || new Map();
    const have = new Set(candidates.map((c) => String(c.tmdb_id)));
    tonightPool.forEach((card) => {
        if ((context.providerIds || []).length) known.set(card.tmdb_id, context.providerIds.map(Number));
        if (!have.has(card.tmdb_id)) { have.add(card.tmdb_id); candidates.push(card); }
    });
    context._knownAvailable = known;
    const debug = process.env.RECO_DEBUG ? (...a) => console.log('[tonight]', ...a) : () => {};
    debug('pool', candidates.length, '(discover', tonightPool.length + ')');
    const { items: filtered, relaxed } = await prepareCandidates(supabase, candidates, context, {
        requireOtt: true,
        excludeRated: true,
        maxRuntime: runtimeCap,
        familyOnly: company === 'family',
    }, 12, { maxFetch: 120 });

    // The 3 taps are an explicit request: company "avoid" genres and mood clashes
    // are hard filters; the mood's own genres are required when enough remain.
    const allowed = filtered.filter((m) => !genreIdsOf(m).some((g) => banned.has(g)));
    const onMood = moodDef.fits?.length
        ? allowed.filter((m) => genreIdsOf(m).some((g) => moodDef.fits.includes(g)))
        : allowed;
    // Prefer titles that are purely on-mood (no diluting genre) when there are enough.
    const pureMood = onMood.filter((m) => !genreIdsOf(m).some((g) => (moodDef.dilutes || []).includes(g)));
    candidates = pureMood.length >= 8 ? pureMood : (onMood.length >= 6 ? onMood : allowed);
    debug('after filters', filtered.length, '| not banned', allowed.length, '| on mood', onMood.length, '| pure', pureMood.length, '| relaxed', relaxed);

    if (context.userVector) await attachVectors(supabase, candidates);
    let scored = scoreCandidates(candidates, context.userVector, tonight);

    // Real runtimes for the front-runners, then re-score so the time fit is honest.
    const front = scored.slice(0, 40);
    await fillRuntimes(front);
    const capped = runtimeCap ? scored.filter((m) => !Number(m.runtime) || Number(m.runtime) <= runtimeCap) : scored;
    scored = scoreCandidates(capped, context.userVector, tonight);

    const shortlist = mmrSelect(scored.slice(0, TONIGHT_SHORTLIST), TONIGHT_SHORTLIST);
    if (!shortlist.length) {
        return { picks: [], meta: { reason: 'no_candidates', mood, minutes, company, relaxed } };
    }
    const byId = new Map(shortlist.map((m) => [Number(m.tmdb_id), m]));

    // LLM chooses 3 of the shortlist (ids validated) and explains each in one line.
    let chosen = null;
    let llmUsed = false;
    if (isLlmEnabled()) {
        const topTaste = topGenreIds(context.profile?.genre_weights, 4).map((id) => GENRE_NAMES[id]).filter(Boolean);
        const prompt = [
            'You pick movies for one person tonight. Choose exactly 3 from the CANDIDATES list only — never suggest anything else.',
            'Prefer variety (not three of the same kind), the right length for their time, and their mood.',
            'For each, write one short line (max 20 words) on why it fits THEM tonight, referencing their taste. No spoilers.',
            '',
            `THEIR TASTE: ${context.profile?.taste_summary || `Loves ${topTaste.join(', ')}`}`,
            `TONIGHT: mood=${TONIGHT_MOODS[mood].label}; time=${minutes ? `${minutes} min` : 'no limit'}; watching=${TONIGHT_COMPANY[company].label}`,
            '',
            'CANDIDATES (JSON lines):',
            ...shortlist.map((m) => JSON.stringify({
                id: Number(m.tmdb_id),
                title: m.title,
                year: String(m.release_date || '').slice(0, 4),
                runtime: Number(m.runtime) || null,
                genres: genreIdsOf(m).map((g) => GENRE_NAMES[g]).filter(Boolean),
                overview: String(m.overview || '').slice(0, 220),
            })),
        ].join('\n');
        try {
            const out = await Promise.race([
                generateStructured(prompt, {
                    name: 'tonight_picks',
                    schema: TONIGHT_JSON_SCHEMA,
                    validate: (v) => TonightPicksSchema.safeParse(v),
                }),
                new Promise((resolve) => setTimeout(() => resolve(null), 9000)),
            ]);
            if (out?.picks?.length) {
                // Drop anything not in the shortlist, and duplicates.
                const seen = new Set();
                chosen = out.picks
                    .filter((p) => byId.has(p.tmdbId) && !seen.has(p.tmdbId) && seen.add(p.tmdbId))
                    .map((p) => ({ movie: byId.get(p.tmdbId), why: p.why.trim() }));
                llmUsed = chosen.length > 0;
            }
        } catch (err) {
            console.warn('[tonight] llm pick failed:', err.message);
        }
    }

    // Fill any gap (LLM down / invalid ids) from the MMR order with template reasons.
    const picks = chosen || [];
    for (const m of shortlist) {
        if (picks.length >= TONIGHT_PICKS) break;
        if (picks.some((p) => p.movie.tmdb_id === m.tmdb_id)) continue;
        picks.push({ movie: m, why: templateWhy(m, context, tonight), template: true });
    }

    // Discover-sourced picks only know "on one of your services", not which one —
    // look up the real providers for the final few so "where to watch" is named.
    const unnamed = picks.slice(0, TONIGHT_PICKS).map((p) => p.movie)
        .filter((m) => !toPublicItem(m).onYourServices?.length && !toPublicItem(m).availability?.length);
    if (unnamed.length) {
        try {
            await attachAvailability(supabase, unnamed, {
                region: context.region || DEFAULT_REGION,
                providerIds: context.providerIds || [],
                maxFetch: unnamed.length,
                staleHours: 0,
            });
        } catch (err) {
            console.warn('[tonight] provider lookup failed:', err.message);
        }
    }

    return {
        picks: picks.slice(0, TONIGHT_PICKS).map(({ movie, why, template }) => {
            const pub = toPublicItem(movie);
            return {
                tmdbId: Number(movie.tmdb_id),
                title: movie.title,
                year: String(movie.release_date || '').slice(0, 4) || null,
                poster: movie.poster_path || null,
                backdrop: movie.backdrop_path || null,
                runtime: Number(movie.runtime) || null,
                runtimeLabel: runtimeLabel(movie.runtime),
                whereToWatch: pub.onYourServices?.length ? pub.onYourServices : pub.availability,
                onYourServices: (pub.onYourServices || []).length > 0,
                why,
                whySource: template ? 'template' : 'llm',
                score: movie.score,
                scores: movie.scores,
            };
        }),
        meta: {
            mood, minutes, company,
            llmUsed,
            shortlist: shortlist.length,
            candidatePool: candidates.length,
            relaxed,
            region: context.region,
            hasTasteVector: !!context.userVector,
        },
    };
}

// ---- Phase 6: personal queue sorted by fit for tonight ----------------------

/**
 * The user's watchlist ordered by how well each title fits tonight
 * (Phase 3 score with tonight context), not by date added.
 * @param {string} userId
 * @param {{ minutes?: number, mood?: string, company?: string, regionHint?: string }} options
 */
export async function getQueueByFit(userId, options = {}) {
    const supabase = getSupabaseAdmin();
    const context = await loadUserContext(supabase, userId, { regionHint: options.regionHint });
    const { data: rows, error } = await supabase
        .from('user_watchlist')
        .select('movie_id, media_type, movie_title, poster_path, added_at')
        .eq('user_id', userId)
        .order('added_at', { ascending: false })
        .limit(300);
    if (error) throw new Error(error.message);
    if (!rows?.length) return { items: [], meta: { count: 0 } };

    const ids = [...new Set(rows.map((r) => String(r.movie_id)))];
    const { data: lib } = await supabase.from('movies_library').select(RECO_MOVIE_SELECT).in('tmdb_id', ids);
    const libByKey = new Map((lib || []).map((m) => [`${m.media_type || 'movie'}:${m.tmdb_id}`, m]));

    // Library row when we have it; otherwise TMDB details (cached) as a lite card.
    const items = await Promise.all(rows.map(async (row) => {
        const type = row.media_type === 'tv' ? 'tv' : 'movie';
        const libRow = libByKey.get(`${type}:${row.movie_id}`) || libByKey.get(`movie:${row.movie_id}`);
        let movie = libRow ? normalizeLibraryItem(libRow) : null;
        if (!movie) {
            const d = await fetchTmdbApi(`/${type}/${row.movie_id}`).catch(() => null);
            movie = {
                tmdb_id: String(row.movie_id), id: String(row.movie_id), media_type: type,
                title: d?.title || d?.name || row.movie_title,
                poster_path: d?.poster_path || row.poster_path,
                release_date: d?.release_date || d?.first_air_date || null,
                runtime: d?.runtime || d?.episode_run_time?.[0] || null,
                vote_average: d?.vote_average ?? null,
                vote_count: d?.vote_count ?? null,
                genres: d?.genres || [],
                genre_ids: (d?.genres || []).map((g) => g.id),
                overview: d?.overview || null,
                original_language: d?.original_language || null,
                _lite: true,
            };
        }
        return { ...movie, added_at: row.added_at };
    }));

    try {
        await attachAvailability(supabase, items, {
            region: context.region, providerIds: context.providerIds || [], maxFetch: 40,
        });
    } catch { /* availability is a bonus */ }
    if (context.userVector) await attachVectors(supabase, items);

    const tonight = {
        mood: TONIGHT_MOODS[options.mood] ? options.mood : 'any',
        company: TONIGHT_COMPANY[options.company] ? options.company : 'solo',
        minutes: Number(options.minutes) || undefined,
        pattern: context.prefs?.pattern,
    };
    const ranked = scoreCandidates(items, context.userVector, tonight);

    return {
        items: ranked.map((m) => {
            const pub = toPublicItem(m);
            const where = (pub.onYourServices?.length ? pub.onYourServices : pub.availability) || [];
            const bits = [];
            if (m.scores.contextFit >= 0.75 && Number(m.runtime)) bits.push(`fits tonight · ${runtimeLabel(m.runtime)}`);
            else if (Number(m.runtime)) bits.push(runtimeLabel(m.runtime));
            if (pub.onYourServices?.length) bits.push(`on ${pub.onYourServices[0].name}`);
            return {
                tmdbId: Number(m.tmdb_id),
                mediaType: m.media_type || 'movie',
                title: m.title,
                year: String(m.release_date || '').slice(0, 4) || null,
                poster: m.poster_path || null,
                runtime: Number(m.runtime) || null,
                addedAt: m.added_at,
                whereToWatch: where,
                onYourServices: (pub.onYourServices || []).length > 0,
                fit: m.score,
                scores: m.scores,
                note: bits.join(' · ') || null,
            };
        }),
        meta: { count: ranked.length, hasTasteVector: !!context.userVector, pattern: context.prefs?.pattern || null },
    };
}

// ---- Phase 7: TOS verdict ----------------------------------------------------

/** Map raw cosine (taste vector vs film) to a 0–1 personal fit (calibrated in reco/config). */
function cosineToFit(cos) {
    const { fitCosineLow, fitCosineHigh } = RECO_CONFIG;
    return Math.max(0, Math.min(1, (cos - fitCosineLow) / (fitCosineHigh - fitCosineLow)));
}

/**
 * Theater / Wait for OTT / Skip for one title.
 * @param {string|number} tmdbId
 * @param {{ mediaType?: string, userId?: string|null, regionHint?: string|null }} options
 */
export async function getTosVerdict(tmdbId, { mediaType = 'movie', userId = null, regionHint = null } = {}) {
    const supabase = getSupabaseAdmin();
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const id = String(tmdbId);

    let { data: movie } = await supabase
        .from('movies_library')
        .select('tmdb_id, media_type, title, release_date, first_air_date, runtime, vote_average, vote_count, genres, genre_ids, keywords, imdb_id, web_ratings')
        .eq('tmdb_id', id)
        .eq('media_type', type)
        .maybeSingle();
    if (!movie) {
        const d = await fetchTmdbApi(`/${type}/${id}`, { append_to_response: 'keywords,external_ids' }).catch(() => null);
        if (!d?.id) {
            const err = new Error('Title not found');
            err.statusCode = 404;
            throw err;
        }
        movie = {
            tmdb_id: id, media_type: type, title: d.title || d.name,
            release_date: d.release_date || d.first_air_date || null,
            runtime: d.runtime || d.episode_run_time?.[0] || null,
            vote_average: d.vote_average, vote_count: d.vote_count, genres: d.genres,
            keywords: d.keywords?.keywords || d.keywords?.results || [],
            imdb_id: d.imdb_id || d.external_ids?.imdb_id || null,
            web_ratings: null,
        };
    }

    // Our users' ratings (7-axis overall).
    const { data: ratingRows } = await supabase
        .from('ratings')
        .select('acting, screenplay, sound, direction, entertainment, pacing, cinematography')
        .eq('movie_id', id)
        .limit(2000);
    const overalls = (ratingRows || []).map(computeOverallFromRatingRow).filter((v) => v != null);
    const community = overalls.length
        ? { avg: Math.round((overalls.reduce((a, b) => a + b, 0) / overalls.length) * 100) / 100, count: overalls.length }
        : null;

    const aiOverall = Number(movie.web_ratings?.overall);
    const critic = await fetchCriticScores(movie).catch(() => null);

    // Personal fit + "already streaming" need the viewer's context.
    let personalFit = null;
    let region = normalizeRegion(regionHint) || DEFAULT_REGION;
    let providerIds = [];
    if (userId) {
        const context = await loadUserContext(supabase, userId, { regionHint });
        region = context.region;
        providerIds = context.providerIds || [];
        if (context.userVector) {
            const [withVector] = await attachVectors(supabase, [{ ...movie }]);
            if (withVector?.vector) personalFit = cosineToFit(cosine(context.userVector, withVector.vector));
        }
    }
    const probe = [{ ...movie }];
    try {
        await attachAvailability(supabase, probe, { region, providerIds, maxFetch: 1 });
    } catch { /* unknown availability = not streaming */ }
    const streamingNow = (probe[0].availability || []).length > 0;

    return {
        tmdbId: Number(id),
        mediaType: type,
        title: movie.title,
        ...buildVerdict({
            movie,
            community,
            aiOverall: Number.isFinite(aiOverall) ? aiOverall : null,
            personalFit,
            streamingNow,
            critic,
        }),
        streamingNow,
        region,
    };
}
