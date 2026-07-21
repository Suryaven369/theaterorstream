import { getSupabaseAdmin } from './supabase-admin.js';
import {
    extractGenreIds,
    computeOverallFromRatingRow,
} from './taste-profile-server.js';
import { getBehavioralSignals, genreSignalToWeights } from './events-server.js';
import { isLlmEnabled, rerankRecommendations, generateRecoMessage } from './llm-server.js';
import { dnaMatchScore } from './movie-dna-server.js';
import { fetchTmdbApi } from './tmdb-server.js';

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
    content: 0.40,
    genre: 0.25,
    axis: 0.15,
    collaborative: 0.10,
    popularity: 0.10,
};

const WEIGHTS_NO_EMBEDDING = {
    content: 0,
    genre: 0.45,
    axis: 0.25,
    collaborative: 0.10,
    popularity: 0.20,
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

export const RECO_MOVIE_SELECT =
    'tmdb_id, title, poster_path, backdrop_path, media_type, release_date, first_air_date, '
    + 'runtime, vote_average, vote_count, popularity, genres, genre_ids, streaming_platforms, '
    + 'certification, custom_parent_guide, mood_tags, family_score, movie_dna, '
    + 'number_of_seasons, number_of_episodes';

const SERVICE_PLATFORM_ALIASES = {
    netflix: ['netflix'],
    prime: ['prime', 'amazon prime', 'prime video'],
    hotstar: ['hotstar', 'disney', 'disney+'],
    jio_cinema: ['jio', 'jiocinema'],
    sonyliv: ['sony', 'sonyliv'],
    zee5: ['zee5'],
    apple_tv: ['apple tv'],
    youtube: ['youtube'],
    disney_plus: ['disney', 'disney+'],
    hulu: ['hulu'],
    max: ['max', 'hbo'],
    peacock: ['peacock'],
    paramount: ['paramount'],
    now: ['now'],
    bbc_iplayer: ['bbc', 'iplayer'],
};

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

function movieOnUserPlatforms(movie, serviceIds) {
    if (!serviceIds?.length) return true;
    const platforms = movie.streaming_platforms;
    if (!Array.isArray(platforms) || !platforms.length) return false;

    const names = platforms.map((p) => String(p?.name || p?.provider_name || '').toLowerCase());

    return serviceIds.some((serviceId) => {
        const aliases = SERVICE_PLATFORM_ALIASES[serviceId] || [serviceId.replace(/_/g, ' ')];
        return aliases.some((alias) => names.some((n) => n.includes(alias)));
    });
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

    let sum = 0;
    let hits = 0;
    ids.forEach((id) => {
        const w = Number(weights[id]);
        if (w > 0) {
            sum += w;
            hits += 1;
        }
    });

    if (!hits) return 0.2;
    return Math.min(1, sum / hits);
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

    const tags = [];
    if (profile.family_mode_enabled && movie.family_score >= 7) tags.push('family-safe');
    if (movie.streaming_platforms?.length) tags.push('likely on your streaming services');

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
        // Behaviour leads (0.6), computed supports (0.4); manual only raises the floor.
        const blended = 0.6 * behavioral + 0.4 * computed;
        effectiveGenres[id] = Math.round(Math.max(blended, manualFloor) * 100) / 100;
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

async function loadUserContext(supabase, userId) {
    const [
        { data: profile, error: profileError },
        { data: streamingRows, error: streamError },
        { data: ratings, error: ratingsError },
        { data: watchedRows },
        { data: logRows },
        { data: likedRows },
        { data: account },
    ] = await Promise.all([
        supabase.from('user_taste_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('user_streaming_services').select('service_id').eq('user_id', userId).eq('is_active', true),
        supabase.from('ratings').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(200),
        // "Seen" history — never recommend these back. Best-effort (missing tables ignored).
        supabase.from('user_watched_movies').select('movie_id').eq('user_id', userId).limit(2000),
        supabase.from('movie_logs').select('tmdb_id').eq('user_id', userId).limit(2000),
        supabase.from('user_liked_movies').select('movie_id').eq('user_id', userId).limit(500),
        supabase.from('user_profiles').select('display_name, username').eq('id', userId).maybeSingle(),
    ]);

    if (profileError) throw new Error(profileError.message);
    if (streamError) throw new Error(streamError.message);
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

    const serviceIds = (streamingRows || []).map((r) => r.service_id);
    const ratedIds = new Set((ratings || []).map((r) => String(r.movie_id)));
    const likedIds = new Set((likedRows || []).map((r) => String(r.movie_id)));

    // Seen ≠ loved: watches/logs/ratings/likes all exclude from recs,
    // but only high ratings + likes feed lovedGenreSets / taste affinity.
    const seenIds = new Set(ratedIds);
    likedIds.forEach((id) => seenIds.add(id));
    (watchedRows || []).forEach((r) => seenIds.add(String(r.movie_id)));
    (logRows || []).forEach((r) => seenIds.add(String(r.tmdb_id)));

    const lovedGenreSets = [];
    const lovedTmdbIds = [];
    const lovedSet = new Set();

    (ratings || []).forEach((rating) => {
        const overall = computeOverallFromRatingRow(rating);
        if (overall != null && overall >= 7) {
            const id = String(rating.movie_id);
            if (!lovedSet.has(id)) {
                lovedSet.add(id);
                lovedTmdbIds.push(id);
            }
        }
    });
    likedIds.forEach((id) => {
        if (!lovedSet.has(id)) {
            lovedSet.add(id);
            lovedTmdbIds.push(id);
        }
    });

    if (lovedTmdbIds.length) {
        const { data: lovedMovies } = await supabase
            .from('movies_library')
            .select('tmdb_id, genres, genre_ids')
            .in('tmdb_id', lovedTmdbIds.slice(0, 40));

        (lovedMovies || []).forEach((m) => {
            const ids = extractGenreIds(m);
            if (ids.length) lovedGenreSets.push(ids);
        });
    }

    return {
        profile: effectiveProfile,
        serviceIds,
        ratedIds,
        seenIds,
        lovedGenreSets,
        suppressTmdbIds: signals.suppressTmdbIds || new Set(),
        userEmbedding: parseEmbeddingVector(baseProfile.embedding),
        userEmbeddingProvider: baseProfile.embedding_provider || null,
        userName: account?.display_name || account?.username || null,
    };
}

async function fetchCandidateMovies(supabase, context, options) {
    const {
        mediaType = null,
        candidateLimit = 200,
        seedTmdbId = null,
        useEmbeddingPool = true,
        seedMediaType = null,
    } = options;

    const tmdbIdSet = new Set();
    const embeddingSimilarity = new Map();
    const isSeedMode = !!seedTmdbId;

    if (seedTmdbId) {
        const { data: similarRows, error } = await supabase.rpc('match_similar_to_movie', {
            target_tmdb_id: String(seedTmdbId),
            match_count: candidateLimit,
        });

        if (!error && similarRows?.length) {
            similarRows.forEach((row) => {
                tmdbIdSet.add(String(row.tmdb_id));
                embeddingSimilarity.set(String(row.tmdb_id), Number(row.similarity) || 0);
            });
        }

        // TMDB genre/keyword neighbors — fills gaps when embeddings are sparse or noisy.
        const tmdbNeighbors = await fetchTmdbNeighborIds(
            seedTmdbId,
            seedMediaType || mediaType || 'movie',
            Math.min(candidateLimit, 40),
        );
        tmdbNeighbors.forEach((id) => {
            tmdbIdSet.add(id);
            // Mild prior so TMDB-only neighbors aren't scored as pure zeros on content.
            if (!embeddingSimilarity.has(id)) embeddingSimilarity.set(id, 0.42);
        });
    } else if (useEmbeddingPool && context.userEmbedding) {
        const literal = embeddingToRpcLiteral(context.userEmbedding);
        if (literal) {
            const { data: matchRows, error } = await supabase.rpc('match_movies_by_embedding', {
                query_embedding: literal,
                match_count: candidateLimit,
                filter_media_type: mediaType,
                // Only compare within the same embedding space (Gemini vs Mistral).
                filter_provider: context.userEmbeddingProvider,
            });

            if (!error && matchRows?.length) {
                matchRows.forEach((row) => {
                    tmdbIdSet.add(String(row.tmdb_id));
                    embeddingSimilarity.set(String(row.tmdb_id), Number(row.similarity) || 0);
                });
            }
        }
    }

    // Popularity backfill is for general For You feeds only.
    // Mixing it into seed-similar pools is what lets Moana rank under "Because you loved The Witch".
    if (!isSeedMode) {
        let popularityQuery = supabase
            .from('movies_library')
            .select(RECO_MOVIE_SELECT)
            .eq('is_active', true)
            .order('popularity', { ascending: false, nullsFirst: false })
            .limit(candidateLimit);

        if (mediaType) popularityQuery = popularityQuery.eq('media_type', mediaType);

        const { data: popularRows, error: popError } = await popularityQuery;
        if (popError) throw new Error(popError.message);

        (popularRows || []).forEach((m) => tmdbIdSet.add(String(m.tmdb_id)));
    } else if (!tmdbIdSet.size) {
        // Last-resort: genre-discover from library using seed genres (handled by caller filter).
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
        (fallbackRows || []).forEach((m) => tmdbIdSet.add(String(m.tmdb_id)));
    }

    if (!tmdbIdSet.size) return [];

    let hydrateQuery = supabase
        .from('movies_library')
        .select(RECO_MOVIE_SELECT)
        .in('tmdb_id', Array.from(tmdbIdSet));

    // Keep media-type requests honest — embedding IDs can otherwise hydrate as movies.
    if (mediaType === 'tv' || mediaType === 'movie') {
        hydrateQuery = hydrateQuery.eq('media_type', mediaType);
    }

    const { data: movies, error: moviesError } = await hydrateQuery;

    if (moviesError) throw new Error(moviesError.message);

    return (movies || []).map((m) => ({
        ...normalizeLibraryItem(m),
        _embeddingSimilarity: embeddingSimilarity.get(String(m.tmdb_id)) ?? null,
    }));
}

function applyHardFilters(movies, context, filters) {
    const {
        requireOtt = false,
        excludeRated = false,
        maxRuntime = null,
        familyOnly = false,
        minFamilyScore = null,
        ignoreSeen = false,
    } = filters;

    return movies.filter((movie) => {
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

        if (requireOtt && context.serviceIds.length) {
            if (!movieOnUserPlatforms(movie, context.serviceIds)) return false;
        }

        return true;
    });
}

function topGenreIds(genreWeights, count = 2) {
    return Object.entries(genreWeights || {})
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
    } = options;
    const isSeedMode = Array.isArray(seedGenreIds) && seedGenreIds.length > 0;
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

    return ranked.map(({ _embeddingSimilarity, _isExploration, scores, ...rest }) => ({
        ...rest,
        scores,
        score: rest.score,
        reason: buildReason(context.profile, rest, scores, {
            isExploration: _isExploration,
            seedMode: isSeedMode,
            seedGenreIds,
        }),
    }));
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

export async function getRecommendations(userId, cacheKey, options = {}) {
    const supabase = getSupabaseAdmin();
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
            // Serve cached analysis (fast). Light-filter titles the user has
            // since watched / liked / disliked — no full re-score / LLM.
            try {
                const ctx = await loadUserContext(supabase, userId);
                const items = (cached.items || []).filter((m) => {
                    const id = String(m.tmdb_id ?? m.id);
                    if (ctx.seenIds?.has(id)) return false;
                    if (ctx.suppressTmdbIds?.has(id)) return false;
                    return true;
                });
                return {
                    ...cached,
                    items,
                    meta: { ...(cached.meta || {}), count: items.length, cacheFiltered: true },
                    fromCache: true,
                };
            } catch {
                return { ...cached, fromCache: true };
            }
        }
    }

    const context = await loadUserContext(supabase, userId);

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

    const filterResult = applyFiltersWithFallback(candidates, context, {
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
            ottFiltered: requireOtt && context.serviceIds.length > 0 && !filterResult.relaxed.includes('ott'),
            relaxedFilters: filterResult.relaxed,
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
    const result = await getRecommendations(userId, `perfect_${day}`, {
        requireOtt: false,
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

async function cachedSection(userId, cacheKey, builder, ttl = CACHE_TTL_HOURS) {
    const supabase = getSupabaseAdmin();
    const cached = await readCache(supabase, userId, cacheKey);
    if (cached?.items?.length) return { ...cached, fromCache: true };
    const payload = await builder(supabase);
    if (payload?.items?.length) await writeCache(supabase, userId, cacheKey, payload, ttl);
    return { ...payload, fromCache: false };
}

/** "Because you loved X" — similar to the user's single highest-rated title. */
export async function getBecauseYouLoved(userId, options = {}) {
    const supabase = getSupabaseAdmin();
    const { data: ratings } = await supabase
        .from('ratings').select('*').eq('user_id', userId)
        .order('updated_at', { ascending: false }).limit(60);

    // Prefer a high score with identifiable genres (avoid seeding on untitled / empty DNA).
    let seed = null;
    let best = 0;
    (ratings || []).forEach((r) => {
        const o = computeOverallFromRatingRow(r);
        if (o != null && o > best) { best = o; seed = String(r.movie_id); }
    });
    if (!seed || best < 7) return null;

    const { data: seedMovie } = await supabase
        .from('movies_library')
        .select('title, genres, genre_ids, media_type')
        .eq('tmdb_id', seed)
        .maybeSingle();

    const res = await getSimilarRecommendations(userId, seed, {
        limit: options.limit || 18,
        excludeRated: true,
        mediaType: seedMovie?.media_type || null,
    });
    return {
        ...res,
        seedTitle: seedMovie?.title || null,
        heading: seedMovie?.title ? `Because you loved ${seedMovie.title}` : 'Because you loved',
    };
}

/** "Hidden Gems You Missed" — well-rated but low-popularity, matched to taste. */
export async function getHiddenGems(userId, options = {}) {
    return cachedSection(userId, 'hidden_gems', async (supabase) => {
        const context = await loadUserContext(supabase, userId);
        const { data: pool } = await supabase
            .from('movies_library').select(RECO_MOVIE_SELECT)
            .eq('is_active', true)
            .gte('vote_average', 7.3).gte('vote_count', 50).lte('popularity', 25)
            .order('vote_average', { ascending: false }).limit(options.candidateLimit || 250);

        const { items: candidates } = applyFiltersWithFallback(
            (pool || []).map(normalizeLibraryItem), context, { excludeRated: true }, 6);
        const items = await scoreAndRankMovies(supabase, candidates, context, { limit: options.limit || 18 });
        return { cacheKey: 'hidden_gems', heading: 'Hidden Gems You Missed', items, meta: { count: items.length } };
    });
}

/** "Underrated Masterpieces" — top-rated, modest reach. */
export async function getUnderratedMasterpieces(userId, options = {}) {
    return cachedSection(userId, 'underrated', async (supabase) => {
        const context = await loadUserContext(supabase, userId);
        const { data: pool } = await supabase
            .from('movies_library').select(RECO_MOVIE_SELECT)
            .eq('is_active', true)
            .gte('vote_average', 8).gte('vote_count', 80).lte('popularity', 60)
            .order('vote_average', { ascending: false }).limit(options.candidateLimit || 200);

        const { items: candidates } = applyFiltersWithFallback(
            (pool || []).map(normalizeLibraryItem), context, { excludeRated: true }, 6);
        const items = await scoreAndRankMovies(supabase, candidates, context, { limit: options.limit || 18 });
        return { cacheKey: 'underrated', heading: 'Underrated Masterpieces', items, meta: { count: items.length } };
    });
}

/** "Outside Your Comfort Zone" — quality picks outside the user's top genres. */
export async function getOutsideComfortZone(userId, options = {}) {
    return cachedSection(userId, 'outside_comfort', async (supabase) => {
        const context = await loadUserContext(supabase, userId);
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

        const { items: filtered } = applyFiltersWithFallback(candidates, context, { excludeRated: true }, 6);
        let items = await scoreAndRankMovies(supabase, filtered, context, { limit: options.limit || 18 });
        items = items.map((m) => ({ ...m, reason: 'A fresh pick to broaden your taste' }));
        return { cacheKey: 'outside_comfort', heading: 'Outside Your Comfort Zone', items, meta: { count: items.length } };
    });
}

export async function getForYouRecommendations(userId, options = {}) {
    return getRecommendations(userId, 'for_you_v2', {
        requireOtt: options?.ottMode !== false,
        // seenIds always excludes watched/logged/liked/rated; excludeRated is redundant.
        excludeRated: true,
        ...options,
        // Watch list rails stay deterministic on Vercel (LLM optional opt-in only).
        useLlm: options?.useLlm === true,
    });
}

export async function getTonightRecommendations(userId, options = {}) {
    return getRecommendations(userId, 'tonight', {
        requireOtt: true,
        excludeRated: true,
        maxRuntime: 120,
        mediaType: options?.mediaType || 'movie',
        ...options,
        useLlm: options?.useLlm === true,
    });
}

export async function getFamilyRecommendations(userId, options) {
    return getRecommendations(userId, 'family', {
        familyOnly: true,
        minFamilyScore: 7,
        requireOtt: options?.ottMode !== false,
        ...options,
    });
}

export async function getSimilarRecommendations(userId, tmdbId, options) {
    // Cache key v2 busts stale pools that mixed popular off-genre titles into seed rows.
    return getRecommendations(userId, `similar_v2_${tmdbId}`, {
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
    providerId = null,
    watchRegion = 'IN',
    strictWithout = true,
} = {}) {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    const out = [];
    const withGenres = (config.requireGenres?.length
        ? config.requireGenres
        : config.genres).join('|');
    const hasProvider = providerId != null && Number(providerId) > 0;
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
                params.with_watch_providers = String(providerId);
                params.watch_region = watchRegion || 'IN';
                params.with_watch_monetization_types = 'flatrate|free|ads';
            }
            // eslint-disable-next-line no-await-in-loop
            data = await fetchTmdbApi(`/discover/${type}`, params);
        } catch (err) {
            console.warn('mood tmdb discover failed:', err.message);
            break;
        }
        (data?.results || []).forEach((m) => {
            const ids = (m.genre_ids || []).map(Number);
            const card = {
                tmdb_id: String(m.id),
                id: String(m.id),
                title: m.title || m.name,
                poster_path: m.poster_path,
                backdrop_path: m.backdrop_path || null,
                media_type: type,
                release_date: type === 'movie' ? m.release_date : null,
                first_air_date: type === 'tv' ? m.first_air_date : null,
                runtime: null,
                vote_average: m.vote_average ?? null,
                vote_count: m.vote_count ?? null,
                popularity: m.popularity ?? 0,
                genre_ids: ids,
                genres: ids.map((gid) => ({ id: gid })),
                streaming_platforms: hasProvider
                    ? [{ provider_id: Number(providerId), name: 'Watch provider' }]
                    : [],
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
    const providerId = options.providerId != null && options.providerId !== ''
        ? Number(options.providerId)
        : null;
    const hasProvider = Number.isFinite(providerId) && providerId > 0;
    const useMyOtt = !hasProvider && options.ottMode === true;
    const watchRegion = options.watchRegion || options.region || 'IN';
    const ottKey = hasProvider ? `p${providerId}` : (useMyOtt ? 'my' : 'any');
    // v6: genre-accurate mood + OTT (TMDB genres are source of truth)
    const cacheKey = `mood_v6_${moodId}_${ottKey}`;
    const limit = Math.min(24, Math.max(1, Number(options.limit) || 12));

    if (!options.refresh) {
        const cached = await readCache(supabase, userId, cacheKey);
        if (cached?.items?.length) return { ...cached, fromCache: true };
    }

    const context = await loadUserContext(supabase, userId);
    const mediaType = options.mediaType === 'tv' || options.mediaType === 'movie'
        ? options.mediaType
        : null;
    const discoverPages = hasProvider || useMyOtt ? 5 : 3;

    const discoverOpts = (type, strictWithout) => ({
        pages: type === 'tv' ? Math.max(2, discoverPages - 1) : discoverPages,
        mediaType: type,
        providerId: hasProvider ? providerId : null,
        watchRegion,
        strictWithout,
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

    if (pool.length) {
        const ids = pool.map((m) => m.tmdb_id).slice(0, 280);
        const { data: libRows } = await supabase
            .from('movies_library')
            .select('tmdb_id, movie_dna, streaming_platforms, mood_tags, custom_vibes, family_score, certification, custom_parent_guide, runtime, genre_ids, genres')
            .in('tmdb_id', ids);
        const byId = new Map((libRows || []).map((r) => [String(r.tmdb_id), r]));
        pool = pool.map((m) => {
            const lib = byId.get(String(m.tmdb_id));
            const fromDiscover = discoverIds.has(String(m.tmdb_id));
            if (!lib) return { ...m, _fromProviderDiscover: fromDiscover && hasProvider };
            const merged = {
                ...m,
                ...Object.fromEntries(Object.entries(lib).filter(([, v]) => v != null)),
                genre_ids: fromDiscover && m.genre_ids?.length
                    ? m.genre_ids
                    : (m.genre_ids?.length ? m.genre_ids : lib.genre_ids),
                genres: fromDiscover && m.genres?.length
                    ? m.genres
                    : (m.genres?.length ? m.genres : lib.genres),
                _fromProviderDiscover: fromDiscover && hasProvider,
            };
            if (fromDiscover && hasProvider) {
                const plats = merged.streaming_platforms;
                if (!Array.isArray(plats) || !plats.length || !movieOnTmdbProviders(merged, [providerId])) {
                    const alias = (TMDB_PROVIDER_ALIASES[providerId] || [])[0] || 'streaming';
                    merged.streaming_platforms = [
                        { provider_id: providerId, name: alias },
                        ...(Array.isArray(plats) ? plats : []),
                    ];
                }
            }
            return merged;
        });
    }

    // Genre gate — every title must match mood genres (soft secondary only for OTT).
    pool = pool.filter((m) => movieMatchesMoodGenres(m, config, {
        softSecondary: hasProvider,
    }));

    if (hasProvider) {
        pool = pool.filter((m) => {
            if (discoverIds.has(String(m.tmdb_id)) || m._fromProviderDiscover) return true;
            return movieOnTmdbProviders(m, [providerId]);
        });
        if (!pool.length && tmdbPool.length) {
            pool = tmdbPool.filter((m) => movieMatchesMoodGenres(m, config, {
                softSecondary: true,
            }));
        }
    }

    const { items: candidates } = applyFiltersWithFallback(pool, context, {
        requireOtt: useMyOtt,
        excludeRated: hasProvider ? false : options.excludeRated !== false,
        familyOnly: moodId === 'family_night',
        ignoreSeen: hasProvider,
    }, hasProvider ? 1 : Math.min(limit, 8));

    let finalCandidates = candidates.filter((m) => movieMatchesMoodGenres(m, config, {
        softSecondary: hasProvider,
    }));
    if (!finalCandidates.length && tmdbPool.length) {
        finalCandidates = tmdbPool.filter((m) => (
            !context.suppressTmdbIds?.has(String(m.tmdb_id))
            && movieMatchesMoodGenres(m, config, { softSecondary: true })
        ));
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
        const finalScore = fitness * 0.8 + taste * 0.1 + pop * 0.1;
        const tagHit = (config.tags || []).find((t) => (movie.mood_tags || []).includes(t));
        return {
            ...movie,
            score: Math.round(finalScore * 1000) / 1000,
            scores: { mood: fitness, genre: taste, popularity: pop },
            reason: primaryIsMood
                ? `${moodGenreLabel} · ${config.label}`
                : (tagHit && MOOD_LABELS[tagHit]
                    ? `A ${MOOD_LABELS[tagHit]} ${config.label.toLowerCase()} pick`
                    : `Matches ${config.label}`),
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

    const items = scored.slice(0, limit).map(({ scores, ...rest }) => ({
        ...rest,
        scores,
    }));

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
            providerId: hasProvider ? providerId : null,
            tmdbPool: tmdbPool.length,
        },
    };

    if (items.length) {
        await writeCache(supabase, userId, cacheKey, payload);
    }
    return { ...payload, fromCache: false };
}

export async function getTrendingPersonalized(userId, options) {
    const supabase = getSupabaseAdmin();
    const context = await loadUserContext(supabase, userId);

    let query = supabase
        .from('movies_library')
        .select(RECO_MOVIE_SELECT)
        .eq('is_active', true)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(options?.candidateLimit || 60);

    if (options?.mediaType) {
        query = query.eq('media_type', options.mediaType);
    }

    const { data: trending, error } = await query;
    if (error) throw new Error(error.message);

    const { items: candidates } = applyFiltersWithFallback(
        (trending || []).map((m) => normalizeLibraryItem(m)),
        context,
        { requireOtt: options?.ottMode !== false },
        Math.min(options?.limit || 24, 8),
    );

    const items = await scoreAndRankMovies(supabase, candidates, context, {
        limit: options?.limit || 24,
    });

    return {
        cacheKey: 'trending_personalized',
        generatedAt: new Date().toISOString(),
        items,
        meta: { count: items.length, candidatePool: candidates.length },
        fromCache: false,
    };
}
