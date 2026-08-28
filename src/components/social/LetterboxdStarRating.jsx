import React, { useRef, useState, useCallback } from 'react';
import { FaStar } from 'react-icons/fa';

function pickStarsFromPointer(clientX, element, index) {
    const rect = element.getBoundingClientRect();
    const half = clientX - rect.left < rect.width / 2 ? 0.5 : 1;
    return index + half;
}

/**
 * Letterboxd-style 5-star picker (half-star precision). Touch + mouse + slide.
 */
export default function LetterboxdStarRating({ value, onChange, size = 'lg', disabled = false }) {
    const [preview, setPreview] = useState(null);
    const rowRef = useRef(null);
    const draggingRef = useRef(false);
    const display = preview ?? value;
    const starIcon = size === 'lg' ? 'text-[1.75rem] sm:text-[2.25rem]' : 'text-2xl';
    const btnSize = size === 'lg'
        ? 'w-11 h-11 sm:w-10 sm:h-10 min-w-[44px] min-h-[44px]'
        : 'w-10 h-10 min-w-[40px] min-h-[40px]';

    const starsFromClientX = useCallback((clientX) => {
        const row = rowRef.current;
        if (!row) return null;
        const buttons = row.querySelectorAll('[data-star-index]');
        for (let i = 0; i < buttons.length; i += 1) {
            const el = buttons[i];
            const rect = el.getBoundingClientRect();
            if (clientX >= rect.left - 4 && clientX <= rect.right + 4) {
                return pickStarsFromPointer(clientX, el, i);
            }
        }
        return null;
    }, []);

    const commitStars = (next) => {
        if (next == null) return;
        onChange(value === next ? null : next);
        setPreview(null);
    };

    const handlePointerDown = (e) => {
        if (disabled) return;
        draggingRef.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const next = starsFromClientX(e.clientX);
        if (next != null) setPreview(next);
    };

    const handlePointerMove = (e) => {
        if (disabled || !draggingRef.current) return;
        const next = starsFromClientX(e.clientX);
        if (next != null) setPreview(next);
    };

    const handlePointerUp = (e) => {
        if (disabled) return;
        draggingRef.current = false;
        const next = starsFromClientX(e.clientX) ?? preview;
        if (next != null) commitStars(next);
        else setPreview(null);
        e.currentTarget.releasePointerCapture?.(e.pointerId);
    };

    const scoreLabel = display != null
        ? `${display.toFixed(1)} / 5`
        : 'Tap or slide to rate';

    return (
        <div className="space-y-2">
            <div
                ref={rowRef}
                className="flex items-center justify-center gap-0.5 sm:gap-1 touch-manipulation select-none"
                onPointerLeave={() => {
                    if (!draggingRef.current) setPreview(null);
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => {
                    draggingRef.current = false;
                    setPreview(null);
                }}
                role="group"
                aria-label="Your rating"
            >
                {[0, 1, 2, 3, 4].map((index) => {
                    const fill = display == null ? 0 : Math.min(1, Math.max(0, display - index));
                    return (
                        <div
                            key={index}
                            data-star-index={index}
                            className={`relative flex items-center justify-center pointer-events-none ${btnSize} ${starIcon}`}
                            aria-hidden
                        >
                            <FaStar className="absolute text-white/15" />
                            {fill > 0 && (
                                <FaStar
                                    className="absolute text-[var(--accent-green)] drop-shadow-[0_0_8px_rgba(0,224,84,0.35)]"
                                    style={{
                                        clipPath: fill >= 1
                                            ? 'inset(0 0 0 0)'
                                            : 'inset(0 50% 0 0)',
                                    }}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
            <p className={`text-center sm:text-left text-sm font-medium ${display != null ? 'text-[var(--accent-green)]' : 'text-white/35'}`}>
                {scoreLabel}
            </p>
        </div>
    );
}

/** Map 0.5–5 stars → 0–10 TOS category value */
export function starsToTosScore(stars) {
    if (stars == null || stars <= 0) return null;
    return Math.round(stars * 2 * 2) / 2;
}

/** Map stored TOS categories → 0.5–5 stars for display */
export function tosScoreToStars(categories) {
    if (!categories) return null;
    const keys = ['acting', 'screenplay', 'sound', 'direction', 'entertainment', 'pacing', 'cinematography'];
    const vals = keys.map((k) => categories[k]).filter((v) => v != null && !Number.isNaN(Number(v)));
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + Number(b), 0) / vals.length;
    return Math.round((avg / 2) * 2) / 2;
}

export function uniformCategoryRatings(tosScore) {
    const v = tosScore ?? 5;
    return {
        acting: v,
        screenplay: v,
        sound: v,
        direction: v,
        entertainment: v,
        pacing: v,
        cinematography: v,
    };
}
