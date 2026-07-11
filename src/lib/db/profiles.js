import { supabase } from '../supabaseClient.js';

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
    // Consider onboarded if ANY of these conditions are met:
    // 1. Explicitly marked as onboarded
    // 2. Has a username (basic profile setup done)
    // 3. Has onboarding_completed_at timestamp
    // 4. Has any activity (ratings, logs, etc.) indicated by updated_at being different from created_at
    return !!(
        profile.is_onboarded || 
        profile.username ||
        profile.onboarding_completed_at
    );
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

// Create profile if not exists (fallback)
export const ensureUserProfile = async (userId) => {
    const existing = await getUserProfile(userId);
    if (existing) {
        return existing;
    }

    // Client-side fallback if the DB trigger hasn't created the row yet. Pulls name/avatar
    // from OAuth metadata (Google: full_name/name + avatar_url/picture) or the email handle.
    const { data: { user } } = await supabase.auth.getUser();
    const meta = user?.user_metadata || {};
    const displayName = meta.full_name
        || meta.name
        || (user?.email ? user.email.split('@')[0] : null);
    const avatarUrl = meta.avatar_url || meta.picture || null;

    const { data, error } = await supabase
        .from('user_profiles')
        .upsert({
            id: userId,
            ...(displayName && { display_name: displayName }),
            ...(avatarUrl && { avatar_url: avatarUrl }),
        }, { onConflict: 'id', ignoreDuplicates: true })
        .select()
        .single();

    if (error) {
        return await getUserProfile(userId);
    }

    return data;
};
