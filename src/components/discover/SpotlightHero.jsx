import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaStar, FaMagic, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { generateSlugWithId } from '../../lib/slugUtils';
import { resolveTmdbImageUrl } from '../../utils/imageHelper';
import { trackEvent, EVENT_TYPES } from '../../lib/eventTracking';
import PosterQuickActions from '../PosterQuickActions';

const ROTATE_MS = 6000; // hold each pick for 6 seconds
const MAX_SLIDES = 6;
const SWIPE_THRESHOLD = 48;

function HeroSkeleton() {
    return (
        <div className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-6 sm:pt-4 lg:px-8">
            <div className="h-[42vh] min-h-[240px] max-h-[320px] w-full animate-pulse rounded-2xl skeleton sm:h-[66vh] sm:min-h-[400px] sm:max-h-none sm:rounded-3xl" />
        </div>
    );
}

/**
 * Top-of-page spotlight carousel: rotates through the user's highest-scoring
 * picks, Netflix-hero style, each with its match score + explanation reason.
 * Accepts a `movies` array (falls back to a single `movie` for compatibility).
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

    // Keep index in range when a slide is dismissed from the parent list.
    useEffect(() => {
        if (!slides.length) return;
        setIndex((i) => (i >= slides.length ? 0 : i));
    }, [slides.length]);

    const go = useCallback((dir) => {
        setIndex((i) => (i + dir + slides.length) % slides.length);
    }, [slides.length]);

    // Auto-advance every 6s; pause while hovered / interacting with actions.
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
        // Centered hero — equal side gutters; shorter on mobile for thumb reach.
        <div className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-6 sm:pt-4 lg:px-8">
            <div
                className="group relative h-[42vh] min-h-[240px] max-h-[320px] w-full overflow-hidden rounded-2xl ring-1 ring-white/10 sm:h-[66vh] sm:min-h-[400px] sm:max-h-none sm:rounded-3xl touch-pan-y"
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
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/50 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-primary)]/85 via-[var(--bg-primary)]/20 to-transparent sm:from-[var(--bg-primary)]/90 sm:via-[var(--bg-primary)]/25" />

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

                <div className="relative z-10 flex h-full flex-col justify-end px-4 pb-7 sm:px-8 sm:pb-14 lg:px-12">
                    <div className="max-w-2xl">
                        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)]/15 px-2.5 py-0.5 text-[10px] font-semibold text-[var(--primary)] ring-1 ring-[var(--primary)]/30 sm:mb-3 sm:px-3 sm:py-1 sm:text-xs">
                            <FaMagic className="text-[10px]" /> Top picks for you
                        </div>

                        <Link to={to} onClick={handleClick}>
                            <h1 className="text-[1.65rem] font-extrabold leading-[1.15] text-white drop-shadow-lg transition-opacity hover:opacity-90 sm:text-5xl sm:leading-tight">
                                {title}
                            </h1>
                        </Link>

                        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-white/70 sm:mt-3 sm:gap-3 sm:text-sm">
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
                            <p className="mt-2 line-clamp-2 max-w-xl text-xs leading-relaxed text-white/80 sm:mt-3 sm:text-base">
                                {active.reason}
                            </p>
                        )}

                        <div className="mt-3.5 sm:mt-5">
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
                        <div className="mt-3.5 flex items-center gap-1.5 sm:mt-5">
                            {slides.map((s, i) => (
                                <button
                                    key={s.tmdb_id ?? s.id ?? i}
                                    type="button"
                                    aria-label={`Go to pick ${i + 1}`}
                                    onClick={() => setIndex(i)}
                                    className={`h-2 min-w-[8px] rounded-full transition-all sm:h-1.5 ${
                                        i === index ? 'w-7 bg-[var(--primary)]' : 'w-2.5 bg-white/30 active:bg-white/50'
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
