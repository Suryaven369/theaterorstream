import React from 'react';
import { TASTE_LANGUAGES, TASTE_ERAS } from '../../constants/discoveryTaste';
import { AXIS_LABELS } from '../../constants/tasteMap';
import { rankAxisPreferences } from '../../lib/tasteMapHelpers';

function ChipCloud({ title, items, empty }) {
    return (
        <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">{title}</h3>
            <div className="flex flex-wrap gap-1.5">
                {items.length
                    ? items.map((item) => (
                        <span
                            key={item.key || item}
                            className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/75"
                        >
                            {item.label || item}
                            {item.level && (
                                <span className="ml-1.5 text-white/35">{item.level}</span>
                            )}
                        </span>
                    ))
                    : <p className="text-xs text-white/35">{empty}</p>}
            </div>
        </div>
    );
}

export default function CinemaWorldMap({
    languages = [],
    decades = [],
    actors = [],
    directors = [],
    axisPreferences = {},
    runtimeRange,
}) {
    const langLabels = languages.map((code) => {
        const found = TASTE_LANGUAGES.find((l) => l.id === code);
        return { key: code, label: found?.label || code, level: 'Interested' };
    });

    const eraLabels = decades.map((d) => {
        const found = TASTE_ERAS.find((e) => e.id === Number(d) || String(e.id) === String(d));
        return { key: String(d), label: found?.label || `${d}s`, level: 'Strong interest' };
    });

    const ranked = rankAxisPreferences(axisPreferences);

    let runtimeNote = null;
    if (runtimeRange) {
        // Postgres int4range may arrive as string "[90,150)" or object
        const raw = String(runtimeRange);
        const match = raw.match(/(\d+)\D+(\d+)/);
        if (match) {
            runtimeNote = `Preferred runtime window around ${match[1]}–${match[2]} minutes when the story earns it.`;
        }
    }

    return (
        <section className="space-y-6">
            <div>
                <h2 className="mb-1.5 text-lg font-bold text-white sm:mb-2 sm:text-xl">Your cinema world</h2>
                <p className="mb-3 text-[13px] text-white/45 sm:mb-4 sm:text-sm">
                    Languages, eras, and people you gravitate toward. Not watched never means disliked.
                </p>
                <div className="grid gap-5 sm:grid-cols-2">
                    <ChipCloud title="Languages" items={langLabels} empty="Not enough information yet" />
                    <ChipCloud title="Eras" items={eraLabels} empty="Not enough information yet" />
                    <ChipCloud
                        title="Favourite actors"
                        items={(actors || []).slice(0, 8).map((a) => ({
                            key: a.id || a.name,
                            label: a.name || a,
                            level: 'Interested',
                        }))}
                        empty="Open to exploring"
                    />
                    <ChipCloud
                        title="Favourite directors"
                        items={(directors || []).slice(0, 8).map((d) => ({
                            key: d.id || d.name,
                            label: d.name || d,
                            level: 'Interested',
                        }))}
                        empty="Open to exploring"
                    />
                </div>
            </div>

            {ranked.length > 0 && (
                <div>
                    <h2 className="mb-1.5 text-lg font-bold text-white sm:mb-2 sm:text-xl">What makes a movie work for you</h2>
                    <p className="mb-3 text-[13px] text-white/45 sm:mb-4 sm:text-sm">
                        Ranked from how you score films on craft axes.
                    </p>
                    <ol className="space-y-2">
                        {ranked.map((r, i) => (
                            <li
                                key={r.key}
                                className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5"
                            >
                                <span className="w-6 text-sm font-bold text-white/35">{i + 1}</span>
                                <span className="flex-1 text-sm font-medium text-white">
                                    {AXIS_LABELS[r.key] || r.key}
                                </span>
                                <span className="text-xs tabular-nums text-white/45">{r.score.toFixed(1)}/10</span>
                            </li>
                        ))}
                    </ol>
                    {ranked[0] && (
                        <p className="mt-3 text-sm italic text-white/50">
                            Movies that excel at {AXIS_LABELS[ranked[0].key]?.toLowerCase() || ranked[0].key} tend to
                            earn your higher scores.
                        </p>
                    )}
                </div>
            )}

            {runtimeNote && (
                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                    <h3 className="text-sm font-semibold text-white">What can make you lose interest</h3>
                    <p className="mt-2 text-sm text-white/60">{runtimeNote}</p>
                    <p className="mt-1 text-xs text-white/40">
                        Soft friction only — we won’t hard-block long films when spectacle or story justify the length.
                    </p>
                </div>
            )}
        </section>
    );
}
