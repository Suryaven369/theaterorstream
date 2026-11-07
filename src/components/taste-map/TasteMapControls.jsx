import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    BOUNDARY_LEVELS,
    CONTENT_BOUNDARY_TYPES,
    DISCOVERY_LEVELS,
} from '../../constants/tasteMap';

export function DiscoveryPreferenceControl({ level = 3, onChange }) {
    const active = DISCOVERY_LEVELS.find((d) => d.id === level) || DISCOVERY_LEVELS[2];

    return (
        <section>
            <h2 className="mb-1.5 text-lg font-bold text-white sm:mb-2 sm:text-xl">How adventurous should recommendations be?</h2>
            <p className="mb-1 text-center text-[10px] text-white/40 sm:text-xs">
                Familiar ←→ Balanced ←→ Surprise me
            </p>
            <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={level}
                onChange={(e) => onChange?.(Number(e.target.value))}
                className="mt-2 h-8 w-full accent-[var(--accent-green)] sm:mt-3 sm:h-auto"
                aria-label="Discovery level"
            />
            <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] p-3.5 sm:mt-4 sm:p-4">
                <h3 className="font-semibold text-white">{active.label}</h3>
                <p className="mt-1 text-[13px] text-white/60 sm:text-sm">{active.blurb}</p>
                <p className="mt-2 text-[11px] text-white/40 sm:text-xs">
                    Suggested mix (illustrative): {active.mix}
                </p>
            </div>
        </section>
    );
}

export function ContentBoundarySettings({ boundaries = {}, onChange }) {
    const [open, setOpen] = useState(false);

    return (
        <section className="rounded-xl border border-white/8 bg-white/[0.02] sm:rounded-2xl">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-3.5 text-left sm:px-4 sm:py-4"
                aria-expanded={open}
            >
                <div className="min-w-0">
                    <h2 className="text-base font-bold text-white sm:text-lg">Your viewing boundaries</h2>
                    <p className="mt-0.5 text-[11px] text-white/40 sm:mt-1 sm:text-xs">
                        Private — only for safer, more relevant recommendations.
                    </p>
                </div>
                <span className="shrink-0 text-sm text-white/45">{open ? 'Hide' : 'Open'}</span>
            </button>
            {open && (
                <div className="space-y-3 border-t border-white/8 px-3.5 pb-4 pt-3 sm:px-4">
                    {CONTENT_BOUNDARY_TYPES.map((t) => {
                        const value = boundaries[t.id] || 'no_preference';
                        return (
                            <div key={t.id} className="flex flex-col gap-1.5">
                                <span className="text-[13px] text-white/75 sm:text-sm">{t.label}</span>
                                <select
                                    className="min-h-[44px] w-full rounded-lg border border-white/12 bg-[#14181c] px-3 py-2.5 text-[13px] text-white/80 sm:min-h-0 sm:w-auto sm:text-xs"
                                    value={value}
                                    onChange={(e) => onChange?.({ ...boundaries, [t.id]: e.target.value })}
                                    aria-label={`${t.label} boundary`}
                                >
                                    {BOUNDARY_LEVELS.map((l) => (
                                        <option key={l.id} value={l.id}>{l.label}</option>
                                    ))}
                                </select>
                            </div>
                        );
                    })}
                    <p className="pt-1 text-[11px] text-white/40 sm:text-xs">
                        Hard exclusions only come from what you set here.
                    </p>
                </div>
            )}
        </section>
    );
}

