import React, { useState } from 'react';
import { confidenceTier } from '../../lib/tasteMapHelpers';
import { DNA_TRAIT_LABELS } from '../../constants/tasteMap';
import { TASTE_MOODS } from '../../constants/discoveryTaste';

const MOOD_LABEL = Object.fromEntries(TASTE_MOODS.map((m) => [m.id, m.label]));

const FEEDBACK = [
    { id: 'more', label: 'More like this', short: 'More' },
    { id: 'less', label: 'Less like this', short: 'Less' },
    { id: 'accurate', label: 'This feels accurate', short: 'Accurate' },
    { id: 'inaccurate', label: 'This is not accurate', short: 'Not it' },
    { id: 'mood', label: 'Only in certain moods', short: 'Mood' },
];

function TastePreferenceCard({ title, score, evidenceHint, explanation, onFeedback }) {
    const [picked, setPicked] = useState(null);
    const conf = confidenceTier(Math.round((score || 0) / 12));

    return (
        <article className="rounded-xl border border-white/8 bg-white/[0.03] p-3.5 transition-[box-shadow] hover:border-white/15 sm:rounded-2xl sm:p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="text-[15px] font-semibold text-white sm:text-base">{title}</h3>
                <span className="shrink-0 text-xs tabular-nums text-white/45">{score}%</span>
            </div>
            <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-white/8 sm:mb-3" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={`${title} affinity`}>
                <div
                    className="h-full rounded-full bg-[var(--accent-green)] motion-safe:transition-[width] motion-safe:duration-700"
                    style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
                />
            </div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/40 sm:text-[11px]">
                {score}% · {conf.label}
                {evidenceHint ? ` · ${evidenceHint}` : ''}
            </p>
            <p className="mt-1.5 text-[13px] leading-snug text-white/60 sm:mt-2 sm:text-sm sm:leading-relaxed">{explanation}</p>
            <div className="-mx-0.5 mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide sm:mt-3 sm:flex-wrap sm:overflow-visible">
                {FEEDBACK.map((f) => (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                            setPicked(f.id);
                            onFeedback?.(f.id, title);
                        }}
                        className={`min-h-[36px] shrink-0 rounded-full border px-2.5 py-1.5 text-[11px] transition-colors sm:min-h-0 sm:py-1 ${
                            picked === f.id
                                ? 'border-[var(--accent-green)] bg-[var(--accent-green)]/15 text-[var(--accent-green)]'
                                : 'border-white/10 text-white/55 hover:border-white/25 hover:text-white'
                        }`}
                        aria-label={f.label}
                    >
                        <span className="sm:hidden">{f.short}</span>
                        <span className="hidden sm:inline">{f.label}</span>
                    </button>
                ))}
            </div>
        </article>
    );
}

export default function StrongestTastes({ genres = [], moods = [], dna = [], onFeedback }) {
    const cards = [];

    genres.slice(0, 4).forEach((g) => {
        cards.push({
            key: `g-${g.id}`,
            title: g.name,
            score: g.score,
            explanation: `You frequently respond positively to ${g.name.toLowerCase()} titles across ratings and likes.`,
            evidenceHint: 'genre signal',
        });
    });

    moods.slice(0, 2).forEach((m) => {
        cards.push({
            key: `m-${m.id}`,
            title: MOOD_LABEL[m.id] || m.id,
            score: m.score,
            explanation: `Moods tagged around ${String(MOOD_LABEL[m.id] || m.id).toLowerCase()} keep showing up in your activity.`,
            evidenceHint: 'mood signal',
        });
    });

    dna.slice(0, 3).forEach((d) => {
        cards.push({
            key: `d-${d.id}`,
            title: DNA_TRAIT_LABELS[d.id] || d.id,
            score: d.score,
            explanation: `Story traits like ${String(DNA_TRAIT_LABELS[d.id] || d.id).toLowerCase()} appear often in films you enjoy.`,
            evidenceHint: 'vibe signal',
        });
    });

    if (!cards.length) return null;

    return (
        <section>
            <h2 className="mb-3 text-lg font-bold text-white sm:mb-4 sm:text-xl">Your strongest tastes</h2>
            <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                {cards.slice(0, 6).map((c) => (
                    <TastePreferenceCard
                        key={c.key}
                        title={c.title}
                        score={c.score}
                        explanation={c.explanation}
                        evidenceHint={c.evidenceHint}
                        onFeedback={onFeedback}
                    />
                ))}
            </div>
        </section>
    );
}
