import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaStar } from 'react-icons/fa';
import { generateSlugWithId } from '../../lib/slugUtils';
import { resolveTmdbImageUrl } from '../../utils/imageHelper';
import { trackEvent, EVENT_TYPES } from '../../lib/eventTracking';
import PosterQuickActions from '../PosterQuickActions';

/**
 * Netflix-style recommendation poster card with like / dislike / watched /
 * watchlist actions that work without opening the details page.
 */
export default function RecommendationCard({
    movie,
    index = 0,
    showReason = true,
    onDismiss,
}) {
    const reduxImageURL = useSelector((state) => state.movieData.imageURL);
    const [hidden, setHidden] = useState(false);

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
            tmdbId,
            mediaType,
            metadata: { reason: movie.reason, score: movie.score },
        });
    };

    const handleAction = (action, result) => {
        // Drop from this session immediately; full re-analysis waits for reload / ≥3 likes.
        if ((action === 'dislike' || action === 'watched' || action === 'like') && result?.added) {
            setHidden(true);
            onDismiss?.(movie, action);
        }
    };

    if (hidden) return null;

    return (
        <div
            className="group relative w-[132px] shrink-0 snap-start animate-fadeInUp sm:w-[170px] lg:w-[185px]"
            style={{ animationDelay: `${Math.min(index * 35, 350)}ms` }}
        >
            <Link
                to={to}
                onClick={handleClick}
                className="relative block overflow-hidden rounded-lg bg-[var(--bg-elevated)] ring-1 ring-white/5 transition-all duration-300 active:scale-[0.98] sm:rounded-xl group-hover:ring-[var(--primary)]/50 group-hover:shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
            >
                <div className="relative aspect-[2/3]">
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

                    {matchPct != null && (
                        <div className="absolute left-1.5 top-1.5 z-10 rounded-md bg-black/70 px-1 py-0.5 text-[10px] font-bold text-[var(--accent-green)] backdrop-blur-sm sm:left-2 sm:top-2 sm:px-1.5 sm:text-[11px]">
                            {matchPct}%
                        </div>
                    )}

                    {rating > 0 && (
                        <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-md bg-black/60 px-1 py-0.5 text-[10px] font-medium text-yellow-400 backdrop-blur-sm sm:right-2 sm:top-2 sm:gap-1 sm:px-1.5 sm:text-[11px]">
                            <FaStar className="text-[8px] sm:text-[9px]" />
                            {rating.toFixed(1)}
                        </div>
                    )}

                    <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                        <PosterQuickActions
                            movieId={tmdbId}
                            movieTitle={title}
                            posterPath={movie.poster_path}
                            mediaType={mediaType}
                            onAction={handleAction}
                        />
                    </div>
                </div>
            </Link>

            <Link to={to} onClick={handleClick} className="mt-1.5 block px-0.5">
                <h3 className="line-clamp-2 text-[12px] font-medium leading-snug text-white/90 transition-colors sm:line-clamp-1 sm:text-[13px] group-hover:text-[var(--primary)]">
                    {title}
                </h3>
                <p className="text-[10px] text-white/40 sm:text-[11px]">
                    {year}{mediaType === 'tv' ? ' • Series' : ''}
                </p>
                {showReason && movie.reason && (
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/35 sm:hidden">
                        {movie.reason}
                    </p>
                )}
            </Link>
        </div>
    );
}
