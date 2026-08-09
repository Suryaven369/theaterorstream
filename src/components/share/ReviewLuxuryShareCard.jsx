import React, { useMemo } from 'react';
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
} from './CinematicShareCardLayers';

function truncateReview(text, max = 240) {
    const t = String(text || '').trim().replace(/\s+/g, ' ');
    if (!t) return '';
    if (t.length <= max) return t;
    return `${t.slice(0, max - 1).trim()}…`;
}

const ReviewLuxuryShareCard = React.forwardRef(({
    movieTitle,
    movieYear,
    posterSrc,
    logoSrc,
    genres = [],
    mediaType = 'movie',
    reviewText,
    reviewHeadline = null,
    authorDisplayName,
    authorUsername,
    avatarSrc,
    overallScore = null,
}, ref) => {
    const mood = resolveShareCardMood(genres, movieTitle);
    const layers = getMoodLayers(mood);
    const metadataLine = useMemo(() => {
        const parts = [];
        if (movieYear) parts.push(movieYear);
        parts.push(pickPrimaryGenreLabel(genres, mediaType));
        return parts.join(' • ');
    }, [movieYear, genres, mediaType]);

    const titleDisplay = (movieTitle || 'Untitled').toUpperCase();
    const body = truncateReview(reviewText);
    const displayName = authorDisplayName || authorUsername || 'Cinephile';
    const handle = authorUsername ? `@${authorUsername}` : null;
    const scoreValue =
        overallScore != null && Number.isFinite(Number(overallScore)) && Number(overallScore) > 0
            ? Number(overallScore)
            : null;
    const scoreText = scoreValue != null ? scoreValue.toFixed(1) : null;

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

            {/* Poster */}
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
                    className="relative h-full w-full overflow-hidden rounded-[3px]"
                    style={{
                        boxShadow: `
                            0 24px 48px rgba(0,0,0,0.75),
                            0 0 0 1px rgba(255,255,255,0.09),
                            inset 0 1px 0 rgba(255,255,255,0.16)
                        `,
                    }}
                >
                    {posterSrc ? (
                        <img src={posterSrc} alt="" className="block h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-4xl opacity-25">🎬</div>
                    )}
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            background: `
                                linear-gradient(118deg, rgba(255,255,255,0.16) 0%, transparent 36%),
                                linear-gradient(to top, rgba(1,1,1,0.88) 0%, transparent 42%)
                            `,
                        }}
                    />
                </div>
            </div>

            {/* Title */}
            <div
                className="absolute z-[22]"
                style={{ top: 348, left: 26, right: 26, textAlign: 'center' }}
            >
                <h1
                    className="m-0 font-light uppercase"
                    style={{
                        fontSize: 16,
                        lineHeight: 1.12,
                        letterSpacing: '0.12em',
                        color: 'rgba(255,255,255,0.92)',
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
                            letterSpacing: '0.34em',
                            color: 'rgba(255,255,255,0.26)',
                        }}
                    >
                        {metadataLine}
                    </p>
                )}
            </div>

            {/* Review — centered hero quote (above profile band) */}
            <div
                className="absolute z-[20]"
                style={{
                    top: 408,
                    left: 36,
                    right: 36,
                    bottom: 148,
                }}
            >
                {scoreText && (
                    <div
                        className="absolute z-[25] flex flex-col items-end"
                        style={{ top: -22, right: 0, lineHeight: 1 }}
                    >
                        <span
                            className="uppercase font-medium"
                            style={{
                                fontSize: 5.5,
                                letterSpacing: '0.32em',
                                color: 'rgba(255,255,255,0.38)',
                                marginBottom: 4,
                            }}
                        >
                            TOS
                        </span>
                        <div className="flex items-baseline" style={{ gap: 4 }}>
                            <span
                                className="font-thin tabular-nums"
                                style={{
                                    fontSize: 34,
                                    letterSpacing: '-0.04em',
                                    color: 'rgba(255,255,255,0.96)',
                                    textShadow: `0 0 32px ${layers.scoreTextGlow || 'rgba(255,255,255,0.15)'}`,
                                }}
                            >
                                {scoreText}
                            </span>
                            <span
                                className="uppercase font-extralight"
                                style={{
                                    fontSize: 9,
                                    letterSpacing: '0.1em',
                                    paddingBottom: 4,
                                    color: 'rgba(255,255,255,0.38)',
                                }}
                            >
                                /10
                            </span>
                        </div>
                    </div>
                )}

                <div
                    className="flex h-full flex-col items-center justify-center"
                    style={{
                        textAlign: 'center',
                        paddingTop: scoreText ? 12 : 0,
                        paddingLeft: scoreText ? 8 : 0,
                        paddingRight: scoreText ? 72 : 0,
                        boxSizing: 'border-box',
                    }}
                >
                {reviewHeadline && (
                    <p
                        className="m-0 font-medium"
                        style={{
                            fontSize: 10,
                            letterSpacing: '0.06em',
                            color: 'rgba(255,255,255,0.78)',
                            marginBottom: 10,
                        }}
                    >
                        {reviewHeadline}
                    </p>
                )}
                <p
                    className="m-0 font-extralight italic"
                    style={{
                        fontSize: 15,
                        lineHeight: 1.5,
                        letterSpacing: '0.02em',
                        color: 'rgba(255,255,255,0.78)',
                        maxWidth: 280,
                    }}
                >
                    “{body || 'No review text yet.'}”
                </p>
                </div>
            </div>

            {/* Author — stacked & centered so avatar is never clipped at card edges */}
            <div
                className="absolute z-[30]"
                style={{
                    left: 0,
                    right: 0,
                    bottom: 34,
                    display: 'flex',
                    justifyContent: 'center',
                    paddingLeft: 28,
                    paddingRight: 28,
                    boxSizing: 'border-box',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        width: '100%',
                        maxWidth: 280,
                    }}
                >
                    <div
                        data-share-profile-avatar
                        role="img"
                        aria-label={displayName}
                        style={{
                            width: 52,
                            height: 52,
                            borderRadius: '50%',
                            overflow: 'hidden',
                            flexShrink: 0,
                            border: '2px solid rgba(255,255,255,0.14)',
                            backgroundColor: '#0a0a0a',
                            ...(avatarSrc
                                ? {
                                    backgroundImage: `url(${JSON.stringify(avatarSrc)})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center center',
                                    backgroundRepeat: 'no-repeat',
                                }
                                : {}),
                        }}
                    >
                        {!avatarSrc && (
                            <div
                                className="flex h-full w-full items-center justify-center text-xl"
                                style={{ background: 'linear-gradient(135deg, #1a1d1f, #0a0a0a)' }}
                            >
                                🎬
                            </div>
                        )}
                    </div>
                    <div
                        className="text-center"
                        style={{ marginTop: 8, width: '100%' }}
                    >
                        <p
                            className="m-0 font-medium"
                            style={{
                                fontSize: 11,
                                color: 'rgba(255,255,255,0.92)',
                                letterSpacing: '0.04em',
                                wordBreak: 'break-word',
                            }}
                        >
                            {displayName}
                        </p>
                        {handle && (
                            <p
                                className="m-0"
                                style={{
                                    marginTop: 2,
                                    fontSize: 8,
                                    color: layers.accent || 'rgba(0,224,84,0.75)',
                                }}
                            >
                                {handle}
                            </p>
                        )}
                        <p
                            className="m-0 uppercase"
                            style={{
                                marginTop: 4,
                                fontSize: 6,
                                letterSpacing: '0.28em',
                                color: 'rgba(255,255,255,0.35)',
                            }}
                        >
                            My review
                        </p>
                    </div>
                </div>
            </div>

            <div className="absolute z-[26] left-0 right-0 text-center" style={{ bottom: 12 }}>
                <div
                    style={{
                        width: 32,
                        height: 1,
                        margin: '0 auto 8px',
                        background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)',
                    }}
                />
                <p className="m-0 lowercase" style={{ fontSize: 6, letterSpacing: '0.4em', color: 'rgba(255,255,255,0.09)' }}>
                    theaterorstream.com
                </p>
            </div>
        </div>
    );
});

ReviewLuxuryShareCard.displayName = 'ReviewLuxuryShareCard';

export default ReviewLuxuryShareCard;
