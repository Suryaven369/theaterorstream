import React from 'react';

export default function BadgeList({ badges = [], compact = false }) {
    if (!badges.length) {
        if (compact) return null;
        return (
            <p className="text-sm text-white/40">No badges earned yet — log movies and rate to unlock.</p>
        );
    }

    if (compact) {
        return (
            <div className="flex flex-wrap gap-2">
                {badges.map((b) => (
                    <span
                        key={b.id}
                        title={b.description}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-200"
                    >
                        <span>{b.icon}</span>
                        {b.name}
                    </span>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {badges.map((b) => (
                <div
                    key={b.id}
                    className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.04] border border-white/10"
                >
                    <span className="text-2xl">{b.icon}</span>
                    <div>
                        <p className="font-semibold text-white">{b.name}</p>
                        <p className="text-xs text-white/45 mt-0.5">{b.description}</p>
                        {b.earned_at && (
                            <p className="text-[10px] text-white/30 mt-2">
                                Earned {new Date(b.earned_at).toLocaleDateString()}
                            </p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
