import React from 'react';
import RecommendationCard from './RecommendationCard';

function RowSkeleton() {
    return (
        <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="w-[150px] shrink-0 sm:w-[170px] lg:w-[185px]">
                    <div className="aspect-[2/3] animate-pulse rounded-xl skeleton" />
                    <div className="mt-2 h-3 w-3/4 animate-pulse rounded skeleton" />
                </div>
            ))}
        </div>
    );
}

/**
 * Netflix-style horizontal recommendation rail with a heading and an optional
 * subtitle (e.g. an accuracy chip).
 */
export default function RecommendationRow({
    heading,
    subtitle,
    icon = null,
    accent = null,
    items = [],
    loading = false,
    showReason = true,
    emptyHint = null,
    max = 6,
}) {
    // Keep rows tight — never overload a row with more than `max` titles.
    const shown = items.slice(0, max);

    if (!loading && !shown.length) {
        if (!emptyHint) return null;
        return (
            <section className="px-4 sm:px-6">
                <RowHeading heading={heading} subtitle={subtitle} icon={icon} accent={accent} />
                <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-white/40">
                    {emptyHint}
                </p>
            </section>
        );
    }

    return (
        <section className="px-4 sm:px-6">
            <RowHeading heading={heading} subtitle={subtitle} icon={icon} accent={accent} />

            <div className="flex gap-3 overflow-x-auto scroll-smooth pb-2 scrollbar-hide">
                {loading
                    ? <RowSkeleton />
                    : shown.map((movie, i) => (
                        <RecommendationCard
                            key={`${movie.tmdb_id ?? movie.id}-${i}`}
                            movie={movie}
                            index={i}
                            showReason={showReason}
                        />
                    ))}
            </div>
        </section>
    );
}

function RowHeading({ heading, subtitle, icon, accent }) {
    return (
        <div className="mb-2.5 flex items-baseline gap-2.5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white sm:text-xl">
                {icon && <span style={accent ? { color: accent } : undefined}>{icon}</span>}
                {heading}
            </h2>
            {subtitle && <span className="text-xs text-white/45">{subtitle}</span>}
        </div>
    );
}
