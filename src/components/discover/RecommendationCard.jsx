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
    const matchPct = typeof movie.score === 'number' ? Math.min(99, Math.round(movie.score * 100)) : null;
    // Where it streams: the user's own services first, else anywhere in their region.
    const yourServices = Array.isArray(movie.onYourServices) ? movie.onYourServices : [];
    const streamingOn = yourServices.length ? yourServices : (Array.isArray(movie.availability) ? movie.availability : []);
    const providerBadges = streamingOn.filter((p) => p?.logo).slice(0, 2);
    // One service only — keeps the card to title, year and a single short line.
    const providerLabel = streamingOn.length ? `On ${streamingOn[0].name}` : null;
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
            className="group relative w-[108px] shrink-0 snap-start sm:w-[170px] lg:w-[185px]"
            style={{ animationDelay: `${Math.min(index * 25, 200)}ms` }}
        >
            <Link
                to={to}
                onClick={handleClick}
                className="relative block overflow-hidden rounded-md bg-[var(--bg-elevated)] ring-1 ring-white/5 transition-transform duration-200 active:scale-[0.97] sm:rounded-xl sm:duration-300 group-hover:ring-[var(--primary)]/50 group-hover:shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
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
                        <div className="absolute left-1 top-1 z-10 rounded bg-black/75 px-1 py-0.5 text-[9px] font-bold text-[var(--accent-green)] backdrop-blur-sm sm:left-2 sm:top-2 sm:rounded-md sm:px-1.5 sm:text-[11px]">
                            {matchPct}%
                        </div>
                    )}

                    {rating > 0 && (
                        <div className="absolute right-1 top-1 z-10 flex items-center gap-0.5 rounded bg-black/65 px-1 py-0.5 text-[9px] font-medium text-yellow-400 backdrop-blur-sm sm:right-2 sm:top-2 sm:gap-1 sm:rounded-md sm:px-1.5 sm:text-[11px]">
                            <FaStar className="text-[7px] sm:text-[9px]" />
                            {rating.toFixed(1)}
                        </div>
                    )}

                    {providerBadges.length > 0 && (
                        <div
                            className="absolute bottom-1 left-1 z-10 flex items-center gap-0.5 sm:bottom-2 sm:left-2 sm:gap-1"
                            title={providerLabel || undefined}
                        >
                            {providerBadges.map((p) => (
                                <img
                                    key={p.id}
                                    src={`https://image.tmdb.org/t/p/w92${p.logo}`}
                                    alt={p.name}
                                    loading="lazy"
                                    className={`h-4 w-4 rounded-[4px] object-cover shadow-md sm:h-6 sm:w-6 sm:rounded-md ${yourServices.length ? 'ring-1 ring-[var(--accent-green)]' : 'ring-1 ring-black/40'}`}
                                />
                            ))}
                        </div>
                    )}

                    {/* Quick actions on hover devices only — phones keep the poster clean
                        (watchlist / like / watched live on the title page). */}
                    <div className="hidden transition-opacity sm:block sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
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

            <Link
                to={to}
                onClick={handleClick}
                title={showReason && movie.reason ? movie.reason : undefined}
                className="mt-1 block px-0.5 sm:mt-1.5"
            >
                <h3 className="line-clamp-2 text-[11px] font-medium leading-snug text-white/90 transition-colors sm:line-clamp-1 sm:text-[13px] group-hover:text-[var(--primary)]">
                    {title}
                </h3>
                <p className="line-clamp-1 text-[9px] text-white/40 sm:text-[11px]">
                    {year}{mediaType === 'tv' ? ' · Series' : ''}
                </p>
            </Link>
        </div>
    );
}
