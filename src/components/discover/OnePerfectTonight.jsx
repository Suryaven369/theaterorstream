import React from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaStar, FaMoon, FaChevronRight } from 'react-icons/fa';
import { generateSlugWithId } from '../../lib/slugUtils';
import { resolveTmdbImageUrl } from '../../utils/imageHelper';
import { trackEvent, EVENT_TYPES } from '../../lib/eventTracking';

/**
 * One Perfect Movie Tonight — compact on mobile (app list-row), richer on desktop.
 */
export default function OnePerfectTonight({ movie, loading }) {
    const reduxImageURL = useSelector((state) => state.movieData.imageURL);

    if (loading) {
        return <div className="mx-4 h-[4.5rem] max-w-xl animate-pulse rounded-xl skeleton sm:mx-6 sm:h-56 sm:rounded-2xl" />;
    }
    if (!movie) return null;

    const tmdbId = movie.tmdb_id ?? movie.id;
    const mediaType = movie.media_type === 'tv' ? 'tv' : 'movie';
    const title = movie.title || movie.name || '';
    const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
    const slug = generateSlugWithId(title, tmdbId, year);
    const to = `${mediaType === 'tv' ? '/tv' : '/movies'}/${slug}`;
    const poster = resolveTmdbImageUrl(movie.poster_path, { baseUrl: reduxImageURL, size: 'w500' });
    const matchPct = typeof movie.score === 'number' ? Math.round(movie.score * 100) : null;
    const rating = Number(movie.vote_average || 0);

    const handleClick = () => {
        trackEvent(EVENT_TYPES.RECOMMENDATION_CLICKED, {
            tmdbId, mediaType, metadata: { surface: 'perfect_tonight', score: movie.score },
        });
    };

    return (
        <section className="mx-4 sm:mx-6">
            <div className="mb-1.5 flex items-center gap-1.5 sm:mb-2 sm:gap-2">
                <FaMoon className="text-[12px] text-[var(--primary)] sm:text-sm" />
                <h2 className="text-[15px] font-bold tracking-tight text-white sm:text-xl">Tonight&apos;s pick</h2>
            </div>

            <Link
                to={to}
                onClick={handleClick}
                className="group flex w-full max-w-xl items-center gap-3 overflow-hidden rounded-xl border border-[var(--primary)]/25 bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-card)] p-2 transition-transform active:scale-[0.99] sm:gap-4 sm:rounded-2xl sm:p-4 hover:border-[var(--primary)]/45"
            >
                <div className="h-[4.25rem] w-[2.85rem] shrink-0 overflow-hidden rounded-lg bg-black/30 sm:h-52 sm:w-36 sm:rounded-xl">
                    {poster
                        ? <img src={poster} alt={title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        : <div className="flex h-full w-full items-center justify-center text-lg text-white/20 sm:text-2xl">🎬</div>}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
                    <h3 className="text-[14px] font-extrabold leading-tight text-white line-clamp-2 sm:text-2xl sm:line-clamp-none">{title}</h3>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/70 sm:mt-1.5 sm:gap-3 sm:text-sm">
                        {matchPct != null && (
                            <span className="rounded-full bg-[var(--accent-green)]/15 px-1.5 py-0.5 font-bold text-[var(--accent-green)] sm:px-2">
                                {matchPct}% match
                            </span>
                        )}
                        {rating > 0 && (
                            <span className="flex items-center gap-1 text-yellow-400">
                                <FaStar className="text-[9px]" /> {rating.toFixed(1)}
                            </span>
                        )}
                        {year && <span>{year}</span>}
                    </div>

                    {movie.reason && (
                        <p className="mt-1 hidden line-clamp-2 text-xs leading-relaxed text-white/75 sm:mt-2.5 sm:line-clamp-3 sm:block sm:text-sm">
                            {movie.reason}
                        </p>
                    )}

                    <span className="mt-1.5 hidden min-h-[40px] w-fit items-center gap-2 rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-xs font-bold text-black transition-transform sm:mt-3 sm:inline-flex sm:min-h-0 sm:px-4 sm:py-2 sm:text-sm group-hover:scale-[1.03]">
                        View details
                    </span>
                </div>

                <FaChevronRight className="shrink-0 text-white/30 text-sm sm:hidden" aria-hidden />
            </Link>
        </section>
    );
}
