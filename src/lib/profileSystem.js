// Profile system v2 — image upload, polymorphic follows, reputation, blocking,
// reporting, and privacy helpers. Built on the schema in
// 20260628000000_profile_system_v2.sql.
import { supabase } from './supabase';

// ===========================================================================
// Image upload (avatars + banners) — public buckets, files under <uid>/...
// ===========================================================================
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']; // kept for callers / docs
export const AVATAR_MAX_BYTES = 3 * 1024 * 1024;  // 3 MB
export const BANNER_MAX_BYTES = 6 * 1024 * 1024;  // 6 MB

async function uploadProfileImage(bucket, file, userId, maxBytes) {
    if (!userId) return { ok: false, error: 'Not signed in' };
    if (!file) return { ok: false, error: 'No file' };

    // Pasted / dropped files often have empty MIME — infer and accept any image/*
    let type = file.type || '';
    if (!type.startsWith('image/')) {
        const name = file.name || '';
        if (/\.png$/i.test(name)) type = 'image/png';
        else if (/\.webp$/i.test(name)) type = 'image/webp';
        else if (/\.gif$/i.test(name)) type = 'image/gif';
        else if (/\.avif$/i.test(name)) type = 'image/avif';
        else type = 'image/jpeg';
    }
    if (!type.startsWith('image/')) {
        return { ok: false, error: 'Use JPG, PNG, WEBP or GIF.' };
    }
    if (file.size > maxBytes) return { ok: false, error: `Image too large (max ${Math.round(maxBytes / 1048576)}MB).` };

    const ext = (type.split('/')[1] || file.name?.split('.').pop() || 'jpg')
        .toLowerCase()
        .replace('jpeg', 'jpg')
        .replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const body = type !== file.type ? new File([file], file.name || `upload.${ext}`, { type }) : file;
    const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: type, upsert: false });
    if (error) return { ok: false, error: error.message };
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
}

export const uploadAvatarImage = (file, userId) => uploadProfileImage('profile-avatars', file, userId, AVATAR_MAX_BYTES);
export const uploadBannerImage = (file, userId) => uploadProfileImage('profile-banners', file, userId, BANNER_MAX_BYTES);
export const uploadCollectionImage = (file, userId) => uploadProfileImage('collection-images', file, userId, BANNER_MAX_BYTES);
export const uploadBlogImage = (file, userId) => uploadProfileImage('blog-images', file, userId, BANNER_MAX_BYTES);

// ===========================================================================
// Polymorphic follows — collections / genres / directors / actors / franchises
// / creators. (User→user follows still use toggleFollow in supabase.js.)
// ===========================================================================
export const ENTITY_TYPES = ['collection', 'board', 'genre', 'director', 'actor', 'franchise', 'creator'];

export async function toggleEntityFollow(userId, { targetType, targetId, targetLabel, targetImage }) {
    if (!userId) return { success: false, error: 'Not signed in' };
    const tId = String(targetId);
    const { data: existing } = await supabase
        .from('entity_follows')
        .select('id')
        .eq('user_id', userId).eq('target_type', targetType).eq('target_id', tId)
        .maybeSingle();

    if (existing) {
        const { error } = await supabase.from('entity_follows').delete().eq('id', existing.id);
        return { success: !error, following: false, error: error?.message };
    }
    const { error } = await supabase.from('entity_follows').insert({
        user_id: userId, target_type: targetType, target_id: tId,
        target_label: targetLabel || null, target_image: targetImage || null,
    });
    return { success: !error, following: true, error: error?.message };
}

export async function isFollowingEntity(userId, targetType, targetId) {
    if (!userId) return false;
    const { data } = await supabase
        .from('entity_follows')
        .select('id')
        .eq('user_id', userId).eq('target_type', targetType).eq('target_id', String(targetId))
        .maybeSingle();
    return !!data;
}

export async function getEntityFollows(userId, targetType = null) {
    if (!userId) return [];
    let q = supabase.from('entity_follows').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (targetType) q = q.eq('target_type', targetType);
    const { data } = await q;
    return data || [];
}

export async function getEntityFollowerCount(targetType, targetId) {
    const { count } = await supabase
        .from('entity_follows')
        .select('*', { count: 'exact', head: true })
        .eq('target_type', targetType).eq('target_id', String(targetId));
    return count || 0;
}

// ===========================================================================
// Reputation — weighted sum of contribution signals, cached on the profile.
// ===========================================================================
const REP_WEIGHTS = { followers: 5, reviews: 10, badges: 15, blogs: 8, publicLists: 4, ratings: 1, watched: 1 };

