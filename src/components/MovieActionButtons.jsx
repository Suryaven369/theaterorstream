import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaBookmark, FaHeart, FaEye, FaFolder } from "react-icons/fa";
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
            onClick={handleClick}
            className={`group flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-200 hover:bg-white/5 ${animating ? 'scale-110' : 'scale-100'}`}
            title={label}
        >
            <div className={`relative transition-all duration-200 ${animating ? 'animate-bounce' : ''}`}>
                {isActive && ActiveIcon ? (
                    <ActiveIcon className={`text-xl ${activeColor} drop-shadow-[0_0_6px_currentColor]`} />
                ) : (
                    <Icon className={`text-xl ${isActive ? `${activeColor} drop-shadow-[0_0_6px_currentColor]` : inactiveColor} group-hover:text-white transition-colors`} />
                )}
                {/* Micro animation pulse */}
                {animating && (
                    <span className={`absolute inset-0 rounded-full ${activeBg}/30 animate-ping`} />
                )}
            </div>
            <span className={`text-[10px] font-medium transition-colors ${isActive ? activeColor : 'text-white/40 group-hover:text-white/70'}`}>
                {label}
            </span>
        </button>
    );
};

// Main MovieActionButtons Component
const MovieActionButtons = ({ movieId, movieTitle, posterPath, mediaType = 'movie' }) => {
    const navigate = useNavigate();
    const { user, isAuthenticated } = useAuth();
    const [status, setStatus] = useState({ inWatchlist: false, isLiked: false, isWatched: false });
    const [showCollections, setShowCollections] = useState(false);
    const [showLogModal, setShowLogModal] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user?.id && movieId) {
            loadStatus();
        } else {
            setLoading(false);
        }
    }, [user?.id, movieId]);

    const loadStatus = async () => {
        const movieStatus = await getUserMovieStatus(user.id, movieId);
        setStatus(movieStatus);
        setLoading(false);
    };

    const handleAuthRequired = () => {
        sessionStorage.setItem('authMessage', 'Please sign up or login to save movies');
        navigate('/auth');
    };

    const handleWatchlist = async () => {
        if (!isAuthenticated) return handleAuthRequired();
        // Optimistic: light up instantly, revert if the save fails.
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

    const handleLike = async () => {
        if (!isAuthenticated) return handleAuthRequired();
        const next = !status.isLiked;
        setStatus(prev => ({ ...prev, isLiked: next }));
        const result = await toggleLikedMovie(user.id, movieId, movieTitle, posterPath, mediaType);
        if (!result.success) {
            setStatus(prev => ({ ...prev, isLiked: !next }));
            return;
        }
        setStatus(prev => ({ ...prev, isLiked: result.added }));
        // Unlike is not a dislike — only an explicit dislike should train negative taste.
        if (result.added) {
            trackEvent(EVENT_TYPES.MOVIE_LIKED, { tmdbId: movieId, mediaType });
        }
    };

    const handleWatched = async () => {
        if (!isAuthenticated) return handleAuthRequired();
        if (status.isWatched) {
            const result = await toggleWatchedMovie(user.id, movieId, movieTitle, posterPath, mediaType);
            if (result.success) {
                setStatus((prev) => ({ ...prev, isWatched: false }));
            }
            return;
        }
        setShowLogModal(true);
    };

    const handleSave = () => {
        if (!isAuthenticated) return handleAuthRequired();
        setShowCollections(true);
    };

    if (loading) {
        return (
            <div className="flex justify-center gap-2 mt-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="w-14 h-14 rounded-xl bg-white/5 animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <>
            <div className="flex justify-center gap-1 mt-4 bg-white/5 rounded-2xl p-1 border border-white/10">
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
                <ActionButton
                    icon={FaHeart}
                    label="Like"
                    isActive={status.isLiked}
                    onClick={handleLike}
                    activeColor="text-red-500"
                />
                <ActionButton
                    icon={FaFolder}
                    label="Save"
                    isActive={false}
                    onClick={handleSave}
                    activeColor="text-purple-400"
                />
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

            <QuickLogModal
                isOpen={showLogModal}
                onClose={() => setShowLogModal(false)}
                userId={user?.id}
                movie={{
                    tmdb_id: movieId,
                    title: movieTitle,
                    poster_path: posterPath,
                    media_type: mediaType,
                }}
                onLogged={() => {
                    setStatus((prev) => ({ ...prev, isWatched: true }));
                    // Seen ≠ loved: busts reco cache; does not train taste genres.
                    trackEvent(EVENT_TYPES.MOVIE_WATCHED, { tmdbId: movieId, mediaType });
                }}
            />
        </>
    );
};

export default MovieActionButtons;
