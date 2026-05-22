import React, { useMemo } from 'react';
import { normalizeShareRatings, getShareEmotionalLine, SHARE_CARD_EDITORIAL_LABELS, TOS_SHARE_CATEGORIES } from '../../lib/shareUtils';
import {
    resolveShareCardMood,
    pickPrimaryGenreLabel,
    getMoodLayers,
} from '../../lib/shareCardAtmosphere';
import {
    CARD_W,
    CARD_H,
    CARD_FONT,
    POSTER_W,
    POSTER_H,
    MoodAtmosphere,
    ScoreBloom,
    EditorialRatingRow,
} from './CinematicShareCardLayers';

const LEFT_RATING_KEYS = ['acting', 'screenplay', 'sound', 'direction'];
const RIGHT_RATING_KEYS = ['entertainment', 'pacing', 'cinematography'];

const LuxuryShareCard = React.forwardRef(({
    movieTitle,
    movieYear,
    posterSrc,
    logoSrc,
    ratings,
    overallScore,
    genres = [],
    mediaType = 'movie',
}, ref) => {
    const normalizedRatings = normalizeShareRatings(ratings);
    const mood = resolveShareCardMood(genres, movieTitle);
    const layers = getMoodLayers(mood);
    const emotionalLine = getShareEmotionalLine(overallScore);
    const metadataLine = useMemo(() => {
        const parts = [];
        if (movieYear) parts.push(movieYear);
        parts.push(pickPrimaryGenreLabel(genres, mediaType));
        return parts.join(' • ');
    }, [movieYear, genres, mediaType]);

    const titleDisplay = (movieTitle || 'Untitled').toUpperCase();
    const scoreText = overallScore.toFixed(1);

    const { leftRatingRows, rightRatingRows } = useMemo(() => {
        const buildRows = (keys) => keys
            .map((key) => {
                const cat = TOS_SHARE_CATEGORIES.find((c) => c.key === key);
                const value = normalizedRatings[key];
                if (value == null || !cat) return null;
                return {
                    key,
                    label: SHARE_CARD_EDITORIAL_LABELS[key] || cat.label.toUpperCase(),
                    value,
                };
            })
            .filter(Boolean);

        return {
            leftRatingRows: buildRows(LEFT_RATING_KEYS),
            rightRatingRows: buildRows(RIGHT_RATING_KEYS),
        };
    }, [normalizedRatings]);

    return (
        <div
            ref={ref}
            data-share-card
            className="relative overflow-hidden text-white"
            style={{
                width: CARD_W,
                height: CARD_H,
                fontFamily: CARD_FONT,
                background: '#010101',
            }}
        >
            <MoodAtmosphere mood={mood} />

            {/* ── TheaterOrStream brand ── */}
            <div
                className="absolute z-[30] flex items-center gap-2"
                style={{ top: 18, left: 22 }}
            >
                {logoSrc ? (
                    <img
                        src={logoSrc}
                        alt=""
                        style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            objectFit: 'cover',
                            opacity: 0.45,
                        }}
                    />
                ) : null}
                <span
                    className="uppercase"
                    style={{
                        fontSize: 6.5,
                        fontWeight: 500,
                        letterSpacing: '0.22em',
                        color: 'rgba(255,255,255,0.28)',
                    }}
                >
                    TheaterOrStream
                </span>
            </div>

            {/* ── TOS score — label left of number, nudged up ── */}
            <ScoreBloom mood={mood} />
            <div
                className="absolute z-[18] pointer-events-none flex items-center"
                style={{
                    right: 40,
                    bottom: 78,
                    gap: 14,
                }}
            >
                <div
                    className="flex flex-col items-end uppercase font-medium"
                    style={{
                        gap: 2,
                        paddingTop: 8,
                    }}
                >
                    <span
                        style={{
                            fontSize: 7,
                            letterSpacing: '0.34em',
                            color: 'rgba(255,255,255,0.48)',
                            lineHeight: 1.2,
                        }}
                    >
                        TOS
                    </span>
                    <span
                        style={{
                            fontSize: 7,
                            letterSpacing: '0.34em',
                            color: 'rgba(255,255,255,0.48)',
                            lineHeight: 1.2,
                        }}
                    >
                        Rating
                    </span>
                </div>
                <div
                    className="flex items-baseline"
                    style={{ gap: 8, lineHeight: 1 }}
                >
                    <span
                        className="font-thin tabular-nums"
                        style={{
                            fontSize: 96,
                            letterSpacing: '-0.05em',
                            color: 'rgba(255,255,255,0.96)',
                            textShadow: `0 0 64px ${layers.scoreTextGlow}, 0 4px 32px rgba(0,0,0,0.55)`,
                        }}
                    >
                        {scoreText}
                    </span>
                    <span
                        className="uppercase font-extralight"
                        style={{
                            fontSize: 13,
                            letterSpacing: '0.12em',
                            paddingBottom: 6,
                            color: 'rgba(255,255,255,0.38)',
                        }}
                    >
                        / 10
                    </span>
                </div>
            </div>

            {/* ── Floating collectible poster ── */}
            <div
                className="absolute z-[14]"
                style={{
                    top: 52,
                    left: 22,
                    width: POSTER_W,
                    height: POSTER_H,
                    transform: 'rotate(-4deg)',
                }}
            >
                <div
                    className="absolute rounded-[3px]"
                    style={{
                        inset: 0,
                        transform: 'translate(10px, 18px) rotate(1deg)',
                        background: 'rgba(0,0,0,0.65)',
                        boxShadow: '0 48px 80px rgba(0,0,0,0.85)',
                    }}
                />
                <div
                    className="absolute pointer-events-none"
                    style={{
                        width: '130%',
                        height: 80,
                        bottom: -36,
                        left: '-15%',
                        background: `radial-gradient(ellipse, ${layers.posterUnderGlow} 0%, transparent 70%)`,
                    }}
                />
                <div
                    className="relative h-full w-full overflow-hidden rounded-[3px]"
                    style={{
                        boxShadow: `
                            0 24px 48px rgba(0,0,0,0.75),
                            0 0 0 1px rgba(255,255,255,0.09),
                            0 0 32px rgba(255,255,255,0.04),
                            inset 0 1px 0 rgba(255,255,255,0.16),
                            inset -1px 0 0 rgba(255,255,255,0.04)
                        `,
                    }}
                >
                    {posterSrc ? (
                        <img
                            src={posterSrc}
                            alt=""
                            className="block h-full w-full object-cover"
                        />
                    ) : (
                        <div
                            className="flex h-full w-full items-center justify-center text-4xl"
                            style={{
                                background: 'linear-gradient(145deg, #121010, #040404)',
                                opacity: 0.25,
                            }}
                        >
                            🎬
                        </div>
                    )}
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            background: `
                                linear-gradient(118deg, rgba(255,255,255,0.16) 0%, transparent 36%),
                                linear-gradient(to top, rgba(1,1,1,0.88) 0%, rgba(1,1,1,0.2) 22%, transparent 42%),
                                linear-gradient(to right, transparent 70%, rgba(0,0,0,0.25) 100%)
                            `,
                        }}
                    />
                </div>
            </div>

            {/* ── Title + metadata ── */}
            <div
                className="absolute z-[22]"
                style={{
                    top: 348,
                    left: 26,
                    right: 120,
                    textAlign: 'left',
                }}
            >
                <h1
                    className="m-0 font-light uppercase"
                    style={{
                        fontSize: 18,
                        lineHeight: 1.08,
                        letterSpacing: '0.14em',
                        color: 'rgba(255,255,255,0.92)',
                        textShadow: '0 2px 28px rgba(0,0,0,0.75)',
                    }}
                >
                    {titleDisplay}
                </h1>
                {metadataLine && (
                    <p
                        className="m-0 uppercase"
                        style={{
                            marginTop: 6,
                            fontSize: 6,
                            fontWeight: 400,
                            letterSpacing: '0.34em',
                            color: 'rgba(255,255,255,0.26)',
                        }}
                    >
                        {metadataLine}
                    </p>
                )}
                <p
                    className="m-0 italic font-extralight"
                    style={{
                        marginTop: 8,
                        fontSize: 9,
                        letterSpacing: '0.05em',
                        lineHeight: 1.4,
                        color: 'rgba(255,255,255,0.34)',
                        maxWidth: 190,
                    }}
                >
                    {emotionalLine}
                </p>
            </div>

            {/* ── All 7 ratings — two-column editorial grid ── */}
            {(leftRatingRows.length > 0 || rightRatingRows.length > 0) && (
                <div
                    className="absolute z-[20] flex"
                    style={{
                        top: 416,
                        left: 26,
                        right: 118,
                        gap: 12,
                    }}
                >
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {leftRatingRows.map((row, i) => (
                            <EditorialRatingRow
                                key={row.key}
                                label={row.label}
                                value={row.value}
                                accent={layers.accent}
                                compact
                                stagger={i === 1 ? 6 : i === 3 ? 3 : 0}
                            />
                        ))}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                        {rightRatingRows.map((row, i) => (
                            <EditorialRatingRow
                                key={row.key}
                                label={row.label}
                                value={row.value}
                                accent={layers.accent}
                                compact
                                stagger={i === 1 ? 8 : 0}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Footer ── */}
            <div
                className="absolute z-[20] left-0 right-0 text-center"
                style={{ bottom: 12 }}
            >
                <div
                    style={{
                        width: 32,
                        height: 1,
                        margin: '0 auto 8px',
                        background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)',
                    }}
                />
                <p
                    className="m-0 lowercase"
                    style={{
                        fontSize: 6,
                        letterSpacing: '0.4em',
                        color: 'rgba(255,255,255,0.09)',
                    }}
                >
                    theaterorstream.com
                </p>
            </div>
        </div>
    );
});

LuxuryShareCard.displayName = 'LuxuryShareCard';

export default LuxuryShareCard;
