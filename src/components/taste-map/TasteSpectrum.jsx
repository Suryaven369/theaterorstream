import React from 'react';

export default function TasteSpectrum({ spectra = [] }) {
    if (!spectra.length) return null;

    return (
        <section>
            <h2 className="mb-1.5 text-lg font-bold text-white sm:mb-2 sm:text-xl">How you like your movies</h2>
            <p className="mb-3 text-[13px] text-white/45 sm:mb-5 sm:text-sm">
                Inferred from story vibes — not hard locks.
            </p>
            <div className="space-y-3 sm:space-y-5">
                {spectra.map((s) => (
                    <div key={s.id} className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 sm:px-4 sm:py-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                            <h3 className="text-[13px] font-semibold text-white sm:text-sm">{s.label}</h3>
                            <span className="text-[10px] text-white/40 sm:text-[11px]">
                                {s.hasSignal ? s.confidence.label : 'Still learning'}
                            </span>
                        </div>
                        <div className="relative h-2 rounded-full bg-white/10">
                            <div
                                className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-[var(--accent-green)] bg-[#14181c] shadow sm:h-4 sm:w-4 motion-safe:transition-[left] motion-safe:duration-700"
                                style={{ left: `calc(${s.position}% - 7px)` }}
                                role="img"
                                aria-label={`${s.label}: ${s.position} toward ${s.right}`}
                            />
                        </div>
                        <div className="mt-1.5 flex justify-between gap-2 text-[10px] leading-tight text-white/40 sm:mt-2 sm:text-[11px]">
                            <span className="max-w-[45%]">{s.left}</span>
                            <span className="max-w-[45%] text-right">{s.right}</span>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
