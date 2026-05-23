import { getSupabaseAdmin } from './supabase-admin.js';
import {
    extractGenreIds,
    computeOverallFromRatingRow,
} from './taste-profile-server.js';

const AXIS_KEYS = [
    'acting', 'screenplay', 'sound', 'direction',
    'entertainment', 'pacing', 'cinematography',
];

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

const CACHE_TTL_HOURS = 6;

export const RECO_MOVIE_SELECT =
    'tmdb_id, title, poster_path, backdrop_path, media_type, release_date, first_air_date, '
    + 'runtime, vote_average, vote_count, popularity, genres, genre_ids, streaming_platforms, '
    + 'certification, custom_parent_guide, mood_tags, family_score';

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

function buildReason(profile, movie, breakdown) {
    const genreIds = extractGenreIds(movie);
    const topGenre = genreIds.find((id) => (profile.genre_weights || {})[id] >= 0.6);
    const parts = [];

    if (breakdown.content >= 0.65) {
        parts.push('Close match to your taste profile');
    } else if (topGenre) {
        parts.push('Matches genres you enjoy');
    } else if (breakdown.collaborative >= 0.6) {
        parts.push('Similar to movies you rated highly');
    } else {
        parts.push('Picked for you based on your ratings');
    }

    if (profile.family_mode_enabled && movie.family_score >= 7) {
        parts.push('family-safe');
    }

    if (movie.streaming_platforms?.length) {
        parts.push('may be on your streaming services');
    }

    return `${parts.join(' — ')}.`;
}

async function loadUserContext(supabase, userId) {
    const [
        { data: profile, error: profileError },
        { data: streamingRows, error: streamError },
        { data: ratings, error: ratingsError },
    ] = await Promise.all([
        supabase.from('user_taste_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('user_streaming_services').select('service_id').eq('user_id', userId).eq('is_active', true),
        supabase.from('ratings').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(200),
    ]);

    if (profileError) throw new Error(profileError.message);
    if (streamError) throw new Error(streamError.message);
    if (ratingsError) throw new Error(ratingsError.message);

    const serviceIds = (streamingRows || []).map((r) => r.service_id);
    const ratedIds = new Set((ratings || []).map((r) => String(r.movie_id)));

    const lovedGenreSets = [];
    const lovedTmdbIds = [];

    (ratings || []).forEach((rating) => {
        const overall = computeOverallFromRatingRow(rating);
        if (overall != null && overall >= 7) {
            lovedTmdbIds.push(String(rating.movie_id));
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
        profile: profile || {},
        serviceIds,
        ratedIds,
        lovedGenreSets,
        userEmbedding: parseEmbeddingVector(profile?.embedding),
    };
}

async function fetchCandidateMovies(supabase, context, options) {
    const {
        mediaType = null,
        candidateLimit = 200,
        seedTmdbId = null,
        useEmbeddingPool = true,
    } = options;

    const tmdbIdSet = new Set();
    const embeddingSimilarity = new Map();

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
    } else if (useEmbeddingPool && context.userEmbedding) {
        const literal = embeddingToRpcLiteral(context.userEmbedding);
        if (literal) {
            const { data: matchRows, error } = await supabase.rpc('match_movies_by_embedding', {
                query_embedding: literal,
                match_count: candidateLimit,
                filter_media_type: mediaType,
            });

            if (!error && matchRows?.length) {
                matchRows.forEach((row) => {
                    tmdbIdSet.add(String(row.tmdb_id));
                    embeddingSimilarity.set(String(row.tmdb_id), Number(row.similarity) || 0);
                });
            }
        }
    }

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

    if (!tmdbIdSet.size) return [];

    const { data: movies, error: moviesError } = await supabase
        .from('movies_library')
        .select(RECO_MOVIE_SELECT)
        .in('tmdb_id', Array.from(tmdbIdSet));

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
    } = filters;

    return movies.filter((movie) => {
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

async function scoreAndRankMovies(supabase, movies, context, options = {}) {
    const { limit = 24 } = options;
    const hasEmbedding = !!context.userEmbedding;
    const weights = hasEmbedding ? WEIGHTS_WITH_EMBEDDING : WEIGHTS_NO_EMBEDDING;

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

        const genre = Math.max(
            genreMatchScore(context.profile.genre_weights, movie),
            moodMatchScore(context.profile.mood_preferences, movie) * 0.85,
        );

        const axis = axisMatchScore(
            context.profile.axis_preferences,
            communityAxisMap.get(tmdbId),
        );

        const collaborative = collaborativeScore(movie, context.lovedGenreSets);
        const popularity = popularityScore(movie.popularity, maxPopularity);

        const breakdown = { content, genre, axis, collaborative, popularity };

        const finalScore =
            weights.content * content
            + weights.genre * genre
            + weights.axis * axis
            + weights.collaborative * collaborative
            + weights.popularity * popularity;

        return {
            ...movie,
            score: Math.round(finalScore * 1000) / 1000,
            scores: breakdown,
            reason: buildReason(context.profile, movie, breakdown),
        };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(({ _embeddingSimilarity, ...rest }) => rest);
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

async function writeCache(supabase, userId, cacheKey, payload) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CACHE_TTL_HOURS);

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
    } = options;

    if (!refresh) {
        const cached = await readCache(supabase, userId, cacheKey);
        if (cached?.items?.length) {
            return { ...cached, fromCache: true };
        }
    }

    const context = await loadUserContext(supabase, userId);

    let candidates = await fetchCandidateMovies(supabase, context, {
        mediaType,
        candidateLimit,
        seedTmdbId,
        useEmbeddingPool: !seedTmdbId,
    });

    candidates = applyHardFilters(candidates, context, {
        requireOtt,
        excludeRated,
        maxRuntime,
        familyOnly,
        minFamilyScore,
    });

    const items = await scoreAndRankMovies(supabase, candidates, context, { limit });

    const payload = {
        cacheKey,
        generatedAt: new Date().toISOString(),
        items,
        meta: {
            count: items.length,
            candidatePool: candidates.length,
            hasUserEmbedding: !!context.userEmbedding,
            ottFiltered: requireOtt && context.serviceIds.length > 0,
        },
    };

    await writeCache(supabase, userId, cacheKey, payload);

    return { ...payload, fromCache: false };
}

export async function getForYouRecommendations(userId, options) {
    return getRecommendations(userId, 'for_you', {
        requireOtt: options?.ottMode !== false,
        excludeRated: false,
        ...options,
    });
}

export async function getTonightRecommendations(userId, options) {
    return getRecommendations(userId, 'tonight', {
        requireOtt: true,
        excludeRated: true,
        maxRuntime: 120,
        mediaType: options?.mediaType || 'movie',
        ...options,
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
    return getRecommendations(userId, `similar_${tmdbId}`, {
        seedTmdbId: tmdbId,
        excludeRated: false,
        requireOtt: options?.ottMode === true,
        candidateLimit: 80,
        ...options,
    });
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

    const candidates = applyHardFilters(
        (trending || []).map((m) => normalizeLibraryItem(m)),
        context,
        {
            requireOtt: options?.ottMode !== false,
            familyOnly: context.profile.family_mode_enabled,
        },
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
