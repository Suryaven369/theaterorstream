import React from 'react';
import RecommendationCard from './RecommendationCard';

function RowSkeleton() {
    return (
        <div className="flex gap-2 overflow-hidden sm:gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-[108px] shrink-0 sm:w-[170px] lg:w-[185px]">
                    <div className="aspect-[2/3] animate-pulse rounded-lg skeleton sm:rounded-xl" />
                    <div className="mt-1.5 h-2.5 w-3/4 animate-pulse rounded skeleton" />
                </div>
            ))}
        </div>
    );
}

/**
 * Netflix-style horizontal recommendation rail.
 * Mobile: denser posters, edge-bleed scroll, compact headings (app-like).
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
    const shown = items.slice(0, max);

    if (!loading && !shown.length) {
        if (!emptyHint) return null;
        return (
            <section className="px-4 sm:px-6">
                <RowHeading heading={heading} subtitle={subtitle} icon={icon} accent={accent} />
                <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-[13px] text-white/40 sm:px-4 sm:py-6 sm:text-sm">
                    {emptyHint}
                </p>
            </section>
        );
    }

    return (
        <section className="min-w-0">
            <div className="px-4 sm:px-6">
                <RowHeading heading={heading} subtitle={subtitle} icon={icon} accent={accent} />
            </div>

            <div
                className="flex gap-2 overflow-x-auto scroll-smooth overscroll-x-contain pb-0.5 pl-4 pr-4 scrollbar-hide snap-x snap-mandatory sm:gap-3 sm:pl-6 sm:pr-6"
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
        <div className="mb-1.5 flex items-baseline justify-between gap-2 sm:mb-2.5 sm:flex-row sm:gap-2.5">
            <h2 className="flex min-w-0 items-center gap-1.5 text-[15px] font-bold tracking-tight text-white sm:gap-2 sm:text-xl">
                {icon && <span className="shrink-0 text-[13px] sm:text-base" style={accent ? { color: accent } : undefined}>{icon}</span>}
                <span className="truncate">{heading}</span>
            </h2>
            {subtitle && (
                <span className="shrink-0 text-[10px] text-white/40 sm:text-xs">{subtitle}</span>
            )}
        </div>
    );
}
