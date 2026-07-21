/**
 * Public diagnostics for production env wiring (no secrets leaked).
 * GET /api/health
 */
export const config = {
    runtime: 'nodejs',
    maxDuration: 15,
};

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const hasUrl = !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
    const hasAnon = !!(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const hasServiceRole = serviceKey.length > 0;
    // service_role JWTs are long; short values usually mean a bad paste.
    const serviceRoleLen = serviceKey.length;

    let dbOk = null;
    let dbError = null;
    let dbHint = null;

    if (hasUrl && hasServiceRole) {
        try {
            const { getSupabaseAdmin } = await import('./_lib/supabase-admin.js');
            const supabase = getSupabaseAdmin();
            const { error } = await supabase.from('movies_library').select('tmdb_id').limit(1);
            dbOk = !error;
            dbError = error?.message || null;
            dbHint = error?.hint || error?.code || null;
        } catch (error) {
            dbOk = false;
            dbError = error.message || String(error);
        }
    } else {
        dbOk = false;
        dbError = !hasUrl
            ? 'Missing VITE_SUPABASE_URL / SUPABASE_URL'
            : 'Missing SUPABASE_SERVICE_ROLE_KEY on this deployment';
    }

    return res.status(200).json({
        ok: !!(hasUrl && hasAnon && hasServiceRole && dbOk),
        env: {
            hasUrl,
            hasAnon,
            hasServiceRole,
            serviceRoleLen,
            hasMistKey: !!(process.env.MIST_API_KEY || process.env.MISTRAL_API_KEY),
            hasTmdb: !!process.env.TMDB_ACCESS_TOKEN,
        },
        db: { ok: dbOk, error: dbError, hint: dbHint },
        node: process.version,
        tip: !hasServiceRole
            ? 'Add SUPABASE_SERVICE_ROLE_KEY in Vercel, then Redeploy (env changes need a new deployment).'
            : dbOk
                ? 'Server DB access looks good.'
                : 'Service role is present but DB query failed — check key value or Supabase project.',
    });
}
