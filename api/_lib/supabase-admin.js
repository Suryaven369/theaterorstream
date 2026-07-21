import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        const missing = [];
        if (!supabaseUrl) missing.push('VITE_SUPABASE_URL or SUPABASE_URL');
        if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
        throw new Error(
            `Missing ${missing.join(' and ')}. `
            + 'Add SUPABASE_SERVICE_ROLE_KEY in Vercel → Environment Variables '
            + '(Supabase → Settings → API → service_role), then redeploy. '
            + 'Locally: put it in .env.local (server-side only).',
        );
    }

    return createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}
