import React from 'react';
import {
    TOS_RATING_CATEGORY_DEFS,
    computeOverallFromCategories,
} from '../lib/ratingUtils';

export const RatingSlider = ({ label, value, onChange, color = '#22c55e', disabled = false }) => {
    const getEmoji = (val) => {
        if (val >= 9) return '🤩';
        if (val >= 7) return '😊';
        if (val >= 5) return '😐';
        if (val >= 3) return '😕';
        return '😢';
    };

    return (
        <div className="mb-3 sm:mb-4">
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                <span className="text-sm font-medium text-white/80">{label}</span>
                <div className="flex items-center gap-2">
                    <span className="text-lg" aria-hidden>{getEmoji(value)}</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color }}>{value.toFixed(1)}</span>
                </div>
            </div>
            <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={value}
                disabled={disabled}
                aria-label={`${label} rating out of 10`}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                    background: `linear-gradient(to right, ${color} 0%, ${color} ${value * 10}%, rgba(255,255,255,0.1) ${value * 10}%, rgba(255,255,255,0.1) 100%)`,
                }}
            />
        </div>
    );
};

/**
 * Original TOS rating: Entertainment, Screenplay, Pacing, Sound, etc. — each out of 10.
 */
export default function TosCategorySliders({ ratings, onChange, disabled = false }) {
    const overall = computeOverallFromCategories(ratings) ?? 0;

    return (
        <div>
            <div className="text-center mb-4 sm:mb-5">
                <div className="inline-flex flex-col items-center">
                    <span className="text-4xl sm:text-5xl font-bold text-orange-400 tabular-nums leading-none">
                        {overall.toFixed(1)}
                    </span>
                    <span className="text-white/40 text-sm mt-1">Your overall / 10</span>
                </div>
            </div>
            <p className="text-[11px] uppercase tracking-wide text-white/45 font-medium mb-3 text-center sm:text-left">
                Rate each category
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                {TOS_RATING_CATEGORY_DEFS.map((cat) => (
                    <RatingSlider
                        key={cat.key}
                        label={cat.label}
                        value={ratings[cat.key]}
                        color={cat.color}
                        disabled={disabled}
                        onChange={(val) => onChange({ ...ratings, [cat.key]: val })}
                    />
                ))}
            </div>
        </div>
    );
}
