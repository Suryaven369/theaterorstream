import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaBookmark, FaHeart, FaEye, FaFolder, FaPen } from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import {
    getUserMovieStatus,
    toggleWatchlist,
    toggleLikedMovie,
    toggleWatchedMovie,
} from "../lib/supabase";
import QuickLogModal from "./social/QuickLogModal";
import CollectionsModal from "./CollectionsModal";
import { trackEvent, EVENT_TYPES } from "../lib/eventTracking";
import { getUserMovieLogCount } from "../lib/movieDiary";

// Animated Action Button
const ActionButton = ({ icon: Icon, activeIcon: ActiveIcon, label, isActive, onClick, activeColor = "text-red-500", inactiveColor = "text-white/50" }) => {
    const [animating, setAnimating] = useState(false);
    const activeBg = activeColor.replace('text-', 'bg-');

    const handleClick = () => {
        setAnimating(true);
        onClick();
        setTimeout(() => setAnimating(false), 300);
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            className={`group flex flex-col items-center justify-center gap-1 p-2.5 sm:p-2.5 rounded-xl transition-all duration-200 hover:bg-white/5 w-full min-h-[3.5rem] sm:min-h-[3.25rem] touch-manipulation active:scale-[0.98] ${animating ? 'scale-110' : 'scale-100'}`}
            title={label}
        >
            <div className={`relative transition-all duration-200 ${animating ? 'animate-bounce' : ''}`}>
                {isActive && ActiveIcon ? (
                    <ActiveIcon className={`text-lg sm:text-xl ${activeColor} drop-shadow-[0_0_6px_currentColor]`} />
                ) : (
                    <Icon className={`text-lg sm:text-xl transition-colors ${isActive ? `${activeColor} drop-shadow-[0_0_6px_currentColor]` : `${inactiveColor} group-hover:text-white`}`} />
                )}
                {animating && (
                    <span className={`absolute inset-0 rounded-full ${activeBg}/30 animate-ping`} />
                )}
            </div>
            <span className={`text-[10px] sm:text-[11px] font-medium leading-tight text-center whitespace-nowrap ${isActive ? activeColor : 'text-white/40 group-hover:text-white/70'}`}>
                {label}
            </span>
        </button>
    );
};

