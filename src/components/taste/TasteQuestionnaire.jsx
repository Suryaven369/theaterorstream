import React from 'react';
import { FaCheck } from 'react-icons/fa';
import { TASTE_QUESTIONNAIRE_STEPS } from '../../constants/tasteOnboarding';

function toggle(list, value) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Title-free taste questions with checkable options.
 * Used on signup onboarding and from Settings / Profile later.
 */
export default function TasteQuestionnaire({
    stepIndex,
    answers,
    onToggle,
    onSelect,
    error,
}) {
    const step = TASTE_QUESTIONNAIRE_STEPS[stepIndex];
    if (!step) return null;

    const selected = answers[step.id];
    const isSelected = (key) => {
        if (step.multi) return Array.isArray(selected) && selected.includes(key);
        return selected === key;
    };

    return (
        <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-green)]">
                Question {stepIndex + 1} of {TASTE_QUESTIONNAIRE_STEPS.length}
            </p>
            <h2 className="mt-1.5 text-xl font-bold leading-snug text-white sm:text-2xl">
                {step.question}
            </h2>
            {step.hint && (
                <p className="mt-2 text-[13px] leading-relaxed text-white/50 sm:text-sm">
                    {step.hint}
                </p>
            )}

            <div className={`mt-5 ${step.getHint ? 'grid gap-2' : 'flex flex-wrap gap-2'}`}>
                {step.options.map((opt) => {
                    const key = step.getKey(opt);
                    const active = isSelected(key);
                    const hint = step.getHint?.(opt);
                    return (
                        <button
                            key={String(key)}
                            type="button"
                            aria-pressed={active}
                            onClick={() => {
                                if (step.multi) onToggle(step.id, key);
                                else onSelect(step.id, key);
                            }}
                            className={`inline-flex min-h-[44px] items-center gap-2 text-left text-[13px] font-medium transition-all sm:text-sm ${
                                hint
                                    ? `w-full rounded-xl border px-4 py-3 ${
                                        active
                                            ? 'border-[var(--primary)] bg-[var(--primary)]/12 text-white'
                                            : 'border-white/12 bg-white/[0.03] text-white/80 hover:border-white/25'
                                    }`
                                    : `rounded-full border px-3.5 py-2 sm:min-h-[40px] ${
                                        active
                                            ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]'
                                            : 'border-white/12 bg-white/[0.03] text-white/75 hover:border-white/25 hover:text-white'
                                    }`
                            }`}
                        >
                            {step.getEmoji?.(opt) && <span aria-hidden>{step.getEmoji(opt)}</span>}
                            <span className="min-w-0 flex-1">
                                {step.getLabel(opt)}
                                {hint && (
                                    <span className="mt-0.5 block text-[11px] font-normal text-white/45">
                                        {hint}
                                    </span>
                                )}
                            </span>
                            {active && <FaCheck className="shrink-0 text-[10px] text-[var(--primary)]" />}
                        </button>
                    );
                })}
            </div>
            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>
    );
}

export function emptyTasteAnswers() {
    return {
        genres: [],
        moods: [],
        languages: [],
        eras: [],
        watchStyle: null,
        company: [],
    };
}

export function toggleTasteAnswer(answers, field, value) {
    return { ...answers, [field]: toggle(answers[field] || [], value) };
}
