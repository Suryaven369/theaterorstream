import React, { useState, useEffect, useRef } from "react";
import { FaArrowLeft } from "react-icons/fa";
import { searchContentFromEdge } from "../lib/contentEdgeApi";
import { resolveTmdbImageUrl } from "../utils/imageHelper";

const SIZE_OPTIONS = [
    { key: "sm", label: "Small" },
    { key: "md", label: "Medium" },
    { key: "lg", label: "Large" },
    { key: "none", label: "No image" },
];

const PREVIEW_TMDB_SIZE = { sm: "w92", md: "w185", lg: "w342", none: "w92" };
const PREVIEW_BOX_CLASS = {
    sm: "w-10 h-14",
    md: "w-16 h-24",
    lg: "w-24 h-36",
    none: "w-10 h-14",
};

/**
 * Dropdown shown while a "/" mention trigger is active in a post/blog composer.
 * Two steps: search & pick a title, then choose how its poster should appear
 * (or remove the poster entirely, keeping just a text + link chip).
 */
const MovieMentionPicker = ({ query, onInsert, onClose }) => {
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [picked, setPicked] = useState(null);
    const [size, setSize] = useState("sm");
    const debounceRef = useRef(null);

    useEffect(() => {
        clearTimeout(debounceRef.current);
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            setResults([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const res = await searchContentFromEdge(trimmed, { limit: 6 });
                setResults(res?.data || []);
            } catch {
                setResults([]);
            }
            setLoading(false);
        }, 250);
        return () => clearTimeout(debounceRef.current);
    }, [query]);

    if (picked) {
        const posterUrl = resolveTmdbImageUrl(picked.poster_path, { size: PREVIEW_TMDB_SIZE[size] });
        return (
            <div
                // Keeps focus on the composer's editable area while the user clicks
                // around inside the picker — losing focus mid-flow would blur the
                // editor and tear down this whole dropdown before "Insert" runs.
                onMouseDown={(e) => e.preventDefault()}
                className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
                    <button type="button" onClick={() => setPicked(null)} className="text-white/40 hover:text-white">
                        <FaArrowLeft className="text-xs" />
                    </button>
                    <span className="text-[11px] text-white/40 flex-1 truncate">{picked.title}</span>
                    <button type="button" onClick={onClose} className="text-white/30 hover:text-white text-xs">
                        Esc
                    </button>
                </div>

                <div className="p-3 flex gap-3 items-start">
                    <div className={`${PREVIEW_BOX_CLASS[size]} shrink-0 rounded-lg bg-black/40 overflow-hidden flex items-center justify-center border border-white/10`}>
                        {size !== "none" && posterUrl ? (
                            <img src={posterUrl} alt={picked.title} className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-xl">🎬</span>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{picked.title}</p>
                        <p className="text-[11px] text-white/40 mb-2">
                            {(picked.release_date || "").split("-")[0] || "—"} &middot; {picked.media_type === "tv" ? "TV" : "Movie"}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {SIZE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.key}
                                    type="button"
                                    onClick={() => setSize(opt.key)}
                                    className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                                        size === opt.key
                                            ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                                            : "bg-white/5 border-white/10 text-white/50 hover:text-white"
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 px-3 py-2 border-t border-white/10">
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onInsert(picked, { size })}
                        className="text-xs px-3 py-1.5 rounded-md bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 font-medium"
                    >
                        Insert
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            onMouseDown={(e) => e.preventDefault()}
            className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
        >
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                <span className="text-[11px] text-white/40">
                    {query.trim() ? `Searching for "${query.trim()}"` : "Search a movie or show…"}
                </span>
                <button type="button" onClick={onClose} className="text-white/30 hover:text-white text-xs">
                    Esc
                </button>
            </div>

            {query.trim().length > 0 && query.trim().length < 2 ? (
                <div className="p-3 text-xs text-white/40">Keep typing to search…</div>
            ) : loading ? (
                <div className="p-3 text-xs text-white/40">Searching…</div>
            ) : results.length === 0 ? (
                <div className="p-3 text-xs text-white/40">
                    {query.trim() ? "No matches found." : "Type a title to search."}
                </div>
            ) : (
                <div className="max-h-64 overflow-y-auto">
                    {results.map((movie) => (
                        <button
                            key={`${movie.media_type}-${movie.tmdb_id}`}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setPicked(movie)}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 text-left transition-colors"
                        >
                            <img
                                src={resolveTmdbImageUrl(movie.poster_path, { size: "w92" }) || ""}
                                alt={movie.title}
                                className="w-8 h-12 object-cover rounded bg-black shrink-0"
                                onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                            />
                            <div className="min-w-0">
                                <p className="text-sm text-white truncate">{movie.title}</p>
                                <p className="text-[11px] text-white/40">
                                    {(movie.release_date || "").split("-")[0] || "—"} &middot; {movie.media_type === "tv" ? "TV" : "Movie"}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MovieMentionPicker;
