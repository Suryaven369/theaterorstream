import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaStar, FaPlay } from 'react-icons/fa';
import { generateSlugWithId } from '../../lib/slugUtils';
import { resolveTmdbImageUrl } from '../../utils/imageHelper';
import { trackEvent, EVENT_TYPES } from '../../lib/eventTracking';

/**
 * Netflix-style recommendation poster card. A click emits recommendation_clicked
 * (the positive engagement signal). Passive scroll-by is NOT tracked as a
 * rejection — that kept reshuffling the feed.
 */
export default function RecommendationCard({ movie, index = 0, showReason = true }) {
    const reduxImageURL = useSelector((state) => state.movieData.imageURL);
    const [hovered, setHovered] = useState(false);

    const tmdbId = movie.tmdb_id ?? movie.id;
    const mediaType = movie.media_type === 'tv' ? 'tv' : 'movie';
    const title = movie.title || movie.name || '';
    const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
    const slug = generateSlugWithId(title, tmdbId, year);
    const to = `${mediaType === 'tv' ? '/tv' : '/movies'}/${slug}`;

    const poster = resolveTmdbImageUrl(movie.poster_path, { baseUrl: reduxImageURL, size: 'w500' });
    const matchPct = typeof movie.score === 'number' ? Math.round(movie.score * 100) : null;
    const rating = Number(movie.vote_average || 0);

    // NOTE: we intentionally do NOT fire "recommendation_ignored" just because a
    // card scrolled into view. Passive browsing isn't a rejection — treating it
    // as one made the whole feed reshuffle on every visit. Only explicit signals
    // (clicks, dislikes, watchlist removals) move the needle now.

    const handleClick = () => {
        trackEvent(EVENT_TYPES.RECOMMENDATION_CLICKED, {
            tmdbId,
            mediaType,
            metadata: { reason: movie.reason, score: movie.score },
        });
    };

    return (
        <Link
            to={to}
            onClick={handleClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="group relative block w-[150px] sm:w-[170px] lg:w-[185px] shrink-0 animate-fadeInUp"
            style={{ animationDelay: `${Math.min(index * 35, 350)}ms` }}
        >
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[var(--bg-elevated)] ring-1 ring-white/5 transition-all duration-300 group-hover:ring-[var(--primary)]/50 group-hover:shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
                {poster ? (
                    <img
                        src={poster}
                        alt={title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl text-white/20">🎬</div>
                )}

                {/* Match score badge */}
                {matchPct != null && (
                    <div className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-[var(--accent-green)] backdrop-blur-sm">
                        {matchPct}% match
                    </div>
                )}

                {/* TMDB rating */}
                {rating > 0 && (
                    <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-yellow-400 backdrop-blur-sm">
                        <FaStar className="text-[9px]" />
                        {rating.toFixed(1)}
                    </div>
                )}

                {/* Hover overlay: reason + play */}
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/40 to-transparent p-2.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <div className="mb-1 flex items-center gap-1.5 text-[var(--primary)]">
                        <FaPlay className="text-[10px]" />
                        <span className="text-[11px] font-semibold">Details</span>
                    </div>
                    {showReason && movie.reason && (
                        <p className="line-clamp-3 text-[10.5px] leading-snug text-white/80">
                            {movie.reason}
                        </p>
                    )}
                </div>
            </div>

            <h3 className="mt-1.5 line-clamp-1 px-0.5 text-[13px] font-medium text-white/90 transition-colors group-hover:text-[var(--primary)]">
                {title}
            </h3>
            <p className="px-0.5 text-[11px] text-white/40">
                {year}{mediaType === 'tv' ? ' • Series' : ''}
            </p>
        </Link>
    );
}
