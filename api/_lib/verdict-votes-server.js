/**
 * Landing page poll: visitors vote Theater / Wait for OTT / Skip on a title.
 * One vote per visitor per title (they can change it). Visitors are anonymous:
 * we only store a salted hash of their device id (or user id when signed in).
 * Totals live in verdict_vote_totals, which browsers watch via Realtime.
 */
import crypto from 'node:crypto';
import { getSupabaseAdmin } from './supabase-admin.js';

export const VOTE_CHOICES = ['theater', 'ott', 'skip'];
// Guard against one person spamming from many cleared browsers.
const MAX_VOTERS_PER_IP_PER_TITLE = 5;

const SALT = process.env.VOTE_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'tos-votes';
const hashKey = (value) => crypto.createHash('sha256').update(`${SALT}:${value}`).digest('hex').slice(0, 40);

const emptyTotals = () => ({ theater: 0, ott: 0, skip: 0 });

/** True when the migration hasn't been applied yet. */
const missingTable = (error) => /verdict_vote|does not exist|schema cache/i.test(error?.message || '');

export async function getVerdictTotals(tmdbIds) {
    const ids = [...new Set(tmdbIds.map(String).filter((id) => /^\d{1,9}$/.test(id)))].slice(0, 24);
    const out = Object.fromEntries(ids.map((id) => [id, emptyTotals()]));
    if (!ids.length) return { totals: out, available: true };
    const { data, error } = await getSupabaseAdmin()
        .from('verdict_vote_totals')
        .select('tmdb_id, theater, ott, skip')
        .in('tmdb_id', ids);
    if (error) {
        if (missingTable(error)) return { totals: out, available: false };
        throw new Error(error.message);
    }
    (data || []).forEach((row) => {
        out[row.tmdb_id] = { theater: row.theater, ott: row.ott, skip: row.skip };
    });
    return { totals: out, available: true };
}

export async function castVerdictVote({ tmdbId, choice, voterId, userId = null, ip = null }) {
    const id = String(tmdbId || '');
    if (!/^\d{1,9}$/.test(id)) {
        const err = new Error('Missing title id'); err.statusCode = 400; throw err;
    }
    if (!VOTE_CHOICES.includes(choice)) {
        const err = new Error('Pick theater, ott or skip'); err.statusCode = 400; throw err;
    }
    if (!userId && !/^[A-Za-z0-9-]{8,64}$/.test(String(voterId || ''))) {
        const err = new Error('Missing voter id'); err.statusCode = 400; throw err;
    }
    const supabase = getSupabaseAdmin();
    const voterKey = userId ? `u:${hashKey(userId)}` : `d:${hashKey(voterId)}`;
    const ipKey = ip ? hashKey(`ip:${ip}`) : null;

    let limited = false;
    if (!userId && ipKey) {
        const { count, error } = await supabase
            .from('verdict_votes')
            .select('voter_key', { count: 'exact', head: true })
            .eq('tmdb_id', id)
            .eq('ip_key', ipKey)
            .neq('voter_key', voterKey);
        if (error && missingTable(error)) return { ...(await getVerdictTotals([id])), recorded: false, tmdbId: id };
        limited = (count || 0) >= MAX_VOTERS_PER_IP_PER_TITLE;
    }

    if (!limited) {
        const { error } = await supabase.from('verdict_votes').upsert({
            tmdb_id: id,
            voter_key: voterKey,
            ip_key: ipKey,
            choice,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'tmdb_id,voter_key' });
        if (error) {
            if (missingTable(error)) return { ...(await getVerdictTotals([id])), recorded: false, tmdbId: id };
            throw new Error(error.message);
        }
    }
    const res = await getVerdictTotals([id]);
    return { ...res, recorded: !limited, tmdbId: id };
}
