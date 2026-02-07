import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
    supabase,
    searchMoviesLibrary,
    getMoviesLibrary,
    updateMovieInLibrary,
    getCollections,
} from "../../lib/supabase";
import { useToast } from "../../components/Toast";

const VIBE_CATEGORIES = [
    { key: "emotional", label: "Emotional", emoji: "😢", color: "#3b82f6" },
    { key: "thrilling", label: "Thrilling", emoji: "😱", color: "#ef4444" },
    { key: "funny", label: "Funny", emoji: "😂", color: "#eab308" },
    { key: "romantic", label: "Romantic", emoji: "💕", color: "#ec4899" },
    { key: "thoughtful", label: "Thoughtful", emoji: "🤔", color: "#a855f7" },
    { key: "intense", label: "Intense", emoji: "🔥", color: "#f97316" },
];

const PARENT_GUIDE_CATEGORIES = [
    { key: "violence", label: "Violence", emoji: "💀" },
    { key: "nudity", label: "Sex/Nudity", emoji: "❤️" },
    { key: "profanity", label: "Profanity", emoji: "🔇" },
    { key: "frightening", label: "Frightening", emoji: "⚠️" },
];

const SEVERITY_LEVELS = ["none", "mild", "moderate", "severe"];

const SEVERITY_COLORS = {
    none: "bg-green-500/20 text-green-400 border-green-500/30",
    mild: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    moderate: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    severe: "bg-red-500/20 text-red-400 border-red-500/30",
};

const DISPLAY_SECTION_OPTIONS = [
    "home_banner",
    "home_trending",
    "home_now_playing",
    "home_featured",
    "browse_recommended",
];

