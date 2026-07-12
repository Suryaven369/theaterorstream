import { requireAdminWrite, logAction } from '../_lib/admin-auth.js';
import { getSupabaseAdmin } from '../_lib/supabase-admin.js';
import { runSyncJob, SYNC_JOBS, backfillTvSeasons } from '../_lib/tmdb-sync-server.js';
import {
    rebuildUserTasteProfile,
    rebuildStaleTasteProfiles,
    backfillMovieEmbeddings,
} from '../_lib/taste-profile-server.js';
import { isEmbeddingConfigured } from '../_lib/embedding-server.js';
import { refreshAllRssSources, refreshRssSourceById, approveFeedArticleWithSummary, approveFeedArticleCandidate } from '../_lib/rss-server.js';
import { readJsonBody } from '../_lib/read-body.js';
import { dedupeLibraryRecords, upsertMoviesLibrary } from '../../src/lib/libraryDedupe.js';
import { AUDIT_ACTIONS } from '../_lib/audit-log.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 60,
};

const UPSERT_SELECT = 'tmdb_id, title, media_type, poster_path, is_active';

function getAction(req) {
    if (req.query?.action) return String(req.query.action);
    const path = String(req.url || '').split('?')[0];
    const parts = path.split('/').filter(Boolean);
    const idx = parts.indexOf('admin');
    return idx >= 0 ? parts[idx + 1] : null;
}

function sanitizeRecord(record) {
    const clean = { ...record };
    if (clean.tmdb_id != null) clean.tmdb_id = String(clean.tmdb_id);
    if (clean.release_date === '') delete clean.release_date;
    if (clean.first_air_date === '') delete clean.first_air_date;
    if (clean.last_air_date === '') delete clean.last_air_date;
    Object.keys(clean).forEach((key) => {
        if (clean[key] === undefined) delete clean[key];
    });
    return clean;
}

async function handleLibrary(req, res, auth) {
    const body = await readJsonBody(req);
    const rawRecords = body.records;

    if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
        return res.status(400).json({ error: 'records array is required' });
    }

    const records = dedupeLibraryRecords(
        rawRecords.map(sanitizeRecord).filter((r) => r.tmdb_id && r.title),
    );

    if (records.length === 0) {
        return res.status(400).json({ error: 'Each record needs tmdb_id and title' });
    }

    const supabase = getSupabaseAdmin();
    const CHUNK_SIZE = 40;
    const savedRows = [];

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const { data, error } = await upsertMoviesLibrary(supabase, chunk, UPSERT_SELECT);

        if (error) {
            console.error('admin library upsert failed:', error);
            return res.status(500).json({
                success: false,
                error: error.message,
                details: error,
                savedCount: savedRows.length,
                partial: savedRows.length > 0,
            });
        }

        if (data?.length) savedRows.push(...data);
    }

    const { count: libraryTotal } = await supabase
        .from('movies_library')
        .select('*', { count: 'exact', head: true });

    // Audit log the bulk import
    logAction(auth, AUDIT_ACTIONS.LIBRARY_BULK_IMPORT, {
        resourceType: 'library',
        request: req,
        metadata: { count: savedRows.length, libraryTotal },
    });

    return res.status(200).json({
        success: true,
        data: savedRows,
        savedCount: savedRows.length,
        libraryTotal: libraryTotal ?? null,
    });
}

async function handleSync(req, res, auth) {
    const body = await readJsonBody(req);
    const jobName = body.jobName;

    if (!jobName || !SYNC_JOBS[jobName]) {
        return res.status(400).json({
            error: 'Invalid jobName',
            allowed: Object.keys(SYNC_JOBS),
        });
    }

    // Audit log the sync trigger
    logAction(auth, AUDIT_ACTIONS.SYNC_TRIGGER, {
        resourceType: 'sync',
        resourceId: jobName,
        request: req,
    });

    const result = await runSyncJob(jobName);
    return res.status(200).json(result);
}

async function handleTaste(req, res, auth) {
    const body = await readJsonBody(req);
    const job = body.job;

    if (job === 'rebuild-user') {
        if (!body.userId) {
            return res.status(400).json({ error: 'userId required for rebuild-user' });
        }
        
        logAction(auth, AUDIT_ACTIONS.TASTE_REBUILD, {
            resourceType: 'taste',
            resourceId: body.userId,
            request: req,
        });
        
        const result = await rebuildUserTasteProfile(body.userId, {
            includeEmbedding: !!body.includeEmbedding && isEmbeddingConfigured(),
        });
        return res.status(200).json({ ok: true, result });
    }

    if (job === 'rebuild-stale') {
        logAction(auth, AUDIT_ACTIONS.TASTE_REBUILD, {
            resourceType: 'taste',
            request: req,
            metadata: { job: 'rebuild-stale', limit: body.limit },
        });
        
        const result = await rebuildStaleTasteProfiles({
            limit: body.limit || 10,
            includeEmbedding: !!body.includeEmbedding && isEmbeddingConfigured(),
        });
        return res.status(200).json({ ok: true, ...result });
    }

    if (job === 'embed-movies') {
        if (!isEmbeddingConfigured()) {
            return res.status(503).json({
                error: 'Set VOYAGE_API_KEY or OPENAI_API_KEY',
            });
        }
        
        logAction(auth, AUDIT_ACTIONS.EMBEDDING_BACKFILL, {
            resourceType: 'embedding',
            request: req,
            metadata: { limit: body.limit },
        });
        
        const result = await backfillMovieEmbeddings({ limit: body.limit || 10 });
        return res.status(200).json({ ok: true, ...result });
    }

    return res.status(400).json({
        error: 'Invalid job',
        allowed: ['rebuild-user', 'rebuild-stale', 'embed-movies'],
    });
}

