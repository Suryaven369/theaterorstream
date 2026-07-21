/**
 * Resolve the API origin for browser fetches.
 *
 * On the live site we always use same-origin (forced to www) so Authorization
 * is never dropped by the apex → www 308 redirect.
 */
export function resolveApiBase() {
    const configured = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

    const toWww = (originOrUrl) => {
        try {
            const u = new URL(originOrUrl);
            if (u.hostname === 'theaterorstream.com') {
                u.hostname = 'www.theaterorstream.com';
            }
            return u.origin;
        } catch {
            return originOrUrl;
        }
    };

    if (typeof window !== 'undefined') {
        const host = window.location.hostname || '';
        if (host === 'www.theaterorstream.com' || host === 'theaterorstream.com') {
            return toWww(window.location.origin);
        }
        if (!configured) return '';
    }

    if (!configured) return '';
    return toWww(configured);
}
