import { supabase } from '../supabaseClient.js';
import { normalizeProfileMediaUrls, toPublicStorageUrl } from '../storagePublicUrl.js';

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

        return normalizeProfileMediaUrls(data);
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

/** Normalize a public @handle: lowercase letters, numbers, underscore only. */
export function normalizeUsername(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 30);
}

/** True when the raw string already contains disallowed characters (before strip). */
export function usernameHasInvalidChars(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return false;
    return /[^a-zA-Z0-9_]/.test(s);
}

export function getUsernameValidationError(raw) {
    const original = String(raw ?? '').trim();
    if (!original) return 'Username is required';
    if (usernameHasInvalidChars(original)) {
        return 'Only letters, numbers, and underscore are allowed — no spaces or special characters';
    }
    const u = normalizeUsername(original);
    if (!u) return 'Username is required';
    if (u.length < 3) return 'Username must be at least 3 characters';
    if (u.length > 30) return 'Username must be at most 30 characters';
    if (!/^[a-z0-9_]{3,30}$/.test(u)) {
        return 'Only letters, numbers, and underscore are allowed';
    }
    return null;
}

// Check if username is available (case-insensitive)
export const checkUsernameAvailable = async (username, excludeUserId = null) => {
    const needle = normalizeUsername(username);
    if (!needle) return false;

    let query = supabase
        .from('user_profiles')
        .select('id')
        .ilike('username', needle);

    if (excludeUserId) {
        query = query.neq('id', excludeUserId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
        // Multiple rows shouldn't happen; treat as taken
        if (error.code === 'PGRST116') return false;
        console.error('Error checking username:', error);
        return false;
    }

    return !data;
};

// Update user profile
export const updateUserProfile = async (userId, updates) => {
    const patch = { ...updates, updated_at: new Date().toISOString() };

    // Username is required — never allow null/empty clears
    if ('username' in patch) {
        if (patch.username == null || String(patch.username).trim() === '') {
            return { success: false, error: { message: 'Username is required' } };
        }
        if (usernameHasInvalidChars(patch.username)) {
            return {
                success: false,
                error: { message: 'Only letters, numbers, and underscore are allowed — no spaces or special characters' },
            };
        }
        const normalized = normalizeUsername(patch.username);
        const formatError = getUsernameValidationError(normalized);
        if (formatError) {
            return { success: false, error: { message: formatError } };
        }
        const available = await checkUsernameAvailable(normalized, userId);
        if (!available) {
            return { success: false, error: { message: 'Username taken' } };
        }
        // Username is the public identity — keep display_name in sync
        patch.username = normalized;
        patch.display_name = normalized;
    }

    if (patch.avatar_url) patch.avatar_url = toPublicStorageUrl(patch.avatar_url);
    if (patch.profile_header_url) patch.profile_header_url = toPublicStorageUrl(patch.profile_header_url);

    const { data, error } = await supabase
        .from('user_profiles')
        .update(patch)
        .eq('id', userId)
        .select();

    if (error) {
        console.error('Error updating profile:', error);
        // Unique violation from DB
        if (error.code === '23505' || /unique|duplicate/i.test(error.message || '')) {
            return { success: false, error: { message: 'Username taken' } };
        }
        if (error.code === '23514' || /username_format|check constraint/i.test(error.message || '')) {
            return {
                success: false,
                error: { message: 'Only letters, numbers, and underscore are allowed' },
            };
        }
        return { success: false, error };
    }
    const rows = Array.isArray(data) ? data.map(normalizeProfileMediaUrls) : data;
    return { success: true, data: rows };
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

function fallbackUsernameFromId(userId) {
    const hex = String(userId || '').replace(/-/g, '').slice(0, 12);
    return normalizeUsername(`user_${hex}`) || `user_${Date.now().toString(36)}`;
}

async function allocateUsername(preferredRaw, userId) {
    let base = normalizeUsername(preferredRaw);
    if (base.length < 3) base = fallbackUsernameFromId(userId);

    let candidate = base;
    for (let n = 0; n < 50; n += 1) {
        const free = await checkUsernameAvailable(candidate, userId);
        if (free) return candidate;
        candidate = `${base.slice(0, 24)}_${n + 1}`;
    }
    return fallbackUsernameFromId(userId) + `_${Date.now().toString(36).slice(-4)}`;
}

// Create profile if not exists (fallback). Also backfills username from display_name
// for older accounts that only got a display name on signup.
export const ensureUserProfile = async (userId) => {
    const existing = await getUserProfile(userId);
    if (existing) {
        return ensureUsernameFromDisplayName(existing);
    }

    // Client-side fallback if the DB trigger hasn't created the row yet. Pulls name/avatar
    // from OAuth metadata (Google: full_name/name + avatar_url/picture) or the email handle.
    const { data: { user } } = await supabase.auth.getUser();
    const meta = user?.user_metadata || {};
    const displayName = meta.full_name
        || meta.name
        || (user?.email ? user.email.split('@')[0] : null);
    const avatarUrl = meta.avatar_url || meta.picture || null;
    const username = await allocateUsername(
        displayName || (user?.email ? user.email.split('@')[0] : ''),
        userId,
    );

    const { data, error } = await supabase
        .from('user_profiles')
        .upsert({
            id: userId,
            display_name: username,
            username,
            ...(avatarUrl && { avatar_url: avatarUrl }),
        }, { onConflict: 'id', ignoreDuplicates: true })
        .select()
        .single();

    if (error) {
        return await getUserProfile(userId);
    }

    return data;
};

/**
 * Older accounts often have display_name but NULL username.
 * Always assign a valid handle (letters/numbers/underscore only) — never leave null.
 */
export async function ensureUsernameFromDisplayName(profile) {
    if (!profile?.id) return profile;

    const current = normalizeUsername(profile.username || '');
    if (current.length >= 3 && /^[a-z0-9_]{3,30}$/.test(current) && current === String(profile.username || '').toLowerCase()) {
        return normalizeProfileMediaUrls(profile);
    }

    const username = await allocateUsername(profile.display_name || profile.username || '', profile.id);

    const { data, error } = await supabase
        .from('user_profiles')
        .update({
            username,
            display_name: username,
            updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id)
        .select()
        .maybeSingle();

    if (error) {
        console.error('Error backfilling username:', error);
        return normalizeProfileMediaUrls(profile);
    }

    return normalizeProfileMediaUrls(data) || (normalizeProfileMediaUrls(await getUserProfile(profile.id)) || profile);
}
