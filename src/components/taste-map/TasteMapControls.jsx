import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    BOUNDARY_LEVELS,
    CONTENT_BOUNDARY_TYPES,
    DISCOVERY_LEVELS,
    EMOTION_CHIPS,
    VIEWING_MODE_KEYS,
} from '../../constants/tasteMap';
import { defaultViewingModeSummaries } from '../../lib/tasteMapHelpers';

export function EmotionalPreferenceMap({ usually = [], sometimes = [], rarely = [], onChange }) {
    const move = (chip, from, to) => {
        const next = {
            usually: usually.filter((c) => c !== chip),
            sometimes: sometimes.filter((c) => c !== chip),
            rarely: rarely.filter((c) => c !== chip),
        };
        next[to] = [...next[to], chip];
        onChange?.(next);
    };

    const unused = EMOTION_CHIPS.filter(
        (c) => !usually.includes(c) && !sometimes.includes(c) && !rarely.includes(c),
    );

    const Column = ({ title, list, id }) => (
        <div className="min-w-[78%] shrink-0 snap-start rounded-xl border border-white/8 bg-white/[0.02] p-3 sm:min-w-0 sm:shrink">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/40 sm:text-xs">{title}</h3>
            <div className="flex min-h-[48px] flex-wrap gap-1.5">
                {list.map((chip) => (
                    <button
                        key={chip}
                        type="button"
                        className="min-h-[36px] rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/75 sm:min-h-0 sm:py-1 sm:text-xs"
                        onClick={() => {
                            const order = ['usually', 'sometimes', 'rarely'];
                            const idx = order.indexOf(id);
                            move(chip, id, order[(idx + 1) % order.length]);
                        }}
                        title="Tap to move"
                    >
                        {chip}
                    </button>
                ))}
                {!list.length && <span className="text-xs text-white/30">Tap chips below to add</span>}
            </div>
        </div>
    );

    return (
        <section>
            <h2 className="mb-1.5 text-lg font-bold text-white sm:mb-2 sm:text-xl">What you like to feel</h2>
            <p className="mb-3 text-[13px] text-white/45 sm:mb-4 sm:text-sm">
                Long-term feelings — not the temporary mood you pick for recommendations. Tap a chip to cycle groups.
            </p>
            <div className="-mx-1 mb-3 flex gap-2.5 overflow-x-auto px-1 pb-1 snap-x snap-mandatory scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 sm:snap-none">
                <Column title="Usually drawn to" list={usually} id="usually" />
                <Column title="Sometimes" list={sometimes} id="sometimes" />
                <Column title="Rarely" list={rarely} id="rarely" />
            </div>
            <div className="flex flex-wrap gap-1.5">
                {unused.map((chip) => (
                    <button
                        key={chip}
                        type="button"
                        onClick={() => move(chip, null, 'usually')}
                        className="min-h-[36px] rounded-full border border-dashed border-white/15 px-2.5 py-1.5 text-[12px] text-white/45 hover:border-white/30 hover:text-white sm:min-h-0 sm:py-1 sm:text-xs"
                    >
                        + {chip}
                    </button>
                ))}
            </div>
        </section>
    );
}

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

export function ViewingModeProfiles({ genres, moods, dna, custom = {}, onSaveNote }) {
    const defaults = defaultViewingModeSummaries({ genres, moods, dna });

    return (
        <section>
            <h2 className="mb-1.5 text-lg font-bold text-white sm:mb-2 sm:text-xl">Your different movie-night modes</h2>
            <p className="mb-3 text-[13px] text-white/45 sm:mb-4 sm:text-sm">
                Soft summaries from your taste — editing one mode does not overwrite the others.
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                {VIEWING_MODE_KEYS.map((mode) => {
                    const text = custom[mode.id] || defaults[mode.id];
                    return (
                        <div key={mode.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5 sm:p-4">
                            <h3 className="text-[13px] font-semibold text-white sm:text-sm">{mode.label}</h3>
                            <textarea
                                className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-[13px] text-white/75 outline-none focus:border-[var(--accent-green)]/50 sm:text-sm"
                                rows={3}
                                defaultValue={text}
                                onBlur={(e) => onSaveNote?.(mode.id, e.target.value)}
                            />
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export function TheatrePreferenceProfile({ dna = [], genres = [] }) {
    const theatreTraits = ['epic', 'action_heavy', 'atmospheric', 'intense', 'suspenseful'];
    const streamTraits = ['character_driven', 'dialogue_heavy', 'slow_burn', 'feel_good', 'funny'];
    const dnaIds = new Set((dna || []).map((d) => d.id));

    const theatre = theatreTraits
        .filter((t) => dnaIds.has(t))
        .map((t) => t.replace(/_/g, ' '));
    const stream = streamTraits
        .filter((t) => dnaIds.has(t))
        .map((t) => t.replace(/_/g, ' '));

    const topGenre = genres[0]?.name;

    return (
        <section>
            <h2 className="mb-1.5 text-lg font-bold text-white sm:mb-2 sm:text-xl">What makes a movie worth the theatre?</h2>
            <p className="mb-3 text-[13px] text-white/60 sm:mb-4 sm:text-sm">
                {theatre.length
                    ? `You’re most likely to choose theatres for ${theatre.slice(0, 3).join(', ')}${topGenre ? ` — especially ${topGenre}` : ''}.`
                    : 'As we learn more about the vibes you love, we’ll personalise theatre-worth cues here.'}
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-4">
                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5 sm:p-4">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-white/40 sm:text-xs">Theatre pull</h3>
                    <ul className="mt-2 space-y-1 text-[13px] text-white/70 sm:text-sm">
                        {(theatre.length ? theatre : ['Large-screen visuals', 'Immersive sound', 'Event energy']).map((t) => (
                            <li key={t}>· {t}</li>
                        ))}
                    </ul>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5 sm:p-4">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-white/40 sm:text-xs">Happy to stream</h3>
                    <ul className="mt-2 space-y-1 text-[13px] text-white/70 sm:text-sm">
                        {(stream.length ? stream : ['Character-driven drama', 'Comfort watches', 'Dialogue-heavy films']).map((t) => (
                            <li key={t}>· {t}</li>
                        ))}
                    </ul>
                </div>
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

export function RecentTasteInsights({ insights = [], onAction }) {
    if (!insights.length) return null;

    return (
        <section>
            <h2 className="mb-4 text-xl font-bold text-white">What we recently learned</h2>
            <div className="space-y-3">
                {insights.map((ins) => (
                    <article key={ins.id} className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                        <h3 className="text-sm font-semibold text-white">{ins.title}</h3>
                        <p className="mt-1 text-sm text-white/60">{ins.description}</p>
                        <p className="mt-2 text-[11px] text-white/35">
                            {ins.confidence}
                            {ins.date ? ` · ${new Date(ins.date).toLocaleDateString()}` : ''}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {['Keep this insight', 'Correct this', 'Remove this inference'].map((label) => (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={() => onAction?.(label, ins.id)}
                                    className="rounded-full border border-white/12 px-2.5 py-1 text-[11px] text-white/60 hover:text-white"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </article>
                ))}
            </div>
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
