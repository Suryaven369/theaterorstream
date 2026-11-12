/**
 * The user's streaming services (OTT subscriptions) + home region.
 * Stored in user_streaming_services; drives "on your services" filtering.
 */
import { getSupabaseAdmin } from './supabase-admin.js';
import {
    DEFAULT_REGION,
    normalizeRegion,
    providerIdsForServiceRow,
    getRegionProviderCatalog,
} from './watch-providers-server.js';

const MAX_SERVICES = 20;

async function loadRows(supabase, userId) {
    let res = await supabase
        .from('user_streaming_services')
        .select('service_id, region, provider_id, provider_name, logo_path, is_active')
        .eq('user_id', userId)
        .eq('is_active', true);
    if (res.error && /provider_(id|name)|logo_path/.test(res.error.message || '')) {
        // Migration not applied yet — legacy columns only.
        res = await supabase
            .from('user_streaming_services')
            .select('service_id, region, is_active')
            .eq('user_id', userId)
            .eq('is_active', true);
    }
    if (res.error) throw new Error(res.error.message);
    return res.data || [];
}

/**
 * Normalised view of a user's services:
 * { region, providerIds: number[], services: [{ id, name, logo }] }
 */
export async function getUserStreamingSetup(userId, supabaseClient = null) {
    const supabase = supabaseClient || getSupabaseAdmin();
    const rows = await loadRows(supabase, userId);

    const regionCounts = {};
    rows.forEach((r) => {
        const code = normalizeRegion(r.region);
        if (code) regionCounts[code] = (regionCounts[code] || 0) + 1;
    });
    const region = Object.entries(regionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || DEFAULT_REGION;

    const providerIds = [];
    const services = [];
    rows.forEach((r) => {
        const ids = providerIdsForServiceRow(r);
        ids.forEach((id) => { if (!providerIds.includes(id)) providerIds.push(id); });
        if (ids.length) {
            services.push({ id: ids[0], name: r.provider_name || null, logo: r.logo_path || null });
        }
    });

    // Fill in names/logos for legacy rows from the regional catalog.
    if (services.some((s) => !s.name)) {
        try {
            const catalog = await getRegionProviderCatalog(region);
            const byId = new Map(catalog.map((p) => [p.id, p]));
            services.forEach((s) => {
                const hit = byId.get(s.id);
                if (hit) {
                    s.name = s.name || hit.name;
                    s.logo = s.logo || hit.logo;
                }
            });
        } catch { /* names are cosmetic */ }
    }

    return { region, providerIds, services: services.filter((s) => s.name), hasServices: providerIds.length > 0 };
}

/**
 * Replace the user's services.
 * @param {{ region: string, providers: Array<{id:number,name?:string,logo?:string}|number> }} body
 */
export async function saveUserStreamingSetup(userId, body = {}) {
    const supabase = getSupabaseAdmin();
    const region = normalizeRegion(body.region) || DEFAULT_REGION;

    const catalog = await getRegionProviderCatalog(region).catch(() => []);
    const byId = new Map(catalog.map((p) => [p.id, p]));

    const picked = [];
    (Array.isArray(body.providers) ? body.providers : []).forEach((p) => {
        const id = Number(typeof p === 'object' ? p?.id : p);
        if (!Number.isFinite(id) || id <= 0 || picked.some((x) => x.id === id)) return;
        const meta = byId.get(id) || {};
        picked.push({
            id,
            name: meta.name || (typeof p === 'object' ? p.name : null) || null,
            logo: meta.logo || (typeof p === 'object' ? p.logo : null) || null,
        });
    });
    const services = picked.slice(0, MAX_SERVICES);

    const { error: delError } = await supabase
        .from('user_streaming_services')
        .delete()
        .eq('user_id', userId);
    if (delError) throw new Error(delError.message);

    if (services.length) {
        const rows = services.map((s) => ({
            user_id: userId,
            service_id: String(s.id),
            region,
            provider_id: s.id,
            provider_name: s.name,
            logo_path: s.logo,
            is_active: true,
            source: 'settings',
        }));
        let { error } = await supabase.from('user_streaming_services').insert(rows);
        if (error && /provider_(id|name)|logo_path/.test(error.message || '')) {
            // Pre-migration fallback: provider id lives in service_id.
            ({ error } = await supabase.from('user_streaming_services').insert(
                rows.map(({ provider_id, provider_name, logo_path, ...rest }) => rest),
            ));
        }
        if (error) throw new Error(error.message);
    }

    // Saved Watch rows are kept until their 7 days are up (no mid-week refresh).

    return getUserStreamingSetup(userId, supabase);
}
