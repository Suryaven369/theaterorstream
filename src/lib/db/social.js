import { supabase } from '../supabaseClient.js';

// =============================================
// USER FOLLOWS
// =============================================

// Toggle follow
export const toggleFollow = async (followerId, followingId) => {
    if (!followerId || !followingId || followerId === followingId) return { success: false };

    // maybeSingle() = no 406/PGRST116 console noise when not yet following.
    const { data: existing } = await supabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .maybeSingle();

    if (existing) {
        const { error } = await supabase
            .from('user_follows')
            .delete()
            .eq('follower_id', followerId)
            .eq('following_id', followingId);
        if (error) console.error('[follow] unfollow failed:', error.message);
        return { success: !error, following: false, error: error?.message };
    }

    const { error } = await supabase
        .from('user_follows')
        .insert({ follower_id: followerId, following_id: followingId });
    if (error) console.error('[follow] follow failed:', error.message);
    return { success: !error, following: true, error: error?.message };
};

// user_follows.follower_id/following_id reference auth.users (no FK to user_profiles), so
// PostgREST can't embed the profile — fetch the follow rows, then batch-load the profiles.
const hydrateFollowProfiles = async (ids) => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return [];
    const { data } = await supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_id, avatar_url')
        .in('id', unique);
    const map = new Map((data || []).map((p) => [p.id, p]));
    // Preserve follow order, drop any profiles that no longer exist
    return unique.map((id) => map.get(id)).filter(Boolean);
};

// Get user's followers (people who follow `userId`) as profile objects
export const getUserFollowers = async (userId) => {
    if (!userId) return [];
    const { data } = await supabase
        .from('user_follows')
        .select('follower_id')
        .eq('following_id', userId);
    return hydrateFollowProfiles((data || []).map((r) => r.follower_id));
};

// Get who `userId` is following, as profile objects
export const getUserFollowing = async (userId) => {
    if (!userId) return [];
    const { data } = await supabase
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', userId);
    return hydrateFollowProfiles((data || []).map((r) => r.following_id));
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
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(limit);
    return data || [];
};

// Search public collections by name or description
export const searchPublicCollections = async (query, limit = 20) => {
    if (!query || query.length < 2) return [];
    const { data, error } = await supabase
        .from('user_collections')
        .select('id, name, slug, description, user_id, is_public, created_at')
        .eq('is_public', true)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('searchPublicCollections:', error);
        return [];
    }

    if (!data?.length) return data || [];

    const userIds = [...new Set(data.map((c) => c.user_id))];
    const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, display_name')
        .in('id', userIds);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    return data.map((c) => ({
        ...c,
        owner: profileMap.get(c.user_id) || null,
    }));
};

// Get profile by username (case-insensitive — URLs / search casing may differ)
export const getProfileByUsername = async (username) => {
    if (!username) return null;
    const needle = String(username).trim();
    if (!needle) return null;

    const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .ilike('username', needle)
        .limit(1)
        .maybeSingle();

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
