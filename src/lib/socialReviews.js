import { supabase } from './supabase';

async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
}

function resolveApiBase() {
    const configured = import.meta.env.VITE_API_BASE_URL;
    if (configured) return configured.replace(/\/$/, '');
    return '';
}

async function postSocial(action, body) {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: 'not_signed_in' };

    try {
        const response = await fetch(`${resolveApiBase()}/api/social/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
        return { ok: true, ...payload };
    } catch (error) {
        if (import.meta.env.DEV) console.warn('[socialReviews]', action, error.message);
        return { ok: false, error: error.message };
    }
}

export function createSocialReview(review) {
    return postSocial('create-review', review);
}

export function toggleReviewLike(reviewId) {
    return postSocial('review-like', { review_id: reviewId });
}

export function addReviewComment(reviewId, content, parentId = null) {
    return postSocial('review-comment', { review_id: reviewId, content, parent_id: parentId });
}

export function updateStreak() {
    return postSocial('streak-update', {});
}

export async function fetchStreak() {
    const token = await getAccessToken();
    if (!token) return null;

    try {
        const response = await fetch(`${resolveApiBase()}/api/social/streak`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) return null;
        return payload.streak;
    } catch {
        return null;
    }
}

export async function getSocialReviewsForUser(userId, limit = 10) {
    const { data, error } = await supabase
        .from('social_reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        if (error.code === '42P01') return [];
        console.error('getSocialReviewsForUser:', error);
        return [];
    }
    return data || [];
}

export async function getReviewComments(reviewId) {
    const { data, error } = await supabase
        .from('review_comments')
        .select('*, profile:user_profiles(username, display_name, avatar_id)')
        .eq('review_id', reviewId)
        .order('created_at', { ascending: true });

    if (error) {
        if (error.code === '42P01') return [];
        return [];
    }
    return data || [];
}
