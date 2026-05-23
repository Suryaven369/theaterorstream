import { requireAdmin } from '../_lib/admin-auth.js';
import { getSupabaseAdmin } from '../_lib/supabase-admin.js';
import { dedupeLibraryRecords, upsertMoviesLibrary } from '../../src/lib/libraryDedupe.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 60,
};

const UPSERT_SELECT = 'tmdb_id, title, media_type, poster_path, is_active';

async function readBody(req) {
    if (req.body && typeof req.body === 'object' && !(req.body instanceof Buffer)) {
        return req.body;
    }
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => {
            if (!data) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
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

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await requireAdmin(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.message });
    }

    try {
        const body = await readBody(req);
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
    } catch (error) {
        console.error('admin library handler failed:', error);
        return res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Failed to save to library',
        });
    }
}
