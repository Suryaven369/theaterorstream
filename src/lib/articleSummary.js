/**
 * Non-AI extractive article summaries for the public feed carousel.
 * - Regular articles: complete sentences, ≥70 words, ends on a full sentence.
 * - Listicles: ONLY numbered titles (no intro, no paragraph blurbs).
 */

export const ARTICLE_SUMMARY_MIN_WORDS = 70;
export const ARTICLE_SUMMARY_MAX_WORDS = 120;
export const LISTICLE_MAX_ITEMS = 15;
/** List entries must read like titles, not paragraphs. */
export const LIST_TITLE_MAX_WORDS = 8;

/** Strip tags / entities and collapse whitespace into plain text. */
export function stripHtmlToText(htmlOrText) {
    if (!htmlOrText) return '';
    const raw = String(htmlOrText)
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&mdash;|&#8212;|&#x2014;/gi, ',')
        .replace(/&ndash;|&#8211;|&#x2013;/gi, ',')
        .replace(/&#(\d+);/g, (_, n) => {
            const code = Number(n);
            return Number.isFinite(code) ? String.fromCharCode(code) : '';
        })
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '\n')
        .trim();
    return normalizeProseText(raw);
}

/**
 * Clean feed-facing copy: no em/en dashes, no spaces before . , ; etc.
 * Fixes HTML-strip artifacts like "The Dog Stars ," → "The Dog Stars,"
 */
