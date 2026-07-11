/**
 * Hashtag helpers — plain-text #Tags in content (not [[tokens]]).
 * Slug: lowercase alphanumeric only (#SciFi → scifi, #Star-Wars → starwars).
 */

export const HASHTAG_TOKEN_RE = /#([A-Za-z][A-Za-z0-9_]{0,49})/g;

export function normalizeHashtagSlug(raw) {
  return String(raw || '')
    .replace(/^#/, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

export function extractHashtags(content) {
  if (!content) return [];
  const cleaned = String(content).replace(/\[\[[^\]]+\]\]/g, ' ');
  const seen = new Set();
  const out = [];
  const re = new RegExp(HASHTAG_TOKEN_RE.source, 'g');
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const display = m[1];
    const slug = normalizeHashtagSlug(display);
    if (slug.length < 2 || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, displayName: display, raw: `#${display}` });
  }
  return out;
}

/** Split a plain-text string into text + hashtag segments for rendering. */
export function splitTextWithHashtags(text) {
  if (!text) return [];
  const segments = [];
  const re = new RegExp(HASHTAG_TOKEN_RE.source, 'g');
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ type: 'text', value: text.slice(last, m.index) });
    }
    segments.push({
      type: 'hashtag',
      displayName: m[1],
      slug: normalizeHashtagSlug(m[1]),
      raw: m[0],
    });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ type: 'text', value: text.slice(last) });
  }
  return segments;
}

/**
 * Detect an active "#" trigger before the cursor.
 * Query is continuous alphanumerics/underscore (no spaces).
 */
export function detectHashTrigger(text, cursorPos) {
  const upToCursor = text.slice(0, cursorPos);
  const hashIndex = upToCursor.lastIndexOf('#');
  if (hashIndex === -1) return null;

  const before = upToCursor[hashIndex - 1];
  if (hashIndex > 0 && before !== ' ' && before !== '\n') return null;

  const query = upToCursor.slice(hashIndex + 1);
  if (query.includes('\n') || query.includes(' ') || query.includes('/') || query.includes('@')) {
    return null;
  }
  if (query.length > 40) return null;
  if (query && !/^[A-Za-z0-9_]*$/.test(query)) return null;

  return { hashIndex, query };
}

export function insertHashtag(text, cursorPos, tag) {
  const trigger = detectHashTrigger(text, cursorPos);
  if (!trigger) return null;

  const display = String(tag.display_name || tag.displayName || tag.slug || '').replace(/^#/, '');
  const token = `#${display}`;
  const before = text.slice(0, trigger.hashIndex);
  const after = text.slice(cursorPos);
  const newText = `${before}${token} ${after}`;
  return { text: newText, cursorPos: before.length + token.length + 1 };
}
