import React, { useMemo, useState } from 'react';
import { DNA_TRAIT_LABELS } from '../../constants/tasteMap';

export default function VibeMap({ dna = [], onFeedback }) {
    const [selected, setSelected] = useState(null);

    const vibes = useMemo(
        () =>
            (dna || []).map((d) => ({
                id: d.id,
                label: DNA_TRAIT_LABELS[d.id] || d.id,
                score: d.score,
            })),
        [dna],
    );

    if (!vibes.length) return null;

    const active = vibes.find((v) => v.id === selected) || null;

    return (
        <section>
            <h2 className="mb-1.5 text-lg font-bold text-white sm:mb-2 sm:text-xl">Your favourite movie vibes</h2>
            <p className="mb-3 text-[13px] text-white/45 sm:mb-4 sm:text-sm">
                Stronger preferences appear larger. Tap a vibe for details.
            </p>
            <div className="flex flex-wrap items-center justify-start gap-1.5 rounded-xl border border-white/8 bg-[#12161a] p-3 sm:items-end sm:justify-center sm:gap-3 sm:rounded-2xl sm:p-7">
                {vibes.map((v) => {
                    // Cap scale on mobile so chips stay tappable and don't overflow.
                    const scale = 0.92 + (v.score / 100) * 0.28;
                    const activeRing = selected === v.id;
                    return (
                        <button
                            key={v.id}
                            type="button"
                            onClick={() => setSelected(v.id)}
                            className={`min-h-[36px] rounded-full border px-2.5 py-1.5 text-[12px] font-medium transition-colors sm:min-h-0 sm:px-3 sm:text-[length:inherit] ${
                                activeRing
                                    ? 'border-[var(--accent-green)] bg-[var(--accent-green)]/15 text-[var(--accent-green)]'
                                    : 'border-white/12 bg-white/[0.04] text-white/75 hover:border-white/25 hover:text-white'
                            }`}
                            style={{
                                fontSize: `clamp(11px, ${Math.round(11 * scale)}px, 15px)`,
                            }}
                            aria-pressed={activeRing}
                        >
                            {v.label}
                            <span className="ml-1 text-[0.75em] opacity-60">{v.score}</span>
                        </button>
                    );
                })}
            </div>

            {active && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 sm:mt-4 sm:rounded-2xl sm:p-4">
                    <h3 className="text-base font-semibold text-white sm:text-lg">{active.label}</h3>
                    <p className="mt-1 text-xs text-white/40">{active.score}% affinity</p>
                    <p className="mt-2 text-[13px] text-white/65 sm:text-sm">
                        You often enjoy movies where {active.label.toLowerCase()} qualities show up in the story,
                        tone, or craft.
                    </p>
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide sm:flex-wrap sm:overflow-visible">
                        {['Show me more', 'Show me less', 'Accurate', 'Not accurate'].map((label) => (
                            <button
                                key={label}
                                type="button"
                                onClick={() => onFeedback?.(label, active.label)}
                                className="min-h-[36px] shrink-0 rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/70 hover:border-white/30 hover:text-white"
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
