import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaStar, FaInfoCircle, FaMagic, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { generateSlugWithId } from '../../lib/slugUtils';
import { resolveTmdbImageUrl } from '../../utils/imageHelper';
import { trackEvent, EVENT_TYPES } from '../../lib/eventTracking';

const ROTATE_MS = 6000;
const MAX_SLIDES = 6;

function HeroSkeleton() {
    return (
        <div className="px-3 pt-4 sm:px-5">
            <div className="h-[58vh] min-h-[400px] w-full animate-pulse rounded-3xl skeleton sm:h-[66vh]" />
        </div>
    );
}

/**
 * Top-of-page spotlight carousel: rotates through the user's highest-scoring
 * picks, Netflix-hero style, each with its match score + explanation reason.
 * Accepts a `movies` array (falls back to a single `movie` for compatibility).
 */
export default function SpotlightHero({ movies, movie, loading }) {
    const reduxImageURL = useSelector((state) => state.movieData.imageURL);
    const [index, setIndex] = useState(0);

    const slides = useMemo(() => {
        const list = (movies && movies.length ? movies : movie ? [movie] : [])
            .filter(Boolean)
            .slice(0, MAX_SLIDES);
        return list;
    }, [movies, movie]);

    const go = useCallback((dir) => {
        setIndex((i) => (i + dir + slides.length) % slides.length);
    }, [slides.length]);

    // Auto-advance; pauses are handled by resetting the timer on manual nav.
    useEffect(() => {
        if (slides.length < 2) return undefined;
        const t = setTimeout(() => setIndex((i) => (i + 1) % slides.length), ROTATE_MS);
        return () => clearTimeout(t);
    }, [index, slides.length]);

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

    return (
        // pt pushes the hero down so it clears the fixed header / tab bar.
        <div className="px-3 pt-4 sm:px-5">
            <div className="group relative h-[58vh] min-h-[400px] w-full overflow-hidden rounded-3xl ring-1 ring-white/10 sm:h-[66vh]">
                {backdrop && (
                    <img
                        key={tmdbId}
                        src={backdrop}
                        alt={title}
                        // Centred framing suits most TMDB backdrops; the taller
                        // hero keeps subjects in view without cropping the top.
                        className="absolute inset-0 h-full w-full object-cover object-center animate-fadeIn"
                    />
                )}
                {/* Cinematic gradients consistent with hero-gradient theme */}
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/45 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-primary)]/90 via-[var(--bg-primary)]/25 to-transparent" />

                {/* Prev / next controls (only when >1 slide) */}
                {slides.length > 1 && (
                    <>
                        <button
                            type="button"
                            aria-label="Previous pick"
                            onClick={() => go(-1)}
                            className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/40 p-2.5 text-white opacity-0 backdrop-blur transition hover:bg-black/70 group-hover:opacity-100 sm:flex"
                        >
                            <FaChevronLeft />
                        </button>
                        <button
                            type="button"
                            aria-label="Next pick"
                            onClick={() => go(1)}
                            className="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/40 p-2.5 text-white opacity-0 backdrop-blur transition hover:bg-black/70 group-hover:opacity-100 sm:flex"
                        >
                            <FaChevronRight />
                        </button>
                    </>
                )}

                <div className="relative z-10 flex h-full flex-col justify-end px-5 pb-12 sm:px-8 sm:pb-14 lg:px-12">
                    <div className="max-w-2xl">
                        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)]/15 px-3 py-1 text-xs font-semibold text-[var(--primary)] ring-1 ring-[var(--primary)]/30">
                            <FaMagic className="text-[10px]" /> Top picks for you
                        </div>

                        <h1 className="text-3xl font-extrabold leading-tight text-white drop-shadow-lg sm:text-5xl">
                            {title}
                        </h1>

                        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white/70">
                            {matchPct != null && (
                                <span className="font-bold text-[var(--accent-green)]">{matchPct}% match</span>
                            )}
                            {rating > 0 && (
                                <span className="flex items-center gap-1 text-yellow-400">
                                    <FaStar className="text-xs" /> {rating.toFixed(1)}
                                </span>
                            )}
                            {year && <span>{year}</span>}
                            {mediaType === 'tv' && <span className="rounded bg-white/10 px-1.5 text-xs">Series</span>}
                        </div>

                        {active.reason && (
                            <p className="mt-3 line-clamp-2 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base">
                                {active.reason}
                            </p>
                        )}

                        <div className="mt-5 flex items-center gap-3">
                            <Link
                                to={to}
                                onClick={handleClick}
                                className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-6 py-2.5 text-sm font-bold text-black transition-transform hover:scale-[1.03]"
                            >
                                <FaInfoCircle /> View details
                            </Link>
                        </div>
                    </div>

                    {/* Slide dots */}
                    {slides.length > 1 && (
                        <div className="mt-5 flex items-center gap-1.5">
                            {slides.map((s, i) => (
                                <button
                                    key={s.tmdb_id ?? s.id ?? i}
                                    type="button"
                                    aria-label={`Go to pick ${i + 1}`}
                                    onClick={() => setIndex(i)}
                                    className={`h-1.5 rounded-full transition-all ${
                                        i === index ? 'w-7 bg-[var(--primary)]' : 'w-2.5 bg-white/30 hover:bg-white/50'
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
