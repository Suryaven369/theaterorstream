import { getSupabaseAdmin } from './supabase-admin.js';

/**
 * Log an admin action to the audit trail
 */
export async function logAdminAction({
    adminId,
    action,
    resourceType = null,
    resourceId = null,
    oldValue = null,
    newValue = null,
    request = null,
    metadata = {},
}) {
    const ipAddress = extractIpAddress(request);
    const userAgent = extractUserAgent(request);
    
    try {
        const supabase = getSupabaseAdmin();
        
        const { data, error } = await supabase.rpc('log_admin_action', {
            p_admin_id: adminId,
            p_action: action,
            p_resource_type: resourceType,
            p_resource_id: resourceId,
            p_old_value: oldValue,
            p_new_value: newValue,
            p_ip_address: ipAddress,
            p_user_agent: userAgent,
            p_metadata: metadata,
        });
        
        if (error) {
            console.error('Audit log failed:', error);
            return { success: false, error };
        }
        
        return { success: true, logId: data };
    } catch (err) {
        console.error('Audit log error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Log admin action synchronously (fire-and-forget)
 */
export function logAdminActionAsync(params) {
    logAdminAction(params).catch((err) => {
        console.error('Async audit log failed:', err);
    });
}

/**
 * Get audit logs for admin dashboard
 */
export async function getAuditLogs({
    adminId = null,
    action = null,
    resourceType = null,
    limit = 50,
    offset = 0,
} = {}) {
    const supabase = getSupabaseAdmin();
    
    let query = supabase
        .from('admin_audit_logs')
        .select(`
            id,
            admin_id,
            action,
            resource_type,
            resource_id,
            old_value,
            new_value,
            ip_address,
            user_agent,
            metadata,
            created_at
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    
    if (adminId) {
        query = query.eq('admin_id', adminId);
    }
    if (action) {
        query = query.eq('action', action);
    }
    if (resourceType) {
        query = query.eq('resource_type', resourceType);
    }
    
    const { data, error, count } = await query;
    
    if (error) {
        console.error('Get audit logs failed:', error);
        return { data: [], total: 0, error };
    }
    
    return { data: data || [], total: count || 0 };
}

/**
 * Extract IP address from request
 */
function extractIpAddress(request) {
    if (!request) return null;
    
    const headers = request.headers || {};
    const forwarded = getHeader(headers, 'x-forwarded-for');
    const realIp = getHeader(headers, 'x-real-ip');
    const cfIp = getHeader(headers, 'cf-connecting-ip');
    
    const ip = cfIp || forwarded?.split(',')[0]?.trim() || realIp;
    
    if (!ip || ip === 'unknown') return null;
    return ip;
}

/**
 * Extract user agent from request
 */
function extractUserAgent(request) {
    if (!request) return null;
    
    const headers = request.headers || {};
    return getHeader(headers, 'user-agent') || null;
}

function getHeader(headers, name) {
    const lower = name.toLowerCase();
    if (typeof headers.get === 'function') {
        return headers.get(name) || headers.get(lower);
    }
    return headers[lower] || headers[name];
}

/**
 * Action types for consistency
 */
export const AUDIT_ACTIONS = {
    // Library actions
    LIBRARY_CREATE: 'library.create',
    LIBRARY_UPDATE: 'library.update',
    LIBRARY_DELETE: 'library.delete',
    LIBRARY_BULK_IMPORT: 'library.bulk_import',
    LIBRARY_TOGGLE_FEATURED: 'library.toggle_featured',
    LIBRARY_TOGGLE_ACTIVE: 'library.toggle_active',
    
    // Sync actions
    SYNC_TRIGGER: 'sync.trigger',
    SYNC_COMPLETE: 'sync.complete',
    SYNC_FAILED: 'sync.failed',
    
    // Section actions
    SECTION_CREATE: 'section.create',
    SECTION_UPDATE: 'section.update',
    SECTION_DELETE: 'section.delete',
    
    // Collection actions
    COLLECTION_CREATE: 'collection.create',
    COLLECTION_UPDATE: 'collection.update',
    COLLECTION_DELETE: 'collection.delete',
    
    // Settings actions
    SETTINGS_UPDATE: 'settings.update',
    
    // User management
    USER_BAN: 'user.ban',
    USER_UNBAN: 'user.unban',
    USER_PROMOTE_ADMIN: 'user.promote_admin',
    USER_DEMOTE_ADMIN: 'user.demote_admin',
    
    // Auth actions
    ADMIN_LOGIN: 'auth.admin_login',
    ADMIN_LOGOUT: 'auth.admin_logout',
    
    // Taste/recommendation actions
    TASTE_REBUILD: 'taste.rebuild',
    EMBEDDING_BACKFILL: 'embedding.backfill',
};