export function normalizeProseText(text) {
    let t = String(text || '');
    if (!t) return '';

    // Keep numeric ranges as plain ASCII hyphen (2018-2020), never long dashes.
    t = t.replace(/(\d)\s*[–—−‐‑‒―]\s*(\d)/gu, '$1-$2');
    // All other long dashes → comma (never keep — or – in summaries).
    t = t.replace(/\s*[—–−‐‑‒―]+\s*/gu, ', ');

    // "Title ," / "Brolin ." from <em>…</em>, stripping
    t = t.replace(/\s+([,.;:!?)}\]])/g, '$1');
    t = t.replace(/([({\[“"‘'])\s+/g, '$1');

    // Ensure one space after sentence/clause punctuation when a word follows
    t = t.replace(/([,.;:!?])([A-Za-z0-9“"‘])/g, '$1 $2');

    // Collapse leftover comma clutter from dash rewrites
    t = t.replace(/,(?:\s*,)+/g, ',');
    t = t.replace(/[ \t]+/g, ' ');
    t = t.replace(/ *\n */g, '\n');
    return t.trim();
}

export function countWords(text) {
    return String(text || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
}

/** Split plain text into sentences (keeps trailing punctuation). */
export function splitSentences(text) {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return [];
    const parts = cleaned.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) || [];
    return parts
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

function ensureSentenceEnd(text) {
    const t = String(text || '').trim();
    if (!t) return '';
    if (/[.!?]"?$/.test(t)) return t;
    return `${t}.`;
}

/**
 * Normalize a raw chunk into a short list title.
 * Handles Collider-style headings: 'Homecoming' (2018–2020)
 */
export function toListTitle(raw, maxWords = LIST_TITLE_MAX_WORDS) {
    let t = String(raw || '')
        .replace(/\s+/g, ' ')
        .replace(/^[\d#.)\-\s]+/, '')
        .trim();
    if (!t) return '';

    // Strip trailing air-date ranges used on listicle headings
    t = t.replace(/\s*\(\s*\d{4}(?:\s*[–—−-]\s*\d{4})?\s*\)\s*$/u, '').trim();

    // Strip wrapping quotes / italics markers
    t = t.replace(/^[‘'"`“]+/, '').replace(/[’'"`”]+$/, '').trim();
    t = t.replace(/\s*\(\s*\d{4}(?:\s*[–—−-]\s*\d{4})?\s*\)\s*$/u, '').trim();

    // Title — blurb / Title: blurb / Title. Blurb
    const splitters = [/\s+[—–]\s+/, /\s+-\s+/, /\s*:\s+/];
    for (const re of splitters) {
        const parts = t.split(re);
        if (parts.length > 1 && countWords(parts[0]) > 0 && countWords(parts[0]) <= maxWords) {
            t = parts[0].trim();
            break;
        }
    }

    t = t.replace(/["“”]+/g, '').replace(/[,;]+$/g, '').trim();
    return finalizeMovieTitle(t, maxWords);
}

/** Reject quiz prose / sentences; keep Title-Case film/show names. */
function finalizeMovieTitle(raw, maxWords = LIST_TITLE_MAX_WORDS) {
    let t = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';

    t = t.replace(/['’]s$/u, '').replace(/^(in|on|from|about)\s+/i, '').trim();

    // Personality / quiz prose — never a list title
    if (/^(you('|’)?re|you('|’)?d|you\s|your\s|you’ll|you'll|you’ll)/i.test(t)) return '';
    if (/\b(you('|’)?re|you('|’)?d|you\s|your\s)\b/i.test(t)) return '';

    // Full-sentence blurbs masquerading as titles
    if (/\b(built|probing|understanding|function|survive|comfort|community|horizon|vehicle|threat|fuel|unsentimental|distinction|accurately|humanity|designation|feeling|hero|lost|resistance|instinct|constructed|realities|information|freedom|prison|wasteland|drawn|outrun)\b/i.test(t)) {
        return '';
    }

    const words = countWords(t);
    if (words < 1 || words > maxWords) return '';
    if (t.length < 2 || t.length > 70) return '';

    // Prefer Title Case / proper names (allow small words)
    const parts = t.split(/\s+/);
    const ok = parts.every((w) => (
        /^(?:the|a|an|of|and|or|in|on|to|for|from|with|&)$/i.test(w)
        || /^[A-Z0-9]/.test(w)
        || /^\d/.test(w)
    ));
    if (!ok) return '';

    return t;
}

/**
 * Pull a film/show name out of a personality blurb or long list cell.
 * e.g. "In Blade Runner's world…" → "Blade Runner"
 *      "The Matrix built an airtight prison…" → "The Matrix"
 */
export function extractEmbeddedTitle(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';

    const tryFinalize = (candidate) => finalizeMovieTitle(candidate);

    // In Blade Runner's world / In Mad Max's world
    let m = t.match(
        /\bIn\s+((?:the\s+)?[A-Z][\w'&.]*(?:\s+[A-Z][\w'&.]*){0,5})(?:['’]s)?\s+world\b/,
    );
    if (m) {
        const hit = tryFinalize(m[1]);
        if (hit) return hit;
    }

    // The Matrix built… / Blade Runner is…
    m = t.match(
        /\b((?:The|A|An)\s+[A-Z][\w'&.]*(?:\s+[A-Z][\w'&.]*){0,4})\s+(?:built|is|was|are|were|has|had|feels|remains)\b/,
    );
    if (m) {
        const hit = tryFinalize(m[1]);
        if (hit) return hit;
    }

    // Quoted titles
    m = t.match(/[“"]([^”"]{2,60})[”"]/);
    if (m) {
        const hit = tryFinalize(m[1]);
        if (hit) return hit;
    }

    // Em-dash reveal: … — Outer Range
    m = t.match(/[—–]\s*((?:The|A|An)\s+)?([A-Z][\w'&.]*(?:\s+[A-Z][\w'&.]*){0,5})\s*$/);
    if (m) {
        const hit = tryFinalize(`${m[1] || ''}${m[2]}`.trim());
        if (hit) return hit;
    }

    return '';
}

/** Resolve one list entry: clean title, or title embedded in a blurb. */
export function resolveListEntry(raw) {
    const plain = stripHtmlToText(raw);
    return toListTitle(plain) || extractEmbeddedTitle(plain) || '';
}

/**
 * Title-only: clear "Top N / N best / ranked…" list signals (not genre words).
 * Also matches "4 Cult Horror Movies…", "10 Classic Sci-Fi Films…" (adjectives
 * between the count and movies/films) — previously only "4 Movies" / "4 best Movies".
 */
export function titleLooksLikeListicle(title = '') {
    const t = String(title || '').toLowerCase();
    if (/\b(top\s+\d+|\d+\s+(best|greatest|great|scariest|worst|essential|forgotten|underrated|perfect)|best\s+\d+|ranked|rankings?|must[- ]see|watchlist|listicle|our\s+picks|the\s+list|hidden\s+gems?|best\s+(shows?|series|movies|films)|shows?\s+to\s+watch|series\s+(to|you\s+should)|which\s+.+\s+are\s+you)\b/i.test(t)) {
        return true;
    }
    // "4 Cult Horror Movies From 1976…", "7 Underrated Thriller Films You…"
    // Skip time-unit false positives ("2 weeks until the movie").
    return /\b\d{1,2}\s+(?!(?:days?|weeks?|months?|years?|hours?|minutes?|times?|dollars?|million|billion)\b)(?:[\w'-]+\s+){0,5}(movies?|films?|shows?|series|titles?|picks?)\b/i.test(t);
}

/** Detect "reasons/ways/facts" type listicles that need full heading extraction. */
export function isReasonBasedListicle(title = '') {
    const t = String(title || '').toLowerCase();
    // Allow adjectives between count and noun: "4 Cult Horror Movies", "5 Weird Facts"
    return /\b\d+\s+(?!(?:days?|weeks?|months?|years?|hours?|minutes?|times?)\b)(?:[\w'-]+\s+){0,5}(reasons?|ways?|facts?|things?|tips?|steps?|signs?|secrets?|mistakes?|lessons?|rules?|truths?|problems?|actors?|movies?|films?|shows?|characters?|scenes?|moments?|episodes?|titles?|picks?)\b/i.test(t);
}

/**
 * Detect real listicles. Genre words alone (sci-fi, dystopian) must NOT match —
 * news pieces like "Ridley Scott Sci-Fi Movie Alien Covenant Is Leaving…" are prose.
 */
export function isListicleArticle(title = '', text = '') {
    if (titleLooksLikeListicle(title)) return true;
    if (isReasonBasedListicle(title)) return true;
    const hay = String(text || '').slice(0, 500).toLowerCase();
    // Body can confirm ranking language, but never genre-only keywords.
    if (/\b(top\s+\d+|\d+\s+(best|greatest|great|scariest|worst|essential|forgotten|underrated)|ranked|rankings?|listicle|our\s+picks|the\s+list|hidden\s+gems?)\b/i.test(hay)) {
        return true;
    }
    return /\b\d{1,2}\s+(?!(?:days?|weeks?|months?|years?)\b)(?:[\w'-]+\s+){0,5}(movies?|films?|shows?|series)\b/i.test(hay);
}

function extractTitleFromLiHtml(liInnerHtml) {
    const tagged = [...liInnerHtml.matchAll(
        /<(strong|b|em|i|cite|h[1-6]|a)\b[^>]*>([\s\S]*?)<\/\1>/gi,
    )];
    for (const taggedMatch of tagged) {
        const fromTag = toListTitle(stripHtmlToText(taggedMatch[2]));
        if (fromTag) return fromTag;
    }
    return resolveListEntry(liInnerHtml);
}

function extractTaggedTitlesFromHtml(bodyHtml) {
    if (!bodyHtml) return [];
    const items = [];
    const re = /<(strong|b|em|i|cite)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = re.exec(bodyHtml)) !== null) {
        const line = toListTitle(stripHtmlToText(m[2]));
        if (line) items.push(line);
        if (items.length >= LISTICLE_MAX_ITEMS) break;
    }
    return items;
}

function extractListItemsFromHtml(bodyHtml) {
    if (!bodyHtml) return [];
    const items = [];
    const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = liRe.exec(bodyHtml)) !== null) {
        const line = extractTitleFromLiHtml(m[1]);
        if (line) items.push(line);
        if (items.length >= LISTICLE_MAX_ITEMS) break;
    }
    return items;
}

function extractListItemsFromText(text) {
    if (!text) return [];
    const items = [];
    const seen = new Set();

    // Split mashed "1) … 2) …" into lines first
    const normalized = String(text).replace(/\s+(\d{1,2}[.)]\s+)/g, '\n$1');
    const patterns = [
        /(?:^|\n)\s*(?:#|no\.?\s*)?(\d{1,2})[.)]\s+([^\n]+)/gi,
        /(?:^|\n)\s*(\d{1,2})\s*[-–—:]\s+([^\n]+)/gi,
    ];
    for (const re of patterns) {
        let m;
        while ((m = re.exec(normalized)) !== null) {
            const line = resolveListEntry(m[2]);
            const key = line.toLowerCase();
            if (!line || seen.has(key)) continue;
            seen.add(key);
            items.push(line);
            if (items.length >= LISTICLE_MAX_ITEMS) return items;
        }
        if (items.length >= 3) break;
    }
    return items;
}

const SKIP_LISTICLE_HEADINGS =
    /^(cast|crew|shorts|subscribe|follow us|about|contact|legal|explore|what to watch|related|more stories|share|comments?|newsletter|trending|latest|recommended|sources?|see also|watch on|where to watch|faq|recap)$/i;

/**
 * Extract full headings for reason-based listicles (not movie titles).
 * More liberal: allows longer text, sentences, and non-Title-Case.
 */
function extractFullHeadings(bodyHtml, maxItems = LISTICLE_MAX_ITEMS) {
    if (!bodyHtml) return [];
    const items = [];
    const re = /<h([2-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    let m;
    while ((m = re.exec(bodyHtml)) !== null) {
        let raw = stripHtmlToText(m[2]).trim();
        if (!raw || raw.length < 2 || raw.length > 150) continue;
        if (SKIP_LISTICLE_HEADINGS.test(raw)) continue;
        // Strip leading numbers like "1. " or "#1 "
        raw = raw.replace(/^[\d#.)\-\s]+/, '').trim();
        if (raw && raw.length >= 2) {
            items.push(raw);
        }
        if (items.length >= maxItems) break;
    }
    return items;
}

function extractHeadingCandidates(bodyHtml) {
    if (!bodyHtml) return [];
    const withYears = [];
    const other = [];
    const re = /<h([2-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    let m;
    while ((m = re.exec(bodyHtml)) !== null) {
        const raw = stripHtmlToText(m[2]);
        const line = resolveListEntry(m[2]);
        if (!line || SKIP_LISTICLE_HEADINGS.test(line)) continue;
        if (/\(\s*\d{4}/.test(raw)) {
            withYears.push(line);
        } else {
            other.push(line);
        }
        if (withYears.length + other.length >= LISTICLE_MAX_ITEMS * 2) break;
    }
    // Year-stamped headings are the real listicle entries on Collider/Variety/etc.
    if (withYears.length >= 3) return withYears.slice(0, LISTICLE_MAX_ITEMS);
    return [...withYears, ...other].slice(0, LISTICLE_MAX_ITEMS);
}

/**
 * Remove embedded publisher quizzes (Collider `.cq-quiz`, etc.) so personality
 * blurbs don't drown out the actual listicle show/movie headings.
 */
export function stripQuizBlocks(htmlOrText) {
    if (!htmlOrText) return htmlOrText || '';
    return String(htmlOrText)
        .replace(/<[^>]*class="[^"]*cq-quiz[^"]*"[\s\S]*?<\/(?:div|section|aside)>/gi, ' ')
        .replace(/RETAKE THE QUIZ[\s\S]*?(?=<h[1-6]\b|$)/gi, ' ')
        .replace(/TEST YOUR SURVIVAL[\s\S]*?(?=<h[1-6]\b|$)/gi, ' ')
        .replace(/Which Sci-Fi World Would You Survive\?[\s\S]*?(?=<h[1-6]\b|$)/gi, ' ');
}

function dedupeTitles(items) {
    const seen = new Set();
    return items.filter((it) => {
        const key = it.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, LISTICLE_MAX_ITEMS);
}

/**
 * Listicle summary = numbered entries (movie titles OR full headings for reasons).
 * Prefers Collider-style h2/h3 headings ('Show' (year)) over quiz lists.
 * For "N reasons/ways/facts" articles, extracts full headings instead of just titles.
 */
export function summarizeListicle({ title = '', summary = '', bodyHtml = '' } = {}) {
    const cleanedHtml = stripQuizBlocks(bodyHtml);
    const plain = mergeSourceText({ title, summary, bodyHtml: cleanedHtml });
    const titleIsList = titleLooksLikeListicle(title);
    const isReasonBased = isReasonBasedListicle(title);
    
    // For reason-based listicles ("5 Reasons Why..."), extract full headings
    if (isReasonBased) {
        const fullHeadings = extractFullHeadings(cleanedHtml);
        if (fullHeadings.length >= 2) {
            const items = dedupeTitles(fullHeadings);
            if (items.length >= 2) {
                return items.map((it, i) => `${i + 1}) ${it}`).join('\n');
            }
        }
    }
    
    // For movie/show listicles, use restrictive title extraction
    const fromHeadings = extractHeadingCandidates(cleanedHtml);
    const fromHtml = extractListItemsFromHtml(cleanedHtml);
    const fromText = extractListItemsFromText(plain);
    const fromTags = extractTaggedTitlesFromHtml(cleanedHtml);

    // Prefer structural list signals. Bold/italic title spam is only trusted when
    // the headline itself is clearly a Top-N / ranked listicle.
    let items = [];
    if (fromHeadings.length >= 3) items = fromHeadings;
    else if (fromHtml.length >= 3) items = fromHtml;
    else if (fromText.length >= 3) items = fromText;
    else if (titleIsList && fromTags.length >= 3) items = fromTags;
    else if (titleIsList) items = [...fromHeadings, ...fromHtml, ...fromText, ...fromTags];
    else return null;

    items = dedupeTitles(items);
    if (items.length < 3) return null;

    return items.map((it, i) => `${i + 1}) ${it}`).join('\n');
}

function mergeSourceText({ title, summary, bodyHtml }) {
    const fromBody = stripHtmlToText(bodyHtml);
    const fromSummary = stripHtmlToText(summary);
    const fromTitle = stripHtmlToText(title);

    let source = fromBody;
    if (fromSummary) {
        const probe = fromSummary.slice(0, Math.min(48, fromSummary.length)).toLowerCase();
        const bodyHasLead = fromBody && probe && fromBody.toLowerCase().includes(probe);
        if (!bodyHasLead) {
            source = [fromSummary, fromBody].filter(Boolean).join(' ').trim();
        }
    }
    if (!source) source = fromTitle;
    return source;
}

/**
 * Take complete sentences until we hit at least minWords (capped at maxWords).
 * Never cuts mid-sentence — ends naturally on the last full sentence.
 */
export function takeSentencesByWordCount(text, minWords = ARTICLE_SUMMARY_MIN_WORDS, maxWords = ARTICLE_SUMMARY_MAX_WORDS) {
    const sentences = splitSentences(text);
    if (!sentences.length) return '';

    const picked = [];
    let words = 0;
    for (const sentence of sentences) {
        const next = countWords(sentence);
        if (picked.length && words >= minWords) break;
        if (picked.length && words + next > maxWords) break;
        picked.push(sentence);
        words += next;
        if (words >= maxWords) break;
    }

    if (words < minWords) {
        for (let i = picked.length; i < sentences.length; i += 1) {
            picked.push(sentences[i]);
            words += countWords(sentences[i]);
            if (words >= minWords) break;
        }
    }

    return ensureSentenceEnd(picked.join(' '));
}

/**
 * Parse a stored summary into structured blocks for the feed carousel UI.
 * Listicles expose movie/show titles OR full reason text.
 */
export function parseSummaryForDisplay(summary) {
    const raw = String(summary || '').trim();
    if (!raw) return { kind: 'empty', intro: '', items: [], paragraphs: [] };

    // Support both newline lists and "…flawless. 1) Foo 2) Bar" mashed into one line.
    const normalized = raw
        .replace(/\s+(\d{1,2}[.)]\s+)/g, '\n$1')
        .trim();
    const lines = normalized.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const listLines = lines.filter((l) => /^\d+[.)]\s+/.test(l));

    if (listLines.length >= 2) {
        // First try restrictive movie-title extraction
        const movieTitleItems = dedupeTitles(
            listLines
                .map((l) => resolveListEntry(l.replace(/^\d+[.)]\s+/, '')))
                .filter(Boolean),
        );
        
        if (movieTitleItems.length >= 2) {
            return { kind: 'list', intro: '', items: movieTitleItems, paragraphs: [] };
        }
        
        // Fallback: keep full text for reason-based listicles (sentences are OK)
        const fullTextItems = listLines
            .map((l) => {
                const text = l.replace(/^\d+[.)]\s+/, '').trim();
                // Basic cleanup but keep full text
                return normalizeProseText(text);
            })
            .filter((t) => t && t.length >= 5 && t.length <= 200);
        
        if (fullTextItems.length >= 2) {
            return { kind: 'list', intro: '', items: fullTextItems, paragraphs: [] };
        }
        
        return { kind: 'empty', intro: '', items: [], paragraphs: [] };
    }

    return {
        kind: 'prose',
        intro: '',
        items: [],
        paragraphs: raw
            .split(/\n{2,}/)
            .map((p) => normalizeProseText(p))
            .filter(Boolean),
    };
}

/**
 * Build a feed summary (no AI, no forced wrap-up line).
 */
export function summarizeArticleForFeed(
    { title = '', summary = '', bodyHtml = '' } = {},
    {
        minWords = ARTICLE_SUMMARY_MIN_WORDS,
        maxWords = ARTICLE_SUMMARY_MAX_WORDS,
    } = {},
) {
    const source = mergeSourceText({ title, summary, bodyHtml });
    if (!source && !bodyHtml) return '';

    if (isListicleArticle(title, source)) {
        const listSummary = summarizeListicle({ title, summary, bodyHtml });
        if (listSummary) return listSummary;
    }

    // Real HTML lists only — never invent a list from bold movie names in news copy.
    const fromLis = dedupeTitles(extractListItemsFromHtml(stripQuizBlocks(bodyHtml)));
    if (fromLis.length >= 5) {
        return fromLis.map((it, i) => `${i + 1}) ${it}`).join('\n');
    }

    let body = takeSentencesByWordCount(source, minWords, maxWords);
    if (!body) body = ensureSentenceEnd(source);
    return normalizeProseText(body);
}
