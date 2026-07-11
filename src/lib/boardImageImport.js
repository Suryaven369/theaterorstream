/**
 * Import images onto boards via file picker, drag-from-web, or paste.
 * Handles Google Images / other-tab drops (uri-list + html img src) and clipboard.
 */

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|jfif)(\?|#|$)/i;

/** Decode HTML entities in attribute values from drag HTML. */
function decodeHtmlEntities(s) {
    if (!s) return s;
    return s
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function looksLikeImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    let u = decodeHtmlEntities(url.trim());
    if (u.startsWith('//')) u = `https:${u}`;
    if (u.startsWith('blob:') || u.startsWith('data:image')) return true;
    if (!/^https?:\/\//i.test(u)) return false;
    // Skip obvious non-image navigations
    if (/google\.[^/]+\/search\?/i.test(u) && !/imgurl=/i.test(u)) return false;
    if (IMAGE_EXT.test(u)) return true;
    // Google Images / CDNs often omit extensions
    if (/googleusercontent\.com|ggpht\.com|gstatic\.com|google\.[^/]+\/imgres|pinimg\.com|imgur\.com|twimg\.com|media\.|cdn\.|cloudfront\.|image\.tmdb\.org|wikimedia\.org|wp-content\/uploads|fbcdn\.net|instagram\.|cdninstagram/i.test(u)) {
        return true;
    }
    // Any https URL that came from an <img src> is accepted by callers via force flag
    return false;
}

/** Prefer the real image URL inside a Google imgres / imgurl= link. */
function unwrapGoogleImageUrl(url) {
    try {
        const u = new URL(decodeHtmlEntities(url.trim()));
        const imgurl = u.searchParams.get('imgurl') || u.searchParams.get('url');
        if (imgurl && /^https?:\/\//i.test(imgurl)) return imgurl;
    } catch {
        /* ignore */
    }
    return decodeHtmlEntities(url.trim());
}

function urlsFromHtml(html) {
    if (!html) return [];
    const found = [];
    const push = (raw) => {
        if (!raw) return;
        const unwrapped = unwrapGoogleImageUrl(raw);
        // Accept almost any http(s) src from an img tag — Google thumbs rarely have extensions
        let u = unwrapped;
        if (u.startsWith('//')) u = `https:${u}`;
        if (!/^https?:\/\//i.test(u) && !u.startsWith('data:image')) return;
        if (/google\.[^/]+\/search\?/i.test(u) && !/imgurl=/i.test(u)) return;
        if (!found.includes(u)) found.push(u);
    };

    const imgRe = /<img[^>]+(?:src|data-src|data-original|data-iurl)=["']([^"']+)["']/gi;
    let m;
    while ((m = imgRe.exec(html))) push(m[1]);

    // Google result links often embed imgurl=
    const hrefRe = /href=["']([^"']*imgurl=[^"']+)["']/gi;
    while ((m = hrefRe.exec(html))) push(m[1]);

    const dataRe = /(?:data-src|data-original|data-iurl)=["'](https?:\/\/[^"']+)["']/gi;
    while ((m = dataRe.exec(html))) push(m[1]);

    return found;
}

function urlsFromUriList(text) {
    if (!text) return [];
    return text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
        .map(unwrapGoogleImageUrl)
        .filter((l) => looksLikeImageUrl(l) || /^https?:\/\//i.test(l));
}

function urlsFromPlainText(text) {
    if (!text) return [];
    const found = [];
    const re = /https?:\/\/[^\s<>"']+/gi;
    let m;
    while ((m = re.exec(text))) {
        const cleaned = unwrapGoogleImageUrl(m[0].replace(/[),.;]+$/, ''));
        if (looksLikeImageUrl(cleaned) || /gstatic|googleusercontent|imgurl=/i.test(cleaned)) {
            if (!found.includes(cleaned)) found.push(cleaned);
        }
    }
    return found;
}

/**
 * Collect image Files and http(s) URLs from a drag or paste event.
 * @returns {{ files: File[], urls: string[] }}
 */
export function extractImagesFromDataTransfer(dt) {
    const files = [];
    const urls = [];
    if (!dt) return { files, urls };

    if (dt.files?.length) {
        for (const f of dt.files) {
            const okType = !f.type || f.type.startsWith('image/') || IMAGE_EXT.test(f.name || '');
            if (okType && f.size > 0) files.push(f);
        }
    }

    if (dt.items?.length) {
        for (const item of dt.items) {
            if (item.kind === 'file' && (!item.type || item.type.startsWith('image/'))) {
                const f = item.getAsFile();
                if (f && !files.some((x) => x.name === f.name && x.size === f.size)) files.push(f);
            }
        }
    }

    let uriList = '';
    let html = '';
    let plain = '';
    try { uriList = dt.getData?.('text/uri-list') || ''; } catch { /* ignore */ }
    try { html = dt.getData?.('text/html') || ''; } catch { /* ignore */ }
    try { plain = dt.getData?.('text/plain') || ''; } catch { /* ignore */ }

    for (const u of [
        ...urlsFromUriList(uriList),
        ...urlsFromHtml(html),
        ...urlsFromPlainText(plain),
    ]) {
        if (!urls.includes(u)) urls.push(u);
    }

    return { files, urls };
}

/**
 * Collect images from a ClipboardEvent (paste).
 * @returns {Promise<{ files: File[], urls: string[] }>}
 */
export async function extractImagesFromClipboard(e) {
    const files = [];
    const urls = [];
    const items = e?.clipboardData?.items;
    if (items) {
        for (const item of items) {
            if (item.type?.startsWith('image/')) {
                const f = item.getAsFile();
                if (f) {
                    // Clipboard files often have empty name — give one so upload accepts them
                    const named = f.name && f.name !== 'image.png'
                        ? f
                        : new File([f], `paste-${Date.now()}.${(item.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: item.type || 'image/png' });
                    files.push(named);
                }
            } else if (item.type === 'text/html') {
                const html = await new Promise((resolve) => {
                    item.getAsString(resolve);
                });
                for (const u of urlsFromHtml(html)) {
                    if (!urls.includes(u)) urls.push(u);
                }
            } else if (item.type === 'text/plain' || item.type === 'text/uri-list') {
                const text = await new Promise((resolve) => {
                    item.getAsString(resolve);
                });
                for (const u of item.type === 'text/uri-list' ? urlsFromUriList(text) : urlsFromPlainText(text)) {
                    if (!urls.includes(u)) urls.push(u);
                }
            }
        }
    }
    if (e?.clipboardData) {
        const extra = extractImagesFromDataTransfer(e.clipboardData);
        for (const f of extra.files) {
            if (!files.some((x) => x.name === f.name && x.size === f.size)) files.push(f);
        }
        for (const u of extra.urls) {
            if (!urls.includes(u)) urls.push(u);
        }
    }
    return { files, urls };
}

/**
 * Ensure a File has a usable image MIME type for storage upload.
 */
export function normalizeImageFile(file) {
    if (!file) return null;
    let type = file.type || '';
    if (!type.startsWith('image/')) {
        const name = file.name || '';
        if (/\.png$/i.test(name)) type = 'image/png';
        else if (/\.webp$/i.test(name)) type = 'image/webp';
        else if (/\.gif$/i.test(name)) type = 'image/gif';
        else if (/\.avif$/i.test(name)) type = 'image/avif';
        else type = 'image/jpeg';
        return new File([file], file.name || `image-${Date.now()}.jpg`, { type });
    }
    if (!file.name || file.name === 'image.png' || file.name === 'blob') {
        const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
        return new File([file], `image-${Date.now()}.${ext}`, { type });
    }
    return file;
}

/**
 * Turn a remote image URL into a File.
 * Tries same-origin API proxy first (avoids CORS), then direct fetch.
 */
export async function fetchImageAsFile(url, filename = 'dropped-image.jpg') {
    const tryBlob = async (res) => {
        if (!res?.ok) return null;
        const blob = await res.blob();
        const type = blob.type?.startsWith('image/') ? blob.type : 'image/jpeg';
        if (blob.size < 50) return null;
        const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
        const name = filename.includes('.') ? filename : `dropped-image.${ext}`;
        return new File([blob], name, { type });
    };

    // 1) App proxy (works for Google / hotlink hosts that block browser CORS)
    try {
        const proxy = `/api/content/fetch-image?url=${encodeURIComponent(url)}`;
        const res = await fetch(proxy, { credentials: 'same-origin' });
        const file = await tryBlob(res);
        if (file) return file;
    } catch {
        /* fall through */
    }

    // 2) Direct CORS fetch
    try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
        return await tryBlob(res);
    } catch {
        return null;
    }
}
