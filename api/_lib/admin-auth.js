import { createClient } from '@supabase/supabase-js';
import { checkRateLimitMemory } from './rate-limit.js';
import { logAdminActionAsync, AUDIT_ACTIONS } from './audit-log.js';
import { getSupabaseAdmin } from './supabase-admin.js';

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

/**
 * Extract client IP address from request
 */
function getClientIp(request) {
    const forwarded = getRequestHeader(request, 'x-forwarded-for');
    const realIp = getRequestHeader(request, 'x-real-ip');
    const cfIp = getRequestHeader(request, 'cf-connecting-ip');
    
    return cfIp || forwarded?.split(',')[0]?.trim() || realIp || 'unknown';
}

/**
 * Check if IP is in the admin whitelist (if configured)
 */
function checkIpWhitelist(request) {
    const whitelist = process.env.ADMIN_IP_WHITELIST;
    if (!whitelist) return { allowed: true };
    
    const clientIp = getClientIp(request);
    const allowedIps = whitelist.split(',').map(ip => ip.trim()).filter(Boolean);
    
    if (allowedIps.length === 0) return { allowed: true };
    
    const isAllowed = allowedIps.some(allowed => {
        if (allowed.includes('/')) {
            return isIpInCidr(clientIp, allowed);
        }
        return clientIp === allowed;
    });
    
    return { allowed: isAllowed, clientIp };
}

/**
 * Simple CIDR check (supports /24, /16, /8)
 */
function isIpInCidr(ip, cidr) {
    const [network, bits] = cidr.split('/');
    const mask = parseInt(bits, 10);
    
    const ipParts = ip.split('.').map(Number);
    const networkParts = network.split('.').map(Number);
    
    const octetsToCheck = Math.ceil(mask / 8);
    
    for (let i = 0; i < octetsToCheck; i++) {
        if (i < Math.floor(mask / 8)) {
            if (ipParts[i] !== networkParts[i]) return false;
        }
    }
    
    return true;
}

/**
 * Enhanced admin authentication with rate limiting and IP whitelist
 */
export async function requireAdmin(request, options = {}) {
    const { 
        rateLimit = true, 
        rateLimitType = 'admin_read',
        logAction = false,
        actionName = null,
    } = options;
    
    // Check IP whitelist first
    const ipCheck = checkIpWhitelist(request);
    if (!ipCheck.allowed) {
        console.warn(`Admin access blocked for IP: ${ipCheck.clientIp}`);
        return { ok: false, status: 403, message: 'Access denied from this IP address' };
    }
    
    const clientIp = getClientIp(request);
    
    // Check rate limit (using memory-based for speed)
    if (rateLimit) {
        const rateLimitResult = checkRateLimitMemory(`ip:${clientIp}`, rateLimitType);
        if (!rateLimitResult.allowed) {
            return { 
                ok: false, 
                status: 429, 
                message: 'Too many requests. Please try again later.',
                retryAfter: 60,
            };
        }
    }
    
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

        // Read is_admin with the service role, NOT the caller's token. The privilege decision
        // must not depend on RLS read policies — only on the server-trusted DB value (which
        // end-user JWTs can't write, per the user_profiles protection trigger).
        const admin = getSupabaseAdmin();
        const { data: profile, error: profileError } = await admin
            .from('user_profiles')
            .select('is_admin, username')
            .eq('id', user.id)
            .single();

        if (profileError || !profile?.is_admin) {
            return { ok: false, status: 403, message: 'Admin access required' };
        }
        
        // Log admin action if requested
        if (logAction && actionName) {
            logAdminActionAsync({
                adminId: user.id,
                action: actionName,
                request,
                metadata: { username: profile.username },
            });
        }

        return { 
            ok: true, 
            user, 
            profile,
            clientIp,
        };
    } catch (error) {
        console.error('admin auth error:', error);
        return { ok: false, status: 500, message: 'Authentication check failed' };
    }
}

/**
 * Require admin with write rate limiting
 */
export async function requireAdminWrite(request, options = {}) {
    return requireAdmin(request, { 
        ...options, 
        rateLimitType: 'admin_write',
    });
}

/**
 * Require admin for sync operations (stricter rate limit)
 */
export async function requireAdminSync(request, options = {}) {
    return requireAdmin(request, { 
        ...options, 
        rateLimitType: 'sync_trigger',
    });
}

/**
 * Log admin action helper (for use after successful auth)
 */
export function logAction(auth, action, details = {}) {
    if (!auth?.ok || !auth?.user?.id) return;
    
    logAdminActionAsync({
        adminId: auth.user.id,
        action,
        ...details,
    });
}
