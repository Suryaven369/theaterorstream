import React from 'react';
import { DISCOVERY_MOODS } from '../../constants/discoveryTaste';

/**
 * Mood selector rail. Picking a mood swaps the spotlight + a dedicated row to
 * that mood's discovery feed.
 */
export default function MoodPills({ activeMood, onSelect }) {
    return (
        <div className="flex gap-2 overflow-x-auto px-4 py-1 scrollbar-hide sm:px-6">
            {DISCOVERY_MOODS.map((mood) => {
                const isActive = activeMood === mood.id;
                return (
                    <button
                        key={mood.id}
                        type="button"
                        onClick={() => onSelect(isActive ? null : mood.id)}
                        className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
                            isActive
                                ? 'border-transparent text-black'
                                : 'border-white/12 bg-white/[0.04] text-white/70 hover:border-white/25 hover:text-white'
                        }`}
                        style={isActive ? { backgroundColor: mood.accent } : undefined}
                    >
                        <span>{mood.emoji}</span>
                        {mood.label}
                    </button>
                );
            })}
        </div>
    );
}