const AdminMovieEditorPage = () => {
    const toast = useToast();

    // Search & selection
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedMovie, setSelectedMovie] = useState(null);

    // Editor sub-tabs
    const [editorTab, setEditorTab] = useState("overview");

    // Form state (loaded from selected movie)
    const [form, setForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Collections
    const [collections, setCollections] = useState([]);

    // Streaming platform form
    const [newPlatform, setNewPlatform] = useState({ name: "", url: "" });

    // Load collections on mount
    useEffect(() => {
        const load = async () => {
            const cols = await getCollections();
            setCollections(cols || []);
        };
        load();
    }, []);

    // Search handler
    const handleSearch = useCallback(async (query) => {
        if (!query || query.length < 2) {
            setSearchResults([]);
            return;
        }
        setSearchLoading(true);
        try {
            const results = await searchMoviesLibrary(query);
            setSearchResults(results || []);
        } catch (err) {
            console.error("Search error:", err);
        }
        setSearchLoading(false);
    }, []);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => handleSearch(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery, handleSearch]);

    // Select a movie to edit
    const selectMovie = (movie) => {
        setSelectedMovie(movie);
        setForm({
            title: movie.title || "",
            overview: movie.overview || "",
            release_date: movie.release_date || "",
            certification: movie.certification || "",
            priority: movie.priority || 0,
            admin_notes: movie.admin_notes || "",
            editor_review: movie.editor_review || "",
            editor_rating: movie.editor_rating || "",
            collection_tags: movie.collection_tags || [],
            display_sections: movie.display_sections || [],
            streaming_platforms: movie.streaming_platforms || [],
            custom_vibes: movie.custom_vibes || {},
            custom_parent_guide: movie.custom_parent_guide || {},
            featured: movie.featured || false,
            is_active: movie.is_active !== false,
        });
        setEditorTab("overview");
        setHasChanges(false);
        setSearchQuery("");
        setSearchResults([]);
    };

    // Update form field
    const updateField = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    // Vibe change - auto-distributes remaining to sum to 100
    const handleVibeChange = (key, rawValue) => {
        const newVal = Math.max(0, Math.min(100, parseInt(rawValue) || 0));
        setForm((prev) => {
            const current = { ...prev.custom_vibes };
            const otherKeys = VIBE_CATEGORIES.map(c => c.key).filter(k => k !== key);
            const otherTotal = otherKeys.reduce((sum, k) => sum + (current[k] || 0), 0);
            const remaining = 100 - newVal;

            const updated = { [key]: newVal };
            if (otherTotal === 0) {
                // Distribute remaining equally among others
                const each = Math.floor(remaining / otherKeys.length);
                const leftover = remaining - each * otherKeys.length;
                otherKeys.forEach((k, i) => {
                    updated[k] = each + (i < leftover ? 1 : 0);
                });
            } else {
                // Scale others proportionally to fit remaining
                otherKeys.forEach(k => {
                    updated[k] = Math.round(((current[k] || 0) / otherTotal) * remaining);
                });
                // Fix rounding drift
                const actualSum = Object.values(updated).reduce((a, b) => a + b, 0);
                const drift = 100 - actualSum;
                if (drift !== 0) {
                    // Add drift to the largest "other" key
                    const largest = otherKeys.reduce((a, b) => (updated[a] >= updated[b] ? a : b));
                    updated[largest] = Math.max(0, updated[largest] + drift);
                }
            }

            return { ...prev, custom_vibes: updated };
        });
        setHasChanges(true);
    };

    // Parent guide change
    const handleParentGuideChange = (key, value) => {
        setForm((prev) => ({
            ...prev,
            custom_parent_guide: { ...prev.custom_parent_guide, [key]: value },
        }));
        setHasChanges(true);
    };

    // Collection toggle
    const handleCollectionToggle = (slug) => {
        const current = form.collection_tags || [];
        const updated = current.includes(slug)
            ? current.filter((t) => t !== slug)
            : [...current, slug];
        updateField("collection_tags", updated);
    };

    // Display section toggle
    const handleDisplayToggle = (section) => {
        const current = form.display_sections || [];
        const updated = current.includes(section)
            ? current.filter((s) => s !== section)
            : [...current, section];
        updateField("display_sections", updated);
    };

    // Streaming platforms
    const addPlatform = () => {
        if (newPlatform.name) {
            updateField("streaming_platforms", [
                ...(form.streaming_platforms || []),
                newPlatform,
            ]);
            setNewPlatform({ name: "", url: "" });
        }
    };

    const removePlatform = (index) => {
        const platforms = [...(form.streaming_platforms || [])];
        platforms.splice(index, 1);
        updateField("streaming_platforms", platforms);
    };

    // Save all changes
    const handleSave = async () => {
        if (!selectedMovie?.tmdb_id) return;
        setSaving(true);
        try {
            await updateMovieInLibrary(selectedMovie.tmdb_id, form);
            toast.success(`"${selectedMovie.title}" updated successfully!`);
            setHasChanges(false);
            // Refresh the selected movie data
            const { data } = await supabase
                .from("movies_library")
                .select("*")
                .eq("tmdb_id", selectedMovie.tmdb_id)
                .single();
            if (data) setSelectedMovie(data);
        } catch (err) {
            console.error("Save error:", err);
            toast.error("Failed to save changes");
        }
        setSaving(false);
    };

    const imageURL = "https://image.tmdb.org/t/p/";

    const editorTabs = [
        { id: "overview", label: "Overview", icon: "📋" },
        { id: "parent_guide", label: "Parent Guide", icon: "🛡️" },
        { id: "vibes", label: "Vibe Chart", icon: "🎭" },
        { id: "review", label: "Editor Review", icon: "✍️" },
        { id: "platforms", label: "Streaming", icon: "📺" },
        { id: "tags", label: "Tags & Sections", icon: "🏷️" },
    ];

    return (
        <div className="space-y-6">
            {/* Search Bar */}
            <div className="bg-white/5 rounded-xl p-5 border border-white/10">
                <h2 className="text-lg font-bold text-white mb-3">
                    🎬 Movie & Series Editor
                </h2>
                <p className="text-xs text-white/40 mb-4">
                    Search your library to open a movie page and edit all details
                    including parent guide, vibe chart, editor review, and more.
                </p>
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search movies in your library..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-black/40 rounded-lg px-4 py-3 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none placeholder:text-white/30"
                    />
                    {searchLoading && (
                        <div className="absolute right-3 top-3.5 w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    )}

                    {/* Search Results Dropdown */}
                    {searchResults.length > 0 && searchQuery && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] rounded-lg border border-white/10 max-h-80 overflow-y-auto z-50 shadow-2xl">
                            {searchResults.map((movie) => (
                                <button
                                    key={movie.id || movie.tmdb_id}
                                    onClick={() => selectMovie(movie)}
                                    className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0"
                                >
                                    <img
                                        src={
                                            movie.images?.poster_base64 ||
                                            (movie.poster_path
                                                ? `${imageURL}w92${movie.poster_path}`
                                                : "")
                                        }
                                        alt=""
                                        className="w-10 h-14 rounded object-cover bg-white/5 flex-shrink-0"
                                        onError={(e) => (e.target.style.display = "none")}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-white truncate">
                                            {movie.title}
                                        </div>
                                        <div className="text-xs text-white/40">
                                            {movie.release_date?.split("-")[0]} •{" "}
                                            {movie.media_type === "tv" ? "TV Series" : "Movie"} •
                                            TMDB: {movie.tmdb_id}
                                        </div>
                                    </div>
                                    <span
                                        className={`text-[10px] px-2 py-0.5 rounded ${
                                            movie.is_active
                                                ? "bg-green-500/20 text-green-400"
                                                : "bg-red-500/20 text-red-400"
                                        }`}
                                    >
                                        {movie.is_active ? "Active" : "Hidden"}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Movie Editor Panel */}
            {selectedMovie ? (
                <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                    {/* Movie Header */}
                    <div className="relative">
                        {/* Backdrop */}
                        <div className="h-48 bg-gradient-to-b from-white/5 to-transparent overflow-hidden">
                            {(selectedMovie.images?.backdrop_base64 ||
                                selectedMovie.backdrop_path) && (
                                <img
                                    src={
                                        selectedMovie.images?.backdrop_base64 ||
                                        `${imageURL}w780${selectedMovie.backdrop_path}`
                                    }
                                    alt=""
                                    className="w-full h-full object-cover opacity-30"
                                />
                            )}
                        </div>

                        {/* Movie Info Overlay */}
                        <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-[#111] via-[#111]/90 to-transparent">
                            <div className="flex items-end gap-4">
                                {/* Poster */}
                                <div className="w-20 h-28 rounded-lg overflow-hidden shadow-xl flex-shrink-0 border border-white/10">
                                    <img
                                        src={
                                            selectedMovie.images?.poster_base64 ||
                                            (selectedMovie.poster_path
                                                ? `${imageURL}w185${selectedMovie.poster_path}`
                                                : "")
                                        }
                                        alt=""
                                        className="w-full h-full object-cover"
                                        onError={(e) =>
                                            (e.target.src =
                                                "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 150'><rect fill='%23222' width='100' height='150'/><text x='50' y='75' text-anchor='middle' fill='%23666' font-size='12'>No Image</text></svg>")
                                        }
                                    />
                                </div>

                                {/* Title & Meta */}
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-xl font-bold text-white truncate">
                                        {selectedMovie.title}
                                    </h2>
                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                        <span className="text-xs text-white/50">
                                            {selectedMovie.release_date?.split("-")[0]}
                                        </span>
                                        <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/60">
                                            {selectedMovie.media_type === "tv"
                                                ? "TV Series"
                                                : "Movie"}
                                        </span>
                                        <span className="text-xs text-white/40">
                                            TMDB: {selectedMovie.tmdb_id}
                                        </span>
                                        {selectedMovie.vote_average && (
                                            <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                                                ⭐ {selectedMovie.vote_average.toFixed(1)}
                                            </span>
                                        )}
                                        {selectedMovie.certification && (
                                            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">
                                                {selectedMovie.certification}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {(selectedMovie.genres || []).slice(0, 5).map((g) => (
                                            <span
                                                key={g.id}
                                                className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/50"
                                            >
                                                {g.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {hasChanges && (
                                        <span className="text-xs text-orange-400 animate-pulse">
                                            Unsaved changes
                                        </span>
                                    )}
                                    <button
                                        onClick={handleSave}
                                        disabled={saving || !hasChanges}
                                        className="px-4 py-2 rounded-lg text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {saving ? (
                                            <>
                                                <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            "💾 Save"
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSelectedMovie(null);
                                            setForm({});
                                            setHasChanges(false);
                                        }}
                                        className="px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Editor Sub-Tabs */}
                    <div className="border-b border-white/10 px-5">
                        <div className="flex gap-1 overflow-x-auto">
                            {editorTabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setEditorTab(tab.id)}
                                    className={`px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors ${
                                        editorTab === tab.id
                                            ? "text-white border-b-2 border-orange-500"
                                            : "text-white/40 hover:text-white/70"
                                    }`}
                                >
                                    {tab.icon} {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Editor Content */}
                    <div className="p-5">
                        {/* OVERVIEW TAB */}
                        {editorTab === "overview" && (
                            <div className="space-y-5">
                                <div className="grid md:grid-cols-2 gap-5">
                                    {/* Left */}
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs text-white/50 mb-1 block">
                                                Title
                                            </label>
                                            <input
                                                type="text"
                                                value={form.title || ""}
                                                onChange={(e) =>
                                                    updateField("title", e.target.value)
                                                }
                                                className="w-full bg-black/30 rounded-lg px-3 py-2 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-xs text-white/50 mb-1 block">
                                                Overview
                                            </label>
                                            <textarea
                                                value={form.overview || ""}
                                                onChange={(e) =>
                                                    updateField("overview", e.target.value)
                                                }
                                                rows={5}
                                                className="w-full bg-black/30 rounded-lg px-3 py-2 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none resize-none"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs text-white/50 mb-1 block">
                                                    Release Date
                                                </label>
                                                <input
                                                    type="date"
                                                    value={form.release_date || ""}
                                                    onChange={(e) =>
                                                        updateField("release_date", e.target.value)
                                                    }
                                                    className="w-full bg-black/30 rounded-lg px-3 py-2 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/50 mb-1 block">
                                                    Certification
                                                </label>
                                                <input
                                                    type="text"
                                                    value={form.certification || ""}
                                                    onChange={(e) =>
                                                        updateField("certification", e.target.value)
                                                    }
                                                    placeholder="PG-13, R, UA..."
                                                    className="w-full bg-black/30 rounded-lg px-3 py-2 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right */}
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs text-white/50 mb-1 block">
                                                    Priority
                                                </label>
                                                <input
                                                    type="number"
                                                    value={form.priority || 0}
                                                    onChange={(e) =>
                                                        updateField(
                                                            "priority",
                                                            parseInt(e.target.value) || 0
                                                        )
                                                    }
                                                    className="w-full bg-black/30 rounded-lg px-3 py-2 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none"
                                                />
                                            </div>
                                            <div className="flex flex-col justify-end gap-2">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={form.featured || false}
                                                        onChange={(e) =>
                                                            updateField("featured", e.target.checked)
                                                        }
                                                        className="accent-orange-500"
                                                    />
                                                    <span className="text-xs text-white/60">
                                                        Featured
                                                    </span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={form.is_active !== false}
                                                        onChange={(e) =>
                                                            updateField("is_active", e.target.checked)
                                                        }
                                                        className="accent-green-500"
                                                    />
                                                    <span className="text-xs text-white/60">
                                                        Active (Visible)
                                                    </span>
                                                </label>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs text-white/50 mb-1 block">
                                                Admin Notes
                                            </label>
                                            <textarea
                                                value={form.admin_notes || ""}
                                                onChange={(e) =>
                                                    updateField("admin_notes", e.target.value)
                                                }
                                                rows={3}
                                                placeholder="Internal notes (not shown to users)..."
                                                className="w-full bg-black/30 rounded-lg px-3 py-2 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none resize-none"
                                            />
                                        </div>

                                        {/* Quick Info Display */}
                                        <div className="bg-black/20 rounded-lg p-3 space-y-2">
                                            <h4 className="text-xs font-medium text-white/40">
                                                Database Info
                                            </h4>
                                            <div className="grid grid-cols-2 gap-2 text-[10px] text-white/40">
                                                <div>
                                                    <span className="text-white/30">Popularity:</span>{" "}
                                                    {selectedMovie.popularity?.toFixed(1)}
                                                </div>
                                                <div>
                                                    <span className="text-white/30">Rating:</span>{" "}
                                                    {selectedMovie.vote_average?.toFixed(1)} (
                                                    {selectedMovie.vote_count} votes)
                                                </div>
                                                <div>
                                                    <span className="text-white/30">Runtime:</span>{" "}
                                                    {selectedMovie.runtime || "N/A"} min
                                                </div>
                                                <div>
                                                    <span className="text-white/30">Language:</span>{" "}
                                                    {selectedMovie.original_language}
                                                </div>
                                                <div>
                                                    <span className="text-white/30">Created:</span>{" "}
                                                    {selectedMovie.created_at
                                                        ? new Date(
                                                              selectedMovie.created_at
                                                          ).toLocaleDateString()
                                                        : "N/A"}
                                                </div>
                                                <div>
                                                    <span className="text-white/30">Updated:</span>{" "}
                                                    {selectedMovie.updated_at
                                                        ? new Date(
                                                              selectedMovie.updated_at
                                                          ).toLocaleDateString()
                                                        : "N/A"}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* PARENT GUIDE TAB */}
                        {editorTab === "parent_guide" && (
                            <div className="space-y-5">
                                <div className="bg-black/20 rounded-lg p-4">
                                    <h3 className="text-sm font-medium text-white mb-1">
                                        🛡️ Custom Parent Guide
                                    </h3>
                                    <p className="text-xs text-white/40 mb-4">
                                        Override the auto-generated parent guide with custom severity
                                        levels. Leave as "Auto" to use the default algorithm.
                                    </p>

                                    <div className="grid sm:grid-cols-2 gap-4">
                                        {PARENT_GUIDE_CATEGORIES.map((cat) => {
                                            const currentValue =
                                                form.custom_parent_guide?.[cat.key] || "";
                                            return (
                                                <div
                                                    key={cat.key}
                                                    className="bg-white/5 rounded-xl p-4 border border-white/10"
                                                >
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="text-lg">{cat.emoji}</span>
                                                        <h4 className="text-sm font-medium text-white">
                                                            {cat.label}
                                                        </h4>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        <button
                                                            onClick={() =>
                                                                handleParentGuideChange(cat.key, "")
                                                            }
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                                                !currentValue
                                                                    ? "bg-white/20 text-white border-white/30"
                                                                    : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
                                                            }`}
                                                        >
                                                            Auto
                                                        </button>
                                                        {SEVERITY_LEVELS.map((level) => (
                                                            <button
                                                                key={level}
                                                                onClick={() =>
                                                                    handleParentGuideChange(
                                                                        cat.key,
                                                                        level
                                                                    )
                                                                }
                                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                                                    currentValue === level
                                                                        ? SEVERITY_COLORS[level]
                                                                        : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
                                                                }`}
                                                            >
                                                                {level.charAt(0).toUpperCase() +
                                                                    level.slice(1)}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Certification Override */}
                                <div className="bg-black/20 rounded-lg p-4">
                                    <h4 className="text-sm font-medium text-white mb-2">
                                        🎫 Certification Override
                                    </h4>
                                    <p className="text-xs text-white/40 mb-3">
                                        Override the TMDB certification with a custom one.
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            "U",
                                            "G",
                                            "PG",
                                            "PG-13",
                                            "UA",
                                            "12A",
                                            "R",
                                            "15",
                                            "A",
                                            "18",
                                            "NC-17",
                                        ].map((cert) => (
                                            <button
                                                key={cert}
                                                onClick={() => updateField("certification", cert)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                                    form.certification === cert
                                                        ? "bg-blue-500/30 text-blue-300 border-blue-500/50"
                                                        : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
                                                }`}
                                            >
                                                {cert}
                                            </button>
                                        ))}
                                        <input
                                            type="text"
                                            value={form.certification || ""}
                                            onChange={(e) =>
                                                updateField("certification", e.target.value)
                                            }
                                            placeholder="Custom..."
                                            className="px-3 py-1.5 rounded-lg text-xs bg-black/30 text-white border border-white/10 w-28 outline-none focus:border-orange-500/50"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* VIBE CHART TAB */}
                        {editorTab === "vibes" && (
                            <div className="space-y-5">
                                <div className="bg-black/20 rounded-lg p-4">
                                    <h3 className="text-sm font-medium text-white mb-1">
                                        🎭 Custom Vibe Chart
                                    </h3>
                                    <div className="flex items-center justify-between mb-4">
                                        <p className="text-xs text-white/40">
                                            Adjust sliders — values auto-balance to always total 100%.
                                        </p>
                                        {(() => {
                                            const total = VIBE_CATEGORIES.reduce((s, c) => s + (form.custom_vibes?.[c.key] || 0), 0);
                                            return (
                                                <span className={`text-sm font-bold px-3 py-1 rounded-lg ${total === 100 ? 'bg-green-500/20 text-green-400' : total === 0 ? 'bg-white/10 text-white/40' : 'bg-red-500/20 text-red-400'}`}>
                                                    Total: {total}%
                                                </span>
                                            );
                                        })()}
                                    </div>

                                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {VIBE_CATEGORIES.map((cat) => {
                                            const value = form.custom_vibes?.[cat.key] || 0;
                                            return (
                                                <div
                                                    key={cat.key}
                                                    className="bg-white/5 rounded-xl p-4 border border-white/10"
                                                >
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-lg">{cat.emoji}</span>
                                                            <span className="text-sm font-medium text-white">
                                                                {cat.label}
                                                            </span>
                                                        </div>
                                                        <span
                                                            className="text-sm font-bold"
                                                            style={{ color: cat.color }}
                                                        >
                                                            {value}%
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="100"
                                                        value={value}
                                                        onChange={(e) =>
                                                            handleVibeChange(cat.key, e.target.value)
                                                        }
                                                        className="w-full accent-orange-500 h-2"
                                                        style={{
                                                            accentColor: cat.color,
                                                        }}
                                                    />
                                                    <div className="flex justify-between text-[10px] text-white/30 mt-1">
                                                        <span>0%</span>
                                                        <span>50%</span>
                                                        <span>100%</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Preview */}
                                    {Object.values(form.custom_vibes || {}).some((v) => v > 0) && (
                                        <div className="mt-5 bg-white/5 rounded-xl p-4 border border-white/10">
                                            <h4 className="text-xs font-medium text-white/50 mb-3">
                                                Preview
                                            </h4>
                                            <div className="flex flex-wrap gap-3">
                                                {VIBE_CATEGORIES.filter(
                                                    (c) => (form.custom_vibes?.[c.key] || 0) > 0
                                                )
                                                    .sort(
                                                        (a, b) =>
                                                            (form.custom_vibes?.[b.key] || 0) -
                                                            (form.custom_vibes?.[a.key] || 0)
                                                    )
                                                    .map((cat) => (
                                                        <div
                                                            key={cat.key}
                                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                                                            style={{
                                                                backgroundColor: `${cat.color}20`,
                                                                border: `1px solid ${cat.color}40`,
                                                            }}
                                                        >
                                                            <span>{cat.emoji}</span>
                                                            <span
                                                                className="text-xs font-medium"
                                                                style={{ color: cat.color }}
                                                            >
                                                                {cat.label}
                                                            </span>
                                                            <span className="text-xs text-white/40">
                                                                {form.custom_vibes?.[cat.key]}%
                                                            </span>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* EDITOR REVIEW TAB */}
                        {editorTab === "review" && (
                            <div className="space-y-5">
                                <div className="bg-black/20 rounded-lg p-4">
                                    <h3 className="text-sm font-medium text-white mb-1">
                                        ✍️ Editor Review
                                    </h3>
                                    <p className="text-xs text-white/40 mb-4">
                                        Add your editorial review and rating. This will be displayed
                                        on the movie detail page.
                                    </p>

                                    <div className="space-y-4">
                                        {/* Rating */}
                                        <div>
                                            <label className="text-xs text-white/50 mb-2 block">
                                                Editor Rating
                                            </label>
                                            <div className="flex items-center gap-4">
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="10"
                                                    step="0.5"
                                                    value={form.editor_rating || 0}
                                                    onChange={(e) =>
                                                        updateField(
                                                            "editor_rating",
                                                            parseFloat(e.target.value)
                                                        )
                                                    }
                                                    className="flex-1 accent-orange-500"
                                                />
                                                <div className="flex items-center gap-1 min-w-[80px]">
                                                    <span className="text-2xl font-bold text-orange-500">
                                                        {form.editor_rating || 0}
                                                    </span>
                                                    <span className="text-sm text-white/40">/10</span>
                                                </div>
                                            </div>
                                            <div className="flex justify-between text-[10px] text-white/30 mt-1">
                                                <span>0 - Skip</span>
                                                <span>5 - Average</span>
                                                <span>10 - Masterpiece</span>
                                            </div>
                                        </div>

                                        {/* Review Text */}
                                        <div>
                                            <label className="text-xs text-white/50 mb-1 block">
                                                Review Text
                                            </label>
                                            <textarea
                                                value={form.editor_review || ""}
                                                onChange={(e) =>
                                                    updateField("editor_review", e.target.value)
                                                }
                                                rows={8}
                                                placeholder="Write your editorial review here. This will be shown to users on the movie page..."
                                                className="w-full bg-black/30 rounded-lg px-4 py-3 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none resize-none leading-relaxed"
                                            />
                                            <div className="text-right text-[10px] text-white/30 mt-1">
                                                {(form.editor_review || "").length} characters
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STREAMING PLATFORMS TAB */}
                        {editorTab === "platforms" && (
                            <div className="space-y-5">
                                <div className="bg-black/20 rounded-lg p-4">
                                    <h3 className="text-sm font-medium text-white mb-1">
                                        📺 Streaming Platforms
                                    </h3>
                                    <p className="text-xs text-white/40 mb-4">
                                        Add where this movie/series can be streamed.
                                    </p>

                                    {/* Quick Add Popular Platforms */}
                                    <div className="mb-4">
                                        <label className="text-xs text-white/40 mb-2 block">
                                            Quick Add
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                "Netflix",
                                                "Amazon Prime",
                                                "Disney+",
                                                "Apple TV+",
                                                "HBO Max",
                                                "Hulu",
                                                "Paramount+",
                                                "JioCinema",
                                                "Hotstar",
                                                "Zee5",
                                                "SonyLIV",
                                            ].map((name) => {
                                                const alreadyAdded = (
                                                    form.streaming_platforms || []
                                                ).some(
                                                    (p) =>
                                                        p.name.toLowerCase() === name.toLowerCase()
                                                );
                                                return (
                                                    <button
                                                        key={name}
                                                        onClick={() => {
                                                            if (!alreadyAdded) {
                                                                updateField("streaming_platforms", [
                                                                    ...(form.streaming_platforms || []),
                                                                    { name, url: "" },
                                                                ]);
                                                            }
                                                        }}
                                                        disabled={alreadyAdded}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                                            alreadyAdded
                                                                ? "bg-green-500/20 text-green-400 border-green-500/30"
                                                                : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10"
                                                        }`}
                                                    >
                                                        {alreadyAdded ? "✓ " : "+ "}
                                                        {name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Custom Add */}
                                    <div className="flex gap-2 mb-4">
                                        <input
                                            type="text"
                                            placeholder="Platform name"
                                            value={newPlatform.name}
                                            onChange={(e) =>
                                                setNewPlatform({
                                                    ...newPlatform,
                                                    name: e.target.value,
                                                })
                                            }
                                            className="flex-1 bg-black/30 rounded-lg px-3 py-2 text-sm text-white border border-white/10 outline-none focus:border-orange-500/50"
                                        />
                                        <input
                                            type="text"
                                            placeholder="URL (optional)"
                                            value={newPlatform.url}
                                            onChange={(e) =>
                                                setNewPlatform({
                                                    ...newPlatform,
                                                    url: e.target.value,
                                                })
                                            }
                                            className="flex-1 bg-black/30 rounded-lg px-3 py-2 text-sm text-white border border-white/10 outline-none focus:border-orange-500/50"
                                        />
                                        <button
                                            onClick={addPlatform}
                                            className="px-4 py-2 rounded-lg text-sm font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                                        >
                                            + Add
                                        </button>
                                    </div>

                                    {/* Current Platforms */}
                                    <div className="space-y-2">
                                        {(form.streaming_platforms || []).length === 0 ? (
                                            <p className="text-xs text-white/30 text-center py-4">
                                                No streaming platforms added yet
                                            </p>
                                        ) : (
                                            (form.streaming_platforms || []).map((p, i) => (
                                                <div
                                                    key={i}
                                                    className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-2.5 border border-white/10"
                                                >
                                                    <div>
                                                        <span className="text-sm text-white font-medium">
                                                            {p.name}
                                                        </span>
                                                        {p.url && (
                                                            <span className="text-xs text-white/30 ml-2">
                                                                {p.url}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => removePlatform(i)}
                                                        className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/10"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAGS & SECTIONS TAB */}
                        {editorTab === "tags" && (
                            <div className="space-y-5">
                                {/* Collections */}
                                <div className="bg-black/20 rounded-lg p-4">
                                    <h3 className="text-sm font-medium text-white mb-1">
                                        🏷️ Collections
                                    </h3>
                                    <p className="text-xs text-white/40 mb-3">
                                        Assign this movie to collections for grouping.
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {collections.length === 0 ? (
                                            <p className="text-xs text-white/30">
                                                No collections created yet. Create them in the
                                                Collections tab.
                                            </p>
                                        ) : (
                                            collections.map((col) => {
                                                const isSelected = (
                                                    form.collection_tags || []
                                                ).includes(col.slug);
                                                return (
                                                    <button
                                                        key={col.slug}
                                                        onClick={() =>
                                                            handleCollectionToggle(col.slug)
                                                        }
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                                            isSelected
                                                                ? "bg-orange-500/30 text-orange-300 border-orange-500/50"
                                                                : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
                                                        }`}
                                                    >
                                                        {isSelected ? "✓ " : ""}
                                                        {col.name}
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* Display Sections */}
                                <div className="bg-black/20 rounded-lg p-4">
                                    <h3 className="text-sm font-medium text-white mb-1">
                                        📌 Display Sections
                                    </h3>
                                    <p className="text-xs text-white/40 mb-3">
                                        Control where this movie appears on the site.
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {DISPLAY_SECTION_OPTIONS.map((section) => {
                                            const isSelected = (
                                                form.display_sections || []
                                            ).includes(section);
                                            return (
                                                <button
                                                    key={section}
                                                    onClick={() => handleDisplayToggle(section)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                                        isSelected
                                                            ? "bg-blue-500/30 text-blue-300 border-blue-500/50"
                                                            : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
                                                    }`}
                                                >
                                                    {isSelected ? "✓ " : ""}
                                                    {section.replace(/_/g, " ")}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom Save Bar */}
                    {hasChanges && (
                        <div className="sticky bottom-0 bg-[#111]/95 backdrop-blur border-t border-orange-500/30 px-5 py-3 flex items-center justify-between">
                            <span className="text-xs text-orange-400">
                                You have unsaved changes
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => selectMovie(selectedMovie)}
                                    className="px-4 py-2 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/5"
                                >
                                    Discard
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-6 py-2 rounded-lg text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
                                >
                                    {saving ? "Saving..." : "💾 Save Changes"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* Empty State */
                <div className="bg-white/5 rounded-xl p-12 border border-white/10 text-center">
                    <div className="text-5xl mb-4">🎬</div>
                    <h3 className="text-lg font-medium text-white mb-2">
                        No Movie Selected
                    </h3>
                    <p className="text-sm text-white/40 max-w-md mx-auto">
                        Search for a movie or series from your library above to open the
                        full editor. You can edit parent guide, vibe chart, editor review,
                        streaming platforms, and more.
                    </p>
                </div>
            )}
        </div>
    );
};

export default AdminMovieEditorPage;
