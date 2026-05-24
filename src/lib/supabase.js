import { createClient } from '@supabase/supabase-js';
import { MOVIES_LIBRARY_SELECT, MOVIE_DETAIL_SELECT } from './moviesLibrarySelect.js';
import { upsertMoviesViaAdminApi } from './adminLibraryApi.js';
import { dedupeLibraryRecords, upsertMoviesLibrary } from './libraryDedupe.js';

export { dedupeLibraryRecords, upsertMoviesLibrary };

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase credentials not found. Please check your .env file.');
}

// Create Supabase client - uses localStorage by default for session persistence
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
    auth: {
        persistSession: true,
        storageKey: 'theaterorstream-auth',
        storage: window.localStorage,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    }
});


// =============================================
// AUTHENTICATION — use src/lib/auth.js
// =============================================

// Get current user
export const getCurrentUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return null;
    return user;
};

// Get current session
export const getSession = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) return null;
    return session;
};

// =============================================
// USER PROFILE FUNCTIONS
// =============================================

// Get user profile - Using direct REST API
export const getUserProfile = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            console.error('Error fetching user profile:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.error('Error fetching user profile:', err);
        return null;
    }
};

export function isProfileOnboarded(profile) {
    if (!profile) return false;
    return !!(profile.is_onboarded || (profile.username && profile.avatar_id));
}

