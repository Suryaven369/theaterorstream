/**
 * Phase 3 — embedding access. Movie vectors live on movies_library.embedding
 * (pgvector, OpenAI text-embedding-3-small @ 512, embedding_provider='openai').
 * Each movie is embedded once and reused; missing ones are embedded in one
 * batched call and persisted (library rows) or memory-cached (TMDB-only cards).
 */
import { buildMovieDocument, embedBatchOpenAI } from '../embedding-server.js';
import { parseVector, buildUserVector } from './scoring.js';

export const VECTOR_PROVIDER = 'openai';
const memoryVectors = new Map(); // tmdbId → vector, for titles not in the library yet
const MAX_EMBED_PER_REQUEST = 120;

/** Stored OpenAI vectors for ids → Map(id → vector). */
export async function loadVectors(supabase, ids) {
    const out = new Map();
    const list = [...new Set((ids || []).map(String))].filter(Boolean);
    for (let i = 0; i < list.length; i += 200) {
        // eslint-disable-next-line no-await-in-loop
        const { data, error } = await supabase
            .from('movies_library')
            .select('tmdb_id, embedding')
            .eq('embedding_provider', VECTOR_PROVIDER)
            .in('tmdb_id', list.slice(i, i + 200));
        if (error) break;
        (data || []).forEach((row) => {
            const v = parseVector(row.embedding);
            if (v) out.set(String(row.tmdb_id), v);
        });
    }
    list.forEach((id) => {
        if (!out.has(id) && memoryVectors.has(id)) out.set(id, memoryVectors.get(id));
    });
    return out;
}

/**
 * Make sure every candidate has a vector (mutates: sets .vector).
 * Library rows without an OpenAI vector are embedded + saved; TMDB-only
 * (lite) cards are embedded and kept in memory. Bounded per request.
 */
export async function attachVectors(supabase, candidates) {
    if (!candidates?.length) return candidates;
    const vectors = await loadVectors(supabase, candidates.map((c) => c.tmdb_id));
    const missing = [];
    candidates.forEach((c) => {
        const v = vectors.get(String(c.tmdb_id));
        if (v) c.vector = v;
        else missing.push(c);
    });

    const batch = missing.slice(0, MAX_EMBED_PER_REQUEST);
    if (batch.length) {
        try {
            const fresh = await embedBatchOpenAI(batch.map((c) => buildMovieDocument(c)));
            const writes = [];
            batch.forEach((c, i) => {
                c.vector = fresh[i];
                memoryVectors.set(String(c.tmdb_id), fresh[i]);
                if (!c._lite) {
                    writes.push(supabase
                        .from('movies_library')
                        .update({ embedding: `[${fresh[i].join(',')}]`, embedding_provider: VECTOR_PROVIDER })
                        .eq('tmdb_id', String(c.tmdb_id))
                        .eq('media_type', c.media_type || 'movie'));
                }
            });
            await Promise.all(writes);
            if (memoryVectors.size > 20000) memoryVectors.clear();
        } catch (err) {
            console.warn('[reco] embedding missing candidates failed:', err.message);
        }
    }
    return candidates;
}

/**
 * The user's taste vector from loved and disliked titles.
 * loved/disliked: [{ id, weight? }]. Returns { vector, lovedUsed, dislikedUsed } or null.
 */
export async function computeUserVector(supabase, { loved = [], disliked = [] }) {
    if (!loved.length) return null;
    const ids = [...loved, ...disliked].map((x) => String(x.id));
    const vectors = await loadVectors(supabase, ids);

    // Loved titles in the library but not yet embedded: embed them now (small, once).
    const needs = loved.filter((x) => !vectors.has(String(x.id))).map((x) => String(x.id)).slice(0, 25);
    if (needs.length) {
        const { data: rows } = await supabase
            .from('movies_library')
            .select('tmdb_id, media_type, title, tagline, overview, genres, genre_ids, keywords, credits, mood_tags, original_language, release_date, first_air_date')
            .in('tmdb_id', needs);
        if (rows?.length) {
            await attachVectors(supabase, rows);
            rows.forEach((r) => { if (r.vector) vectors.set(String(r.tmdb_id), r.vector); });
        }
    }

    const pick = (list) => list
        .map((x) => ({ vector: vectors.get(String(x.id)), weight: x.weight ?? 1 }))
        .filter((x) => x.vector);
    const lovedV = pick(loved);
    const dislikedV = pick(disliked);
    const vector = buildUserVector(lovedV, dislikedV);
    return vector ? { vector, lovedUsed: lovedV.length, dislikedUsed: dislikedV.length } : null;
}
