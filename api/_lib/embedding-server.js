const EMBEDDING_DIM = 512;
const VOYAGE_MODEL = 'voyage-3-lite';
const OPENAI_MODEL = 'text-embedding-3-small';
const GEMINI_EMBED_MODEL = 'gemini-embedding-001';
const MISTRAL_EMBED_MODEL = 'mistral-embed';

function getMistralKey() {
    return process.env.MIST_API_KEY || process.env.MISTRAL_API_KEY;
}

/** L2-normalise so cosine/inner-product comparisons stay consistent. Google
 *  recommends this when truncating MRL embeddings below their native size. */
function l2normalize(vector) {
    let sum = 0;
    for (const v of vector) sum += v * v;
    const norm = Math.sqrt(sum);
    if (!norm) return vector;
    return vector.map((v) => v / norm);
}

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

async function embedWithHuggingFace(text) {
    const apiKey = process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) return null;

    const model = process.env.HF_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
    const url = `https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            inputs: text,
            options: { wait_for_model: true },
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`HuggingFace embeddings failed (${response.status}): ${body}`);
    }

    const json = await response.json();
    const vector = Array.isArray(json?.[0]) ? json[0] : json;
    if (!Array.isArray(vector) || !vector.length) {
        throw new Error('HuggingFace returned empty embedding');
    }

    return vector.length === EMBEDDING_DIM ? vector : vector.slice(0, EMBEDDING_DIM);
}

async function embedWithGemini(text, inputType) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const model = process.env.GEMINI_EMBED_MODEL || GEMINI_EMBED_MODEL;
    // Asymmetric retrieval: movies = documents, taste profile = query.
    const taskType = inputType === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            taskType,
            outputDimensionality: EMBEDDING_DIM,
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Gemini embeddings failed (${response.status}): ${body.slice(0, 200)}`);
    }

    const json = await response.json();
    const vector = json?.embedding?.values;
    if (!vector?.length) {
        throw new Error('Gemini returned empty embedding');
    }

    const sized = vector.length === EMBEDDING_DIM ? vector : vector.slice(0, EMBEDDING_DIM);
    return l2normalize(sized);
}

async function embedWithMistral(text) {
    const apiKey = getMistralKey();
    if (!apiKey) return null;

    const model = process.env.MISTRAL_EMBED_MODEL || MISTRAL_EMBED_MODEL;
    const response = await fetch('https://api.mistral.ai/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: [text] }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Mistral embeddings failed (${response.status}): ${body.slice(0, 200)}`);
    }

    const json = await response.json();
    const vector = json?.data?.[0]?.embedding;
    if (!vector?.length) {
        throw new Error('Mistral returned empty embedding');
    }

    // mistral-embed is 1024-dim; truncate to the DB's 512 and re-normalise.
    const sized = vector.length === EMBEDDING_DIM ? vector : vector.slice(0, EMBEDDING_DIM);
    return l2normalize(sized);
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
/**
 * Embed text and report which provider produced the vector. Provider priority:
 * VOYAGE > GEMINI > (Mistral fallback) > HF > OPENAI. Gemini failures (e.g. daily
 * quota) automatically fall through to Mistral.
 *
 * IMPORTANT: the returned `provider` must be stored alongside the vector — the
 * similarity search only ever compares vectors from the SAME provider, because
 * different models live in different (incompatible) vector spaces.
 *
 * @returns {Promise<{ vector: number[], provider: string }>}
 */
export async function embedTextWithProvider(text, inputType = 'document') {
    const normalized = truncate(String(text || '').trim(), 8000);
    if (!normalized) {
        throw new Error('Cannot embed empty text');
    }

    if (process.env.VOYAGE_API_KEY) {
        return { vector: await embedWithVoyage(normalized, inputType), provider: 'voyage' };
    }

    if (getMistralKey()) {
        try {
            const vector = await embedWithMistral(normalized);
            if (vector) return { vector, provider: 'mistral' };
        } catch (err) {
            if (process.env.GEMINI_API_KEY) {
                console.warn('[embed] Mistral failed, falling back to Gemini:', err.message);
            } else {
                throw err;
            }
        }
    }

    if (process.env.GEMINI_API_KEY) {
        const vector = await embedWithGemini(normalized, inputType);
        if (vector) return { vector, provider: 'gemini' };
    }

    if (process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY) {
        return { vector: await embedWithHuggingFace(normalized), provider: 'hf' };
    }

    if (process.env.OPENAI_API_KEY) {
        return { vector: await embedWithOpenAI(normalized), provider: 'openai' };
    }

    throw new Error(
        'No embedding provider configured. Set GEMINI_API_KEY (free), MIST_API_KEY, HF_API_KEY, VOYAGE_API_KEY, or OPENAI_API_KEY.',
    );
}

/** Back-compat: returns just the vector. */
export async function embedText(text, inputType = 'document') {
    return (await embedTextWithProvider(text, inputType)).vector;
}

export function isEmbeddingConfigured() {
    return !!(
        process.env.VOYAGE_API_KEY
        || process.env.GEMINI_API_KEY
        || getMistralKey()
        || process.env.OPENAI_API_KEY
        || process.env.HF_API_KEY
        || process.env.HUGGINGFACE_API_KEY
    );
}
