import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaStar, FaMagic, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { generateSlugWithId } from '../../lib/slugUtils';
import { resolveTmdbImageUrl } from '../../utils/imageHelper';
import { trackEvent, EVENT_TYPES } from '../../lib/eventTracking';
import PosterQuickActions from '../PosterQuickActions';

const ROTATE_MS = 6000;
const MAX_SLIDES = 6;
const SWIPE_THRESHOLD = 48;

function HeroSkeleton() {
    return (
        <div className="w-full">
            {/* Mobile: full-bleed. Desktop: inset card. */}
            <div className="h-[min(58vh,420px)] min-h-[280px] w-full animate-pulse skeleton sm:mx-auto sm:mt-4 sm:h-[66vh] sm:min-h-[400px] sm:max-w-7xl sm:rounded-3xl sm:px-0" />
        </div>
    );
}

/**
 * Top-of-page spotlight carousel — full-bleed on mobile (app-like),
 * inset card on desktop.
 */
export default function SpotlightHero({ movies, movie, loading, onDismiss = null }) {
    const reduxImageURL = useSelector((state) => state.movieData.imageURL);
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const touchStartX = useRef(null);

    const slides = useMemo(() => {
        const list = (movies && movies.length ? movies : movie ? [movie] : [])
            .filter(Boolean)
            .slice(0, MAX_SLIDES);
        return list;
    }, [movies, movie]);

    useEffect(() => {
        if (!slides.length) return;
        setIndex((i) => (i >= slides.length ? 0 : i));
    }, [slides.length]);

    const go = useCallback((dir) => {
        setIndex((i) => (i + dir + slides.length) % slides.length);
    }, [slides.length]);

    useEffect(() => {
        if (slides.length < 2 || paused) return undefined;
        const t = setTimeout(() => setIndex((i) => (i + 1) % slides.length), ROTATE_MS);
        return () => clearTimeout(t);
    }, [index, slides.length, paused]);

    const onTouchStart = (e) => {
        touchStartX.current = e.changedTouches?.[0]?.clientX ?? null;
    };
    const onTouchEnd = (e) => {
        if (touchStartX.current == null || slides.length < 2) return;
        const endX = e.changedTouches?.[0]?.clientX;
        if (endX == null) return;
        const delta = endX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) < SWIPE_THRESHOLD) return;
        go(delta < 0 ? 1 : -1);
    };

    if (loading) return <HeroSkeleton />;
    if (!slides.length) return null;

    const active = slides[Math.min(index, slides.length - 1)];
    const tmdbId = active.tmdb_id ?? active.id;
    const mediaType = active.media_type === 'tv' ? 'tv' : 'movie';
    const title = active.title || active.name || '';
    const year = (active.release_date || active.first_air_date || '').slice(0, 4);
    const slug = generateSlugWithId(title, tmdbId, year);
    const to = `${mediaType === 'tv' ? '/tv' : '/movies'}/${slug}`;

    const backdrop = resolveTmdbImageUrl(
        active.backdrop_path || active.poster_path,
        { baseUrl: reduxImageURL, size: 'original' },
    );
    const matchPct = typeof active.score === 'number' ? Math.round(active.score * 100) : null;
    const rating = Number(active.vote_average || 0);

    const handleClick = () => {
        trackEvent(EVENT_TYPES.RECOMMENDATION_CLICKED, {
            tmdbId, mediaType, metadata: { surface: 'spotlight', score: active.score },
        });
    };

    const handleAction = (action, result) => {
        if ((action === 'dislike' || action === 'watched' || action === 'like') && result?.added) {
            onDismiss?.(active, action);
        }
    };

    return (
        <div className="w-full sm:mx-auto sm:max-w-7xl sm:px-6 sm:pt-4 lg:px-8">
            <div
                className="group relative h-[min(58vh,420px)] min-h-[280px] w-full overflow-hidden touch-pan-y sm:h-[66vh] sm:min-h-[400px] sm:max-h-none sm:rounded-3xl sm:ring-1 sm:ring-white/10"
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                onMouseEnter={() => setPaused(true)}
                onMouseLeave={() => setPaused(false)}
            >
                {backdrop && (
                    <img
                        key={tmdbId}
                        src={backdrop}
                        alt={title}
                        className="absolute inset-0 h-full w-full object-cover object-center animate-fadeIn"
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/45 to-black/20" />
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-primary)]/80 via-transparent to-transparent sm:from-[var(--bg-primary)]/90 sm:via-[var(--bg-primary)]/25" />

                {slides.length > 1 && (
                    <>
                        <button
                            type="button"
                            aria-label="Previous pick"
                            onClick={() => go(-1)}
                            className="absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/40 p-2.5 text-white opacity-0 backdrop-blur transition hover:bg-black/70 group-hover:opacity-100 sm:flex"
                        >
                            <FaChevronLeft />
                        </button>
                        <button
                            type="button"
                            aria-label="Next pick"
                            onClick={() => go(1)}
                            className="absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/40 p-2.5 text-white opacity-0 backdrop-blur transition hover:bg-black/70 group-hover:opacity-100 sm:flex"
                        >
                            <FaChevronRight />
                        </button>
                    </>
                )}

                <div className="relative z-10 flex h-full flex-col justify-end px-4 pb-5 sm:px-8 sm:pb-14 lg:px-12">
                    <div className="max-w-2xl">
                        <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-0.5 text-[10px] font-semibold text-[var(--primary)] ring-1 ring-[var(--primary)]/35 backdrop-blur-sm sm:mb-3 sm:bg-[var(--primary)]/15 sm:px-3 sm:py-1 sm:text-xs">
                            <FaMagic className="text-[10px]" /> For you
                        </div>

                        <Link to={to} onClick={handleClick}>
                            <h1 className="text-[1.75rem] font-extrabold leading-[1.12] tracking-tight text-white drop-shadow-lg transition-opacity active:opacity-90 sm:text-5xl sm:leading-tight">
                                {title}
                            </h1>
                        </Link>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-white/75 sm:mt-3 sm:gap-3 sm:text-sm">
                            {matchPct != null && (
                                <span className="font-bold text-[var(--accent-green)]">{matchPct}% match</span>
                            )}
                            {rating > 0 && (
                                <span className="flex items-center gap-1 text-yellow-400">
                                    <FaStar className="text-[10px]" /> {rating.toFixed(1)}
                                </span>
                            )}
                            {year && <span>{year}</span>}
                            {mediaType === 'tv' && <span className="rounded bg-white/10 px-1.5 text-[10px] sm:text-xs">Series</span>}
                        </div>

                        {active.reason && (
                            <p className="mt-1.5 line-clamp-2 max-w-xl text-[12px] leading-snug text-white/75 sm:mt-3 sm:text-base sm:leading-relaxed">
                                {active.reason}
                            </p>
                        )}

                        <div className="mt-3 sm:mt-5">
                            <PosterQuickActions
                                key={tmdbId}
                                movieId={tmdbId}
                                movieTitle={title}
                                posterPath={active.poster_path}
                                mediaType={mediaType}
                                variant="inline"
                                onAction={handleAction}
                            />
                        </div>
                    </div>

                    {slides.length > 1 && (
                        <div className="mt-3 flex items-center gap-1.5 sm:mt-5">
                            {slides.map((s, i) => (
                                <button
                                    key={s.tmdb_id ?? s.id ?? i}
                                    type="button"
                                    aria-label={`Go to pick ${i + 1}`}
                                    onClick={() => setIndex(i)}
                                    className={`h-1.5 min-w-[6px] rounded-full transition-all ${
                                        i === index ? 'w-6 bg-[var(--primary)]' : 'w-1.5 bg-white/35 active:bg-white/55'
                                    }`}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
