import { createClient } from '@supabase/supabase-js';

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
// AUTHENTICATION FUNCTIONS
// =============================================

// Allowed email providers
const ALLOWED_EMAIL_PROVIDERS = [
    'gmail.com', 'yahoo.com', 'yahoo.in', 'yahoo.co.in',
    'outlook.com', 'hotmail.com', 'live.com',
    'icloud.com', 'me.com', 'mac.com'
];

// Check if email provider is allowed
export const isEmailAllowed = (email) => {
    const domain = email.split('@')[1]?.toLowerCase();
    return ALLOWED_EMAIL_PROVIDERS.includes(domain);
};

// Send OTP to email
export const sendEmailOTP = async (email) => {
    if (!isEmailAllowed(email)) {
        return { success: false, error: { message: 'Please use Gmail, Yahoo, Outlook, or iCloud email' } };
    }

    const { data, error } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase(),
        options: { shouldCreateUser: true }
    });
    if (error) {
        console.error('Error sending OTP:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Verify email OTP
export const verifyEmailOTP = async (email, token) => {
    const { data, error } = await supabase.auth.verifyOtp({
        email: email.toLowerCase(),
        token: token,
        type: 'email'
    });
    if (error) {
        console.error('Error verifying OTP:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Sign up with email and password
export const signUpWithEmail = async (email, password) => {
    if (!isEmailAllowed(email)) {
        return { success: false, error: { message: 'Please use Gmail, Yahoo, Outlook, or iCloud email' } };
    }

    const { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase(),
        password: password,
    });
    if (error) {
        console.error('Error signing up:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Sign in with email and password
export const signInWithEmail = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password: password,
    });
    if (error) {
        console.error('Error signing in:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Send password reset email
export const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
        console.error('Error sending reset email:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

// Sign out
export const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Error signing out:', error);
        return { success: false, error };
    }
    return { success: true };
};

// Update password (for password reset)
export const updatePassword = async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({
        password: newPassword
    });
    if (error) {
        console.error('Error updating password:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

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
        const restUrl = `${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}&select=*`;

        // Get auth token directly from localStorage
        let authToken = supabaseAnonKey;
        try {
            const storedSession = localStorage.getItem('theaterorstream-auth');
            if (storedSession) {
                const parsed = JSON.parse(storedSession);
                if (parsed?.access_token) {
                    authToken = parsed.access_token;
                }
            }
        } catch (e) {
            // Use anon key as fallback
        }

        const response = await fetch(restUrl, {
            headers: {
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.pgrst.object+json'
            }
        });

        if (response.status === 406) {
            return null; // No profile found
        }

        if (!response.ok) {
            return null;
        }

        return await response.json();
    } catch (err) {
        return null;
    }
};

// Check if username is available
export const checkUsernameAvailable = async (username) => {
    const { data, error } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('username', username.toLowerCase())
        .single();

    // If no data found, username is available
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
    const { data, error } = await supabase
        .from('user_profiles')
        .upsert({
            id: userId,
            username: profileData.username?.toLowerCase(),
            display_name: profileData.displayName,
            avatar_id: profileData.avatarId,
            date_of_birth: profileData.dateOfBirth,
            is_onboarded: true,
            updated_at: new Date().toISOString()
        })
        .select();

    if (error) {
        console.error('Error completing onboarding:', error);
        return { success: false, error };
    }
    return { success: true, data };
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

// Get all reviews for a movie (including replies)
export const getMovieReviews = async (movieId) => {
    const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('movie_id', movieId)
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
        .eq('movie_id', movieId);

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

// Get a specific user's rating for a movie
export const getUserRatingForMovie = async (userId, movieId) => {
    if (!userId || userId === 'anonymous') return null;

    const { data, error } = await supabase
        .from('ratings')
        .select('*')
        .eq('user_id', userId)
        .eq('movie_id', movieId)
        .single();

    if (error) {
        // PGRST116 = no rows found, not an error
        if (error.code === 'PGRST116') return null;
        return null;
    }
    return data;
};

// Submit or update a rating (upsert based on user_id + movie_id)
export const submitRating = async (movieId, movieTitle, ratings, userId = 'anonymous') => {
    // First check if user already has a rating for this movie
    const existingRating = await getUserRatingForMovie(userId, movieId);

    if (existingRating) {
        // Update existing rating
        const { data, error } = await supabase
            .from('ratings')
            .update({
                acting: ratings.acting,
                screenplay: ratings.screenplay,
                sound: ratings.sound,
                direction: ratings.direction,
                entertainment: ratings.entertainment,
                pacing: ratings.pacing,
                cinematography: ratings.cinematography,
                updated_at: new Date().toISOString()
            })
            .eq('id', existingRating.id)
            .select();

        if (error) {
            console.error('Error updating rating:', error);
            return { success: false, error };
        }
        return { success: true, data, updated: true };
    } else {
        // Insert new rating
        const { data, error } = await supabase
            .from('ratings')
            .insert({
                movie_id: movieId,
                movie_title: movieTitle,
                user_id: userId,
                acting: ratings.acting,
                screenplay: ratings.screenplay,
                sound: ratings.sound,
                direction: ratings.direction,
                entertainment: ratings.entertainment,
                pacing: ratings.pacing,
                cinematography: ratings.cinematography,
                created_at: new Date().toISOString()
            })
            .select();

        if (error) {
            console.error('Error submitting rating:', error);
            return { success: false, error };
        }
        return { success: true, data, updated: false };
    }
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
        .select('*')
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
        .select('*')
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
        .select('*')
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
        .select('*')
        .eq('tmdb_id', tmdbId.toString())
        .single();

    if (error) return null;
    return data;
};

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

    const { data, error } = await supabase
        .from('movies_library')
        .upsert(movieRecord, { onConflict: 'tmdb_id' })
        .select();

    if (error) {
        console.error('Error saving movie to library:', error);
        return { success: false, error };
    }
    return { success: true, data };
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

    const { data, error } = await supabase
        .from('movies_library')
        .upsert(movieRecords, { onConflict: 'tmdb_id' })
        .select();

    if (error) {
        console.error('Error bulk saving movies:', error);
        return { success: false, error, savedCount: 0 };
    }
    return { success: true, data, savedCount: data?.length || 0 };
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
    let query = supabase
        .from('movies_library')
        .select('*')
        .ilike('title', `%${searchTerm}%`)
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

// Get all homepage sections (ordered by display_order)
export const getHomepageSections = async (activeOnly = false) => {
    let query = supabase
        .from('homepage_sections')
        .select('*')
        .order('display_order', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching homepage sections:', error);
        return [];
    }
    return data || [];
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
            movies: section.movies || []
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

// Add movie to a section
export const addMovieToSection = async (sectionId, movie) => {
    // Get current section
    const { data: section } = await supabase
        .from('homepage_sections')
        .select('movies')
        .eq('id', sectionId)
        .single();

    if (!section) return { success: false, error: 'Section not found' };

    const currentMovies = section.movies || [];

    // Check if movie already exists
    if (currentMovies.some(m => m.tmdb_id === movie.tmdb_id)) {
        return { success: false, error: 'Movie already in section' };
    }

    // Add movie with next order
    const newMovie = {
        tmdb_id: movie.tmdb_id || movie.id,
        title: movie.title || movie.name,
        poster_path: movie.poster_path,
        media_type: movie.media_type || 'movie',
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

// =============================================
// USER MOVIE INTERACTIONS (Watchlist, Liked, Watched)
// =============================================

// Get user's movie status (watchlist, liked, watched)
export const getUserMovieStatus = async (userId, movieId) => {
    if (!userId) return { inWatchlist: false, isLiked: false, isWatched: false };

    const [watchlist, liked, watched] = await Promise.all([
        supabase.from('user_watchlist').select('id').eq('user_id', userId).eq('movie_id', movieId).single(),
        supabase.from('user_liked_movies').select('id').eq('user_id', userId).eq('movie_id', movieId).single(),
        supabase.from('user_watched_movies').select('id').eq('user_id', userId).eq('movie_id', movieId).single()
    ]);

    return {
        inWatchlist: !!watchlist.data,
        isLiked: !!liked.data,
        isWatched: !!watched.data
    };
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

    return collection;
};

// Update user collection (by ID)
export const updateUserCollection = async (collectionId, updates) => {
    const { data, error } = await supabase
        .from('user_collections')
        .update({
            name: updates.name,
            description: updates.description,
            is_public: updates.is_public
        })
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

    const { data, error } = await supabase
        .from('collection_movies')
        .insert({
            collection_id: collectionId,
            movie_id: String(movieId),
            movie_title: movieTitle,
            poster_path: posterPath,
            media_type: mediaType
        })
        .select();

    if (error) {
        console.error("Error adding to collection:", error);
    } else {
        console.log("Added to collection successfully:", data);
    }

    return { success: !error, error, data };
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
    const records = movies.map(m => ({
        collection_id: collectionId,
        movie_id: String(m.id),
        movie_title: m.title || m.name,
        poster_path: m.poster_path,
        media_type: m.media_type || 'movie'
    }));

    console.log("Adding movies to collection:", records);

    const { data, error } = await supabase
        .from('collection_movies')
        .insert(records)
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

// Save full movie details to the existing movies_library table
// This now uses a single table with JSONB columns for detailed data
export const saveFullMovieToLibrary = async (movieData, additionalData = {}) => {
    // Determine the ID: prefer passed ID, then stringified ID from object
    const tmdbId = movieData.id.toString();

    // Prepare the record with all detailed data
    const movieRecord = {
        tmdb_id: tmdbId,
        media_type: 'movie',
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
        production_companies: movieData.production_companies,
        production_countries: movieData.production_countries,
        spoken_languages: movieData.spoken_languages,

        // New Detailed JSONB Fields
        credits: movieData.credits,                // Contains cast and crew
        videos: movieData.videos?.results || [],   // Trailers, teasers
        images: movieData.images,                         // Posters, backdrops
        reviews: movieData.reviews?.results || [], // TMDB user reviews
        similar_movies: movieData.similar?.results || [], // Similar movies
        recommendations: movieData.recommendations?.results || [], // Recommended movies
        keywords: movieData.keywords?.keywords || [], // Keywords
        release_dates_data: movieData.release_dates?.results || [], // Certifications and dates

        // Additional Info
        imdb_id: movieData.imdb_id,
        homepage: movieData.homepage,
        budget: movieData.budget,
        revenue: movieData.revenue,
        belongs_to_collection: movieData.belongs_to_collection,

        // Meta
        is_active: true,
        synced_at: new Date().toISOString(),
        ...additionalData
    };

    // Upsert into the single movies_library table
    const { data, error } = await supabase
        .from('movies_library')
        .upsert(movieRecord, { onConflict: 'tmdb_id' })
        .select();

    if (error) {
        console.error('Error saving full movie to library:', error);
        return { success: false, error };
    }

    return { success: true, data: data[0] };
};

// Get Single Advanced Movie (just wraps standard get)
export const getAdvancedMovieFromLibrary = async (movieId) => {
    // Query the single table
    const { data, error } = await supabase
        .from('movies_library')
        .select('*')
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
        .select('*', { count: 'exact', head: true });

    if (error) return { totalMovies: 0 };
    return { totalMovies: count };
};

export const getAdvancedMoviesLibrary = async (options = {}) => {
    let query = supabase.from('movies_library').select('*');

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
    const { data, error } = await supabase
        .from('movies_library')
        .select('*')
        .ilike('title', `%${searchTerm}%`)
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

// Bulk check which movies are in the advanced library
export const checkMoviesInAdvancedLibrary = async (movieIds) => {
    const { data, error } = await supabase
        .from('movies')
        .select('id')
        .in('id', movieIds);

    if (error) {
        console.error('Error bulk checking movies:', error);
        return new Set();
    }

    return new Set(data?.map(m => m.id) || []);
};

export default supabase;
