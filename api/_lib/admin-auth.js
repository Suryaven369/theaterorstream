import { createClient } from '@supabase/supabase-js';

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

export async function requireAdmin(request) {
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

        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('is_admin')
            .eq('id', user.id)
            .single();

        if (profileError || !profile?.is_admin) {
            return { ok: false, status: 403, message: 'Admin access required' };
        }

        return { ok: true, user, profile };
    } catch (error) {
        console.error('admin auth error:', error);
        return { ok: false, status: 500, message: 'Authentication check failed' };
    }
}
