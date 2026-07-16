import { supabase } from '../supabaseClient.js';
import { normalizeProfileMediaUrls } from '../storagePublicUrl.js';

// Helper functions for movie ratings and reviews

const normalizeMovieId = (movieId) => String(movieId);

const isUuid = (value) =>
    typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** Attach avatar/profile fields from user_profiles onto review rows. */
async function hydrateReviewAuthors(reviews) {
    if (!reviews?.length) return reviews || [];

    const userIds = [...new Set(
        reviews.map((r) => r.user_id).filter((id) => id && id !== 'anonymous' && isUuid(id)),
    )];
    const usernames = [...new Set(
        reviews
            .filter((r) => !(r.user_id && isUuid(r.user_id)) && r.username)
            .map((r) => String(r.username).replace(/^@/, '').trim())
            .filter(Boolean),
    )];

    const profileById = new Map();
    const profileByUsername = new Map();

    if (userIds.length) {
        const { data } = await supabase
            .from('user_profiles')
            .select('id, username, display_name, avatar_id, avatar_url')
            .in('id', userIds);
        (data || []).forEach((p) => {
            const normalized = normalizeProfileMediaUrls(p);
            profileById.set(p.id, normalized);
            if (p.username) profileByUsername.set(String(p.username).toLowerCase(), normalized);
        });
    }

    if (usernames.length) {
        const missing = usernames.filter((u) => !profileByUsername.has(u.toLowerCase()));
        if (missing.length) {
            const { data } = await supabase
                .from('user_profiles')
                .select('id, username, display_name, avatar_id, avatar_url')
                .in('username', missing);
            (data || []).forEach((p) => {
                const normalized = normalizeProfileMediaUrls(p);
                profileById.set(p.id, normalized);
                if (p.username) profileByUsername.set(String(p.username).toLowerCase(), normalized);
            });
        }
    }

    return reviews.map((review) => {
        const byId = review.user_id && isUuid(review.user_id)
            ? profileById.get(review.user_id)
            : null;
        const byName = review.username
            ? profileByUsername.get(String(review.username).replace(/^@/, '').toLowerCase())
            : null;
        const profile = byId || byName;
        if (!profile) return review;
        return {
            ...review,
            avatar_url: profile.avatar_url || null,
            avatar_id: profile.avatar_id || null,
            username: profile.username || review.username,
            display_name: profile.display_name || null,
        };
    });
}

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
    return hydrateReviewAuthors(data || []);
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

// Delete a review (owner only — caller should pass current user id)
export const deleteReview = async (reviewId, userId) => {
    if (!reviewId || !userId || userId === 'anonymous') {
        return { success: false, error: 'Not allowed' };
    }

    const { error } = await supabase
        .from('reviews')
        .delete()
        .eq('id', reviewId)
        .eq('user_id', String(userId));

    if (error) {
        console.error('Error deleting review:', error);
        return { success: false, error };
    }
    return { success: true };
};
