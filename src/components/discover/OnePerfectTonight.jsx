import React from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaStar, FaInfoCircle, FaMoon } from 'react-icons/fa';
import { generateSlugWithId } from '../../lib/slugUtils';
import { resolveTmdbImageUrl } from '../../utils/imageHelper';
import { trackEvent, EVENT_TYPES } from '../../lib/eventTracking';

/**
 * One Perfect Movie Tonight — a single curated daily pick to kill decision
 * fatigue. Stable for 24h, with a match score and a "why this" explanation.
 */
export default function OnePerfectTonight({ movie, loading }) {
    const reduxImageURL = useSelector((state) => state.movieData.imageURL);

    if (loading) {
        return <div className="mx-4 h-56 animate-pulse rounded-2xl skeleton sm:mx-6" />;
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
            <div className="mb-2 flex items-center gap-2">
                <FaMoon className="text-[var(--primary)]" />
                <h2 className="text-lg font-bold text-white sm:text-xl">One Perfect Movie Tonight</h2>
            </div>

            <Link
                to={to}
                onClick={handleClick}
                className="group flex max-w-2xl gap-4 overflow-hidden rounded-2xl border border-[var(--primary)]/20 bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-card)] p-3 transition-all hover:border-[var(--primary)]/45 sm:p-4"
            >
                <div className="h-44 w-28 shrink-0 overflow-hidden rounded-xl bg-black/30 sm:h-52 sm:w-36">
                    {poster
                        ? <img src={poster} alt={title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        : <div className="flex h-full w-full items-center justify-center text-2xl text-white/20">🎬</div>}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <h3 className="text-xl font-extrabold leading-tight text-white sm:text-2xl">{title}</h3>

                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-white/70">
                        {matchPct != null && (
                            <span className="rounded-full bg-[var(--accent-green)]/15 px-2 py-0.5 font-bold text-[var(--accent-green)]">
                                {matchPct}% match
                            </span>
                        )}
                        {rating > 0 && (
                            <span className="flex items-center gap-1 text-yellow-400">
                                <FaStar className="text-xs" /> {rating.toFixed(1)}
                            </span>
                        )}
                        {year && <span>{year}</span>}
                    </div>

                    {movie.reason && (
                        <p className="mt-2.5 line-clamp-3 text-sm leading-relaxed text-white/75">
                            {movie.reason}
                        </p>
                    )}

                    <span className="mt-3 inline-flex w-fit items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-black transition-transform group-hover:scale-[1.03]">
                        <FaInfoCircle /> View details
                    </span>
                </div>
            </Link>
        </section>
    );
}
