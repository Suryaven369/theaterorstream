import React, { useState } from 'react';
import { FaInfoCircle, FaTimes } from 'react-icons/fa';

export default function CinematicIdentityCard({ identity, meta }) {
    const [open, setOpen] = useState(false);

    return (
        <section className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-[#1a1f24] via-[#14181c] to-[#0f1215] p-4 sm:rounded-2xl sm:p-7">
            <div
                className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--accent-green)]/10 blur-3xl"
                aria-hidden
            />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 sm:text-xs">
                Your cinematic identity
            </p>
            <h2 className="mt-1.5 text-xl font-bold text-white sm:mt-2 sm:text-3xl">{identity.label}</h2>
            <p className="mt-2 max-w-3xl text-[13px] leading-snug text-white/65 sm:mt-3 sm:text-base sm:leading-relaxed">
                {identity.description}
            </p>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-3 inline-flex min-h-[40px] items-center gap-2 text-sm text-[var(--accent-green)] hover:underline sm:mt-4"
            >
                <FaInfoCircle className="text-xs" /> How was this created?
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="taste-identity-how"
                    onClick={() => setOpen(false)}
                >
                    <div
                        className="w-full max-w-md rounded-t-2xl border border-white/10 bg-[#1c1f22] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <h3 id="taste-identity-how" className="text-lg font-semibold text-white">
                                How this summary is built
                            </h3>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="min-h-[40px] min-w-[40px] rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white"
                                aria-label="Close"
                            >
                                <FaTimes />
                            </button>
                        </div>
                        <ul className="space-y-2 text-sm text-white/65">
                            <li>· Movies you’ve rated ({meta.ratingCount})</li>
                            <li>· Genres you engage with most often</li>
                            <li>· Story vibes that show up across liked titles</li>
                            <li>· Recent behaviour on Watch and recommendations</li>
                            <li>· Preferences you’ve set explicitly in Taste Settings</li>
                            <li>· Current confidence: {meta.confidence}%</li>
                        </ul>
                        <p className="mt-4 text-xs text-white/40">
                            This is a current summary, not a permanent personality label. It will shift as your
                            activity changes.
                        </p>
                    </div>
                </div>
            )}
        </section>
    );
}
