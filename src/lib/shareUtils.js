const SHARE_FILENAME = 'tos-rating-card.png';

export const isMobileDevice = () =>
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

export const isAndroid = () => /Android/i.test(navigator.userAgent);

export async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return response.blob();
}

export function blobToShareFile(blob, filename = SHARE_FILENAME) {
    return new File([blob], filename, { type: 'image/png' });
}

export async function shareImageFile(blob, { title, text, url } = {}) {
    if (!navigator.share) {
        return { ok: false, reason: 'unsupported' };
    }

    const file = blobToShareFile(blob);

    try {
        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ title, text, url, files: [file] });
            return { ok: true, method: 'native-file' };
        }

        await navigator.share({ title, text, url: url || window.location.href });
        return { ok: true, method: 'native-link' };
    } catch (error) {
        if (error?.name === 'AbortError') {
            return { ok: false, reason: 'cancelled' };
        }
        return { ok: false, reason: 'failed', error };
    }
}

export async function copyImageToClipboard(blob) {
    if (!navigator.clipboard?.write || !window.ClipboardItem) {
        return false;
    }

    try {
        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
        ]);
        return true;
    } catch {
        return false;
    }
}

export function downloadBlob(blob, filename = SHARE_FILENAME) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
}

export async function shareToInstagramStories(blob) {
    const native = await shareImageFile(blob, {
        title: 'TOS Rating Card',
        text: 'My TheaterOrStream rating',
    });
    if (native.ok) {
        return { ok: true, message: 'Choose Instagram Stories in the share menu.' };
    }

    const copied = await copyImageToClipboard(blob);
    if (copied) {
        if (isIOS()) {
            window.location.href = 'instagram-stories://share';
            return {
                ok: true,
                message: 'Image copied! Instagram should open — paste or add to your Story.',
            };
        }
        if (isAndroid()) {
            window.location.href =
                'intent://share/#Intent;package=com.instagram.android;scheme=https;end';
            return {
                ok: true,
                message: 'Image copied! Pick Instagram and add to Story.',
            };
        }
        window.open('https://www.instagram.com/', '_blank');
        return {
            ok: true,
            message: 'Image copied! Open Instagram and create a Story.',
        };
    }

    downloadBlob(blob);
    window.open('https://www.instagram.com/', '_blank');
    return {
        ok: true,
        message: 'Card downloaded. Upload it to Instagram Stories.',
    };
}

export async function shareToWhatsApp({ text, url, blob }) {
    const message = [text, url].filter(Boolean).join('\n');

    if (blob) {
        const native = await shareImageFile(blob, {
            title: 'TOS Rating Card',
            text: message,
            url,
        });
        if (native.ok) {
            return { ok: true, message: 'Choose WhatsApp in the share menu.' };
        }
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    return { ok: true, message: 'WhatsApp opened — attach the card if needed.' };
}

export function shareToTwitter({ text, url }) {
    window.open(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
        '_blank',
    );
    return { ok: true, message: 'Twitter compose opened.' };
}

export function shareToFacebook({ url }) {
    window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
        '_blank',
    );
    return { ok: true, message: 'Facebook share opened.' };
}

export function shareToTelegram({ text, url }) {
    window.open(
        `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
        '_blank',
    );
    return { ok: true, message: 'Telegram share opened.' };
}

export function shareToReddit({ title, url }) {
    window.open(
        `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
        '_blank',
    );
    return { ok: true, message: 'Reddit submit opened.' };
}

export const TOS_SHARE_CATEGORIES = [
    { key: 'acting', label: 'Acting', color: '#22c55e' },
    { key: 'screenplay', label: 'Story', color: '#3b82f6' },
    { key: 'sound', label: 'Sound', color: '#a855f7' },
    { key: 'direction', label: 'Direction', color: '#f97316' },
    { key: 'entertainment', label: 'Fun', color: '#ec4899' },
    { key: 'pacing', label: 'Pacing', color: '#06b6d4' },
    { key: 'cinematography', label: 'Visuals', color: '#f59e0b' },
];

const LEGACY_RATING_KEYS = {
    entertainmentValue: 'entertainment',
    cinematicQuality: 'cinematography',
};

export function normalizeShareRatings(ratings) {
    if (!ratings) return {};

    const normalized = {};
    TOS_SHARE_CATEGORIES.forEach(({ key }) => {
        const legacyKey = Object.entries(LEGACY_RATING_KEYS).find(([, value]) => value === key)?.[0];
        const value = ratings[key] ?? ratings[legacyKey];
        if (typeof value === 'number') {
            normalized[key] = value;
        }
    });

    return normalized;
}

export function calculateShareOverallScore(ratings) {
    const values = Object.values(normalizeShareRatings(ratings));
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getScoreAccentColor(score) {
    if (score >= 7) return '#f59e0b';
    if (score >= 5) return '#d97706';
    if (score >= 3) return '#94a3b8';
    return '#64748b';
}

/** Curated one-liner for share card editorial feel */
export function getShareEmotionalLine(score) {
    const lines = {
        high: [
            'Best experienced in IMAX.',
            'A cinematic spectacle.',
            'Electrifying storytelling.',
            'Pure big-screen energy.',
        ],
        good: [
            'Worth your time.',
            'A confident watch.',
            'Strongly recommended.',
        ],
        mid: [
            'Solid company for a night in.',
            'Has its moments.',
        ],
        low: [
            'Not for everyone.',
            'A divisive experience.',
        ],
    };

    let pool;
    if (score >= 8.5) pool = lines.high;
    else if (score >= 7) pool = lines.good;
    else if (score >= 5.5) pool = lines.mid;
    else pool = lines.low;

    const idx = Math.floor(score * 10) % pool.length;
    return pool[idx];
}

export const SHARE_CARD_EDITORIAL_LABELS = {
    acting: 'ACTING',
    screenplay: 'STORY',
    sound: 'SOUND',
    direction: 'DIRECTION',
    entertainment: 'FUN',
    pacing: 'PACING',
    cinematography: 'VISUALS',
};
