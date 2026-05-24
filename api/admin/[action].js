import { requireAdmin } from '../_lib/admin-auth.js';
import { getSupabaseAdmin } from '../_lib/supabase-admin.js';
import { runSyncJob, SYNC_JOBS } from '../_lib/tmdb-sync-server.js';
import {
    rebuildUserTasteProfile,
    rebuildStaleTasteProfiles,
    backfillMovieEmbeddings,
} from '../_lib/taste-profile-server.js';
import { isEmbeddingConfigured } from '../_lib/embedding-server.js';
import { readJsonBody } from '../_lib/read-body.js';
import { dedupeLibraryRecords, upsertMoviesLibrary } from '../../src/lib/libraryDedupe.js';

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

async function handleLibrary(req, res) {
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

    return res.status(200).json({
        success: true,
        data: savedRows,
        savedCount: savedRows.length,
        libraryTotal: libraryTotal ?? null,
    });
}

async function handleSync(req, res) {
    const body = await readJsonBody(req);
    const jobName = body.jobName;

    if (!jobName || !SYNC_JOBS[jobName]) {
        return res.status(400).json({
            error: 'Invalid jobName',
            allowed: Object.keys(SYNC_JOBS),
        });
    }

    const result = await runSyncJob(jobName);
    return res.status(200).json(result);
}

async function handleTaste(req, res) {
    const body = await readJsonBody(req);
    const job = body.job;

    if (job === 'rebuild-user') {
        if (!body.userId) {
            return res.status(400).json({ error: 'userId required for rebuild-user' });
        }
        const result = await rebuildUserTasteProfile(body.userId, {
            includeEmbedding: !!body.includeEmbedding && isEmbeddingConfigured(),
        });
        return res.status(200).json({ ok: true, result });
    }

    if (job === 'rebuild-stale') {
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
        const result = await backfillMovieEmbeddings({ limit: body.limit || 10 });
        return res.status(200).json({ ok: true, ...result });
    }

    return res.status(400).json({
        error: 'Invalid job',
        allowed: ['rebuild-user', 'rebuild-stale', 'embed-movies'],
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await requireAdmin(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.message });
    }

    const action = getAction(req);

    try {
        if (action === 'library') return handleLibrary(req, res);
        if (action === 'sync') return handleSync(req, res);
        if (action === 'taste') return handleTaste(req, res);

        return res.status(404).json({
            error: 'Unknown admin action',
            allowed: ['library', 'sync', 'taste'],
        });
    } catch (error) {
        console.error('admin handler failed:', action, error);
        return res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Admin request failed',
        });
    }
}
