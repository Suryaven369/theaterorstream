const EMBEDDING_DIM = 512;
const VOYAGE_MODEL = 'voyage-3-lite';
const OPENAI_MODEL = 'text-embedding-3-small';
const GEMINI_EMBED_MODEL = 'gemini-embedding-001';
const MISTRAL_EMBED_MODEL = 'mistral-embed';

function getMistralKey() {
    return process.env.MIST_API_KEY || process.env.MISTRAL_API_KEY;
}

/** OpenAI key — GPT_KEY is the project's name for it. */
function getOpenAiKey() {
    return process.env.GPT_KEY || process.env.OPENAI_API_KEY;
}

const GENRE_NAMES = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western', 10759: 'Action & Adventure',
    10765: 'Sci-Fi & Fantasy', 10768: 'War & Politics', 10762: 'Kids', 10764: 'Reality',
};

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
    const genreList = Array.isArray(movie?.genres) && movie.genres.length
        ? movie.genres.map((g) => g?.name || GENRE_NAMES[g?.id ?? g]).filter(Boolean)
        : (movie?.genre_ids || []).map((id) => GENRE_NAMES[id]).filter(Boolean);
    const keywords = (Array.isArray(movie?.keywords) ? movie.keywords : [])
        .map((k) => k?.name || k)
        .filter((k) => typeof k === 'string' && k)
        .slice(0, 15);
    const directors = (movie?.credits?.crew || [])
        .filter((c) => c.job === 'Director')
        .map((c) => c.name)
        .slice(0, 2);
    const cast = (movie?.credits?.cast || [])
        .slice()
        .sort((x, y) => (x.order ?? 99) - (y.order ?? 99))
        .slice(0, 4)
        .map((c) => c.name);
    const moods = Array.isArray(movie?.mood_tags) ? movie.mood_tags.join(', ') : '';
    const year = String(movie?.release_date || movie?.first_air_date || '').slice(0, 4);
    const kind = movie?.media_type === 'tv' ? 'TV series' : 'Film';

    return truncate([
        `${movie?.title || movie?.name || ''}${year ? ` (${year})` : ''} — ${kind}`,
        movie?.tagline && `Tagline: ${movie.tagline}`,
        genreList.length && `Genres: ${genreList.join(', ')}`,
        keywords.length && `Keywords: ${keywords.join(', ')}`,
        directors.length && `Director: ${directors.join(', ')}`,
        cast.length && `Starring: ${cast.join(', ')}`,
        moods && `Moods: ${moods}`,
        movie?.original_language && `Language: ${movie.original_language}`,
        movie?.overview,
    ].filter(Boolean).join('\n'), 4000);
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
    const vectors = await embedBatchOpenAI([text]);
    return vectors?.[0] || null;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Embed many texts in one OpenAI request (text-embedding-3-small @ 512 dims).
 * Retries 429 / 5xx with exponential backoff. Returns vectors in input order
 * plus token usage when `withUsage` is set.
 */
export async function embedBatchOpenAI(texts, { withUsage = false, maxRetries = 5 } = {}) {
    const apiKey = getOpenAiKey();
    if (!apiKey) throw new Error('GPT_KEY / OPENAI_API_KEY is not set');
    const input = texts.map((t) => truncate(String(t || ' '), 8000) || ' ');

    for (let attempt = 0; ; attempt += 1) {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model: OPENAI_MODEL, input, dimensions: EMBEDDING_DIM }),
        });
        if (response.ok) {
            const json = await response.json();
            const vectors = new Array(input.length);
            (json?.data || []).forEach((d) => { vectors[d.index] = l2normalize(d.embedding); });
            if (vectors.some((v) => !v?.length)) throw new Error('OpenAI returned a missing embedding');
            return withUsage ? { vectors, tokens: json?.usage?.total_tokens || 0 } : vectors;
        }
        const body = await response.text();
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt >= maxRetries) {
            throw new Error(`OpenAI embeddings failed (${response.status}): ${body.slice(0, 200)}`);
        }
        await sleep(Math.min(30000, 1000 * 2 ** attempt));
    }
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

    // OpenAI is the primary provider: the whole library is embedded with it, and
    // similarity only works within one provider's vector space.
    if (getOpenAiKey()) {
        return { vector: await embedWithOpenAI(normalized), provider: 'openai' };
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
        getOpenAiKey()
        || process.env.VOYAGE_API_KEY
        || process.env.GEMINI_API_KEY
        || getMistralKey()
        || process.env.OPENAI_API_KEY
        || process.env.HF_API_KEY
        || process.env.HUGGINGFACE_API_KEY
    );
}