export function TasteCorrectionCentre({
    rebuilding,
    onRebuild,
    toast,
}) {
    const [confirmRebuild, setConfirmRebuild] = useState(false);

    return (
        <section className="rounded-xl border border-[var(--accent-green)]/25 bg-gradient-to-br from-[var(--accent-green)]/10 to-transparent p-4 sm:rounded-2xl sm:p-5">
            <h2 className="text-lg font-bold text-white sm:text-xl">Tune your Taste Map</h2>
            <p className="mt-1.5 text-[13px] text-white/55 sm:mt-2 sm:text-sm">
                Correct inferences, rebuild from ratings, or adjust preferences.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:mt-4 sm:flex-row sm:flex-wrap">
                <Link
                    to="/settings/taste"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/15 px-3.5 py-2.5 text-sm text-white/80 hover:border-white/30 hover:text-white sm:min-h-0 sm:justify-start sm:py-2"
                >
                    Update preferences
                </Link>
                <Link
                    to="/onboarding/taste?from=settings"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/15 px-3.5 py-2.5 text-sm text-white/80 hover:border-white/30 hover:text-white sm:min-h-0 sm:justify-start sm:py-2"
                >
                    Taste questions
                </Link>
                <Link
                    to="/explore"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/15 px-3.5 py-2.5 text-sm text-white/80 hover:border-white/30 hover:text-white sm:min-h-0 sm:justify-start sm:py-2"
                >
                    Rate more movies
                </Link>
                {!confirmRebuild ? (
                    <button
                        type="button"
                        onClick={() => setConfirmRebuild(true)}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--accent-green)]/40 bg-[var(--accent-green)]/15 px-3.5 py-2.5 text-sm text-[var(--accent-green)] sm:min-h-0 sm:py-2"
                    >
                        Rebuild Taste Map
                    </button>
                ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        <span className="text-xs text-white/50">Recalculate from ratings & activity?</span>
                        <button
                            type="button"
                            disabled={rebuilding}
                            onClick={onRebuild}
                            className="min-h-[44px] rounded-full bg-[var(--accent-green)] px-3.5 py-2.5 text-sm font-medium text-black disabled:opacity-50 sm:min-h-0 sm:py-2"
                        >
                            {rebuilding ? 'Rebuilding…' : 'Confirm rebuild'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmRebuild(false)}
                            className="min-h-[44px] rounded-full border border-white/15 px-3 py-2.5 text-sm text-white/60 sm:min-h-0 sm:py-2"
                        >
                            Cancel
                        </button>
                    </div>
                )}
            </div>
            <div className="mt-3 grid gap-2 text-[11px] text-white/45 sm:mt-4 sm:grid-cols-2 sm:gap-3 sm:text-xs">
                <p>
                    <span className="font-semibold text-white/70">Rebuild</span>
                    {' '}— recalculates from existing ratings and activity.
                </p>
                <p>
                    <span className="font-semibold text-white/70">Delete data</span>
                    {' '}— not offered here. History and ratings stay unless you remove them separately.
                </p>
            </div>
            {toast && (
                <p className="mt-3 text-sm text-[var(--accent-green)]" role="status">{toast}</p>
            )}
        </section>
    );
}

export function TasteMapEmptyState() {
    return (
        <section className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-center sm:rounded-2xl sm:px-5 sm:py-10">
            <h2 className="text-xl font-bold text-white sm:text-2xl">Let’s discover your movie taste</h2>
            <p className="mx-auto mt-2 max-w-md text-[13px] text-white/55 sm:mt-3 sm:text-sm">
                Rate a few movies and tell us what you enjoy. We’ll build a Taste Map that gets sharper over time.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:mt-6 sm:flex-row sm:flex-wrap sm:justify-center">
                <Link
                    to="/explore"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--accent-green)] px-4 py-2.5 text-sm font-semibold text-black"
                >
                    Rate movies
                </Link>
                <Link
                    to="/watch"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/15 px-4 py-2.5 text-sm text-white/80"
                >
                    Choose favourites on Watch
                </Link>
                <Link
                    to="/settings/taste"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/15 px-4 py-2.5 text-sm text-white/80"
                >
                    Set basic preferences
                </Link>
            </div>
        </section>
    );
}

export function TasteMapSkeleton() {
    return (
        <div className="space-y-4" aria-busy="true" aria-label="Loading taste map">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl skeleton" />
            ))}
        </div>
    );
}
