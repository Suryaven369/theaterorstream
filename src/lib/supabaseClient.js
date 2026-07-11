import { createClient } from '@supabase/supabase-js';

const supabaseRemoteUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** In Vite dev, same-origin proxy avoids browser CORS / Cloudflare 522 errors */
function getSupabaseClientUrl() {
    if (!import.meta.env.DEV) {
        return supabaseRemoteUrl || '';
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}/supabase-proxy`;
    }
    return 'http://localhost:5173/supabase-proxy';
}

const supabaseUrl = getSupabaseClientUrl();

if (!supabaseRemoteUrl || !supabaseAnonKey) {
    console.warn('Supabase credentials not found. Please check your .env file.');
}

// Create Supabase client - uses localStorage by default for session persistence
export const supabase = createClient(supabaseUrl, supabaseAnonKey || '', {
    auth: {
        persistSession: true,
        storageKey: 'theaterorstream-auth',
        storage: window.localStorage,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    }
});

export default supabase;
