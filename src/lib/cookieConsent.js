/**
 * Analytics cookie consent. Login, region, search history and caches are
 * essential (browser storage, no consent needed); Google Analytics is the only
 * optional tracking and loads only after "Accept" (loader in index.html).
 */
export const CONSENT_KEY = 'tos_cookie_consent'; // 'granted' | 'denied'
export const OPEN_COOKIE_SETTINGS_EVENT = 'tos:open-cookie-settings';

export function getCookieConsent() {
    try {
        return localStorage.getItem(CONSENT_KEY);
    } catch {
        return 'denied'; // storage blocked — don't nag, don't track
    }
}

/** Remove Google Analytics cookies (_ga, _ga_*) after a withdrawal. */
function clearAnalyticsCookies() {
    const host = window.location.hostname;
    const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
    document.cookie.split(';').forEach((c) => {
        const name = c.split('=')[0].trim();
        if (!/^_ga(_|$)/.test(name)) return;
        domains.forEach((d) => {
            document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`;
        });
    });
}

export function setCookieConsent(granted) {
    try {
        localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
    } catch { /* storage blocked */ }

    if (granted) {
        window.tosLoadAnalytics?.();
    } else {
        window.gtag?.('consent', 'update', { analytics_storage: 'denied' });
        clearAnalyticsCookies();
    }
}

/** Reopen the banner (footer "Cookie settings" link). */
export function openCookieSettings() {
    window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}
