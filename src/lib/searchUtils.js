/**
 * PostgREST title search helpers.
 * Quotes ILIKE values (spaces break unquoted filters) and ranks typo-tolerant hits.
 */

const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'to', 'for']);

export function searchTokens(rawQuery) {
    return String(rawQuery || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 2 && !STOP.has(t));
}

function levRatio(a, b) {
    if (a === b) return 1;
    const m = a.length;
    const n = b.length;
    if (!m || !n) return 0;
    const row = Array.from({ length: m + 1 }, (_, i) => i);
    for (let j = 1; j <= n; j += 1) {
        let prev = row[0];
        row[0] = j;
        for (let i = 1; i <= m; i += 1) {
            const cur = row[i];
            row[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[i], row[i - 1]);
            prev = cur;
        }
    }
    return 1 - row[m] / Math.max(m, n);
}

function tokenScore(qt, titleTokens) {
    let best = 0;
    for (const tt of titleTokens) {
        if (tt === qt) return 1;
        if (tt.startsWith(qt) || qt.startsWith(tt)) best = Math.max(best, 0.9);
        else best = Math.max(best, levRatio(qt, tt));
    }
    return best;
}

/** Re-rank DB hits so typos / missing "the" still surface the right title. */
export function rankLibrarySearchHits(query, rows, { minScore = 0.55 } = {}) {
    const qTokens = searchTokens(query);
    if (!qTokens.length) return rows || [];

    const alnumQ = qTokens.join('');
    const scored = (rows || []).map((row) => {
        const title = `${row.title || ''} ${row.original_title || ''}`;
        const lower = title.toLowerCase();
        const tTokens = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
        const alnumT = lower.replace(/[^a-z0-9]/g, '');
        let s = 0;
        let minTok = 1;
        if (alnumT.includes(alnumQ)) {
            s = 1;
        } else {
            const parts = qTokens.map((qt) => tokenScore(qt, tTokens));
            minTok = Math.min(...parts);
            s = parts.reduce((a, b) => a + b, 0) / parts.length;
        }
        return { row, s, minTok };
    });

    const floor = qTokens.length === 1 ? Math.min(minScore, 0.45) : minScore;
    const minTokFloor = qTokens.length >= 2 ? 0.55 : 0;
    return scored
        .filter((x) => x.s >= floor && x.minTok >= minTokFloor)
        .sort((a, b) => b.s - a.s || (b.row.popularity || 0) - (a.row.popularity || 0))
        .map((x) => x.row);
}

/**
 * Build PostgREST .or() clause for movies_library title search.
 * Handles "big bang theory" → The Big Bang Theory, and "antman" → Ant-Man.
 */
export function buildLibrarySearchOrClause(rawQuery) {
    const q = (rawQuery || '').trim();
    if (q.length < 2) return null;

    const patterns = new Set();
    const add = (value) => {
        const v = (value || '').trim();
        if (v.length < 2) return;
        patterns.add(v.includes('%') ? v : `%${v}%`);
    };

    add(q);

    const tokens = searchTokens(q);
    if (tokens.length) {
        patterns.add(`%${tokens.join('%')}%`);
        add(tokens.join(' '));
        for (const t of tokens) {
            add(t);
            if (t.length >= 4) add(`${t.slice(0, Math.max(3, t.length - 2))}%`);
        }
    }

    const alnum = q.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (alnum.length >= 2) add(alnum);

    if (alnum.length >= 4 && !/\s/.test(q)) {
        for (let i = 2; i <= alnum.length - 2; i += 1) {
            const head = alnum.slice(0, i);
            const tail = alnum.slice(i);
            add(`${head}-${tail}`);
            add(`${head} ${tail}`);
            add(`${head}%${tail}`);
        }
    }

    const fields = ['title', 'original_title'];
    const parts = [];
    for (const field of fields) {
        for (const pat of patterns) {
            const safe = pat.replace(/[,"]/g, '');
            parts.push(`${field}.ilike."${safe}"`);
        }
    }
    return parts.join(',');
}
