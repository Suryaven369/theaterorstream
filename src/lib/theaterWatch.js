import { supabase, addToCollection } from './supabase';

export const THEATER_WATCH_KIND = 'watched_in_theater';
export const THEATER_COLLECTION_NAME = 'Watched in Theaters';
export const THEATER_COLLECTION_DESCRIPTION =
    'Movies you logged as watched in the theater — updated automatically from your diary.';

export function watchedInTheaterFromContext(watchedWith = []) {
    return Array.isArray(watchedWith) && watchedWith.includes('theater');
}

export async function ensureWatchedInTheaterCollection(userId) {
    if (!userId) return null;

    const { data: existing, error: findError } = await supabase
        .from('user_collections')
        .select('id, name, is_system, collection_kind')
        .eq('user_id', userId)
        .eq('collection_kind', THEATER_WATCH_KIND)
        .maybeSingle();

    if (findError) {
        console.error('ensureWatchedInTheaterCollection find:', findError);
    }
    if (existing?.id) return existing.id;

    const { data, error } = await supabase
        .from('user_collections')
        .insert({
            user_id: userId,
            name: THEATER_COLLECTION_NAME,
            description: THEATER_COLLECTION_DESCRIPTION,
            is_public: false,
            is_system: true,
            collection_kind: THEATER_WATCH_KIND,
        })
        .select('id')
        .single();

    if (error) {
        console.error('ensureWatchedInTheaterCollection insert:', error);
        return null;
    }

    return data?.id || null;
}

export async function syncMovieToTheaterCollection(userId, { tmdbId, title, posterPath, mediaType }) {
    if (!userId || !tmdbId || !title) return { success: false };

    const collectionId = await ensureWatchedInTheaterCollection(userId);
    if (!collectionId) return { success: false };

    return addToCollection(collectionId, tmdbId, title, posterPath, mediaType || 'movie');
}

export async function getTheaterWatchLogs(userId, { limit = 50 } = {}) {
    if (!userId) return [];

    const { data, error } = await supabase
        .from('movie_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('watched_in_theater', true)
        .order('watched_on', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('getTheaterWatchLogs:', error);
        return [];
    }

    return data || [];
}

export async function getTheaterActivityFeed(userId, limit = 40) {
    if (!userId) return [];

    const { data, error } = await supabase
        .from('activity_feed')
        .select('*')
        .eq('user_id', userId)
        .eq('watched_in_theater', true)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('getTheaterActivityFeed:', error);
        return [];
    }

    return data || [];
}

export function isTheaterSystemCollection(collection) {
    return collection?.is_system === true
        && collection?.collection_kind === THEATER_WATCH_KIND;
}
