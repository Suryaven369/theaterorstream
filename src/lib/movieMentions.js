// Inline movie mentions: typing "/" in a post or blog composer lets the user search
// and insert a movie/show, stored as a token directly in the text content so no
// schema change is needed on posts/blogs:
//   [[movie|tmdbId|mediaType|posterPath|year|title|size]]
// `size` is one of MENTION_SIZES below — 'none' means "title only, no poster" (the
// editor's per-chip "x" button just flips a chip to this size rather than removing
// the mention entirely). Trailing `|size` is optional for backwards compatibility
// with tokens written before this field existed, defaulting to 'sm'.

export const MENTION_SIZES = ['none', 'sm', 'md', 'lg'];
export const DEFAULT_MENTION_SIZE = 'sm';

const MOVIE_TOKEN_SOURCE =
    '\\[\\[movie\\|(\\d+)\\|(movie|tv)\\|([^|]*)\\|([^|]*)\\|([^|\\]]+)(?:\\|(none|sm|md|lg))?\\]\\]';

function getMovieTokenRegex() {
    return new RegExp(MOVIE_TOKEN_SOURCE, 'g');
}

// Strip characters that would break a token's own delimiters.
const safe = (s) => String(s || '').replace(/[|[\]]/g, '').trim();

export function buildMovieToken(movie, { size = DEFAULT_MENTION_SIZE } = {}) {
    const tmdbId = movie.tmdb_id ?? movie.id;
    const mediaType = movie.media_type === 'tv' ? 'tv' : 'movie';
    const posterPath = movie.poster_path || '';
    const year = (movie.release_date || movie.first_air_date || '').split('-')[0] || '';
    const title = safe(movie.title || movie.name);
    const safeSize = MENTION_SIZES.includes(size) ? size : DEFAULT_MENTION_SIZE;
    return `[[movie|${tmdbId}|${mediaType}|${posterPath}|${year}|${title}|${safeSize}]]`;
}

// @-mention an app user — links to their profile, can fire a notification.
//   [[user|userId|username|displayName]]
export function buildUserToken(user) {
    return `[[user|${user.id}|${safe(user.username)}|${safe(user.display_name || user.username)}]]`;
}

// @-mention a TMDB person (director/actor) — links to their work.
//   [[person|personId|name|profilePath]]
export function buildPersonToken(person) {
    return `[[person|${person.id}|${safe(person.name)}|${person.profile_path || ''}]]`;
}

// How long a "/query" is allowed to run before we give up treating it as a live
// mention search — long enough for any real movie/show title, short enough that an
// unrelated "/" typed mid-sentence doesn't hold the picker open indefinitely.
const MAX_TRIGGER_QUERY_LENGTH = 40;

/**
 * Detects an active "/" trigger immediately before the cursor — the "/" must sit at
 * the start of the text or after whitespace. The query may contain spaces (so
 * multi-word titles like "the dark knight" work), but a newline or a query that's
 * gotten too long ends the trigger.
 */
function detectCharTrigger(text, cursorPos, triggerChar) {
    const upToCursor = text.slice(0, cursorPos);
    const triggerIndex = upToCursor.lastIndexOf(triggerChar);
    if (triggerIndex === -1) return null;

    const before = upToCursor[triggerIndex - 1];
    if (triggerIndex > 0 && before !== ' ' && before !== '\n') return null;

    const query = upToCursor.slice(triggerIndex + 1);
    if (query.includes('\n') || query.length > MAX_TRIGGER_QUERY_LENGTH) return null;
    // Don't keep a trigger open across a different trigger char (e.g. "@x /y" or "#tag").
    if (query.includes('/') || query.includes('@') || query.includes('#')) return null;

    return { triggerIndex, query };
}

export function detectSlashTrigger(text, cursorPos) {
    const t = detectCharTrigger(text, cursorPos, '/');
    return t ? { slashIndex: t.triggerIndex, query: t.query } : null;
}

// "@" trigger for mentioning users + people (directors/actors).
export function detectAtTrigger(text, cursorPos) {
    const t = detectCharTrigger(text, cursorPos, '@');
    return t ? { atIndex: t.triggerIndex, query: t.query } : null;
}

/**
 * Replaces the active "/query" trigger with the selected movie's token.
 * Returns null if there's no active trigger at `cursorPos` anymore.
 */
export function insertMovieMention(text, cursorPos, movie, options = {}) {
    const trigger = detectSlashTrigger(text, cursorPos);
    if (!trigger) return null;

    const token = buildMovieToken(movie, options);
    const before = text.slice(0, trigger.slashIndex);
    const after = text.slice(cursorPos);
    const newText = `${before}${token} ${after}`;

    return { text: newText, cursorPos: before.length + token.length + 1 };
}

// Any mention token: movie | user | person. Body is split by "|" and dispatched.
const ANY_TOKEN_SOURCE = '\\[\\[(movie|user|person)\\|([^\\]]+)\\]\\]';
function getAnyTokenRegex() {
    return new RegExp(ANY_TOKEN_SOURCE, 'g');
}

function tokenToSegment(type, body) {
    const p = body.split('|');
    if (type === 'movie') {
        return { type: 'movie', tmdbId: p[0], mediaType: p[1], posterPath: p[2] || null, year: p[3], title: p[4], size: p[5] || DEFAULT_MENTION_SIZE };
    }
    if (type === 'user') {
        return { type: 'user', userId: p[0], username: p[1], displayName: p[2] || p[1] };
    }
    if (type === 'person') {
        return { type: 'person', personId: p[0], name: p[1], profilePath: p[2] || null };
    }
    return null;
}

/** Splits content into plain-text + mention (movie/user/person) segments for rendering. */
export function parseMentions(content) {
    if (!content) return [];
    const segments = [];
    let lastIndex = 0;
    const regex = getAnyTokenRegex();
    let match;
    while ((match = regex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
        }
        const seg = tokenToSegment(match[1], match[2]);
        if (seg) segments.push(seg);
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
        segments.push({ type: 'text', value: content.slice(lastIndex) });
    }
    return segments;
}

// Back-compat alias (older imports) — now returns all mention types, not just movies.
export const parseMovieMentions = parseMentions;

/** Collapses tokens down to readable plain text — for truncated previews/cards. */
export function stripMentionsToPlainText(content) {
    if (!content) return '';
    return content.replace(getAnyTokenRegex(), (_m, type, body) => {
        const seg = tokenToSegment(type, body);
        if (seg?.type === 'movie') return `🎬 ${seg.title}`;
        if (seg?.type === 'user') return `@${seg.displayName}`;
        if (seg?.type === 'person') return seg.name;
        return '';
    });
}

/** Extracts mentioned app-user ids from content — for firing mention notifications. */
export function extractMentionedUserIds(content) {
    return parseMentions(content).filter((s) => s.type === 'user').map((s) => s.userId);
}

/** Approximate human-readable length (tokens count as their title, not raw markup) — for char counters. */
export function getPlainTextLength(content) {
    return stripMentionsToPlainText(content).length;
}
