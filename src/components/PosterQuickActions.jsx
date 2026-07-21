import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBookmark, FaHeart, FaEye, FaThumbsDown } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import {
    getUserMovieStatus,
    toggleWatchlist,
    toggleLikedMovie,
    toggleWatchedMovie,
    ensureWatchedMovie,
} from '../lib/supabase';
import { trackEvent, EVENT_TYPES } from '../lib/eventTracking';

function ActionBtn({
    label,
    active,
    activeClass,
    busy,
    onClick,
    size = 'sm',
    children,
}) {
    const sizeClass = size === 'lg'
        ? 'h-11 w-11 min-h-[44px] min-w-[44px] sm:h-11 sm:w-11'
        : 'h-9 w-9 min-h-[36px] min-w-[36px] sm:h-8 sm:w-8';
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={!!active}
            disabled={busy}
            onClick={onClick}
            className={`flex items-center justify-center rounded-full backdrop-blur-md transition-all active:scale-90 disabled:opacity-50 ${sizeClass} ${
                active
                    ? `${activeClass} bg-black/75`
                    : 'bg-black/55 text-white/85 hover:bg-black/80 hover:text-white'
            }`}
        >
            {children}
        </button>
    );
}

/**
 * Like / Dislike / Watched / Watchlist controls — works without opening details.
 * Stops click propagation so a parent <Link> doesn't navigate.
 *
 * @param {{
 *   onAction?: (action: string, result: object) => void,
 *   variant?: 'overlay' | 'inline',
 * }} props
 */
