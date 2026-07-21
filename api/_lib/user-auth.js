import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

function getSupabaseAuthClient(accessToken) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase environment variables');
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { transport: ws },
    });
}

function getRequestHeader(request, name) {
    const lower = name.toLowerCase();
    if (request?.headers && typeof request.headers.get === 'function') {
        return request.headers.get(name) || request.headers.get(lower);
    }
    const headers = request?.headers || {};
    return headers[lower] || headers[name];
}

/** Any signed-in user (for taste rebuild on self). */
export async function requireUser(request) {
    const authHeader = getRequestHeader(request, 'authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return { ok: false, status: 401, message: 'Missing authorization token' };
    }

    const accessToken = authHeader.slice(7).trim();
    if (!accessToken) {
        return { ok: false, status: 401, message: 'Missing authorization token' };
    }

    try {
        const supabase = getSupabaseAuthClient(accessToken);
        const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);

        if (userError || !user) {
            return { ok: false, status: 401, message: 'Invalid or expired session' };
        }

        return { ok: true, user, accessToken };
    } catch (error) {
        console.error('user auth error:', error);
        return { ok: false, status: 500, message: 'Authentication check failed' };
    }
}