export const REP_TIERS = [
    { min: 1500, name: 'Legend', color: '#f5c518', icon: '👑' },
    { min: 500, name: 'Critic', color: '#a855f7', icon: '🎯' },
    { min: 200, name: 'Enthusiast', color: '#3b82f6', icon: '🌟' },
    { min: 50, name: 'Regular', color: '#22c55e', icon: '🎬' },
    { min: 0, name: 'Newcomer', color: '#9ca3af', icon: '🌱' },
];

export function reputationTier(score) {
    return REP_TIERS.find((t) => score >= t.min) || REP_TIERS[REP_TIERS.length - 1];
}

async function countRows(table, column, value) {
    const { count, error } = await supabase
        .from(table).select('*', { count: 'exact', head: true }).eq(column, value);
    return error ? 0 : (count || 0);
}

// Computes reputation from live signals. Caches the number on the profile when
// computing your OWN (writable) profile.
export async function computeReputation(userId, { cache = false } = {}) {
    if (!userId) return { score: 0, tier: reputationTier(0), breakdown: {} };
    const uid = String(userId);

    const [followers, reviews, badges, blogs, publicLists, ratings, watched] = await Promise.all([
        countRows('user_follows', 'following_id', uid),
        countRows('social_reviews', 'user_id', uid),
        countRows('user_badges', 'user_id', uid),
        countRows('blog_posts', 'user_id', uid),
        (async () => {
            const { count } = await supabase.from('user_collections')
                .select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('is_public', true);
            return count || 0;
        })(),
        countRows('ratings', 'user_id', uid),
        countRows('user_watched_movies', 'user_id', uid),
    ]);

    const breakdown = { followers, reviews, badges, blogs, publicLists, ratings, watched };
    const score = Object.entries(REP_WEIGHTS).reduce((s, [k, w]) => s + (breakdown[k] || 0) * w, 0);

    if (cache) {
        supabase.from('user_profiles')
            .update({ reputation: score, reputation_updated_at: new Date().toISOString() })
            .eq('id', uid)
            .then(() => {}, () => {});
    }
    return { score, tier: reputationTier(score), breakdown };
}

// ===========================================================================
// Blocking + reporting
// ===========================================================================
export async function blockUser(blockerId, blockedId) {
    if (!blockerId || !blockedId || blockerId === blockedId) return { success: false };
    // Block implies un-following both ways.
    await supabase.from('user_follows').delete()
        .or(`and(follower_id.eq.${blockerId},following_id.eq.${blockedId}),and(follower_id.eq.${blockedId},following_id.eq.${blockerId})`);
    const { error } = await supabase.from('blocked_users').insert({ blocker_id: blockerId, blocked_id: blockedId });
    return { success: !error, error: error?.message };
}

export async function unblockUser(blockerId, blockedId) {
    const { error } = await supabase.from('blocked_users').delete()
        .eq('blocker_id', blockerId).eq('blocked_id', blockedId);
    return { success: !error, error: error?.message };
}

export async function getBlockedUsers(blockerId) {
    if (!blockerId) return [];
    const { data } = await supabase.from('blocked_users').select('blocked_id, created_at').eq('blocker_id', blockerId);
    return data || [];
}

export async function isBlocked(blockerId, blockedId) {
    if (!blockerId || !blockedId) return false;
    const { data } = await supabase.from('blocked_users')
        .select('blocker_id').eq('blocker_id', blockerId).eq('blocked_id', blockedId).maybeSingle();
    return !!data;
}

export async function reportUser(reporterId, reportedId, reason, details = '', context = null) {
    if (!reporterId || !reason) return { success: false };
    const { error } = await supabase.from('user_reports')
        .insert({ reporter_id: reporterId, reported_id: reportedId || null, reason, details: details || null, context });
    return { success: !error, error: error?.message };
}

// ===========================================================================
// Privacy — does the viewer have permission to see this profile / its activity?
// ===========================================================================
export async function canViewProfile(viewerId, profile, { isFollowing = null } = {}) {
    const vis = profile?.profile_visibility || 'public';
    if (vis === 'public') return true;
    if (!viewerId) return false;
    if (viewerId === profile?.id) return true;
    if (vis === 'private') return false;
    // followers-only
    if (isFollowing !== null) return isFollowing;
    const { data } = await supabase.from('user_follows')
        .select('follower_id').eq('follower_id', viewerId).eq('following_id', profile.id).maybeSingle();
    return !!data;
}
