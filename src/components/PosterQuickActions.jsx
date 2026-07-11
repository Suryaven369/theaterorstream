import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FaEllipsisV, FaBookmark, FaHeart, FaFolderPlus } from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { toggleWatchlist, toggleLikedMovie } from "../lib/supabase";
import { trackEvent, EVENT_TYPES } from "../lib/eventTracking";
import CollectionsModal from "./CollectionsModal";

const MenuItem = ({ icon: Icon, label, busy, onClick }) => (
    <button
        onClick={onClick}
        disabled={busy}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
    >
        <Icon className="text-xs shrink-0" />
        <span>{label}</span>
    </button>
);

/**
 * Three-dots quick menu overlaid on a poster: add to Watchlist, Favorite, or a
 * Collection/List — without leaving the grid. Stops click propagation so it
 * never triggers the surrounding poster <Link>.
 */
const PosterQuickActions = ({ movieId, movieTitle, posterPath, mediaType = "movie" }) => {
    const navigate = useNavigate();
    const { user, isAuthenticated } = useAuth();
    const [open, setOpen] = useState(false);
    const [showCollections, setShowCollections] = useState(false);
    const [busy, setBusy] = useState(null);
    const [toast, setToast] = useState(null);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [open]);

    // Keep clicks inside the menu from bubbling to the poster link / navigating.
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

    const requireAuth = () => {
        sessionStorage.setItem("authMessage", "Please sign up or login to save movies");
        navigate("/auth");
    };

    const toggleMenu = (e) => {
        stop(e);
        if (!isAuthenticated) return requireAuth();
        setOpen((o) => !o);
    };

    const flash = (msg) => {
        setToast(msg);
        setTimeout(() => { setOpen(false); setToast(null); }, 750);
    };

    const handleWatchlist = async (e) => {
        stop(e);
        setBusy("watchlist");
        const r = await toggleWatchlist(user.id, movieId, movieTitle, posterPath, mediaType);
        setBusy(null);
        if (r.success) {
            trackEvent(r.added ? EVENT_TYPES.WATCHLISTED : EVENT_TYPES.WATCHLIST_REMOVED, { tmdbId: movieId, mediaType });
            flash(r.added ? "Added to Watchlist" : "Removed from Watchlist");
        }
    };

    const handleFavorite = async (e) => {
        stop(e);
        setBusy("fav");
        const r = await toggleLikedMovie(user.id, movieId, movieTitle, posterPath, mediaType);
        setBusy(null);
        if (r.success) {
            trackEvent(r.added ? EVENT_TYPES.MOVIE_LIKED : EVENT_TYPES.MOVIE_DISLIKED, { tmdbId: movieId, mediaType });
            flash(r.added ? "Added to Favorites" : "Removed from Favorites");
        }
    };

    const openCollections = (e) => {
        stop(e);
        setOpen(false);
        setShowCollections(true);
    };

    return (
        <div ref={ref} onClick={stop}>
            <button
                onClick={toggleMenu}
                title="Add to…"
                aria-label="Add to watchlist, favorites or collection"
                className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-white/90 hover:bg-black/80 transition-colors"
            >
                <FaEllipsisV className="text-xs" />
            </button>

            {open && (
                <div className="absolute left-0 mt-1 w-48 rounded-xl bg-[#1c1f22] border border-white/10 shadow-2xl overflow-hidden z-30 animate-fadeInUp">
                    {toast ? (
                        <div className="px-3 py-3 text-sm text-green-400 text-center">✓ {toast}</div>
                    ) : (
                        <>
                            <MenuItem icon={FaBookmark} label="Watchlist" busy={busy === "watchlist"} onClick={handleWatchlist} />
                            <MenuItem icon={FaHeart} label="Favorite" busy={busy === "fav"} onClick={handleFavorite} />
                            <MenuItem icon={FaFolderPlus} label="Add to Collection" onClick={openCollections} />
                        </>
                    )}
                </div>
            )}

            <CollectionsModal
                isOpen={showCollections}
                onClose={() => setShowCollections(false)}
                movieId={movieId}
                movieTitle={movieTitle}
                posterPath={posterPath}
                mediaType={mediaType}
                userId={user?.id}
            />
        </div>
    );
};

export default PosterQuickActions;