const MovieActionButtons = ({
    movieId,
    movieTitle,
    posterPath,
    mediaType = 'movie',
    releaseYear = null,
    onDiaryLogged = null,
}) => {
    const navigate = useNavigate();
    const { user, isAuthenticated } = useAuth();
    const [status, setStatus] = useState({ inWatchlist: false, isLiked: false, isWatched: false });
    const [showCollections, setShowCollections] = useState(false);
    const [showLogModal, setShowLogModal] = useState(false);
    const [logIntent, setLogIntent] = useState('log');
    const [hasDiaryLog, setHasDiaryLog] = useState(false);
    const [loading, setLoading] = useState(true);

    const isMovie = mediaType === 'movie';

    useEffect(() => {
        if (user?.id && movieId) {
            loadStatus();
        } else {
            setLoading(false);
        }
    }, [user?.id, movieId, mediaType]);

    const loadStatus = async () => {
        const movieStatus = await getUserMovieStatus(user.id, movieId);
        setStatus(movieStatus);
        if (isMovie) {
            const logCount = await getUserMovieLogCount(user.id, movieId, 'movie');
            setHasDiaryLog(logCount > 0);
        } else {
            setHasDiaryLog(false);
        }
        setLoading(false);
    };

    const handleAuthRequired = () => {
        sessionStorage.setItem('authMessage', 'Please sign up or login to save movies');
        navigate('/auth');
    };

    const handleWatchlist = async () => {
        if (!isAuthenticated) return handleAuthRequired();
        const next = !status.inWatchlist;
        setStatus(prev => ({ ...prev, inWatchlist: next }));
        const result = await toggleWatchlist(user.id, movieId, movieTitle, posterPath, mediaType);
        if (!result.success) {
            setStatus(prev => ({ ...prev, inWatchlist: !next }));
            return;
        }
        setStatus(prev => ({ ...prev, inWatchlist: result.added }));
        trackEvent(
            result.added ? EVENT_TYPES.WATCHLISTED : EVENT_TYPES.WATCHLIST_REMOVED,
            { tmdbId: movieId, mediaType },
        );
    };

    const openLogModal = (intent) => {
        if (!isAuthenticated) return handleAuthRequired();
        if (!isMovie) return;
        setLogIntent(intent);
        setShowLogModal(true);
    };

    const handleLike = async () => {
        if (!isAuthenticated) return handleAuthRequired();
        if (!status.isLiked && isMovie) {
            openLogModal('like');
            return;
        }
        const next = !status.isLiked;
        setStatus((prev) => ({ ...prev, isLiked: next }));
        const result = await toggleLikedMovie(user.id, movieId, movieTitle, posterPath, mediaType);
        if (!result.success) {
            setStatus((prev) => ({ ...prev, isLiked: !next }));
        } else {
            setStatus((prev) => ({ ...prev, isLiked: result.added }));
        }
    };

    const handleWatched = async () => {
        if (!isAuthenticated) return handleAuthRequired();
        if (!status.isWatched && isMovie) {
            openLogModal('watched');
            return;
        }
        const next = !status.isWatched;
        setStatus((prev) => ({ ...prev, isWatched: next }));
        const result = await toggleWatchedMovie(user.id, movieId, movieTitle, posterPath, mediaType);
        if (!result.success) {
            setStatus((prev) => ({ ...prev, isWatched: !next }));
        } else {
            setStatus((prev) => ({ ...prev, isWatched: result.added }));
        }
    };

    const handleLog = () => openLogModal('log');

    const handleSave = () => {
        if (!isAuthenticated) return handleAuthRequired();
        setShowCollections(true);
    };

    if (loading) {
        return (
            <div className="mt-4 space-y-1 rounded-2xl border border-white/10 bg-white/5 p-1.5">
                <div className="grid grid-cols-2 gap-1">
                    <div className="h-14 rounded-xl bg-white/5 animate-pulse" />
                    <div className="h-14 rounded-xl bg-white/5 animate-pulse" />
                </div>
                <div className={`grid gap-1 ${isMovie ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {[...Array(isMovie ? 3 : 2)].map((_, i) => (
                        <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="mt-4 space-y-1 rounded-2xl border border-white/10 bg-white/5 p-1.5">
                <div className="grid grid-cols-2 gap-1">
                    <ActionButton
                        icon={FaBookmark}
                        label="Watchlist"
                        isActive={status.inWatchlist}
                        onClick={handleWatchlist}
                        activeColor="text-yellow-400"
                    />
                    <ActionButton
                        icon={FaEye}
                        label="Watched"
                        isActive={status.isWatched}
                        onClick={handleWatched}
                        activeColor="text-green-400"
                    />
                </div>
                <div className={`grid gap-1 ${isMovie ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <ActionButton
                        icon={FaHeart}
                        label="Like"
                        isActive={status.isLiked}
                        onClick={handleLike}
                        activeColor="text-red-500"
                    />
                    {isMovie && (
                        <ActionButton
                            icon={FaPen}
                            label="Log"
                            isActive={hasDiaryLog}
                            onClick={handleLog}
                            activeColor="text-[var(--accent-green)]"
                            inactiveColor="text-white/55"
                        />
                    )}
                    <ActionButton
                        icon={FaFolder}
                        label="Save"
                        isActive={false}
                        onClick={handleSave}
                        activeColor="text-purple-400"
                    />
                </div>
            </div>

            <CollectionsModal
                isOpen={showCollections}
                onClose={() => setShowCollections(false)}
                movieId={movieId}
                movieTitle={movieTitle}
                posterPath={posterPath}
                mediaType={mediaType}
                userId={user?.id}
            />

            {isMovie && (
                <QuickLogModal
                    isOpen={showLogModal}
                    onClose={() => setShowLogModal(false)}
                    userId={user?.id}
                    releaseYear={releaseYear}
                    intent={logIntent}
                    movie={{
                        tmdb_id: movieId,
                        title: movieTitle,
                        poster_path: posterPath,
                        media_type: 'movie',
                    }}
                    onLogged={() => {
                        setHasDiaryLog(true);
                        setStatus((prev) => ({
                            ...prev,
                            isWatched: true,
                            isLiked: logIntent === 'like' ? true : prev.isLiked,
                        }));
                        onDiaryLogged?.();
                    }}
                />
            )}
        </>
    );
};

export default MovieActionButtons;
