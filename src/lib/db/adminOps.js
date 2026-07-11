import { supabase } from '../supabaseClient.js';

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

// Count of TV shows still missing seasons data — lets the Backfill TV Seasons
// admin card show real progress (the count going down) across repeated runs.
export const getTvSeasonsBackfillRemaining = async () => {
    const { count, error } = await supabase
        .from('movies_library')
        .select('tmdb_id', { count: 'exact', head: true })
        .eq('media_type', 'tv')
        .eq('is_active', true)
        .eq('seasons', JSON.stringify([]));

    if (error) {
        console.error('Error counting TV seasons backfill remaining:', error);
        return null;
    }
    return count ?? null;
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
