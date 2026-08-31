import React from 'react';
import RatingSlider from './RatingSlider';
import { TOS_RATING_CATEGORIES } from './tosRatingCategories';
import { computeOverallFromCategories } from '../../lib/ratingUtils';

export default function TosCategoryRatingForm({
    value,
    onChange,
    disabled = false,
    compact = false,
}) {
    const overall = computeOverallFromCategories(value);

    return (
        <div className={compact ? 'space-y-2' : 'space-y-3'}>
            {overall != null && (
                <div className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/8 px-3 py-2.5 sm:py-3">
                    <span className="text-[11px] uppercase tracking-wide text-white/45 font-medium">
                        Your TOS score
                    </span>
                    <span className="text-2xl sm:text-3xl font-bold text-orange-400 tabular-nums">
                        {overall.toFixed(1)}
                    </span>
                </div>
            )}

            <p className="text-[11px] uppercase tracking-wide text-white/40 font-medium">
                Rate each category
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-4">
                {TOS_RATING_CATEGORIES.map((cat) => (
                    <RatingSlider
                        key={cat.key}
                        label={cat.label}
                        value={value[cat.key]}
                        onChange={(val) => onChange({ ...value, [cat.key]: val })}
                        color={cat.color}
                        disabled={disabled}
                    />
                ))}
            </div>
        </div>
    );
}