// Check if username is available
export const checkUsernameAvailable = async (username, excludeUserId = null) => {
    let query = supabase
        .from('user_profiles')
        .select('id')
        .eq('username', username.toLowerCase());

    if (excludeUserId) {
        query = query.neq('id', excludeUserId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
        console.error('Error checking username:', error);
        return false;
    }

    return !data;
};

// Update user profile
export const updateUserProfile = async (userId, updates) => {
    const { data, error } = await supabase
        .from('user_profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select();

    if (error) {
        console.error('Error updating profile:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Complete onboarding
export const completeOnboarding = async (userId, profileData) => {
    const now = new Date().toISOString();
    const payload = {
        id: userId,
        username: profileData.username?.toLowerCase(),
        display_name: profileData.displayName || profileData.username?.toLowerCase(),
        avatar_id: profileData.avatarId,
        date_of_birth: profileData.dateOfBirth,
        is_onboarded: true,
        updated_at: now,
    };

    if (profileData.preferredRegion) {
        payload.preferred_region = profileData.preferredRegion;
    }
    if (profileData.favoriteGenres?.length) {
        payload.favorite_genres = profileData.favoriteGenres.map(String);
    }
    if (profileData.moodPreferences) {
        payload.mood_preferences = profileData.moodPreferences;
    }
    if (profileData.familyModeEnabled != null) {
        payload.family_mode_enabled = profileData.familyModeEnabled;
    }
    if (profileData.familyMaxCertification != null) {
        payload.family_max_certification = profileData.familyMaxCertification;
    }
    payload.onboarding_completed_at = now;

    const { data: updated, error: updateError } = await supabase
        .from('user_profiles')
        .update({
            username: payload.username,
            display_name: payload.display_name,
            avatar_id: payload.avatar_id,
            date_of_birth: payload.date_of_birth,
            preferred_region: payload.preferred_region,
            favorite_genres: payload.favorite_genres,
            mood_preferences: payload.mood_preferences,
            family_mode_enabled: payload.family_mode_enabled,
            family_max_certification: payload.family_max_certification,
            onboarding_completed_at: payload.onboarding_completed_at,
            is_onboarded: true,
            updated_at: payload.updated_at,
        })
        .eq('id', userId)
        .select('*')
        .maybeSingle();

    if (!updateError && updated) {
        return { success: true, data: updated };
    }

    const { data, error } = await supabase
        .from('user_profiles')
        .upsert(payload, { onConflict: 'id' })
        .select('*')
        .single();

    if (error) {
        console.error('Error completing onboarding:', error);
        return { success: false, error };
    }

    return { success: true, data };
};

/** Replace user's active streaming service rows */
export const saveUserStreamingServices = async (userId, serviceIds, region = 'IN') => {
    if (!userId) return { success: false, error: new Error('Missing user id') };

    const { error: deleteError } = await supabase
        .from('user_streaming_services')
        .delete()
        .eq('user_id', userId);

    if (deleteError) {
        console.error('Error clearing streaming services:', deleteError);
        return { success: false, error: deleteError };
    }

    if (!serviceIds?.length) {
        return { success: true, data: [] };
    }

    const rows = serviceIds.map((serviceId) => ({
        user_id: userId,
        service_id: serviceId,
        region,
        is_active: true,
        source: 'onboarding',
    }));

    const { data, error } = await supabase
        .from('user_streaming_services')
        .insert(rows)
        .select();

    if (error) {
        console.error('Error saving streaming services:', error);
        return { success: false, error };
    }

    return { success: true, data: data || [] };
};

/** Upsert AI-ready taste profile from onboarding selections */
export const saveUserTasteProfile = async (userId, tasteData) => {
    if (!userId) return { success: false, error: new Error('Missing user id') };

    const now = new Date().toISOString();
    const payload = {
        user_id: userId,
        genre_weights: tasteData.genreWeights || {},
        mood_preferences: tasteData.moodPreferences || {},
        preferred_languages: tasteData.preferredLanguages || [],
        preferred_region: tasteData.preferredRegion || 'IN',
        axis_preferences: tasteData.axisPreferences || {},
        family_mode_enabled: !!tasteData.familyModeEnabled,
        family_max_certification: tasteData.familyMaxCertification || null,
        family_content_limits: tasteData.familyContentLimits || {},
        onboarding_seed_movie_ids: tasteData.seedMovieIds || [],
        onboarding_step_data: tasteData.stepData || {},
        onboarding_completed_at: now,
        rating_count: tasteData.ratingCount ?? 0,
        taste_summary: tasteData.tasteSummary || null,
        updated_at: now,
    };

    if (tasteData.preferredRuntimeRange) {
        payload.preferred_runtime_range = tasteData.preferredRuntimeRange;
    }

    const { data, error } = await supabase
        .from('user_taste_profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select('*')
        .single();

    if (error) {
        console.error('Error saving taste profile:', error);
        return { success: false, error };
    }

    return { success: true, data };
};

export const getUserTasteProfile = async (userId) => {
    if (!userId) return null;

    const { data, error } = await supabase
        .from('user_taste_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.error('Error fetching taste profile:', error);
        return null;
    }

    return data;
};

export function hasCompletedTasteOnboarding(tasteProfile) {
    return !!(tasteProfile?.onboarding_completed_at);
}

export const getUserStreamingServices = async (userId) => {
    if (!userId) return [];

    const { data, error } = await supabase
        .from('user_streaming_services')
        .select('service_id, region')
        .eq('user_id', userId)
        .eq('is_active', true);

    if (error) {
        console.error('Error fetching streaming services:', error);
        return [];
    }

    return data || [];
};

/** Prefill taste onboarding form from DB (existing accounts) */
export const loadTasteOnboardingPrefill = async (userId, profile) => {
    if (!userId) return null;

    const [tasteProfile, streamingRows] = await Promise.all([
        getUserTasteProfile(userId),
        getUserStreamingServices(userId),
    ]);

    const genreIds = tasteProfile?.genre_weights
        ? Object.keys(tasteProfile.genre_weights).map((id) => Number(id))
        : (profile?.favorite_genres || []).map((id) => Number(id));

    const moodIds = tasteProfile?.mood_preferences
        ? Object.keys(tasteProfile.mood_preferences)
        : Object.keys(profile?.mood_preferences || {});

    const stepData = tasteProfile?.onboarding_step_data || {};

    return {
        region: tasteProfile?.preferred_region || profile?.preferred_region || 'IN',
        streamingServices: streamingRows.map((r) => r.service_id),
        genreIds: genreIds.filter(Boolean),
        moodIds: moodIds.filter((id) => !id.startsWith('vibe_')),
        vibeIds: moodIds.filter((id) => id.startsWith('vibe_')).map((id) => id.replace('vibe_', '')),
        favoriteMovieIds: stepData.favorite_movies || [],
        swipeRatings: stepData.swipe_reactions || {},
        emotionalTastes: stepData.emotional_tastes || [],
        storytellingPrefs: stepData.storytelling || [],
        characterPrefs: stepData.characters || [],
        worldPrefs: stepData.worlds || [],
        pacingPref: stepData.pacing || null,
        endingPrefs: stepData.endings || [],
        complexityPref: stepData.complexity || null,
        watchingHabit: stepData.watching_habit || null,
        viewingContext: stepData.viewing_context || [],
        runtimePref: stepData.runtime || null,
        watchFrequency: stepData.watch_frequency || null,
        emotionalGoals: stepData.emotional_goals || [],
        deepCalibrationEnabled: !!stepData.deep_calibration,
        directorPrefs: stepData.directors || [],
        cinematographyPrefs: stepData.cinematography || [],
        soundtrackImportance: stepData.soundtrack || null,
        familyModeEnabled: tasteProfile?.family_mode_enabled ?? profile?.family_mode_enabled ?? false,
        familyMaxCertification: tasteProfile?.family_max_certification
            ?? profile?.family_max_certification
            ?? null,
        tasteIdentity: stepData.taste_identity || null,
    };
};

/** Full onboarding completion: profile + streaming + taste + optional seed ratings */
export const completeTasteOnboarding = async (userId, onboardingData) => {
    const {
        profile,
        streamingServiceIds,
        tasteProfile,
        seedRatings = [],
    } = onboardingData;

    const profileResult = await completeOnboarding(userId, profile);
    if (!profileResult.success) {
        return profileResult;
    }

    const streamingResult = await saveUserStreamingServices(
        userId,
        streamingServiceIds,
        profile.preferredRegion || 'IN',
    );
    if (!streamingResult.success) {
        return streamingResult;
    }

    let ratingCount = 0;
    const ratedMovieIds = [];

    for (const seed of seedRatings) {
        if (!seed.reaction || seed.reaction === 'skip') continue;
        const ratings = seed.ratings;
        if (!ratings) continue;

        const ratingResult = await submitRating(
            seed.tmdbId,
            seed.title,
            ratings,
            userId,
        );
        if (ratingResult.success) {
            ratingCount += 1;
            ratedMovieIds.push(String(seed.tmdbId));
        }
    }

    const tasteResult = await saveUserTasteProfile(userId, {
        ...tasteProfile,
        seedMovieIds: ratedMovieIds.length ? ratedMovieIds : tasteProfile.seedMovieIds,
        ratingCount,
        stepData: {
            ...(tasteProfile.stepData || {}),
            seed_ratings_submitted: ratingCount,
        },
    });
    if (!tasteResult.success) {
        return tasteResult;
    }

    import('./tasteProfileApi.js').then(({ requestTasteProfileRebuild }) => {
        requestTasteProfileRebuild().catch(() => {});
    });

    return {
        success: true,
        data: {
            profile: profileResult.data,
            tasteProfile: tasteResult.data,
            streaming: streamingResult.data,
            ratingsSubmitted: ratingCount,
        },
    };
};

// Create profile if not exists (fallback)
export const ensureUserProfile = async (userId) => {
    const existing = await getUserProfile(userId);
    if (existing) {
        return existing;
    }

    // Get user data from auth to include email
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
        .from('user_profiles')
        .upsert({
            id: userId,
            ...(user?.email && { display_name: user.email.split('@')[0] })
        }, { onConflict: 'id', ignoreDuplicates: true })
        .select()
        .single();

    if (error) {
        return await getUserProfile(userId);
    }

    return data;
};


// Helper functions for movie ratings and reviews

const normalizeMovieId = (movieId) => String(movieId);

const ratingPayloadFromInput = (movieId, movieTitle, ratings, userId) => ({
    movie_id: normalizeMovieId(movieId),
    movie_title: movieTitle,
    user_id: userId,
    acting: ratings.acting,
    screenplay: ratings.screenplay,
    sound: ratings.sound,
    direction: ratings.direction,
    entertainment: ratings.entertainment,
    pacing: ratings.pacing,
    cinematography: ratings.cinematography,
    updated_at: new Date().toISOString(),
});

// Get all reviews for a movie (including replies)
export const getMovieReviews = async (movieId) => {
    const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('movie_id', normalizeMovieId(movieId))
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching reviews:', error);
        return [];
    }
    return data || [];
};

// Get aggregate ratings for a movie
export const getMovieRatings = async (movieId) => {
    const { data, error } = await supabase
        .from('ratings')
        .select('*')
        .eq('movie_id', normalizeMovieId(movieId));

    if (error) {
        console.error('Error fetching ratings:', error);
        return null;
    }

    if (!data || data.length === 0) return null;

    // Calculate averages for each category
    const categories = ['acting', 'screenplay', 'sound', 'direction', 'entertainment', 'pacing', 'cinematography'];
    const aggregates = {};

    categories.forEach(cat => {
        const validRatings = data.filter(r => r[cat] !== null && r[cat] !== undefined);
        if (validRatings.length > 0) {
            aggregates[cat] = validRatings.reduce((sum, r) => sum + r[cat], 0) / validRatings.length;
        }
    });

    aggregates.totalRatings = data.length;
    return aggregates;
};

// Get aggregate ratings for multiple movies in batch (optimized)
// Returns a Map of movieId -> { score, count }
export const getBatchMovieRatings = async (movieIds) => {
    if (!movieIds || movieIds.length === 0) return new Map();

    const { data, error } = await supabase
        .from('ratings')
        .select('movie_id, acting, screenplay, sound, direction, entertainment, pacing, cinematography')
        .in('movie_id', movieIds.map(id => String(id)));

    if (error) {
        console.error('Error fetching batch ratings:', error);
        return new Map();
    }

    if (!data || data.length === 0) return new Map();

    // Group ratings by movie_id
    const ratingsByMovie = new Map();
    data.forEach(rating => {
        const movieId = String(rating.movie_id);
        if (!ratingsByMovie.has(movieId)) {
            ratingsByMovie.set(movieId, []);
        }
        ratingsByMovie.get(movieId).push(rating);
    });

    // Calculate aggregates for each movie
    const result = new Map();
    const categories = ['acting', 'screenplay', 'sound', 'direction', 'entertainment', 'pacing', 'cinematography'];

    ratingsByMovie.forEach((ratings, movieId) => {
        let totalSum = 0;
        let totalCount = 0;

        categories.forEach(cat => {
            const validRatings = ratings.filter(r => r[cat] !== null && r[cat] !== undefined);
            if (validRatings.length > 0) {
                const catAvg = validRatings.reduce((sum, r) => sum + r[cat], 0) / validRatings.length;
                totalSum += catAvg;
                totalCount++;
            }
        });

        if (totalCount > 0) {
            result.set(movieId, {
                score: totalSum / totalCount,
                count: ratings.length
            });
        }
    });

    return result;
};

// Get a specific user's rating for a movie
export const getUserRatingForMovie = async (userId, movieId) => {
    if (!userId || userId === 'anonymous') return null;

    const { data, error } = await supabase
        .from('ratings')
        .select('*')
        .eq('user_id', userId)
        .eq('movie_id', normalizeMovieId(movieId))
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('Error fetching user rating:', error);
        return null;
    }
    return data;
};

// Submit or update a rating (upsert on user_id + movie_id)
export const submitRating = async (movieId, movieTitle, ratings, userId = 'anonymous') => {
    const normalizedMovieId = normalizeMovieId(movieId);
    const row = ratingPayloadFromInput(normalizedMovieId, movieTitle, ratings, userId);

    const { data, error } = await supabase
        .from('ratings')
        .upsert(row, { onConflict: 'user_id,movie_id' })
        .select()
        .maybeSingle();

    if (error) {
        const existingRating = await getUserRatingForMovie(userId, normalizedMovieId);

        if (existingRating) {
            const { data: updated, error: updateError } = await supabase
                .from('ratings')
                .update({
                    acting: row.acting,
                    screenplay: row.screenplay,
                    sound: row.sound,
                    direction: row.direction,
                    entertainment: row.entertainment,
                    pacing: row.pacing,
                    cinematography: row.cinematography,
                    updated_at: row.updated_at,
                })
                .eq('id', existingRating.id)
                .select()
                .maybeSingle();

            if (updateError) {
                console.error('Error updating rating:', updateError);
                return { success: false, error: updateError };
            }
            return { success: true, data: updated, updated: true };
        }

        const { data: inserted, error: insertError } = await supabase
            .from('ratings')
            .insert({ ...row, created_at: new Date().toISOString() })
            .select()
            .maybeSingle();

        if (insertError) {
            console.error('Error submitting rating:', insertError);
            return { success: false, error: insertError };
        }
        return { success: true, data: inserted, updated: false };
    }

    return { success: true, data, updated: !!data?.updated_at };
};

// Get all ratings by a specific user (for profile feed)
export const getAllUserRatings = async (userId) => {
    if (!userId) return [];

    const { data, error } = await supabase
        .from('ratings')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching user ratings:', error);
        return [];
    }
    return data || [];
};

// Submit a new review or reply
export const submitReview = async (movieId, movieTitle, reviewText, userId = 'anonymous', username = 'Anonymous User', parentId = null) => {
    const { data, error } = await supabase
        .from('reviews')
        .insert({
            movie_id: movieId,
            movie_title: movieTitle,
            user_id: userId,
            username: username,
            parent_id: parentId, // null for top-level, UUID for replies
            review_text: reviewText,
            upvotes: 0,
            downvotes: 0,
            created_at: new Date().toISOString()
        })
        .select();

    if (error) {
        console.error('Error submitting review:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Upvote a review (Reddit-style)
export const upvoteReview = async (reviewId) => {
    // First get current upvotes
    const { data: current } = await supabase
        .from('reviews')
        .select('upvotes')
        .eq('id', reviewId)
        .single();

    if (!current) return { success: false };

    const { data, error } = await supabase
        .from('reviews')
        .update({ upvotes: (current.upvotes || 0) + 1 })
        .eq('id', reviewId)
        .select();

    if (error) {
        console.error('Error upvoting:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Downvote a review (Reddit-style)
export const downvoteReview = async (reviewId) => {
    // First get current downvotes
    const { data: current } = await supabase
        .from('reviews')
        .select('downvotes')
        .eq('id', reviewId)
        .single();

    if (!current) return { success: false };

    const { data, error } = await supabase
        .from('reviews')
        .update({ downvotes: (current.downvotes || 0) + 1 })
        .eq('id', reviewId)
        .select();

    if (error) {
        console.error('Error downvoting:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Remove upvote from a review (toggle unlike)
export const removeUpvoteReview = async (reviewId) => {
    // First get current upvotes
    const { data: current } = await supabase
        .from('reviews')
        .select('upvotes')
        .eq('id', reviewId)
        .single();

    if (!current) return { success: false };

    const newUpvotes = Math.max(0, (current.upvotes || 0) - 1); // Prevent negative

    const { data, error } = await supabase
        .from('reviews')
        .update({ upvotes: newUpvotes })
        .eq('id', reviewId)
        .select();

    if (error) {
        console.error('Error removing upvote:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// =============================================
// ADMIN - Movies Library Functions
// =============================================

// Get all movies from library
export const getMoviesLibrary = async (options = {}) => {
    const { mediaType, featured, collectionTag, displaySection, limit = 100, offset = 0 } = options;

    let query = supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_SELECT)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (mediaType) query = query.eq('media_type', mediaType);
    if (featured !== undefined) query = query.eq('featured', featured);
    if (collectionTag) query = query.contains('collection_tags', [collectionTag]);
    if (displaySection) query = query.contains('display_sections', [displaySection]);

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching movies library:', error);
        return [];
    }
    return data || [];
};

// Get movies by collection tag
export const getMoviesByCollection = async (collectionTag, limit = 20) => {
    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_SELECT)
        .eq('is_active', true)
        .contains('collection_tags', [collectionTag])
        .order('priority', { ascending: false })
        .limit(limit);

    if (error) return [];
    return data || [];
};

// Get movies by display section
export const getMoviesByDisplaySection = async (section, limit = 20) => {
    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_SELECT)
        .eq('is_active', true)
        .contains('display_sections', [section])
        .order('priority', { ascending: false })
        .limit(limit);

    if (error) return [];
    return data || [];
};

// Get movie from library by TMDB ID
export const getMovieFromLibrary = async (tmdbId) => {
    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_SELECT)
        .eq('tmdb_id', tmdbId.toString())
        .single();

    if (error) return null;
    return data;
};

function sanitizeLibraryRecord(record) {
    const clean = { ...record };
    if (clean.tmdb_id != null) clean.tmdb_id = String(clean.tmdb_id);
    if (clean.release_date === '') delete clean.release_date;
    if (clean.first_air_date === '') delete clean.first_air_date;
    if (clean.last_air_date === '') delete clean.last_air_date;
    Object.keys(clean).forEach((key) => {
        if (clean[key] === undefined) delete clean[key];
    });
    return clean;
}

const LIBRARY_UPSERT_CHUNK_SIZE = 40;

async function upsertLibraryChunk(records) {
    const { data, error } = await upsertMoviesLibrary(
        supabase,
        records,
        LIBRARY_UPSERT_SELECT,
    );

    if (error) {
        return { success: false, error, data: [] };
    }

    return { success: true, data: data || [], error: null };
}

/**
 * Upsert one or many library rows. Never deletes other titles — each row is keyed by tmdb_id.
 */
async function persistLibraryRecords(records) {
    const rawList = (Array.isArray(records) ? records : [records]).map(sanitizeLibraryRecord);
    const normalized = dedupeLibraryRecords(rawList);
    const duplicatesSkipped = rawList.length - normalized.length;

    if (!normalized.length) {
        return { success: false, error: new Error('No records to save') };
    }

    let apiResult = null;
    try {
        apiResult = await upsertMoviesViaAdminApi(normalized);
    } catch (error) {
        console.warn('Admin library API save failed:', error.message);
        if (error.message?.includes('Admin sign-in')) {
            return { success: false, error };
        }
    }

    if (apiResult?.success) {
        return {
            ...apiResult,
            savedCount: apiResult.savedCount ?? apiResult.data?.length ?? normalized.length,
            duplicatesSkipped,
        };
    }

    const savedRows = [];
    for (let i = 0; i < normalized.length; i += LIBRARY_UPSERT_CHUNK_SIZE) {
        const chunk = normalized.slice(i, i + LIBRARY_UPSERT_CHUNK_SIZE);
        const result = await upsertLibraryChunk(chunk);
        if (!result.success) {
            console.error('Error saving to movies_library:', result.error);
            return {
                success: false,
                error: result.error,
                savedCount: savedRows.length,
                partial: savedRows.length > 0,
            };
        }
        savedRows.push(...result.data);
    }

    return {
        success: true,
        data: savedRows,
        savedCount: savedRows.length,
        duplicatesSkipped,
    };
}

// Save movie to library (from TMDB data)
export const saveMovieToLibrary = async (movieData, mediaType = 'movie', additionalData = {}) => {
    const movieRecord = {
        tmdb_id: movieData.id.toString(),
        media_type: mediaType,
        title: movieData.title || movieData.name,
        original_title: movieData.original_title || movieData.original_name,
        overview: movieData.overview,
        tagline: movieData.tagline,
        poster_path: movieData.poster_path,
        backdrop_path: movieData.backdrop_path,
        release_date: movieData.release_date || movieData.first_air_date,
        status: movieData.status,
        runtime: movieData.runtime || movieData.episode_run_time?.[0],
        vote_average: movieData.vote_average,
        vote_count: movieData.vote_count,
        popularity: movieData.popularity,
        genres: movieData.genres || (movieData.genre_ids ? movieData.genre_ids.map(id => ({ id })) : null),
        production_companies: movieData.production_companies,
        production_countries: movieData.production_countries,
        spoken_languages: movieData.spoken_languages,
        imdb_id: movieData.imdb_id,
        homepage: movieData.homepage,
        budget: movieData.budget,
        revenue: movieData.revenue,
        is_active: true,
        synced_at: new Date().toISOString(),
        ...additionalData
    };

    return persistLibraryRecords(movieRecord);
};

// Bulk save movies to library
export const bulkSaveMoviesToLibrary = async (moviesArray, mediaType = 'movie', additionalData = {}) => {
    const movieRecords = moviesArray.map(movie => ({
        tmdb_id: movie.id.toString(),
        media_type: mediaType,
        title: movie.title || movie.name,
        original_title: movie.original_title || movie.original_name,
        overview: movie.overview,
        poster_path: movie.poster_path,
        backdrop_path: movie.backdrop_path,
        release_date: movie.release_date || movie.first_air_date,
        vote_average: movie.vote_average,
        vote_count: movie.vote_count,
        popularity: movie.popularity,
        genres: movie.genre_ids ? movie.genre_ids.map(id => ({ id })) : movie.genres,
        is_active: true,
        synced_at: new Date().toISOString(),
        ...additionalData
    }));

    return persistLibraryRecords(movieRecords);
};

// Update movie in library
export const updateMovieInLibrary = async (tmdbId, updates) => {
    const { data, error } = await supabase
        .from('movies_library')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('tmdb_id', tmdbId.toString())
        .select();

    if (error) {
        console.error('Error updating movie:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Delete movie from library
export const deleteMovieFromLibrary = async (tmdbId) => {
    const { error } = await supabase
        .from('movies_library')
        .delete()
        .eq('tmdb_id', tmdbId.toString());

    if (error) {
        console.error('Error deleting movie:', error);
        return { success: false, error };
    }
    return { success: true };
};

// Toggle featured status
export const toggleMovieFeatured = async (tmdbId) => {
    const movie = await getMovieFromLibrary(tmdbId);
    if (!movie) return { success: false, error: 'Movie not found' };

    return updateMovieInLibrary(tmdbId, { featured: !movie.featured });
};

// Toggle active status
export const toggleMovieActive = async (tmdbId) => {
    const movie = await getMovieFromLibrary(tmdbId);
    if (!movie) return { success: false, error: 'Movie not found' };

    return updateMovieInLibrary(tmdbId, { is_active: !movie.is_active });
};

// Add/remove collection tag
export const updateMovieCollections = async (tmdbId, collectionTags) => {
    return updateMovieInLibrary(tmdbId, { collection_tags: collectionTags });
};

// Add/remove display section
export const updateMovieDisplaySections = async (tmdbId, displaySections) => {
    return updateMovieInLibrary(tmdbId, { display_sections: displaySections });
};

// Update streaming platforms
export const updateMovieStreamingPlatforms = async (tmdbId, platforms) => {
    return updateMovieInLibrary(tmdbId, { streaming_platforms: platforms });
};

// Update custom vibe meter
export const updateMovieVibes = async (tmdbId, vibes) => {
    return updateMovieInLibrary(tmdbId, { custom_vibes: vibes });
};

// Update custom parent guide
export const updateMovieParentGuide = async (tmdbId, parentGuide, certification = null) => {
    const updates = { custom_parent_guide: parentGuide };
    if (certification) updates.certification = certification;
    return updateMovieInLibrary(tmdbId, updates);
};

// Update editor review
export const updateMovieEditorReview = async (tmdbId, review, rating = null) => {
    const updates = { editor_review: review };
    if (rating !== null) updates.editor_rating = rating;
    return updateMovieInLibrary(tmdbId, updates);
};

// Search movies in library
export const searchMoviesLibrary = async (searchTerm, activeOnly = false) => {
    const { buildLibrarySearchOrClause } = await import('./searchUtils.js');
    const orClause = buildLibrarySearchOrClause(searchTerm);
    if (!orClause) return [];

    let query = supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_SELECT)
        .or(orClause)
        .order('popularity', { ascending: false })
        .limit(50);

    if (activeOnly) query = query.eq('is_active', true);

    const { data, error } = await query;

    if (error) {
        console.error('Error searching library:', error);
        return [];
    }
    return data || [];
};

// Get library stats
export const getLibraryStats = async () => {
    const { data: all } = await supabase.from('movies_library').select('id, media_type, featured, is_active, collection_tags');

    if (!all) return { total: 0, movies: 0, tv: 0, featured: 0, active: 0, collections: {} };

    const collectionCounts = {};
    all.forEach(m => {
        (m.collection_tags || []).forEach(tag => {
            collectionCounts[tag] = (collectionCounts[tag] || 0) + 1;
        });
    });

    return {
        total: all.length,
        movies: all.filter(m => m.media_type === 'movie').length,
        tv: all.filter(m => m.media_type === 'tv').length,
        featured: all.filter(m => m.featured).length,
        active: all.filter(m => m.is_active).length,
        collections: collectionCounts
    };
};

// =============================================
// COLLECTIONS MANAGEMENT
// =============================================

// Get all collections
export const getCollections = async () => {
    const { data, error } = await supabase
        .from('collections')
        .select('*')
        .order('display_order', { ascending: true });

    if (error) {
        console.error('Error fetching collections:', error);
        return [];
    }
    return data || [];
};

// Create admin collection (for movie tagging)
export const createCollection = async (collection) => {
    const { data, error } = await supabase
        .from('collections')
        .insert(collection)
        .select();

    if (error) {
        console.error('Error creating collection:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Update admin collection
export const updateCollectionAdmin = async (slug, updates) => {
    const { data, error } = await supabase
        .from('collections')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('slug', slug)
        .select();

    if (error) {
        console.error('Error updating collection:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Delete admin collection
export const deleteCollection = async (slug) => {
    const { error } = await supabase
        .from('collections')
        .delete()
        .eq('slug', slug);

    if (error) {
        console.error('Error deleting collection:', error);
        return { success: false, error };
    }
    return { success: true };
};

// Alias for AdminPanel compatibility (admin collections)
export const updateCollection = async (slug, updates) => {
    const { data, error } = await supabase
        .from('collections')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('slug', slug)
        .select();

    if (error) {
        console.error('Error updating collection:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// =============================================
// HOMEPAGE SECTIONS CMS
// =============================================

/** Slim projection for list/card hydration — excludes heavy JSONB blobs */
const LIBRARY_CARD_SELECT = SHARED_LIBRARY_CARD_SELECT;

const stripImagesBase64 = (images) => {
    if (!images || typeof images !== 'object' || Array.isArray(images)) return images;
    const { poster_base64, backdrop_base64, ...clean } = images;
    return clean;
};

const stripCreditsBase64 = (credits) => {
    if (!credits) return credits;
    const stripPerson = ({ profile_base64, ...rest }) => rest;
    return {
        ...credits,
        cast: credits.cast?.map(stripPerson),
        crew: credits.crew?.map(stripPerson),
    };
};

// Get all homepage sections (ordered by display_order)
// Movies are stored per region in movies_by_region field
export const getHomepageSections = async (activeOnly = false) => {
    let query = supabase
        .from('homepage_sections')
        .select('*')
        .order('display_order', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data: sections, error } = await query;

    if (error) {
        console.error('Error fetching homepage sections:', error);
        return [];
    }

    if (!sections || sections.length === 0) return [];

    // ============================================================
    // GLOBAL LIBRARY HYDRATION LOGIC
    // ============================================================
    // 1. Collect all unique TMDB IDs from all sections' movies_by_region
    const tmdbIdsToFetch = new Set();

    sections.forEach(section => {
        if (!section.movies_by_region) return;

        Object.values(section.movies_by_region).forEach(movieList => {
            if (!Array.isArray(movieList)) return;
            movieList.forEach(movie => {
                // If the movie object is "slim" (missing poster/title), it needs hydration
                // Or if we just want to enforce Source-of-Truth from library
                if (movie.tmdb_id) {
                    tmdbIdsToFetch.add(String(movie.tmdb_id));
                }
            });
        });
    });

    if (tmdbIdsToFetch.size === 0) return sections; // No movies to hydrate

    // 2. Fetch full details from movies_library
    // We fetch a bit more info to ensure we can fully reconstruct the UI cards
    const { data: globalMovies, error: libError } = await supabase
        .from('movies_library')
        .select(LIBRARY_CARD_SELECT)
        .in('tmdb_id', Array.from(tmdbIdsToFetch));

    if (libError) {
        console.error('Error fetching global movies for sections:', libError);
        return sections; // Fallback to raw section data
    }

    // Map for O(1) lookup
    const movieMap = new Map();
    globalMovies?.forEach(m => {
        movieMap.set(String(m.tmdb_id), m);
    });

    // 3. Batch fetch TOS ratings for all movies (SINGLE query)
    const ratingsMap = await getBatchMovieRatings(Array.from(tmdbIdsToFetch));

    // 4. Hydrate sections
    // Replace the section's movie data with the fresh data from library + TOS ratings
    const hydratedSections = sections.map(section => {
        if (!section.movies_by_region) return section;

        const hydatedMoviesByRegion = {};

        Object.keys(section.movies_by_region).forEach(regionCode => {
            const rawMovies = section.movies_by_region[regionCode] || [];

            hydatedMoviesByRegion[regionCode] = rawMovies.map(rawMovie => {
                const globalMovie = movieMap.get(String(rawMovie.tmdb_id));
                const tosRating = ratingsMap.get(String(rawMovie.tmdb_id));

                if (globalMovie) {
                    return {
                        ...rawMovie,
                        ...globalMovie,
                        release_date: globalMovie.release_date || globalMovie.first_air_date || rawMovie.release_date,
                        tos_rating: tosRating || null,
                    };
                }
                return {
                    ...rawMovie,
                    tos_rating: tosRating || null,
                };
            });
        });

        return {
            ...section,
            movies_by_region: hydatedMoviesByRegion
        };
    });

    return hydratedSections;

};

// Create a new homepage section
export const createHomepageSection = async (section) => {
    // Generate slug if not provided
    const slug = section.slug || section.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Get max display_order
    const { data: existing } = await supabase
        .from('homepage_sections')
        .select('display_order')
        .order('display_order', { ascending: false })
        .limit(1);

    const nextOrder = existing?.[0]?.display_order ? existing[0].display_order + 1 : 1;

    const { data, error } = await supabase
        .from('homepage_sections')
        .insert({
            ...section,
            slug,
            display_order: section.display_order ?? nextOrder,
            movies: [], // Deprecated: using movies_by_region now
            movies_by_region: section.movies_by_region || {}
        })
        .select();

    if (error) {
        console.error('Error creating homepage section:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Update a homepage section
export const updateHomepageSection = async (id, updates) => {
    const { data, error } = await supabase
        .from('homepage_sections')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select();

    if (error) {
        console.error('Error updating homepage section:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Delete a homepage section
export const deleteHomepageSection = async (id) => {
    const { error } = await supabase
        .from('homepage_sections')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting homepage section:', error);
        return { success: false, error };
    }
    return { success: true };
};

// Get all TV sections (ordered by display_order)
// Hydrates from movies_library with slim card fields only
export const getTVSections = async (activeOnly = false) => {
    let query = supabase
        .from('tv_sections')
        .select('*')
        .order('display_order', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data: sections, error } = await query;

    if (error) {
        console.error('Error fetching tv sections:', error);
        return [];
    }

    if (!sections || sections.length === 0) return [];

    // ============================================================
    // GLOBAL LIBRARY HYDRATION LOGIC (Unified for TV)
    // ============================================================
    const tmdbIdsToFetch = new Set();

    sections.forEach(section => {
        if (!section.movies_by_region) return;

        Object.values(section.movies_by_region).forEach(movieList => {
            if (!Array.isArray(movieList)) return;
            movieList.forEach(movie => {
                if (movie.tmdb_id) {
                    tmdbIdsToFetch.add(String(movie.tmdb_id));
                }
            });
        });
    });

    if (tmdbIdsToFetch.size === 0) return sections;

    const { data: globalMovies, error: libError } = await supabase
        .from('movies_library')
        .select(LIBRARY_CARD_SELECT)
        .in('tmdb_id', Array.from(tmdbIdsToFetch));

    if (libError) {
        console.error('Error fetching global movies for TV sections:', libError);
        return sections;
    }

    const movieMap = new Map();
    globalMovies?.forEach(m => {
        movieMap.set(String(m.tmdb_id), m);
    });

    const hydratedSections = sections.map(section => {
        if (!section.movies_by_region) return section;

        const hydatedMoviesByRegion = {};

        Object.keys(section.movies_by_region).forEach(regionCode => {
            const rawMovies = section.movies_by_region[regionCode] || [];

            hydatedMoviesByRegion[regionCode] = rawMovies.map(rawMovie => {
                const globalMovie = movieMap.get(String(rawMovie.tmdb_id));

                if (globalMovie) {
                    return {
                        ...rawMovie,
                        ...globalMovie,
                        release_date: globalMovie.release_date || globalMovie.first_air_date || rawMovie.release_date,
                    };
                }
                return rawMovie;
            });
        });

        return {
            ...section,
            movies_by_region: hydatedMoviesByRegion
        };
    });

    return hydratedSections;
};

// Toggle section active status
export const toggleHomepageSectionActive = async (id) => {
    // First get current status
    const { data: section } = await supabase
        .from('homepage_sections')
        .select('is_active')
        .eq('id', id)
        .single();

    if (!section) return { success: false, error: 'Section not found' };

    return updateHomepageSection(id, { is_active: !section.is_active });
};

// Reorder sections (update display_order for all)
export const reorderHomepageSections = async (orderedIds) => {
    const updates = orderedIds.map((id, index) => ({
        id,
        display_order: index + 1,
        updated_at: new Date().toISOString()
    }));

    // Update each section's order
    for (const update of updates) {
        await supabase
            .from('homepage_sections')
            .update({ display_order: update.display_order, updated_at: update.updated_at })
            .eq('id', update.id);
    }

    return { success: true };
};

// Add movie to a section - stores rich movie data for display
export const addMovieToSection = async (sectionId, movie) => {
    // Get current section
    const { data: section } = await supabase
        .from('homepage_sections')
        .select('movies')
        .eq('id', sectionId)
        .single();

    if (!section) return { success: false, error: 'Section not found' };

    const currentMovies = section.movies || [];

    const tmdbId = movie.tmdb_id || movie.id;

    // Check if movie already exists
    if (currentMovies.some(m => m.tmdb_id === tmdbId || m.tmdb_id === String(tmdbId))) {
        return { success: false, error: 'Movie already in section' };
    }

    // Add movie with rich data for display (includes all fields needed for Home page)
    const newMovie = {
        tmdb_id: tmdbId,
        title: movie.title || movie.name,
        poster_path: movie.poster_path,
        backdrop_path: movie.backdrop_path,
        media_type: movie.media_type || 'movie',
        release_date: movie.release_date || movie.first_air_date,
        vote_average: movie.vote_average,
        overview: movie.overview,
        popularity: movie.popularity,
        original_language: movie.original_language,
        genres: movie.genres,
        runtime: movie.runtime,
        order: currentMovies.length + 1
    };

    return updateHomepageSection(sectionId, { movies: [...currentMovies, newMovie] });
};

// Remove movie from a section
export const removeMovieFromSection = async (sectionId, tmdbId) => {
    // Get current section
    const { data: section } = await supabase
        .from('homepage_sections')
        .select('movies')
        .eq('id', sectionId)
        .single();

    if (!section) return { success: false, error: 'Section not found' };

    const updatedMovies = (section.movies || [])
        .filter(m => m.tmdb_id !== tmdbId)
        .map((m, index) => ({ ...m, order: index + 1 }));

    return updateHomepageSection(sectionId, { movies: updatedMovies });
};

// Reorder movies within a section
export const reorderSectionMovies = async (sectionId, orderedTmdbIds) => {
    // Get current section
    const { data: section } = await supabase
        .from('homepage_sections')
        .select('movies')
        .eq('id', sectionId)
        .single();

    if (!section) return { success: false, error: 'Section not found' };

    const movieMap = new Map((section.movies || []).map(m => [m.tmdb_id, m]));
    const reorderedMovies = orderedTmdbIds
        .filter(id => movieMap.has(id))
        .map((id, index) => ({ ...movieMap.get(id), order: index + 1 }));

    return updateHomepageSection(sectionId, { movies: reorderedMovies });
};

// Get movies from library by array of tmdb_ids
// Returns a map of tmdb_id -> full movie data for easy lookup
export const getMoviesFromLibraryByIds = async (tmdbIds) => {
    if (!tmdbIds || tmdbIds.length === 0) return new Map();

    // Convert all IDs to strings for consistent matching
    const stringIds = tmdbIds.map(id => String(id));

    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_SELECT)
        .in('tmdb_id', stringIds);

    if (error) {
        console.error('Error fetching movies from library:', error);
        return new Map();
    }

    // Create a map for quick lookup
    const movieMap = new Map();
    (data || []).forEach(movie => {
        movieMap.set(String(movie.tmdb_id), movie);
    });

    return movieMap;
};

// =============================================
// USER MOVIE INTERACTIONS (Watchlist, Liked, Watched)
// =============================================

// Get user's movie status (watchlist, liked, watched)
// Gracefully handles missing tables
export const getUserMovieStatus = async (userId, movieId) => {
    if (!userId) return { inWatchlist: false, isLiked: false, isWatched: false };

    try {
        const [watchlist, liked, watched] = await Promise.all([
            supabase.from('user_watchlist').select('id').eq('user_id', userId).eq('movie_id', movieId).maybeSingle(),
            supabase.from('user_liked_movies').select('id').eq('user_id', userId).eq('movie_id', movieId).maybeSingle(),
            supabase.from('user_watched_movies').select('id').eq('user_id', userId).eq('movie_id', movieId).maybeSingle()
        ]);

        return {
            inWatchlist: !!watchlist?.data,
            isLiked: !!liked?.data,
            isWatched: !!watched?.data
        };
    } catch (error) {
        console.log('User movie status fetch error (tables may not exist):', error.message);
        return { inWatchlist: false, isLiked: false, isWatched: false };
    }
};

// Toggle Watchlist
export const toggleWatchlist = async (userId, movieId, movieTitle, posterPath, mediaType = 'movie') => {
    if (!userId) return { success: false, error: 'Not logged in' };

    const { data: existing } = await supabase
        .from('user_watchlist')
        .select('id')
        .eq('user_id', userId)
        .eq('movie_id', movieId)
        .single();

    if (existing) {
        // Remove from watchlist
        const { error } = await supabase
            .from('user_watchlist')
            .delete()
            .eq('user_id', userId)
            .eq('movie_id', movieId);
        return { success: !error, added: false };
    } else {
        // Add to watchlist
        const { error } = await supabase
            .from('user_watchlist')
            .insert({ user_id: userId, movie_id: movieId, movie_title: movieTitle, poster_path: posterPath, media_type: mediaType });
        return { success: !error, added: true };
    }
};

// Toggle Liked
export const toggleLikedMovie = async (userId, movieId, movieTitle, posterPath, mediaType = 'movie') => {
    if (!userId) return { success: false, error: 'Not logged in' };

    const { data: existing } = await supabase
        .from('user_liked_movies')
        .select('id')
        .eq('user_id', userId)
        .eq('movie_id', movieId)
        .single();

    if (existing) {
        const { error } = await supabase
            .from('user_liked_movies')
            .delete()
            .eq('user_id', userId)
            .eq('movie_id', movieId);
        return { success: !error, added: false };
    } else {
        const { error } = await supabase
            .from('user_liked_movies')
            .insert({ user_id: userId, movie_id: movieId, movie_title: movieTitle, poster_path: posterPath, media_type: mediaType });
        return { success: !error, added: true };
    }
};

// Toggle Watched
export const toggleWatchedMovie = async (userId, movieId, movieTitle, posterPath, mediaType = 'movie') => {
    if (!userId) return { success: false, error: 'Not logged in' };

    const { data: existing } = await supabase
        .from('user_watched_movies')
        .select('id')
        .eq('user_id', userId)
        .eq('movie_id', movieId)
        .single();

    if (existing) {
        const { error } = await supabase
            .from('user_watched_movies')
            .delete()
            .eq('user_id', userId)
            .eq('movie_id', movieId);
        return { success: !error, added: false };
    } else {
        const { error } = await supabase
            .from('user_watched_movies')
            .insert({ user_id: userId, movie_id: movieId, movie_title: movieTitle, poster_path: posterPath, media_type: mediaType });
        return { success: !error, added: true };
    }
};

// Get user's watchlist
export const getUserWatchlist = async (userId) => {
    if (!userId) return [];
    const { data, error } = await supabase
        .from('user_watchlist')
        .select('*')
        .eq('user_id', userId)
        .order('added_at', { ascending: false });
    return data || [];
};

// Get user's liked movies
export const getUserLikedMovies = async (userId) => {
    if (!userId) return [];
    const { data } = await supabase
        .from('user_liked_movies')
        .select('*')
        .eq('user_id', userId)
        .order('liked_at', { ascending: false });
    return data || [];
};

// Get user's watched movies
export const getUserWatchedMovies = async (userId) => {
    if (!userId) return [];
    const { data } = await supabase
        .from('user_watched_movies')
        .select('*')
        .eq('user_id', userId)
        .order('watched_at', { ascending: false });
    return data || [];
};

// =============================================
// COLLECTIONS
// =============================================

// Get user's collections with poster data
export const getUserCollections = async (userId) => {
    if (!userId) return [];
    const { data } = await supabase
        .from('user_collections')
        .select('*, collection_movies(movie_id, poster_path, movie_title)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    return data || [];
};

// Create user collection
export const createUserCollection = async (userId, name, description = '', isPublic = false) => {
    if (!userId) return { success: false };
    const { data, error } = await supabase
        .from('user_collections')
        .insert({ user_id: userId, name, description, is_public: isPublic })
        .select()
        .single();
    return { success: !error, data };
};

// Helper to create slug from name
const createSlug = (text) => {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
};

// Get collection by SEO-friendly slug (matches against slugified name)
// Now hydrates movie data from global movies_library for full poster/image support
export const getCollectionBySlug = async (slug) => {
    // Fetch all collections and find matching slug
    const { data: collections, error } = await supabase
        .from('user_collections')
        .select('*, collection_movies(*)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching collections:", error);
        return null;
    }

    // Find collection where slugified name matches
    const collection = collections?.find(c => createSlug(c.name) === slug);

    if (!collection) {
        return null;
    }

    // Fetch user profile separately
    if (collection.user_id) {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('username, avatar_id')
            .eq('id', collection.user_id)
            .single();

        collection.user_profiles = profile;
    }

    // ============================================================
    // HYDRATE COLLECTION MOVIES FROM GLOBAL LIBRARY
    // ============================================================
    if (collection.collection_movies && collection.collection_movies.length > 0) {
        // Collect all movie IDs
        const movieIds = collection.collection_movies.map(m => String(m.movie_id));

        // Fetch full details from movies_library
        const { data: libraryMovies, error: libError } = await supabase
            .from('movies_library')
            .select(LIBRARY_CARD_SELECT)
            .in('tmdb_id', movieIds);

        if (!libError && libraryMovies && libraryMovies.length > 0) {
            // Create lookup map
            const movieMap = new Map();
            libraryMovies.forEach(m => {
                movieMap.set(String(m.tmdb_id), m);
            });

            // Hydrate collection_movies with library data
            collection.collection_movies = collection.collection_movies.map(collMovie => {
                const libraryMovie = movieMap.get(String(collMovie.movie_id));
                if (libraryMovie) {
                    return {
                        ...collMovie,
                        poster_path: libraryMovie.poster_path || collMovie.poster_path,
                        backdrop_path: libraryMovie.backdrop_path,
                        title: libraryMovie.title || collMovie.movie_title,
                        vote_average: libraryMovie.vote_average,
                        release_date: libraryMovie.release_date,
                        overview: libraryMovie.overview,
                        genres: libraryMovie.genres,
                        runtime: libraryMovie.runtime,
                    };
                }
                return collMovie;
            });
        }
    }

    return collection;
};

// Update user collection (by ID)
export const updateUserCollection = async (collectionId, updates) => {
    const { data: existing } = await supabase
        .from('user_collections')
        .select('is_system, collection_kind')
        .eq('id', collectionId)
        .maybeSingle();

    const patch = existing?.is_system
        ? {
            description: updates.description,
            is_public: updates.is_public,
        }
        : {
            name: updates.name,
            description: updates.description,
            is_public: updates.is_public,
        };

    const { data, error } = await supabase
        .from('user_collections')
        .update(patch)
        .eq('id', collectionId)
        .select()
        .single();

    if (error) {
        console.error("Error updating collection:", error);
    }

    return { success: !error, data, error };
};

// Add movie to collection
export const addToCollection = async (collectionId, movieId, movieTitle, posterPath, mediaType = 'movie') => {
    console.log("Adding to collection:", { collectionId, movieId, movieTitle, posterPath, mediaType });

    const movieKey = String(movieId);
    const { data, error } = await supabase
        .from('collection_movies')
        .upsert(
            {
                collection_id: collectionId,
                movie_id: movieKey,
                movie_title: movieTitle,
                poster_path: posterPath,
                media_type: mediaType,
            },
            { onConflict: 'collection_id,movie_id' },
        )
        .select();

    if (error) {
        console.error('Error adding to collection:', error);
        return { success: false, error, data };
    }

    return { success: true, error: null, data };
};

// Remove movie from collection
export const removeFromCollection = async (collectionId, movieId) => {
    const { error } = await supabase
        .from('collection_movies')
        .delete()
        .eq('collection_id', collectionId)
        .eq('movie_id', movieId);
    return { success: !error, error };
};

// Get collection with movies
export const getCollection = async (collectionId) => {
    // First get the collection with movies
    const { data: collection, error } = await supabase
        .from('user_collections')
        .select('*, collection_movies(*)')
        .eq('id', collectionId)
        .single();

    if (error) {
        console.error("Error fetching collection:", error);
        return null;
    }

    // Then get the user profile separately
    if (collection?.user_id) {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('username, avatar_id')
            .eq('id', collection.user_id)
            .single();

        collection.user_profiles = profile;
    }

    return collection;
};

// Get collection by name and userId
export const getCollectionByName = async (userId, collectionName) => {
    const { data: collection, error } = await supabase
        .from('user_collections')
        .select('*, collection_movies(*)')
        .eq('user_id', userId)
        .eq('name', collectionName)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("Error fetching collection by name:", error);
        return null;
    }

    // Fetch user profile separately
    if (collection?.user_id) {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('username, avatar_id')
            .eq('id', collection.user_id)
            .single();

        collection.user_profiles = profile;
    }

    return collection;
};

// Add multiple movies to collection
export const addMoviesToCollection = async (collectionId, movies) => {
    const byMovieId = new Map();
    for (const m of movies || []) {
        const movieId = String(m.id ?? m.tmdb_id ?? m.movie_id);
        if (!movieId) continue;
        byMovieId.set(movieId, {
            collection_id: collectionId,
            movie_id: movieId,
            movie_title: m.title || m.name || m.movie_title,
            poster_path: m.poster_path,
            media_type: m.media_type || 'movie',
        });
    }

    const records = Array.from(byMovieId.values());
    if (!records.length) {
        return { success: false, error: new Error('No movies to add') };
    }

    const { data, error } = await supabase
        .from('collection_movies')
        .upsert(records, { onConflict: 'collection_id,movie_id' })
        .select();

    if (error) {
        console.error("Error adding movies:", error);
    } else {
        console.log("Added movies successfully:", data);
    }

    return { success: !error, error, data };
};

// =============================================
// USER FOLLOWS
// =============================================

// Toggle follow
export const toggleFollow = async (followerId, followingId) => {
    if (!followerId || followerId === followingId) return { success: false };

    const { data: existing } = await supabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .single();

    if (existing) {
        const { error } = await supabase
            .from('user_follows')
            .delete()
            .eq('follower_id', followerId)
            .eq('following_id', followingId);
        return { success: !error, following: false };
    } else {
        const { error } = await supabase
            .from('user_follows')
            .insert({ follower_id: followerId, following_id: followingId });
        return { success: !error, following: true };
    }
};

// Get user's followers
export const getUserFollowers = async (userId) => {
    const { data } = await supabase
        .from('user_follows')
        .select('follower_id, user_profiles!user_follows_follower_id_fkey(username, display_name, avatar_id)')
        .eq('following_id', userId);
    return data || [];
};

// Get user's following
export const getUserFollowing = async (userId) => {
    const { data } = await supabase
        .from('user_follows')
        .select('following_id, user_profiles!user_follows_following_id_fkey(username, display_name, avatar_id)')
        .eq('follower_id', userId);
    return data || [];
};

// Check if following
export const isFollowing = async (followerId, followingId) => {
    if (!followerId) return false;
    const { data } = await supabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .single();
    return !!data;
};

// =============================================
// PROFILE SEARCH
// =============================================

// Search profiles by username
export const searchProfiles = async (query, limit = 10) => {
    if (!query || query.length < 2) return [];
    const { data } = await supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_id')
        .ilike('username', `%${query}%`)
        .limit(limit);
    return data || [];
};

// Get profile by username
export const getProfileByUsername = async (username) => {
    if (!username) return null;
    const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('username', username)
        .single();

    if (error) return null;
    return data;
};

// Get user's rating count
export const getUserRatingsCount = async (userId) => {
    if (!userId) return 0;
    const { count } = await supabase
        .from('ratings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
    return count || 0;
};

// =============================================
// ADVANCED MOVIES LIBRARY - Full TMDB Data
// =============================================

// Save full movie/TV details to the existing movies_library table
// This now uses a single table with JSONB columns for detailed data
// Enhanced to properly handle TV series with all fields
export const saveFullMovieToLibrary = async (movieData, additionalData = {}) => {
    // Determine the ID: prefer passed ID, then stringified ID from object
    const tmdbId = movieData.id.toString();

    // Determine if this is a TV show based on data properties
    const isTV = !!(movieData.first_air_date || movieData.number_of_seasons || movieData.episode_run_time);
    const mediaType = additionalData.media_type || (isTV ? 'tv' : 'movie');

    // Extract genre IDs for efficient filtering
    const genreIds = movieData.genres?.map(g => g.id).filter(Boolean) || [];

    // Prepare the record with all detailed data
    const movieRecord = {
        tmdb_id: tmdbId,
        media_type: mediaType,
        title: movieData.title || movieData.name,
        original_title: movieData.original_title || movieData.original_name,
        overview: movieData.overview,
        tagline: movieData.tagline,
        poster_path: movieData.poster_path,
        backdrop_path: movieData.backdrop_path,
        release_date: movieData.release_date || movieData.first_air_date,
        status: movieData.status,
        runtime: movieData.runtime || movieData.episode_run_time?.[0],
        vote_average: movieData.vote_average,
        vote_count: movieData.vote_count,
        popularity: movieData.popularity,

        // JSONB Fields for Lists
        genres: movieData.genres,
        genre_ids: genreIds,  // Extract for efficient filtering
        production_companies: movieData.production_companies,
        production_countries: movieData.production_countries,
        spoken_languages: movieData.spoken_languages,

        // TV Series specific fields
        first_air_date: movieData.first_air_date,
        last_air_date: movieData.last_air_date,
        number_of_seasons: movieData.number_of_seasons,
        number_of_episodes: movieData.number_of_episodes,
        networks: movieData.networks,
        in_production: movieData.in_production,
        episode_run_time: movieData.episode_run_time,
        origin_country: movieData.origin_country,
        original_language: movieData.original_language,

        // New Detailed JSONB Fields (base64 stripped — use TMDB CDN paths)
        credits: stripCreditsBase64(movieData.credits),
        videos: movieData.videos?.results || [],
        images: stripImagesBase64(movieData.images),
        reviews: movieData.reviews?.results || [], // TMDB user reviews
        similar_movies: movieData.similar?.results || movieData.similar || [], // Similar movies/TV
        recommendations: movieData.recommendations?.results || movieData.recommendations || [], // Recommended
        keywords: movieData.keywords?.keywords || movieData.keywords?.results || [], // Keywords
        release_dates_data: movieData.release_dates?.results || [], // Certifications and dates

        // Additional Info
        imdb_id: movieData.imdb_id || movieData.external_ids?.imdb_id,
        homepage: movieData.homepage,
        budget: movieData.budget,
        revenue: movieData.revenue,
        belongs_to_collection: movieData.belongs_to_collection,
        adult: movieData.adult || false,

        // Meta
        is_active: true,
        synced_at: new Date().toISOString(),
        ...additionalData
    };

    const result = await persistLibraryRecords(movieRecord);
    if (!result.success) return result;

    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return { success: true, data: row };
};

// Get Single Advanced Movie (just wraps standard get)
export const getAdvancedMovieFromLibrary = async (movieId) => {
    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIE_DETAIL_SELECT)
        .eq('tmdb_id', movieId.toString())
        .single();

    if (error) {
        console.error('Error fetching movie details:', error);
        return { success: false, error };
    }

    return { success: true, data };
};

// Get stats for the library (simplified for single table)
export const getAdvancedLibraryStats = async () => {
    const { count, error } = await supabase
        .from('movies_library')
        .select('id', { count: 'exact', head: true });

    if (error) return { totalMovies: 0 };
    return { totalMovies: count };
};

export const getAdvancedMoviesLibrary = async (options = {}) => {
    let query = supabase.from('movies_library').select(MOVIES_LIBRARY_SELECT);

    if (options.limit) query = query.limit(options.limit);
    if (options.page && options.limit) {
        const from = (options.page - 1) * options.limit;
        query = query.range(from, from + options.limit - 1);
    }

    // Sorting (default to created_at desc)
    const sortField = options.sort || 'created_at';
    const sortOrder = options.order === 'asc';
    query = query.order(sortField, { ascending: sortOrder });

    const { data, error, count } = await query;

    if (error) {
        console.error('Error fetching advanced movies:', error);
        return { success: false, error };
    }

    return { success: true, data, count };
};

export const searchAdvancedMoviesLibrary = async (searchTerm, limit = 20) => {
    const { buildLibrarySearchOrClause } = await import('./searchUtils.js');
    const orClause = buildLibrarySearchOrClause(searchTerm);
    if (!orClause) return [];

    const { data, error } = await supabase
        .from('movies_library')
        .select(MOVIES_LIBRARY_SELECT)
        .or(orClause)
        .limit(limit);

    if (error) {
        console.error('Error searching advanced movies:', error);
        return [];
    }

    return data;
};

// Check if movie exists in the new library
export const checkMovieInAdvancedLibrary = async (movieId) => {
    const { data, error } = await supabase
        .from('movies')
        .select('id, title, synced_at')
        .eq('id', movieId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error checking movie:', error);
    }

    return data;
};

// Bulk check which movies are in the library (by TMDB id)
export const checkMoviesInAdvancedLibrary = async (movieIds) => {
    const ids = movieIds.map((id) => String(id));
    const { data, error } = await supabase
        .from('movies_library')
        .select('tmdb_id')
        .in('tmdb_id', ids);

    if (error) {
        console.error('Error bulk checking movies_library:', error);
        return new Set();
    }

    return new Set(data?.map((m) => Number(m.tmdb_id)) || []);
};

// Get global user stats (total users)
export const getGlobalUserStats = async () => {
    const { count, error } = await supabase
        .from('user_profiles')
        .select('id', { count: 'exact', head: true });

    if (error) {
        console.error('Error fetching user count:', error);
        return { totalUsers: 0 };
    }
    return { totalUsers: count || 0 };
};

// =============================================
// CONTROL TOWER — SYNC + EVENTS + SETTINGS
// =============================================

export const DEFAULT_APP_SETTINGS = {
    siteName: 'TheaterOrStream',
    siteDescription: 'Discover what to watch and where to stream it',
    defaultRegion: 'IN',
    maxSectionsHome: 10,
    cacheTimeout: 3600,
    enableReviews: true,
    enableRatings: true,
    enableWatchlist: true,
    enableCollections: true,
};

export const getAppSettings = async (key = 'site') => {
    const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();

    if (error) {
        console.error('Error fetching app settings:', error);
        return { ...DEFAULT_APP_SETTINGS };
    }

    return { ...DEFAULT_APP_SETTINGS, ...(data?.value || {}) };
};

export const saveAppSettings = async (settings, key = 'site') => {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
        .from('app_settings')
        .upsert({
            key,
            value: settings,
            updated_by: user?.id || null,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })
        .select('value')
        .single();

    if (error) {
        console.error('Error saving app settings:', error);
        return { success: false, error };
    }

    return { success: true, data: data?.value };
};

export const getSyncState = async () => {
    const { data, error } = await supabase
        .from('tmdb_sync_state')
        .select('*')
        .order('job_name');

    if (error) {
        console.error('Error fetching sync state:', error);
        return [];
    }

    return data || [];
};

export const getSyncRuns = async ({ limit = 25, jobName = null } = {}) => {
    let query = supabase
        .from('tmdb_sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit);

    if (jobName) {
        query = query.eq('job_name', jobName);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching sync runs:', error);
        return [];
    }

    return data || [];
};

export const getContentEvents = async ({ status = null, limit = 50 } = {}) => {
    let query = supabase
        .from('content_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (status && status !== 'all') {
        query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching content events:', error);
        return [];
    }

    return data || [];
};

export const createContentEvent = async (event) => {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
        .from('content_events')
        .insert({
            ...event,
            created_by: user?.id || null,
        })
        .select('*')
        .single();

    if (error) {
        console.error('Error creating content event:', error);
        return { success: false, error };
    }

    return { success: true, data };
};

export const updateContentEventStatus = async (id, status, extra = {}) => {
    const patch = {
        status,
        ...extra,
    };

    if (status === 'processing') {
        patch.started_at = new Date().toISOString();
    }
    if (status === 'done' || status === 'failed' || status === 'cancelled') {
        patch.processed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
        .from('content_events')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();

    if (error) {
        console.error('Error updating content event:', error);
        return { success: false, error };
    }

    return { success: true, data };
};

export default supabase;
