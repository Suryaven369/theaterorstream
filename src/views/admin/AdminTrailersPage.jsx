import React, { useState, useEffect, useCallback } from "react";
import { FaPlay, FaTrash, FaToggleOn, FaToggleOff, FaGripVertical, FaSync, FaSearch } from "react-icons/fa";
import { getTrailersFromEdge } from "../../lib/contentEdgeApi";
import tmdbApi from "../../lib/tmdbApi";
import {
    getShowcaseTrailers,
    createShowcaseTrailer,
    deleteShowcaseTrailer,
    toggleShowcaseTrailerActive,
    reorderShowcaseTrailers,
    saveFullMovieToLibrary,
} from "../../lib/supabase";

const FULL_APPEND = "credits,videos,images,release_dates,keywords,reviews,similar,recommendations";

const SORT_TABS = [
    { key: "recent", label: "Latest" },
    { key: "popular", label: "Popular" },
    { key: "trending", label: "Trending" },
];

const DAYS_BACK_OPTIONS = [
    { value: 1, label: "Last 24 hours" },
    { value: 3, label: "Last 3 days" },
    { value: 7, label: "Last 7 days" },
    { value: 14, label: "Last 14 days" },
    { value: 21, label: "Last 21 days" },
    { value: 30, label: "Last 30 days" },
    { value: 0, label: "All time" },
];

const CandidateCard = ({ item, alreadyShowcased, onAdd, adding }) => {
    const trailer = item.featured_trailer;
    const year = (item.release_date || item.first_air_date || "").split("-")[0];

    return (
        <div className="bg-[#1a1a1a] rounded-xl border border-white/10 overflow-hidden">
            <div className="relative aspect-video bg-black">
                <img
                    src={trailer?.thumbnail}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                        if (trailer?.thumbnailFallback && e.currentTarget.src !== trailer.thumbnailFallback) {
                            e.currentTarget.src = trailer.thumbnailFallback;
                        }
                    }}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <FaPlay className="text-white/80 text-2xl" />
                </div>
            </div>
            <div className="p-3">
                <p className="text-sm font-semibold text-white truncate">{item.title}</p>
                <p className="text-[11px] text-white/40 mt-0.5">
                    {year} &middot; {item.media_type === "tv" ? "TV" : "Movie"} &middot; {trailer?.name || "Trailer"}
                </p>
                <p className="text-[10px] text-white/30 mt-1">
                    Published {trailer?.published_at ? new Date(trailer.published_at).toLocaleDateString() : "—"}
                </p>
                <button
                    onClick={() => onAdd(item)}
                    disabled={alreadyShowcased || adding}
                    className={`mt-2 w-full text-xs font-medium py-1.5 rounded-lg transition-colors ${
                        alreadyShowcased
                            ? "bg-white/5 text-white/30 cursor-not-allowed"
                            : "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
                    }`}
                >
                    {alreadyShowcased ? "Already showcased" : adding ? "Adding…" : "+ Add to Showcase"}
                </button>
            </div>
        </div>
    );
};

const ShowcaseRow = ({ item, index, onToggle, onDelete, onDragStart, onDragOver, onDrop, dragging }) => {
    return (
        <div
            draggable
            onDragStart={() => onDragStart(index)}
            onDragOver={(e) => { e.preventDefault(); onDragOver(index); }}
            onDrop={() => onDrop(index)}
            className={`flex items-center gap-3 p-3 rounded-xl bg-[#1a1a1a] border ${
                dragging ? "border-orange-500/50" : "border-white/10"
            } cursor-move`}
        >
            <FaGripVertical className="text-white/20 shrink-0" />
            <img
                src={item.thumbnail_url}
                alt={item.title}
                className="w-20 h-12 object-cover rounded-lg bg-black shrink-0"
                onError={(e) => {
                    if (item.thumbnail_fallback_url && e.currentTarget.src !== item.thumbnail_fallback_url) {
                        e.currentTarget.src = item.thumbnail_fallback_url;
                    }
                }}
            />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{item.title}</p>
                <p className="text-[11px] text-white/40 truncate">
                    {item.category} &middot; {item.media_type === "tv" ? "TV" : "Movie"}
                </p>
            </div>
            <span className={`text-[10px] px-2 py-1 rounded-full shrink-0 ${item.is_active ? "bg-green-500/20 text-green-400" : "bg-white/5 text-white/40"}`}>
                {item.is_active ? "Live" : "Hidden"}
            </span>
            <button
                onClick={() => onToggle(item)}
                className="text-white/50 hover:text-white shrink-0"
                title={item.is_active ? "Hide from feed" : "Show on feed"}
            >
                {item.is_active ? <FaToggleOn className="text-xl text-green-400" /> : <FaToggleOff className="text-xl" />}
            </button>
            <button
                onClick={() => onDelete(item)}
                className="text-white/40 hover:text-red-400 shrink-0"
                title="Remove"
            >
                <FaTrash />
            </button>
        </div>
    );
};

