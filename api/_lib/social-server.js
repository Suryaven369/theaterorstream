import { getSupabaseAdmin } from './supabase-admin.js';
import { updateUserStreak } from './streak-server.js';

export async function recordDecisionPick(userId, movie) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('activity_feed').insert({
        user_id: userId,
        event_type: 'decision_pick',
        target_tmdb_id: String(movie.tmdb_id),
        target_movie_title: movie.title,
        target_poster_path: movie.poster_path,
        media_type: movie.media_type || 'movie',
        payload: {},
        visibility: 'public',
        engagement_score: 3,
    });
    if (error) throw new Error(error.message);
    await updateUserStreak(userId);
    return { ok: true };
}

export async function createSocialReview(userId, body) {
    const supabase = getSupabaseAdmin();
    const row = {
        user_id: userId,
        tmdb_id: String(body.tmdb_id),
        media_type: body.media_type || 'movie',
        movie_title: body.movie_title,
        poster_path: body.poster_path || null,
        title: body.title,
        content: body.content,
        spoiler: !!body.spoiler,
        rating_id: body.rating_id || null,
        visibility: body.visibility || 'public',
    };

    const { data, error } = await supabase.from('social_reviews').insert(row).select().single();
    if (error) throw new Error(error.message);

    await supabase.from('activity_feed').insert({
        user_id: userId,
        event_type: 'review',
        target_tmdb_id: row.tmdb_id,
        target_movie_title: row.movie_title,
        target_poster_path: row.poster_path,
        media_type: row.media_type,
        payload: { review_id: data.id, title: row.title, excerpt: row.content.slice(0, 120) },
        visibility: row.visibility,
        engagement_score: 5,
    });

    await updateUserStreak(userId);
    return { review: data };
}

export async function toggleReviewLike(userId, reviewId) {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
        .from('review_likes')
        .select('review_id')
        .eq('user_id', userId)
        .eq('review_id', reviewId)
        .maybeSingle();

    if (existing) {
        await supabase.from('review_likes').delete().eq('user_id', userId).eq('review_id', reviewId);
        return { liked: false };
    }

    await supabase.from('review_likes').insert({ user_id: userId, review_id: reviewId });
    return { liked: true };
}

export async function addReviewComment(userId, reviewId, content, parentId = null) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from('review_comments')
        .insert({ user_id: userId, review_id: reviewId, content, parent_id: parentId })
        .select()
        .single();
    if (error) throw new Error(error.message);

    return data;
}

export async function toggleCollectionLike(userId, collectionId) {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
        .from('collection_likes')
        .select('collection_id')
        .eq('user_id', userId)
        .eq('collection_id', collectionId)
        .maybeSingle();

    if (existing) {
        await supabase.from('collection_likes').delete().eq('user_id', userId).eq('collection_id', collectionId);
        return { liked: false };
    }

    await supabase.from('collection_likes').insert({ user_id: userId, collection_id: collectionId });
    const { recordCollectionLikeActivity } = await import('./activity-feed-server.js');
    await recordCollectionLikeActivity(supabase, userId, collectionId);
    return { liked: true };
}
