/**
 * Build PostgREST .or() clause for movies_library title search.
 * Handles compact queries like "antman" matching "Ant-Man".
 */
export function buildLibrarySearchOrClause(rawQuery) {
    const q = (rawQuery || '').trim();
    if (q.length < 2) return null;

    const patterns = new Set();

    const addPattern = (value) => {
        const v = (value || '').trim();
        if (v.length < 2) return;
        patterns.add(v.includes('%') ? v : `%${v}%`);
    };

    addPattern(q);

    const alnum = q.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (alnum.length >= 2) {
        addPattern(alnum);
    }

    // "antman" → "ant-man", "ant man", "ant%man"
    if (alnum.length >= 4 && !/\s/.test(q)) {
        for (let i = 2; i <= alnum.length - 2; i += 1) {
            const head = alnum.slice(0, i);
            const tail = alnum.slice(i);
            addPattern(`${head}-${tail}`);
            addPattern(`${head} ${tail}`);
            addPattern(`${head}%${tail}`);
        }
    }

    const fields = ['title', 'original_title'];
    const parts = [];

    for (const field of fields) {
        for (const pat of patterns) {
            const safe = pat.replace(/,/g, '');
            parts.push(`${field}.ilike.${safe}`);
        }
    }

    return parts.join(',');
}

export function normalizeSearchQuery(rawQuery) {
    return (rawQuery || '').trim();
}
