import React from 'react';
import RatingSlider from './RatingSlider';
import { TOS_RATING_CATEGORIES } from './tosRatingCategories';
import { computeOverallFromCategories } from '../../lib/ratingUtils';

export default function TosCategoryRatingForm({
    value,
    onChange,
    disabled = false,
    /** @deprecated use variant="compact" */
    compact = false,
    variant = compact ? 'compact' : 'default',
}) {
    const overall = computeOverallFromCategories(value);
    const isCompact = variant === 'compact';
    const sliderVariant = isCompact ? 'inline' : 'default';

    return (
        <div className={isCompact ? 'space-y-2' : 'space-y-3'}>
            {overall != null && (
                <div className={`flex items-center justify-between ${
                    isCompact
                        ? 'px-0.5 py-0'
                        : 'rounded-xl bg-white/[0.04] border border-white/8 px-3 py-2.5 sm:py-3'
                }`}>
                    <span className={`uppercase tracking-wide text-white/40 font-medium ${
                        isCompact ? 'text-[10px]' : 'text-[11px]'
                    }`}>
                        {isCompact ? 'TOS score' : 'Your TOS score'}
                    </span>
                    <span className={`font-bold text-orange-400 tabular-nums leading-none ${
                        isCompact ? 'text-lg sm:text-xl' : 'text-2xl sm:text-3xl'
                    }`}>
                        {overall.toFixed(1)}
                    </span>
                </div>
            )}

            {!isCompact && (
                <p className="text-[11px] uppercase tracking-wide text-white/40 font-medium">
                    Rate each category
                </p>
            )}

            <div className={
                isCompact
                    ? 'rounded-lg border border-white/6 bg-white/[0.02] px-2 py-2 sm:px-2.5 grid grid-cols-1 sm:grid-cols-2 sm:gap-x-3 gap-y-0'
                    : 'grid grid-cols-1 sm:grid-cols-2 sm:gap-x-4'
            }>
                {TOS_RATING_CATEGORIES.map((cat) => (
                    <RatingSlider
                        key={cat.key}
                        label={cat.label}
                        value={value[cat.key]}
                        onChange={(val) => onChange({ ...value, [cat.key]: val })}
                        color={cat.color}
                        disabled={disabled}
                        variant={sliderVariant}
                    />
                ))}
            </div>
        </div>
    );
}