const AdminTrailersPage = () => {
    const [sortBy, setSortBy] = useState("recent");
    const [daysBack, setDaysBack] = useState(21);
    const [candidates, setCandidates] = useState([]);
    const [loadingCandidates, setLoadingCandidates] = useState(false);
    const [showcased, setShowcased] = useState([]);
    const [loadingShowcase, setLoadingShowcase] = useState(true);
    const [addingKey, setAddingKey] = useState(null);
    const [dragIndex, setDragIndex] = useState(null);
    const [overIndex, setOverIndex] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [syncingId, setSyncingId] = useState(null);
    const [syncMessage, setSyncMessage] = useState(null);

    const loadShowcase = useCallback(async () => {
        setLoadingShowcase(true);
        const data = await getShowcaseTrailers(false);
        setShowcased(data);
        setLoadingShowcase(false);
    }, []);

    const loadCandidates = useCallback(async (sort, days) => {
        setLoadingCandidates(true);
        try {
            const res = await getTrailersFromEdge({ limit: 24, daysBack: days, sortBy: sort });
            setCandidates(res.data || []);
        } catch (err) {
            console.error("Failed to load trailer candidates:", err);
            setCandidates([]);
        }
        setLoadingCandidates(false);
    }, []);

    useEffect(() => { loadShowcase(); }, [loadShowcase]);
    useEffect(() => { loadCandidates(sortBy, daysBack); }, [sortBy, daysBack, loadCandidates]);

    const isShowcased = (item) =>
        showcased.some((s) => s.tmdb_id === String(item.tmdb_id) && s.trailer_key === item.featured_trailer?.key);

    const handleAdd = async (item) => {
        const trailer = item.featured_trailer;
        if (!trailer?.key) return;
        const key = `${item.tmdb_id}-${trailer.key}`;
        setAddingKey(key);
        const result = await createShowcaseTrailer({
            tmdb_id: item.tmdb_id,
            media_type: item.media_type,
            title: item.title,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            release_date: item.release_date || item.first_air_date,
            trailer_key: trailer.key,
            trailer_name: trailer.name,
            trailer_published_at: trailer.published_at,
            youtube_url: trailer.url,
            thumbnail_url: trailer.thumbnail,
            thumbnail_fallback_url: trailer.thumbnailFallback,
            category: sortBy === "recent" ? "latest" : sortBy,
        });
        setAddingKey(null);
        if (result.success) {
            loadShowcase();
        } else {
            alert(`Failed to add trailer: ${result.error?.message || "Unknown error"}`);
        }
    };

    const handleToggle = async (item) => {
        await toggleShowcaseTrailerActive(item.id);
        loadShowcase();
    };

    const handleDelete = async (item) => {
        if (!confirm(`Remove "${item.title}" from the showcase?`)) return;
        await deleteShowcaseTrailer(item.id);
        loadShowcase();
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        const query = searchQuery.trim();
        if (!query) return;
        setSearching(true);
        setSyncMessage(null);
        try {
            const { data } = await tmdbApi.get("/search/multi", { params: { query } });
            const results = (data?.results || []).filter(
                (r) => (r.media_type === "movie" || r.media_type === "tv") && (r.title || r.name)
            );
            setSearchResults(results.slice(0, 8));
        } catch (err) {
            console.error("TMDB search failed:", err);
            setSyncMessage({ type: "error", text: "Search failed. Check the TMDB proxy." });
        }
        setSearching(false);
    };

    const handleSyncFromTmdb = async (result) => {
        setSyncingId(result.id);
        setSyncMessage(null);
        try {
            const mediaType = result.media_type === "tv" ? "tv" : "movie";
            const endpoint = mediaType === "tv" ? `/tv/${result.id}` : `/movie/${result.id}`;
            const { data: fullData } = await tmdbApi.get(endpoint, {
                params: { append_to_response: FULL_APPEND },
            });
            const saveResult = await saveFullMovieToLibrary(fullData, { media_type: mediaType });
            if (!saveResult.success) {
                throw new Error(saveResult.error?.message || "Save failed");
            }
            const trailerCount = (fullData.videos?.results || []).filter(
                (v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")
            ).length;
            setSyncMessage({
                type: "success",
                text: `Synced "${fullData.title || fullData.name}" from TMDB — ${trailerCount} trailer/teaser video${trailerCount === 1 ? "" : "s"} now in the library.`,
            });
            loadCandidates(sortBy, daysBack);
        } catch (err) {
            console.error("Failed to sync from TMDB:", err);
            setSyncMessage({ type: "error", text: `Failed to sync: ${err.message || "Unknown error"}` });
        }
        setSyncingId(null);
    };

    const handleDragStart = (index) => setDragIndex(index);
    const handleDragOver = (index) => setOverIndex(index);
    const handleDrop = async (index) => {
        if (dragIndex === null || dragIndex === index) {
            setDragIndex(null);
            setOverIndex(null);
            return;
        }
        const reordered = [...showcased];
        const [moved] = reordered.splice(dragIndex, 1);
        reordered.splice(index, 0, moved);
        setShowcased(reordered);
        setDragIndex(null);
        setOverIndex(null);
        await reorderShowcaseTrailers(reordered.map((r) => r.id));
        loadShowcase();
    };

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <div className="mb-6">
                <h1 className="text-xl font-bold text-white">Showcase Trailers</h1>
                <p className="text-sm text-white/40 mt-1">
                    Pick which trailers appear on the Home feed. Only trailers listed under "Showcased" below are
                    ever shown to users — the candidate browser on the left is just a preview of what's available.
                </p>
            </div>

            <div className="mb-6 bg-[#1a1a1a] rounded-xl border border-white/10 p-4">
                <h2 className="text-sm font-semibold text-white/70 mb-1">Sync a movie/show from TMDB</h2>
                <p className="text-xs text-white/40 mb-3">
                    Candidates are scanned from our DB, which only refreshes on scheduled syncs. If a trailer just
                    went live on TMDB and isn't showing up here yet, search for the title and sync it directly —
                    it'll pull the newest videos and appear in the candidates list above immediately.
                </p>
                <form onSubmit={handleSearch} className="flex gap-2">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="e.g. Spider-Man: Brand New Day"
                        className="flex-1 text-sm bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50"
                    />
                    <button
                        type="submit"
                        disabled={searching}
                        className="text-sm px-4 py-2 rounded-md bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 flex items-center gap-2 disabled:opacity-50"
                    >
                        <FaSearch className={searching ? "animate-pulse" : ""} /> Search
                    </button>
                </form>

                {syncMessage && (
                    <p className={`text-xs mt-3 ${syncMessage.type === "error" ? "text-red-400" : "text-green-400"}`}>
                        {syncMessage.text}
                    </p>
                )}

                {searchResults.length > 0 && (
                    <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
                        {searchResults.map((result) => {
                            const year = (result.release_date || result.first_air_date || "").split("-")[0];
                            return (
                                <div
                                    key={`${result.media_type}-${result.id}`}
                                    className="flex items-center gap-3 p-2 rounded-lg bg-white/5"
                                >
                                    {result.poster_path ? (
                                        <img
                                            src={`https://image.tmdb.org/t/p/w92${result.poster_path}`}
                                            alt={result.title || result.name}
                                            className="w-8 h-12 object-cover rounded shrink-0"
                                        />
                                    ) : (
                                        <div className="w-8 h-12 rounded bg-white/10 shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white truncate">{result.title || result.name}</p>
                                        <p className="text-[11px] text-white/40">
                                            {year || "—"} &middot; {result.media_type === "tv" ? "TV" : "Movie"}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleSyncFromTmdb(result)}
                                        disabled={syncingId === result.id}
                                        className="text-xs px-3 py-1.5 rounded-md bg-white/10 text-white/80 hover:bg-white/20 shrink-0 disabled:opacity-50"
                                    >
                                        {syncingId === result.id ? "Syncing…" : "Sync from TMDB"}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Candidates */}
                <div>
                    <div className="flex items-center justify-between mb-3 gap-2">
                        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                            {SORT_TABS.map((tab) => (
                                <button
                                    key={tab.key}
                                    onClick={() => setSortBy(tab.key)}
                                    className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                                        sortBy === tab.key ? "bg-orange-500/20 text-orange-400" : "text-white/50 hover:text-white"
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <select
                                value={daysBack}
                                onChange={(e) => setDaysBack(Number(e.target.value))}
                                className="text-xs bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-white/70 focus:outline-none focus:border-orange-500/50"
                            >
                                {DAYS_BACK_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value} className="bg-[#1a1a1a]">
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={() => loadCandidates(sortBy, daysBack)}
                                className="text-xs text-white/50 hover:text-white flex items-center gap-1.5"
                            >
                                <FaSync className={loadingCandidates ? "animate-spin" : ""} /> Refresh
                            </button>
                        </div>
                    </div>

                    {loadingCandidates ? (
                        <div className="grid grid-cols-2 gap-3">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="aspect-video rounded-xl bg-white/5 animate-pulse" />
                            ))}
                        </div>
                    ) : candidates.length === 0 ? (
                        <p className="text-sm text-white/40 py-8 text-center">No trailer candidates found.</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto pr-1">
                            {candidates.map((item) => (
                                <CandidateCard
                                    key={`${item.tmdb_id}-${item.featured_trailer?.key}`}
                                    item={item}
                                    alreadyShowcased={isShowcased(item)}
                                    adding={addingKey === `${item.tmdb_id}-${item.featured_trailer?.key}`}
                                    onAdd={handleAdd}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Showcased */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-white/70">
                            Showcased ({showcased.length})
                        </h2>
                    </div>

                    {loadingShowcase ? (
                        <div className="space-y-2">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
                            ))}
                        </div>
                    ) : showcased.length === 0 ? (
                        <p className="text-sm text-white/40 py-8 text-center">
                            Nothing showcased yet — add trailers from the candidates list.
                        </p>
                    ) : (
                        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                            {showcased.map((item, index) => (
                                <ShowcaseRow
                                    key={item.id}
                                    item={item}
                                    index={index}
                                    dragging={dragIndex === index || overIndex === index}
                                    onToggle={handleToggle}
                                    onDelete={handleDelete}
                                    onDragStart={handleDragStart}
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminTrailersPage;
