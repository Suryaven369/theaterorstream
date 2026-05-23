const EMBEDDING_DIM = 512;
const VOYAGE_MODEL = 'voyage-3-lite';
const OPENAI_MODEL = 'text-embedding-3-small';

function truncate(text, maxLen = 6000) {
    if (!text) return '';
    return text.length <= maxLen ? text : `${text.slice(0, maxLen)}…`;
}

export function buildMovieDocument(movie) {
    const genres = Array.isArray(movie?.genres)
        ? movie.genres.map((g) => g?.name || g).filter(Boolean).join(', ')
        : '';
    const moods = Array.isArray(movie?.mood_tags) ? movie.mood_tags.join(', ') : '';

    return truncate([
        movie?.title,
        genres && `Genres: ${genres}`,
        moods && `Moods: ${moods}`,
        movie?.original_language && `Language: ${movie.original_language}`,
        movie?.overview,
    ].filter(Boolean).join('\n'));
}

export function buildUserTasteDocument(profile, ratings = [], movieByTmdbId = new Map()) {
    const genreEntries = Object.entries(profile?.genre_weights || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([id, w]) => `genre ${id}: ${w}`);

    const moodEntries = Object.entries(profile?.mood_preferences || {})
        .slice(0, 10)
        .map(([id, w]) => `mood ${id}: ${w}`);

    const axisEntries = Object.entries(profile?.axis_preferences || {})
        .map(([k, v]) => `${k}: ${v}`);

    const axisKeys = ['acting', 'screenplay', 'sound', 'direction', 'entertainment', 'pacing', 'cinematography'];
    const lovedTitles = ratings
        .filter((r) => {
            const vals = axisKeys.map((k) => r[k]).filter((v) => v != null);
            if (!vals.length) return false;
            return vals.reduce((a, b) => a + Number(b), 0) / vals.length >= 7;
        })
        .slice(0, 8)
        .map((r) => movieByTmdbId.get(String(r.movie_id))?.title || r.movie_title)
        .filter(Boolean);

    return truncate([
        profile?.taste_summary,
        genreEntries.length && `Genre affinities: ${genreEntries.join('; ')}`,
        moodEntries.length && `Mood preferences: ${moodEntries.join('; ')}`,
        axisEntries.length && `Axis taste: ${axisEntries.join('; ')}`,
        lovedTitles.length && `Highly rated titles: ${lovedTitles.join(', ')}`,
        profile?.family_mode_enabled && 'Family-safe mode enabled',
        profile?.preferred_region && `Region: ${profile.preferred_region}`,
    ].filter(Boolean).join('\n'));
}

async function embedWithVoyage(text, inputType) {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) return null;

    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            input: [text],
            model: VOYAGE_MODEL,
            input_type: inputType === 'query' ? 'query' : 'document',
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Voyage embeddings failed (${response.status}): ${body}`);
    }

    const json = await response.json();
    const vector = json?.data?.[0]?.embedding;
    if (!vector?.length) {
        throw new Error('Voyage returned empty embedding');
    }

    return vector.length === EMBEDDING_DIM ? vector : vector.slice(0, EMBEDDING_DIM);
}

async function embedWithOpenAI(text) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            input: text,
            dimensions: EMBEDDING_DIM,
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenAI embeddings failed (${response.status}): ${body}`);
    }

    const json = await response.json();
    return json?.data?.[0]?.embedding || null;
}

/**
 * @param {string} text
 * @param {'query'|'document'} inputType — Voyage input_type hint
 */
export async function embedText(text, inputType = 'document') {
    const normalized = truncate(String(text || '').trim(), 8000);
    if (!normalized) {
        throw new Error('Cannot embed empty text');
    }

    if (process.env.VOYAGE_API_KEY) {
        return embedWithVoyage(normalized, inputType);
    }

    if (process.env.OPENAI_API_KEY) {
        return embedWithOpenAI(normalized);
    }

    throw new Error(
        'No embedding provider configured. Set VOYAGE_API_KEY (recommended) or OPENAI_API_KEY.',
    );
}

export function isEmbeddingConfigured() {
    return !!(process.env.VOYAGE_API_KEY || process.env.OPENAI_API_KEY);
}
