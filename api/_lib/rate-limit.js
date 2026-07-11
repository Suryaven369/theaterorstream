import { getSupabaseAdmin } from './supabase-admin.js';

/**
 * Rate limiting configuration
 */
const RATE_LIMITS = {
    admin_read: { maxRequests: 100, windowMinutes: 1 },
    admin_write: { maxRequests: 30, windowMinutes: 1 },
    sync_trigger: { maxRequests: 10, windowMinutes: 5 },
    login_attempt: { maxRequests: 5, windowMinutes: 15 },
};

/**
 * Get client identifier from request
 */
function getClientIdentifier(request, userId = null) {
    const forwarded = getRequestHeader(request, 'x-forwarded-for');
    const realIp = getRequestHeader(request, 'x-real-ip');
    const ip = forwarded?.split(',')[0]?.trim() || realIp || 'unknown';
    
    return userId ? `user:${userId}` : `ip:${ip}`;
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
 * Check if request is within rate limit
 * Uses sliding window algorithm via Supabase
 */
export async function checkRateLimit(request, actionType, userId = null) {
    const config = RATE_LIMITS[actionType] || RATE_LIMITS.admin_read;
    const identifier = getClientIdentifier(request, userId);
    
    try {
        const supabase = getSupabaseAdmin();
        
        const { data, error } = await supabase.rpc('check_rate_limit', {
            p_identifier: identifier,
            p_action_type: actionType,
            p_max_requests: config.maxRequests,
            p_window_minutes: config.windowMinutes,
        });
        
        if (error) {
            console.error('Rate limit check failed:', error);
            return { allowed: true };
        }
        
        return {
            allowed: data === true,
            limit: config.maxRequests,
            window: config.windowMinutes,
        };
    } catch (err) {
        console.error('Rate limit error:', err);
        return { allowed: true };
    }
}

/**
 * Rate limit middleware for API handlers
 */
export function withRateLimit(actionType) {
    return async (req, res, next) => {
        const result = await checkRateLimit(req, actionType);
        
        if (!result.allowed) {
            return res.status(429).json({
                error: 'Too many requests',
                retryAfter: result.window * 60,
            });
        }
        
        if (typeof next === 'function') {
            return next();
        }
        return result;
    };
}

/**
 * Simple in-memory rate limiter for fallback
 */
const memoryStore = new Map();

export function checkRateLimitMemory(identifier, actionType) {
    const config = RATE_LIMITS[actionType] || RATE_LIMITS.admin_read;
    const key = `${identifier}:${actionType}`;
    const now = Date.now();
    const windowMs = config.windowMinutes * 60 * 1000;
    
    const record = memoryStore.get(key);
    
    if (!record || now - record.windowStart > windowMs) {
        memoryStore.set(key, { count: 1, windowStart: now });
        return { allowed: true };
    }
    
    record.count += 1;
    
    if (record.count > config.maxRequests) {
        return {
            allowed: false,
            limit: config.maxRequests,
            remaining: 0,
            resetAt: new Date(record.windowStart + windowMs),
        };
    }
    
    return {
        allowed: true,
        limit: config.maxRequests,
        remaining: config.maxRequests - record.count,
    };
}

// Cleanup old memory entries periodically
setInterval(() => {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000;
    
    for (const [key, record] of memoryStore.entries()) {
        if (now - record.windowStart > maxAge) {
            memoryStore.delete(key);
        }
    }
}, 5 * 60 * 1000);
