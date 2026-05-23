import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        const missing = [];
        if (!supabaseUrl) missing.push('VITE_SUPABASE_URL or SUPABASE_URL');
        if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
        throw new Error(
            `Missing ${missing.join(' and ')} for cron sync. `
            + 'Add them to .env.local (server-side only). '
            + 'Service role: Supabase → Settings → API → service_role key.',
        );
    }

    return createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}
