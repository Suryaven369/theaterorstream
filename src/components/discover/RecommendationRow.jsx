import React from 'react';
import RecommendationCard from './RecommendationCard';

function RowSkeleton() {
    return (
        <div className="flex gap-2.5 overflow-hidden sm:gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-[132px] shrink-0 sm:w-[170px] lg:w-[185px]">
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
    onDismiss = null,
}) {
    // Keep rows tight — never overload a row with more than `max` titles.
    const shown = items.slice(0, max);

    if (!loading && !shown.length) {
        if (!emptyHint) return null;
        return (
            <section className="px-3 sm:px-6">
                <RowHeading heading={heading} subtitle={subtitle} icon={icon} accent={accent} />
                <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-5 text-sm text-white/40 sm:px-4 sm:py-6">
                    {emptyHint}
                </p>
            </section>
        );
    }

    return (
        <section className="min-w-0">
            <div className="px-3 sm:px-6">
                <RowHeading heading={heading} subtitle={subtitle} icon={icon} accent={accent} />
            </div>

            <div
                className="flex gap-2.5 overflow-x-auto scroll-smooth overscroll-x-contain pb-1 pl-3 pr-3 scrollbar-hide snap-x snap-mandatory sm:gap-3 sm:pl-6 sm:pr-6"
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                {loading
                    ? <RowSkeleton />
                    : shown.map((movie, i) => (
                        <RecommendationCard
                            key={`${movie.tmdb_id ?? movie.id}-${i}`}
                            movie={movie}
                            index={i}
                            showReason={showReason}
                            onDismiss={onDismiss}
                        />
                    ))}
            </div>
        </section>
    );
}

function RowHeading({ heading, subtitle, icon, accent }) {
    return (
        <div className="mb-2 flex flex-col gap-0.5 sm:mb-2.5 sm:flex-row sm:items-baseline sm:gap-2.5">
            <h2 className="flex min-w-0 items-center gap-2 text-base font-bold text-white sm:text-xl">
                {icon && <span className="shrink-0" style={accent ? { color: accent } : undefined}>{icon}</span>}
                <span className="truncate">{heading}</span>
            </h2>
            {subtitle && <span className="text-[11px] text-white/45 sm:text-xs">{subtitle}</span>}
        </div>
    );
}
