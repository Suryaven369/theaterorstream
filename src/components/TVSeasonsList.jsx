import React, { useState, useEffect } from "react";
import { FaEye, FaRegEye } from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { useToast } from "./Toast";
import { getUserWatchedSeasons, toggleSeasonWatched } from "../lib/movieDiary";
import { resolveTmdbImageUrl } from "../utils/imageHelper";

/**
 * "Seasons" grid on a TV show's detail page. Each card's eye icon is a one-click
 * watched marker — toggling it on creates a public activity-feed/home-feed entry
 * ("Watched Season N of <Show>"); toggling it off removes that entry again.
 */
const TVSeasonsList = ({ tmdbId, title, seasons }) => {
    const { user, isAuthenticated } = useAuth();
    const toast = useToast();
    const [watchedSeasons, setWatchedSeasons] = useState(new Set());
    const [togglingSeason, setTogglingSeason] = useState(null);

    useEffect(() => {
        if (!isAuthenticated || !user?.id || !tmdbId) return;
        getUserWatchedSeasons(user.id, tmdbId).then((nums) => setWatchedSeasons(new Set(nums)));
    }, [isAuthenticated, user?.id, tmdbId]);

    if (!seasons?.length) return null;

    const realSeasons = seasons.filter((s) => s.season_number != null).sort((a, b) => a.season_number - b.season_number);
    if (!realSeasons.length) return null;

    const handleToggle = async (season) => {
        if (!isAuthenticated || !user?.id) {
            toast.info("Sign in to mark seasons as watched.");
            return;
        }
        if (togglingSeason === season.season_number) return;

        const wasWatched = watchedSeasons.has(season.season_number);
        setTogglingSeason(season.season_number);

        // Optimistic update — revert if the request fails.
        setWatchedSeasons((prev) => {
            const next = new Set(prev);
            if (wasWatched) next.delete(season.season_number);
            else next.add(season.season_number);
            return next;
        });

        const result = await toggleSeasonWatched(user.id, {
            tmdbId,
            seasonNumber: season.season_number,
            seasonName: season.name || `Season ${season.season_number}`,
            title,
            posterPath: season.poster_path,
        });

        if (!result.success) {
            setWatchedSeasons((prev) => {
                const next = new Set(prev);
                if (wasWatched) next.add(season.season_number);
                else next.delete(season.season_number);
                return next;
            });
            toast.error("Couldn't update watched status. Try again.");
        } else {
            toast.success(result.watched ? `Marked "${season.name || `Season ${season.season_number}`}" as watched` : "Unmarked as watched");
        }
        setTogglingSeason(null);
    };

    return (
        <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-3">Seasons</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
                {realSeasons.map((season) => {
                    const watched = watchedSeasons.has(season.season_number);
                    const year = (season.air_date || "").split("-")[0];
                    return (
                        <div
                            key={season.id || season.season_number}
                            className="bg-white/5 rounded-lg border border-white/10 overflow-hidden hover:border-white/20 transition-colors"
                        >
                            <div className="relative aspect-[2/3] bg-black/40">
                                {season.poster_path ? (
                                    <img
                                        src={resolveTmdbImageUrl(season.poster_path, { size: "w500" })}
                                        alt={season.name}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/20 text-xl">🎬</div>
                                )}
                                <button
                                    type="button"
                                    onClick={() => handleToggle(season)}
                                    disabled={togglingSeason === season.season_number}
                                    title={watched ? "Mark as not watched" : "Mark as watched"}
                                    className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 ${
                                        watched
                                            ? "bg-[var(--accent-green)] text-black"
                                            : "bg-black/60 text-white hover:bg-black/80"
                                    }`}
                                >
                                    {watched ? <FaEye className="text-[11px]" /> : <FaRegEye className="text-[11px]" />}
                                </button>
                            </div>
                            <div className="p-1.5">
                                <p className="text-[11px] font-semibold text-white truncate">{season.name || `Season ${season.season_number}`}</p>
                                <p className="text-[10px] text-white/40 mt-0.5 truncate">
                                    {year || "—"} &middot; {season.episode_count || 0} Ep
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TVSeasonsList;
