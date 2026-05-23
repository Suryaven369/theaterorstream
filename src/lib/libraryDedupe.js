/** Preferred upsert target after migration 20260526300000 */
export const LIBRARY_UPSERT_CONFLICT = 'tmdb_id,media_type';

/** Legacy DB: unique on tmdb_id only */
export const LIBRARY_UPSERT_CONFLICT_LEGACY = 'tmdb_id';

export function libraryRecordKey(record) {
    const tmdbId = String(record?.tmdb_id ?? record?.id ?? '').trim();
    const mediaType = record?.media_type || 'movie';
    return `${tmdbId}:${mediaType}`;
}

function recordRichness(record) {
    return Object.keys(record || {}).filter((key) => {
        const value = record[key];
        return value != null && value !== '';
    }).length;
}

/**
 * Collapse duplicate TMDB ids in one save batch (keeps the richest row per id+type).
 */
export function dedupeLibraryRecords(records) {
    const byKey = new Map();

    for (const raw of records || []) {
        const tmdbId = String(raw?.tmdb_id ?? raw?.id ?? '').trim();
        if (!tmdbId) continue;

        const mediaType = raw?.media_type || 'movie';
        const key = `${tmdbId}:${mediaType}`;
        const normalized = {
            ...raw,
            tmdb_id: tmdbId,
            media_type: mediaType,
        };

        const existing = byKey.get(key);
        if (!existing || recordRichness(normalized) >= recordRichness(existing)) {
            byKey.set(key, normalized);
        }
    }

    return Array.from(byKey.values());
}

/** When only tmdb_id is unique, keep one row per id (richest wins). */
export function dedupeLibraryRecordsByTmdbIdOnly(records) {
    const byKey = new Map();

    for (const raw of dedupeLibraryRecords(records)) {
        const tmdbId = String(raw.tmdb_id);
        const existing = byKey.get(tmdbId);
        if (!existing || recordRichness(raw) >= recordRichness(existing)) {
            byKey.set(tmdbId, raw);
        }
    }

    return Array.from(byKey.values());
}

export function isLibraryUpsertConflictError(error) {
    const msg = String(error?.message || error || '');
    return msg.includes('ON CONFLICT')
        || msg.includes('no unique or exclusion constraint');
}

/**
 * Upsert with composite conflict; falls back to tmdb_id-only if migration not applied yet.
 */
export async function upsertMoviesLibrary(supabase, records, selectColumns) {
    const deduped = dedupeLibraryRecords(records);
    if (!deduped.length) {
        return { data: [], error: null, conflictTarget: null };
    }

    const payload = deduped.length === 1 ? deduped[0] : deduped;

    let result = await supabase
        .from('movies_library')
        .upsert(payload, { onConflict: LIBRARY_UPSERT_CONFLICT })
        .select(selectColumns);

    if (result.error && isLibraryUpsertConflictError(result.error)) {
        const legacyPayload = dedupeLibraryRecordsByTmdbIdOnly(deduped);
        const legacyRows = legacyPayload.length === 1 ? legacyPayload[0] : legacyPayload;

        result = await supabase
            .from('movies_library')
            .upsert(legacyRows, { onConflict: LIBRARY_UPSERT_CONFLICT_LEGACY })
            .select(selectColumns);

        if (!result.error) {
            return { ...result, conflictTarget: LIBRARY_UPSERT_CONFLICT_LEGACY };
        }
    }

    return {
        ...result,
        conflictTarget: result.error ? null : LIBRARY_UPSERT_CONFLICT,
    };
}
