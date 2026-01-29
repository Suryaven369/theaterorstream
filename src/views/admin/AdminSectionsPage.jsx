import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
    getHomepageSections,
    createHomepageSection,
    updateHomepageSection,
    deleteHomepageSection,
    toggleHomepageSectionActive,
    addMovieToSection,
    removeMovieFromSection,
    reorderHomepageSections
} from "../../lib/supabase";

// API endpoints for fetching movies based on section type
const API_ENDPOINTS = {
    trending: "/trending/all/week",
    now_playing: "/movie/now_playing",
    popular: "/movie/popular",
    top_rated: "/movie/top_rated",
    upcoming: "/movie/upcoming",
    provider_8: "/discover/movie", // Netflix
    provider_119: "/discover/movie", // Prime
    provider_122: "/discover/movie", // Hotstar
};

const AdminSectionsPage = () => {
    const [sections, setSections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newSection, setNewSection] = useState({ name: "", icon: "🎬", section_type: "manual", max_movies: 10 });
    const [editingSection, setEditingSection] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [fetchingApi, setFetchingApi] = useState(null); // Track which section is fetching

    // Load sections
    const loadSections = useCallback(async () => {
        setLoading(true);
        const data = await getHomepageSections();
        setSections(data || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadSections();
    }, [loadSections]);

    // Live search with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.trim().length >= 2) {
                performSearch(searchQuery);
            } else {
                setSearchResults([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const performSearch = async (query) => {
        setSearchLoading(true);
        try {
            const response = await axios.get("/search/multi", {
                params: { query, page: 1 }
            });
            const results = response.data.results
                ?.filter(r => r.media_type === "movie" || r.media_type === "tv")
                .slice(0, 12) || [];
            setSearchResults(results);
        } catch (error) {
            console.error("Search error:", error);
        }
        setSearchLoading(false);
    };

    // Fetch movies from API for a section
    const handleFetchFromApi = async (section) => {
        setFetchingApi(section.id);
        try {
            let endpoint = API_ENDPOINTS[section.api_source] || "/trending/all/week";
            let params = { page: 1 };

            // Handle provider-based sections (Netflix, Prime, Hotstar)
            if (section.api_source?.startsWith("provider_")) {
                const providerId = section.api_source.split("_")[1];
                params = {
                    with_watch_providers: providerId,
                    watch_region: "IN",
                    sort_by: "popularity.desc",
                    page: 1
                };
            }

            const response = await axios.get(endpoint, { params });
            const movies = response.data.results?.slice(0, section.max_movies || 10) || [];

            // Convert to our format and save to section
            const movieData = movies.map(movie => ({
                tmdb_id: movie.id,
                title: movie.title || movie.name,
                poster_path: movie.poster_path,
                media_type: movie.media_type || "movie"
            }));

            // Update section with fetched movies
            await updateHomepageSection(section.id, { movies: movieData });
            await loadSections();

        } catch (error) {
            console.error("Error fetching from API:", error);
            alert("Failed to fetch movies. Check console for details.");
        }
        setFetchingApi(null);
    };

    // Create section
    const handleCreateSection = async () => {
        if (!newSection.name.trim()) return;
        const slug = newSection.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        await createHomepageSection({ ...newSection, slug });
        setNewSection({ name: "", icon: "🎬", section_type: "manual", max_movies: 10 });
        await loadSections();
    };

    // Delete section
    const handleDelete = async (id, isSystem) => {
        if (isSystem) {
            alert("System sections cannot be deleted");
            return;
        }
        if (confirm("Delete this section?")) {
            await deleteHomepageSection(id);
            await loadSections();
        }
    };

    // Toggle active
    const handleToggle = async (id) => {
        await toggleHomepageSectionActive(id);
        await loadSections();
    };

    // Add movie to section
    const handleAddMovie = async (sectionId, movie) => {
        await addMovieToSection(sectionId, {
            tmdb_id: movie.id,
            title: movie.title || movie.name,
            poster_path: movie.poster_path,
            media_type: movie.media_type || "movie"
        });
        await loadSections();
        setSearchQuery("");
        setSearchResults([]);
    };

    // Remove movie from section
    const handleRemoveMovie = async (sectionId, tmdbId) => {
        await removeMovieFromSection(sectionId, tmdbId);
        await loadSections();
    };

    // Clear all movies from section
    const handleClearMovies = async (sectionId) => {
        if (confirm("Remove all movies from this section?")) {
            await updateHomepageSection(sectionId, { movies: [] });
            await loadSections();
        }
    };

    // Drag and drop handlers
    const handleDragStart = (index) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;

        const newSections = [...sections];
        const [removed] = newSections.splice(draggedIndex, 1);
        newSections.splice(index, 0, removed);
        setSections(newSections);
        setDraggedIndex(index);
    };

    const handleDragEnd = async () => {
        setDraggedIndex(null);
        const orderedIds = sections.map(s => s.id);
        await reorderHomepageSections(orderedIds);
    };

    return (
        <div className="p-6">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-white">📐 Homepage Sections</h1>
                <p className="text-white/50 text-sm">Manage sections displayed on the homepage. Drag to reorder. Click Edit to add/remove movies.</p>
            </div>

            {/* Create New Section */}
            <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-3">Create New Section</h3>
                <div className="flex gap-3 flex-wrap">
                    <input
                        type="text"
                        placeholder="Section name"
                        value={newSection.name}
                        onChange={(e) => setNewSection({ ...newSection, name: e.target.value })}
                        className="flex-1 min-w-[200px] bg-black/30 rounded-lg px-4 py-2 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none"
                    />
                    <input
                        type="text"
                        placeholder="Icon"
                        value={newSection.icon}
                        onChange={(e) => setNewSection({ ...newSection, icon: e.target.value })}
                        className="w-16 bg-black/30 rounded-lg px-3 py-2 text-sm text-white border border-white/10 text-center"
                    />
                    <select
                        value={newSection.section_type}
                        onChange={(e) => setNewSection({ ...newSection, section_type: e.target.value })}
                        className="bg-black/30 rounded-lg px-3 py-2 text-sm text-white border border-white/10"
                    >
                        <option value="manual">Manual (Add movies yourself)</option>
                        <option value="api">API (Fetch from TMDB)</option>
                    </select>
                    <input
                        type="number"
                        placeholder="Max"
                        value={newSection.max_movies}
                        onChange={(e) => setNewSection({ ...newSection, max_movies: parseInt(e.target.value) || 10 })}
                        className="w-20 bg-black/30 rounded-lg px-3 py-2 text-sm text-white border border-white/10 text-center"
                    />
                    <button
                        onClick={handleCreateSection}
                        disabled={!newSection.name.trim()}
                        className="px-6 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
                    >
                        + Create
                    </button>
                </div>
            </div>

            {/* Sections List */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-pulse text-white/40">Loading sections...</div>
                </div>
            ) : sections.length === 0 ? (
                <div className="text-center py-12 text-white/40">
                    No sections found. Create one above or run the SQL migration to add defaults.
                </div>
            ) : (
                <div className="space-y-3">
                    {sections.map((section, index) => (
                        <div
                            key={section.id}
                            draggable
                            onDragStart={() => handleDragStart(index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            className={`bg-white/[0.03] rounded-xl border border-white/10 overflow-hidden transition-all ${draggedIndex === index ? "opacity-50 scale-[0.98]" : ""
                                } ${!section.is_active ? "opacity-60" : ""}`}
                        >
                            {/* Section Header */}
                            <div className="flex items-center gap-4 p-4">
                                {/* Drag Handle */}
                                <div className="cursor-grab active:cursor-grabbing text-white/30 hover:text-white/60">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
                                    </svg>
                                </div>

                                {/* Order Number */}
                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 text-sm font-medium">
                                    {index + 1}
                                </div>

                                {/* Icon */}
                                <span className="text-2xl">{section.icon}</span>

                                {/* Info */}
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-medium">{section.name}</span>
                                        {section.is_system && (
                                            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-medium">SYSTEM</span>
                                        )}
                                        <span className="px-2 py-0.5 rounded bg-white/10 text-white/50 text-[10px]">
                                            {section.section_type === 'api' ? `API: ${section.api_source}` : 'Manual'}
                                        </span>
                                    </div>
                                    <div className="text-white/40 text-xs mt-0.5">
                                        {section.movies?.length || 0} movies • Max: {section.max_movies || 10}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                    {/* Fetch from API button for API sections */}
                                    {section.section_type === 'api' && (
                                        <button
                                            onClick={() => handleFetchFromApi(section)}
                                            disabled={fetchingApi === section.id}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                                        >
                                            {fetchingApi === section.id ? "⏳ Fetching..." : "🔄 Fetch from API"}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleToggle(section.id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${section.is_active
                                                ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                                                : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                            }`}
                                    >
                                        {section.is_active ? "Active" : "Hidden"}
                                    </button>
                                    <button
                                        onClick={() => setEditingSection(editingSection === section.id ? null : section.id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${editingSection === section.id
                                                ? "bg-orange-500/30 text-orange-300"
                                                : "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                                            }`}
                                    >
                                        {editingSection === section.id ? "✕ Close" : "✏️ Edit"}
                                    </button>
                                    {!section.is_system && (
                                        <button
                                            onClick={() => handleDelete(section.id, section.is_system)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                                        >
                                            🗑️
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Movies Preview (Always visible when has movies) */}
                            {section.movies && section.movies.length > 0 && (
                                <div className="px-4 pb-4">
                                    <div className="flex gap-2 overflow-x-auto pb-2">
                                        {section.movies.map((movie, idx) => (
                                            <div key={`${movie.tmdb_id}-${idx}`} className="relative flex-shrink-0 group">
                                                <img
                                                    src={movie.poster_path ? `https://image.tmdb.org/t/p/w92${movie.poster_path}` : "/placeholder.png"}
                                                    alt={movie.title}
                                                    className="w-14 h-20 rounded-lg object-cover border border-white/10"
                                                />
                                                {editingSection === section.id && (
                                                    <button
                                                        onClick={() => handleRemoveMovie(section.id, movie.tmdb_id)}
                                                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Expanded Edit Panel */}
                            {editingSection === section.id && (
                                <div className="p-4 border-t border-white/5 bg-black/20">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-sm font-medium text-white">Add Movies to "{section.name}"</h4>
                                        <div className="flex gap-2">
                                            {section.section_type === 'api' && (
                                                <button
                                                    onClick={() => handleFetchFromApi(section)}
                                                    disabled={fetchingApi === section.id}
                                                    className="px-4 py-2 rounded-lg text-xs font-medium bg-purple-500 text-white hover:bg-purple-600 transition-colors disabled:opacity-50"
                                                >
                                                    {fetchingApi === section.id ? "⏳ Fetching..." : "🔄 Fetch Latest from API"}
                                                </button>
                                            )}
                                            {section.movies?.length > 0 && (
                                                <button
                                                    onClick={() => handleClearMovies(section.id)}
                                                    className="px-4 py-2 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                                                >
                                                    🗑️ Clear All
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Live Search */}
                                    <div className="relative mb-4">
                                        <input
                                            type="text"
                                            placeholder="🔍 Search movies or TV shows to add... (type at least 2 characters)"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full bg-black/40 rounded-lg px-4 py-3 text-sm text-white border border-white/20 focus:border-orange-500/50 outline-none placeholder:text-white/30"
                                        />
                                        {searchLoading && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                <div className="animate-spin w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full"></div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Search Results */}
                                    {searchResults.length > 0 && (
                                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
                                            {searchResults.map((movie) => {
                                                const alreadyAdded = section.movies?.some(m => m.tmdb_id === movie.id);
                                                return (
                                                    <div
                                                        key={movie.id}
                                                        onClick={() => !alreadyAdded && handleAddMovie(section.id, movie)}
                                                        className={`relative cursor-pointer group ${alreadyAdded ? "opacity-50 cursor-not-allowed" : "hover:scale-105 transition-transform"}`}
                                                    >
                                                        <img
                                                            src={movie.poster_path ? `https://image.tmdb.org/t/p/w154${movie.poster_path}` : "/placeholder.png"}
                                                            alt={movie.title || movie.name}
                                                            className="w-full rounded-lg border border-white/10"
                                                        />
                                                        <div className={`absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg transition-opacity ${alreadyAdded ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                                            }`}>
                                                            <span className="text-white text-2xl font-bold">{alreadyAdded ? "✓" : "+"}</span>
                                                        </div>
                                                        <div className="text-[10px] text-white/60 mt-1 truncate text-center">{movie.title || movie.name}</div>
                                                        <div className="text-[9px] text-white/40 text-center">{movie.media_type === 'tv' ? 'TV' : 'Movie'}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {searchQuery.length >= 2 && searchResults.length === 0 && !searchLoading && (
                                        <div className="text-center py-6 text-white/40 text-sm">No results found for "{searchQuery}"</div>
                                    )}

                                    {searchQuery.length < 2 && (
                                        <div className="text-center py-6 text-white/30 text-sm">
                                            {section.section_type === 'api'
                                                ? '💡 Tip: Click "Fetch Latest from API" to auto-populate with trending content, or search manually above.'
                                                : '💡 Start typing to search for movies or TV shows to add to this section.'
                                            }
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AdminSectionsPage;