export default function PosterQuickActions({
    movieId,
    movieTitle,
    posterPath,
    mediaType = 'movie',
    onAction,
    className = '',
    variant = 'overlay',
}) {
    const navigate = useNavigate();
    const { user, isAuthenticated } = useAuth();
    const [status, setStatus] = useState({
        inWatchlist: false,
        isLiked: false,
        isWatched: false,
        isDisliked: false,
    });
    const [busy, setBusy] = useState(null);
    const [loaded, setLoaded] = useState(false);

    const loadStatus = useCallback(async () => {
        if (!user?.id || !movieId) {
            setLoaded(true);
            return;
        }
        const s = await getUserMovieStatus(user.id, movieId);
        setStatus((prev) => ({ ...prev, ...s }));
        setLoaded(true);
    }, [user?.id, movieId]);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    const stop = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const requireAuth = () => {
        sessionStorage.setItem('authMessage', 'Please sign up or login to save movies');
        navigate('/auth');
    };

    const run = async (e, key, fn) => {
        stop(e);
        if (!isAuthenticated || !user?.id) return requireAuth();
        if (busy) return;
        setBusy(key);
        try {
            await fn();
        } finally {
            setBusy(null);
        }
    };

    const handleWatchlist = (e) => run(e, 'watchlist', async () => {
        const next = !status.inWatchlist;
        setStatus((prev) => ({ ...prev, inWatchlist: next }));
        const r = await toggleWatchlist(user.id, movieId, movieTitle, posterPath, mediaType);
        if (!r.success) {
            setStatus((prev) => ({ ...prev, inWatchlist: !next }));
            return;
        }
        setStatus((prev) => ({ ...prev, inWatchlist: r.added }));
        trackEvent(r.added ? EVENT_TYPES.WATCHLISTED : EVENT_TYPES.WATCHLIST_REMOVED, {
            tmdbId: movieId,
            mediaType,
        });
        onAction?.('watchlist', r);
    });

    const handleWatched = (e) => run(e, 'watched', async () => {
        const next = !status.isWatched;
        setStatus((prev) => ({ ...prev, isWatched: next }));
        const r = await toggleWatchedMovie(user.id, movieId, movieTitle, posterPath, mediaType);
        if (!r.success) {
            setStatus((prev) => ({ ...prev, isWatched: !next }));
            return;
        }
        setStatus((prev) => ({ ...prev, isWatched: r.added }));
        if (r.added) {
            trackEvent(EVENT_TYPES.MOVIE_WATCHED, { tmdbId: movieId, mediaType });
        }
        onAction?.('watched', r);
    });

    const handleLike = (e) => run(e, 'like', async () => {
        const next = !status.isLiked;
        setStatus((prev) => ({
            ...prev,
            isLiked: next,
            isDisliked: next ? false : prev.isDisliked,
            // Like implies watched.
            isWatched: next ? true : prev.isWatched,
        }));
        const r = await toggleLikedMovie(user.id, movieId, movieTitle, posterPath, mediaType);
        if (!r.success) {
            setStatus((prev) => ({ ...prev, isLiked: !next }));
            return;
        }
        setStatus((prev) => ({
            ...prev,
            isLiked: r.added,
            isDisliked: r.added ? false : prev.isDisliked,
            isWatched: r.added ? true : prev.isWatched,
        }));
        if (r.added) {
            trackEvent(EVENT_TYPES.MOVIE_LIKED, { tmdbId: movieId, mediaType });
            if (!status.isWatched) {
                trackEvent(EVENT_TYPES.MOVIE_WATCHED, { tmdbId: movieId, mediaType });
            }
        }
        onAction?.('like', r);
    });

    const handleDislike = (e) => run(e, 'dislike', async () => {
        // Dislike trains negative taste, hides from recs, and marks watched.
        if (status.isDisliked) {
            onAction?.('dislike', { success: true, added: true });
            return;
        }
        if (status.isLiked) {
            await toggleLikedMovie(user.id, movieId, movieTitle, posterPath, mediaType);
        }
        const watched = await ensureWatchedMovie(user.id, movieId, movieTitle, posterPath, mediaType);
        setStatus((prev) => ({ ...prev, isLiked: false, isDisliked: true, isWatched: true }));
        trackEvent(EVENT_TYPES.MOVIE_DISLIKED, { tmdbId: movieId, mediaType });
        if (watched.added) {
            trackEvent(EVENT_TYPES.MOVIE_WATCHED, { tmdbId: movieId, mediaType });
        }
        onAction?.('dislike', { success: true, added: true });
    });

    if (!loaded && !isAuthenticated) {
        // Still show buttons so guests get auth redirect on tap.
    }

    const isInline = variant === 'inline';
    const btnSize = isInline ? 'lg' : 'sm';
    const iconClass = isInline ? 'text-sm sm:text-base' : 'text-[11px] sm:text-xs';
    const wrapClass = isInline
        ? `pointer-events-auto relative z-20 flex items-center gap-2 ${className}`
        : `pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-1 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-1 pb-1.5 pt-8 sm:gap-1.5 sm:pb-2.5 ${className}`;

    return (
        <div
            className={wrapClass}
            onClick={stop}
            onKeyDown={stop}
            role="group"
            aria-label="Quick movie actions"
        >
            <ActionBtn
                label={status.inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                active={status.inWatchlist}
                activeClass="text-yellow-400"
                busy={busy === 'watchlist'}
                onClick={handleWatchlist}
                size={btnSize}
            >
                <FaBookmark className={iconClass} />
            </ActionBtn>
            <ActionBtn
                label={status.isWatched ? 'Unmark watched' : 'Mark watched'}
                active={status.isWatched}
                activeClass="text-emerald-400"
                busy={busy === 'watched'}
                onClick={handleWatched}
                size={btnSize}
            >
                <FaEye className={iconClass} />
            </ActionBtn>
            <ActionBtn
                label={status.isLiked ? 'Unlike' : 'Like'}
                active={status.isLiked}
                activeClass="text-red-400"
                busy={busy === 'like'}
                onClick={handleLike}
                size={btnSize}
            >
                <FaHeart className={iconClass} />
            </ActionBtn>
            <ActionBtn
                label={status.isDisliked ? 'Disliked' : 'Dislike'}
                active={status.isDisliked}
                activeClass="text-orange-400"
                busy={busy === 'dislike'}
                onClick={handleDislike}
                size={btnSize}
            >
                <FaThumbsDown className={iconClass} />
            </ActionBtn>
        </div>
    );
}
