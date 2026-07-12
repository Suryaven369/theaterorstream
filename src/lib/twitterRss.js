import { normalizeProseText, stripHtmlToText } from './articleSummary.js';

/** Nitter / X / Twitter / RssHub Twitter feeds. */
export function isTwitterRssUrl(url = '') {
    return /nitter\.|\/\/(?:www\.)?(?:twitter|x)\.com\b|rsshub\.app\/twitter/i.test(String(url || ''));
}

export function isTwitterFeedArticle({ link = '', sourceName = '', feedUrl = '' } = {}) {
    return isTwitterRssUrl(link) || isTwitterRssUrl(feedUrl) || /\bnitter\b/i.test(sourceName || '');
}

/** Prefer a stable x.com status URL when the feed used a Nitter mirror. */
export function toXStatusUrl(link = '') {
    const raw = String(link || '').trim();
    if (!raw) return null;
    try {
        const u = new URL(raw);
        const m = u.pathname.match(/\/([^/]+)\/status\/(\d+)/i);
        if (m) return `https://x.com/${m[1]}/status/${m[2]}`;
        if (/twitter\.com|x\.com/i.test(u.hostname)) return raw;
    } catch {
        /* ignore */
    }
    return raw;
}

export function extractTwitterHandle(link = '', sourceName = '') {
    try {
        const u = new URL(String(link || ''));
        const m = u.pathname.match(/^\/([^/]+)/);
        if (m && !/^(i|search|home|explore|intent)$/i.test(m[1])) {
            return m[1].replace(/^@/, '');
        }
    } catch {
        /* ignore */
    }
    const fromName = String(sourceName || '').replace(/^@/, '').trim();
    if (/^[A-Za-z0-9_]{1,15}$/.test(fromName)) return fromName;
    return fromName || 'tweet';
}

/**
 * Clean RSS tweet title/description into plain post text.
 * Nitter often prefixes "Handle: " on the title.
 */
export function normalizeTweetText({ title = '', summary = '', bodyHtml = '', handle = '' } = {}) {
    let text = stripHtmlToText(summary || bodyHtml || title || '');
    if (!text) text = stripHtmlToText(title || '');
    text = normalizeProseText(text);

    const h = String(handle || '').replace(/^@/, '');
    if (h) {
        const re = new RegExp(`^@?${h}\\s*[:\\-–—]\\s*`, 'i');
        text = text.replace(re, '').trim();
    }
    // Drop trailing "… nitter" / "RTs" noise occasionally left by mirrors
    text = text.replace(/\s*nitter\.?\s*$/i, '').trim();
    return text;
}
