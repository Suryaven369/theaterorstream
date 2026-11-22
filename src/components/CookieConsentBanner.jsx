import React, { useEffect, useState } from 'react';
import { getCookieConsent, setCookieConsent, OPEN_COOKIE_SETTINGS_EVENT } from '../lib/cookieConsent';

/**
 * Bottom banner asking before Google Analytics runs. Shown until the visitor
 * chooses; footer "Cookie settings" links reopen it to change the choice.
 */
export default function CookieConsentBanner() {
    const [open, setOpen] = useState(() => !getCookieConsent());

    useEffect(() => {
        const reopen = () => setOpen(true);
        window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
        return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
    }, []);

    if (!open) return null;

    const choose = (granted) => {
        setCookieConsent(granted);
        setOpen(false);
    };

    return (
        <div
            role="dialog"
            aria-live="polite"
            aria-label="Cookie preferences"
            className="fixed inset-x-0 bottom-0 z-[100] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pb-6"
        >
            <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-white/10 bg-[#16151a]/95 p-4 text-white shadow-2xl backdrop-blur-md sm:flex-row sm:items-center sm:gap-5 sm:p-5">
                <p className="flex-1 text-[13px] leading-relaxed text-white/70 sm:text-sm">
                    We use essential storage to keep you signed in and remember your preferences. With your
                    OK, we&rsquo;d also use Google Analytics cookies to understand how the site is used.{' '}
                    <a href="/privacy" className="text-white underline underline-offset-2 hover:text-[#f5c518]">
                        Privacy policy
                    </a>
                </p>
                <div className="flex shrink-0 gap-2">
                    <button
                        type="button"
                        onClick={() => choose(false)}
                        className="min-h-[44px] flex-1 rounded-full border border-white/20 px-4 text-sm font-medium text-white/85 hover:bg-white/10 sm:flex-none"
                    >
                        Essential only
                    </button>
                    <button
                        type="button"
                        onClick={() => choose(true)}
                        className="min-h-[44px] flex-1 rounded-full bg-[#f5c518] px-5 text-sm font-semibold text-black hover:bg-[#f5c518]/90 sm:flex-none"
                    >
                        Accept
                    </button>
                </div>
            </div>
        </div>
    );
}
