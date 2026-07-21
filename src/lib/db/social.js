import { supabase } from '../supabaseClient.js';
import { normalizeProfileMediaUrls } from '../storagePublicUrl.js';
import { fillMissingCollectionPosters } from './collections.js';

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
    const map = new Map((data || []).map((p) => [p.id, normalizeProfileMediaUrls(p)]));
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

// Get suggested users to follow (excludes current user and already-followed users)
export const getSuggestedUsersToFollow = async (currentUserId, limit = 3) => {
    // Get IDs of users the current user is already following
    let excludeIds = currentUserId ? [currentUserId] : [];
    
    if (currentUserId) {
        const { data: following } = await supabase
            .from('user_follows')
            .select('following_id')
            .eq('follower_id', currentUserId);
        if (following?.length) {
            excludeIds = [...excludeIds, ...following.map((f) => f.following_id)];
        }
    }

    // Get random users not in the exclude list, prioritize verified/active users
    let query = supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_url, is_verified')
        .not('username', 'is', null);
    
    if (excludeIds.length) {
        query = query.not('id', 'in', `(${excludeIds.join(',')})`);
    }

    const { data, error } = await query
        .order('is_verified', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit + 5); // Fetch a few extra for randomization

    if (error) {
        console.warn('[getSuggestedUsersToFollow]', error.message);
        return [];
    }

    // Shuffle and take the requested limit for variety
    const shuffled = (data || []).sort(() => Math.random() - 0.5);
    return shuffled.slice(0, limit).map(normalizeProfileMediaUrls);
};

// =============================================
// PROFILE SEARCH
// =============================================

// Search profiles by username
export const searchProfiles = async (query, limit = 10) => {
    if (!query || query.length < 2) return [];
    const { data } = await supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_id, avatar_url, is_verified')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(limit);
    return (data || []).map(normalizeProfileMediaUrls);
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

/** Recent public user lists for Explore browse rail.
 *  @param {number} limit
 *  @param {{ category?: 'all'|'list'|'franchise' }} [options]
 *  category filters Explore tabs (Franchise = admin/official lists).
 */
export const getRecentPublicCollections = async (limit = 6, options = {}) => {
    const category =
        options.category && options.category !== 'all' ? options.category : null;

    // Prefer posters via embed; fall back to a plain list if the embed 400s
    // (schema/RLS/PostgREST), so the Explore panel never goes empty.
    let data = null;
    let usedEmbed = false;

    const applyCategory = (query) => {
        if (!category) return query;
        let q = query.eq('category', category);
        // Franchise tab only shows admin-approved lists
        if (category === 'franchise') {
            q = q.eq('moderation_status', 'approved');
        }
        return q;
    };

    {
        let nestedQuery = supabase
            .from('user_collections')
            .select('id, name, slug, description, user_id, is_public, created_at, category, collection_movies(movie_id, poster_path, movie_title, added_at)')
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .order('added_at', { foreignTable: 'collection_movies', ascending: false })
            .limit(limit);
        nestedQuery = applyCategory(nestedQuery);

        let nested = await nestedQuery;

        // Pre-migration DBs may not have `category` yet.
        if (nested.error && /category/i.test(nested.error.message || '')) {
            nestedQuery = supabase
                .from('user_collections')
                .select('id, name, slug, description, user_id, is_public, created_at, collection_movies(movie_id, poster_path, movie_title, added_at)')
                .eq('is_public', true)
                .order('created_at', { ascending: false })
                .order('added_at', { foreignTable: 'collection_movies', ascending: false })
                .limit(limit);
            nested = await nestedQuery;
        }

        if (!nested.error && nested.data) {
            data = nested.data;
            usedEmbed = true;
        } else if (nested.error) {
            console.warn('getRecentPublicCollections embed:', nested.error.message);
        }
    }

    if (!data) {
        let plainQuery = supabase
            .from('user_collections')
            .select('id, name, slug, description, user_id, is_public, created_at, category')
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(limit);
        plainQuery = applyCategory(plainQuery);

        let plain = await plainQuery;
        if (plain.error && /category/i.test(plain.error.message || '')) {
            plain = await supabase
                .from('user_collections')
                .select('id, name, slug, description, user_id, is_public, created_at')
                .eq('is_public', true)
                .order('created_at', { ascending: false })
                .limit(limit);
        }

        if (plain.error) {
            console.error('getRecentPublicCollections:', plain.error);
            return [];
        }
        data = plain.data || [];
    }

    if (!data.length) return [];

    const ids = data.map((c) => c.id);
    const userIds = [...new Set(data.map((c) => c.user_id))];

    const [profilesRes, coversRes, moviesRes] = await Promise.all([
        supabase
            .from('user_profiles')
            .select('id, username, display_name')
            .in('id', userIds),
        supabase
            .from('user_collections')
            .select('id, cover_image')
            .in('id', ids),
        usedEmbed
            ? Promise.resolve({ data: null, error: null })
            : supabase
                .from('collection_movies')
                .select('collection_id, movie_id, poster_path, movie_title, added_at')
                .in('collection_id', ids)
                .order('added_at', { ascending: false }),
    ]);

    if (coversRes.error) {
        console.warn('getRecentPublicCollections covers:', coversRes.error.message);
    }
    if (moviesRes.error) {
        console.warn('getRecentPublicCollections movies:', moviesRes.error.message);
    }

    const profileMap = new Map((profilesRes.data || []).map((p) => [p.id, p]));
    const coverMap = new Map((coversRes.data || []).map((c) => [c.id, c.cover_image || null]));
    const moviesByCollection = new Map();
    const countByCollection = new Map();

    if (!usedEmbed) {
        for (const row of moviesRes.data || []) {
            countByCollection.set(row.collection_id, (countByCollection.get(row.collection_id) || 0) + 1);
            const list = moviesByCollection.get(row.collection_id) || [];
            if (list.length < 4) list.push(row);
            moviesByCollection.set(row.collection_id, list);
        }
    }

    return fillMissingCollectionPosters(data.map((c) => {
        const embedded = usedEmbed ? (c.collection_movies || []) : null;
        const movies = embedded
            ? [...embedded].slice(0, 8)
            : (moviesByCollection.get(c.id) || []);
        const movieCount = embedded
            ? embedded.length
            : (countByCollection.get(c.id) || 0);

        return {
            id: c.id,
            name: c.name,
            slug: c.slug,
            description: c.description,
            user_id: c.user_id,
            is_public: c.is_public,
            created_at: c.created_at,
            category: c.category || 'list',
            cover_image: coverMap.get(c.id) || null,
            collection_movies: movies,
            movie_count: movieCount,
            owner: profileMap.get(c.user_id) || null,
        };
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
    return normalizeProfileMediaUrls(data);
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