async function handleRss(req, res, auth) {
    const body = await readJsonBody(req);
    const job = body.job;

    logAction(auth, AUDIT_ACTIONS.SYNC_TRIGGER, {
        resourceType: 'rss',
        resourceId: body.sourceId || 'all',
        request: req,
        metadata: { job },
    });

    if (job === 'refresh-source') {
        if (!body.sourceId) {
            return res.status(400).json({ error: 'sourceId required for refresh-source' });
        }
        const result = await refreshRssSourceById(body.sourceId);
        return res.status(200).json({ ok: true, result });
    }

    if (job === 'refresh-all') {
        const result = await refreshAllRssSources();
        return res.status(200).json({ ok: true, ...result });
    }

    if (job === 'approve-article' || job === 'regenerate-summary') {
        if (job === 'approve-article' && body.candidate) {
            const result = await approveFeedArticleCandidate(body.candidate);
            if (!result.success) {
                return res.status(400).json({ error: result.error || 'Approve failed' });
            }
            return res.status(200).json({ ok: true, ...result });
        }
        if (!body.articleId) {
            return res.status(400).json({ error: 'articleId required' });
        }
        const result = await approveFeedArticleWithSummary(body.articleId, {
            regenerateOnly: job === 'regenerate-summary',
        });
        if (!result.success) {
            return res.status(400).json({ error: result.error || 'Approve failed' });
        }
        return res.status(200).json({ ok: true, ...result });
    }

    return res.status(400).json({
        error: 'Invalid job',
        allowed: ['refresh-source', 'refresh-all', 'approve-article', 'regenerate-summary'],
    });
}

async function handleBackfill(req, res, auth) {
    const body = await readJsonBody(req);
    const job = body.job;

    logAction(auth, AUDIT_ACTIONS.SYNC_TRIGGER, {
        resourceType: 'backfill',
        request: req,
        metadata: { job, limit: body.limit },
    });

    if (job === 'tv-seasons') {
        const result = await backfillTvSeasons({ limit: body.limit || 50 });
        return res.status(200).json({ ok: true, ...result });
    }

    return res.status(400).json({
        error: 'Invalid job',
        allowed: ['tv-seasons'],
    });
}

/**
 * Connect / disconnect the official TheaterOrStream profile.
 * Body: { username } | { userId } | { disconnect: true }
 * Sets is_verified via service role and stores linkage in app_settings.
 */
async function handleOfficialProfile(req, res, auth) {
    const body = await readJsonBody(req);
    const supabase = getSupabaseAdmin();

    if (body?.disconnect) {
        await supabase
            .from('user_profiles')
            .update({ is_verified: false })
            .eq('is_verified', true);

        await supabase.from('app_settings').upsert({
            key: 'official_profile',
            value: {
                userId: null,
                username: null,
                displayName: null,
                avatarUrl: null,
                connectedAt: null,
            },
            updated_by: auth.user?.id || null,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });

        logAction(auth, AUDIT_ACTIONS.SYNC_TRIGGER, {
            resourceType: 'official_profile',
            request: req,
            metadata: { action: 'disconnect' },
        });

        return res.status(200).json({ ok: true, connected: false });
    }

    const username = String(body?.username || '').trim().replace(/^@/, '');
    const userId = body?.userId ? String(body.userId) : null;

    if (!username && !userId) {
        return res.status(400).json({ error: 'username or userId is required' });
    }

    let query = supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_url, avatar_id, is_verified');

    if (userId) query = query.eq('id', userId);
    else query = query.ilike('username', username);

    const { data: profile, error: findErr } = await query.limit(1).maybeSingle();
    if (findErr) {
        return res.status(500).json({ error: findErr.message });
    }
    if (!profile) {
        return res.status(404).json({ error: 'Profile not found. Create the account first, then connect it.' });
    }

    // Clear any previous official verification
    await supabase
        .from('user_profiles')
        .update({ is_verified: false })
        .eq('is_verified', true)
        .neq('id', profile.id);

    const { error: verifyErr } = await supabase
        .from('user_profiles')
        .update({ is_verified: true })
        .eq('id', profile.id);

    if (verifyErr) {
        return res.status(500).json({ error: verifyErr.message });
    }

    const connectedAt = new Date().toISOString();
    const value = {
        userId: profile.id,
        username: profile.username,
        displayName: profile.display_name || profile.username,
        avatarUrl: profile.avatar_url || null,
        connectedAt,
    };

    await supabase.from('app_settings').upsert({
        key: 'official_profile',
        value,
        updated_by: auth.user?.id || null,
        updated_at: connectedAt,
    }, { onConflict: 'key' });

    logAction(auth, AUDIT_ACTIONS.SYNC_TRIGGER, {
        resourceType: 'official_profile',
        resourceId: profile.id,
        request: req,
        metadata: { action: 'connect', username: profile.username },
    });

    return res.status(200).json({ ok: true, connected: true, profile: value });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Use write rate limiting for admin actions
    const auth = await requireAdminWrite(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.message });
    }

    const action = getAction(req);

    try {
        if (action === 'library') return handleLibrary(req, res, auth);
        if (action === 'sync') return handleSync(req, res, auth);
        if (action === 'taste') return handleTaste(req, res, auth);
        if (action === 'rss') return handleRss(req, res, auth);
        if (action === 'backfill') return handleBackfill(req, res, auth);
        if (action === 'official-profile') return handleOfficialProfile(req, res, auth);

        return res.status(404).json({
            error: 'Unknown admin action',
            allowed: ['library', 'sync', 'taste', 'rss', 'backfill', 'official-profile'],
        });
    } catch (error) {
        console.error('admin handler failed:', action, error);
        return res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Admin request failed',
        });
    }
}
