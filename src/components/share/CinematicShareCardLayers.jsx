/** Premium cinematic share card — html2canvas-safe layered atmosphere */

import { getMoodLayers } from '../../lib/shareCardAtmosphere';

export const CARD_W = 360;
export const CARD_H = 640;
export const CARD_EXPORT_SCALE = 3;

export const CARD_FONT =
    "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

/** Poster dimensions — ~16% smaller than prior hero */
export const POSTER_W = 208;
export const POSTER_H = 312;

export const GRAIN_BG = `
    repeating-linear-gradient(0deg, rgba(255,255,255,0.028) 0px, transparent 1px, transparent 2px),
    repeating-linear-gradient(90deg, rgba(255,255,255,0.018) 0px, transparent 1px, transparent 3px),
    repeating-radial-gradient(circle at 17% 29%, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px),
    repeating-radial-gradient(circle at 73% 61%, rgba(255,255,255,0.025) 0 1px, transparent 1px 4px)
`;

export function EditorialRatingRow({ label, value, accent, stagger = 0, compact = false }) {
    return (
        <div
            className="flex items-end gap-1.5"
            style={{
                marginBottom: compact ? 6 : 8,
                marginLeft: stagger,
                width: stagger ? '92%' : '100%',
            }}
        >
            <span
                className="shrink-0 uppercase"
                style={{
                    fontSize: compact ? 6.5 : 7,
                    fontWeight: 500,
                    letterSpacing: compact ? '0.18em' : '0.24em',
                    color: 'rgba(255,255,255,0.52)',
                    paddingBottom: 1,
                }}
            >
                {label}
            </span>
            <span
                className="flex-1"
                style={{
                    borderBottom: '1px dotted rgba(255,255,255,0.14)',
                    marginBottom: 2,
                    minWidth: compact ? 6 : 8,
                }}
            />
            <span
                className="shrink-0 tabular-nums font-light"
                style={{
                    fontSize: compact ? 10.5 : 11,
                    letterSpacing: '0.03em',
                    color: accent || 'rgba(251, 191, 36, 0.82)',
                }}
            >
                {value.toFixed(1)}
            </span>
        </div>
    );
}

export function MoodAtmosphere({ mood, posterBloom }) {
    const layers = getMoodLayers(mood);

    return (
        <>
            <div className="absolute inset-0" style={{ background: layers.base }} />

            <div
                className="absolute"
                style={{
                    inset: 0,
                    background: layers.glowA,
                }}
            />
            <div
                className="absolute"
                style={{
                    inset: 0,
                    background: layers.glowB,
                }}
            />
            <div
                className="absolute"
                style={{
                    inset: 0,
                    background: layers.glowC,
                }}
            />

            {/* Diagonal cinematic haze */}
            <div
                className="absolute"
                style={{
                    width: '120%',
                    height: '35%',
                    top: '38%',
                    left: '-10%',
                    transform: 'rotate(-8deg)',
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.025) 45%, transparent 100%)',
                }}
            />

            {/* Poster-zone bloom (offset left) */}
            <div
                className="absolute pointer-events-none"
                style={{
                    width: 240,
                    height: 240,
                    top: 72,
                    left: 8,
                    background: posterBloom || layers.posterBloom,
                }}
            />

            {/* Shadow bleed from poster downward */}
            <div
                className="absolute pointer-events-none"
                style={{
                    width: 200,
                    height: 140,
                    top: 340,
                    left: 20,
                    background: 'radial-gradient(ellipse, rgba(0,0,0,0.55) 0%, transparent 72%)',
                }}
            />

            {/* Score-zone atmospheric wash */}
            <div
                className="absolute"
                style={{
                    width: '85%',
                    height: '42%',
                    bottom: 0,
                    right: '-10%',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.35) 0%, transparent 100%)',
                }}
            />

            {/* Edge light — left rim */}
            <div
                className="absolute"
                style={{
                    width: 1,
                    height: '55%',
                    top: '18%',
                    left: 0,
                    background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.06), transparent)',
                }}
            />

            {/* Vignette */}
            <div
                className="absolute inset-0"
                style={{
                    background:
                        'radial-gradient(ellipse 82% 78% at 42% 38%, transparent 18%, rgba(0,0,0,0.5) 68%, rgba(0,0,0,0.94) 100%)',
                }}
            />

            {/* Analog grain */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    opacity: 0.062,
                    backgroundImage: GRAIN_BG,
                }}
            />

            {/* Subtle scan shimmer */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    opacity: 0.04,
                    background:
                        'repeating-linear-gradient(180deg, transparent 0px, transparent 3px, rgba(255,255,255,0.04) 3px, rgba(255,255,255,0.04) 4px)',
                }}
            />
        </>
    );
}

export function ScoreBloom({ mood }) {
    const layers = getMoodLayers(mood);
    return (
        <div
            className="absolute pointer-events-none"
            style={{
                width: 220,
                height: 130,
                right: 36,
                bottom: 58,
                background: layers.scoreBloom,
            }}
        />
    );
}
