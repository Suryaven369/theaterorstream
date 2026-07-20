import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { DISCOVERY_MOODS } from '../../constants/discoveryTaste';

/**
 * Mood rail: full-width scroll with arrows hugging the strip (flex, no JS width clamp).
 * Avoids collapsed/zero-width viewports that blanked the rail on mobile.
 */
export default function MoodPills({ activeMood, onSelect }) {
    const scrollerRef = useRef(null);
    const [canLeft, setCanLeft] = useState(false);
    const [canRight, setCanRight] = useState(false);

    const updateArrows = useCallback(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const maxScroll = el.scrollWidth - el.clientWidth;
        const overflow = maxScroll > 4;
        setCanLeft(overflow && el.scrollLeft > 4);
        setCanRight(overflow && el.scrollLeft < maxScroll - 4);
    }, []);

    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) return undefined;

        const onScroll = () => updateArrows();
        el.addEventListener('scroll', onScroll, { passive: true });

        const ro = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => {
                requestAnimationFrame(updateArrows);
            })
            : null;
        ro?.observe(el);
        window.addEventListener('resize', updateArrows);

        const t = setTimeout(updateArrows, 80);
        updateArrows();

        return () => {
            clearTimeout(t);
            el.removeEventListener('scroll', onScroll);
            ro?.disconnect();
            window.removeEventListener('resize', updateArrows);
        };
    }, [updateArrows]);

    const scrollByDir = (dir) => {
        const el = scrollerRef.current;
        if (!el) return;
        const step = Math.max(160, Math.floor(el.clientWidth * 0.75));
        el.scrollBy({ left: dir * step, behavior: 'smooth' });
    };

    const arrowBtn =
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white transition hover:border-white/30 hover:bg-white/10';

    const showArrows = canLeft || canRight;

    return (
        <div className="flex w-full max-w-full items-center gap-1.5 sm:gap-2">
            {showArrows ? (
                <button
                    type="button"
                    aria-label="Scroll moods left"
                    disabled={!canLeft}
                    onClick={() => scrollByDir(-1)}
                    className={`${arrowBtn} ${canLeft ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                >
                    <FaChevronLeft className="text-[10px]" />
                </button>
            ) : null}

            <div
                ref={scrollerRef}
                className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain scroll-smooth py-1 scrollbar-hide"
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                <div className="flex w-max gap-2 sm:gap-2.5">
                    {DISCOVERY_MOODS.map((mood) => {
                        const isActive = activeMood === mood.id;
                        return (
                            <button
                                key={mood.id}
                                type="button"
                                data-mood-pill
                                onClick={() => onSelect(isActive ? null : mood.id)}
                                className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all active:scale-[0.97] sm:py-1.5 sm:text-sm ${
                                    isActive
                                        ? 'border-transparent text-black'
                                        : 'border-white/12 bg-white/[0.04] text-white/70 hover:border-white/25 hover:text-white'
                                }`}
                                style={isActive ? { backgroundColor: mood.accent } : undefined}
                            >
                                <span aria-hidden>{mood.emoji}</span>
                                {mood.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {showArrows ? (
                <button
                    type="button"
                    aria-label="Scroll moods right"
                    disabled={!canRight}
                    onClick={() => scrollByDir(1)}
                    className={`${arrowBtn} ${canRight ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                >
                    <FaChevronRight className="text-[10px]" />
                </button>
            ) : null}
        </div>
    );
}
