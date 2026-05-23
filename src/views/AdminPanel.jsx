import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import tmdbApi from "../lib/tmdbApi";
import {
    getMoviesLibrary,
    getMovieFromLibrary,
    saveMovieToLibrary,
    bulkSaveMoviesToLibrary,
    updateMovieInLibrary,
    deleteMovieFromLibrary,
    toggleMovieFeatured,
    toggleMovieActive,
    searchMoviesLibrary,
    getLibraryStats,
    getCollections,
    createCollection,
    updateCollection,
    deleteCollection,
    saveFullMovieToLibrary,
    checkMoviesInAdvancedLibrary,
    getAdvancedLibraryStats,
    getHomepageSections,
    createHomepageSection,
    updateHomepageSection,
    deleteHomepageSection,
    toggleHomepageSectionActive,
    addMovieToSection,
    removeMovieFromSection,
    getGlobalUserStats,
    getSyncState,
    getSyncRuns,
    supabase
} from "../lib/supabase";
import { convertImageToBase64 } from "../utils/imageHelper";
import MovieDetailsModal from "../components/MovieDetailsModal";
import AdminMovieEditorPage from "./admin/AdminMovieEditorPage";

// ========== COMPONENTS ==========

// Simple Tab Component
const Tab = ({ tabs, activeTab, onTabChange }) => (
    <div className="flex gap-1 border-b border-white/10 mb-4 overflow-x-auto">
        {tabs.map(tab => (
            <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${activeTab === tab.id
                    ? 'text-white border-b-2 border-orange-500'
                    : 'text-white/50 hover:text-white'
                    }`}
            >
                {tab.icon} {tab.label}
            </button>
        ))}
    </div>
);

// Stat Card
const StatCard = ({ label, value }) => (
    <div className="bg-white/5 rounded p-2 text-center">
        <div className="text-lg font-bold text-white">{value}</div>
        <div className="text-[10px] text-white/40">{label}</div>
    </div>
);

// Movie Row Component
const MovieRow = ({ movie, onEdit, onDelete, onToggleFeatured, onToggleActive }) => (
    <div className="flex items-center gap-2 p-2 bg-white/[0.02] rounded border border-white/5 hover:bg-white/[0.04]">
        <img
            src={movie.poster_path ? `https://image.tmdb.org/t/p/w92${movie.poster_path}` : '/placeholder.png'}
            alt={movie.title}
            className="w-8 h-12 object-cover rounded"
        />
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs font-medium text-white truncate">{movie.title}</span>
                <span className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/50">{movie.media_type}</span>
                {movie.featured && <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400">⭐</span>}
                {!movie.is_active && <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-400">Hidden</span>}
            </div>
            <div className="text-[10px] text-white/40">
                ID: {movie.tmdb_id} • {movie.release_date?.split('T')[0]}
                {movie.collection_tags?.length > 0 && ` • 🏷️ ${movie.collection_tags.length}`}
            </div>
        </div>
        <div className="flex gap-1">
            <button onClick={() => onToggleFeatured(movie.tmdb_id)} className={`px-1.5 py-1 text-[10px] rounded ${movie.featured ? 'bg-yellow-500/30 text-yellow-400' : 'bg-white/5 text-white/40'}`}>⭐</button>
            <button onClick={() => onToggleActive(movie.tmdb_id)} className={`px-1.5 py-1 text-[10px] rounded ${movie.is_active ? 'bg-green-500/30 text-green-400' : 'bg-red-500/30 text-red-400'}`}>{movie.is_active ? '✓' : '✗'}</button>
            <button onClick={() => onEdit(movie)} className="px-1.5 py-1 text-[10px] rounded bg-blue-500/20 text-blue-400">Edit</button>
            <button onClick={() => onDelete(movie.tmdb_id)} className="px-1.5 py-1 text-[10px] rounded bg-red-500/20 text-red-400">🗑</button>
        </div>
    </div>
);

// TMDB Movie Card
const TMDBCard = ({ movie, mediaType, onSave, onSaveFull, isSaved, isSaving }) => (
    <div className="bg-white/[0.02] rounded p-1.5 border border-white/5">
        <div className="flex gap-1.5">
            <img
                src={movie.poster_path ? `https://image.tmdb.org/t/p/w92${movie.poster_path}` : '/placeholder.png'}
                alt={movie.title || movie.name}
                className="w-10 h-14 object-cover rounded"
            />
            <div className="flex-1 min-w-0">
                <div className="text-[10px] font-medium text-white truncate">{movie.title || movie.name}</div>
                <div className="text-[9px] text-white/40">{movie.release_date || movie.first_air_date}</div>
                <div className="text-[9px] text-white/40">⭐ {movie.vote_average?.toFixed(1)} • ID: {movie.id}</div>
            </div>
        </div>
        <div className="flex gap-1 mt-1">
            <button
                onClick={() => onSave(movie, mediaType)}
                disabled={isSaved || isSaving}
                className={`flex-1 py-1 text-[10px] rounded ${isSaved ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
            >
                Quick
            </button>
            <button
                onClick={() => onSaveFull(movie, mediaType)}
                disabled={isSaved || isSaving}
                className={`flex-1 py-1 text-[10px] rounded ${isSaved ? 'bg-green-500/20 text-green-400' : isSaving ? 'bg-yellow-500/20 text-yellow-400' : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'}`}
            >
                {isSaving ? '⏳' : isSaved ? '✓' : '+ Full'}
            </button>
        </div>
    </div>
);

// Edit Modal
const EditModal = ({ movie, collections, onClose, onSave }) => {
    const [form, setForm] = useState({
        priority: movie?.priority || 0,
        admin_notes: movie?.admin_notes || '',
        editor_review: movie?.editor_review || '',
        editor_rating: movie?.editor_rating || '',
        certification: movie?.certification || '',
        collection_tags: movie?.collection_tags || [],
        display_sections: movie?.display_sections || [],
        streaming_platforms: movie?.streaming_platforms || [],
        custom_vibes: movie?.custom_vibes || {},
        custom_parent_guide: movie?.custom_parent_guide || {}
    });

    const [newPlatform, setNewPlatform] = useState({ name: '', url: '' });

    const vibeCategories = ['emotional', 'thrilling', 'funny', 'romantic', 'thoughtful', 'intense'];
    const parentGuideCategories = ['violence', 'nudity', 'profanity', 'frightening'];
    const severityLevels = ['none', 'mild', 'moderate', 'severe'];
    const displaySectionOptions = ['home_banner', 'home_trending', 'home_now_playing', 'home_featured', 'browse_recommended'];

    const handleCollectionToggle = (slug) => {
        const current = form.collection_tags || [];
        if (current.includes(slug)) {
            setForm({ ...form, collection_tags: current.filter(t => t !== slug) });
        } else {
            setForm({ ...form, collection_tags: [...current, slug] });
        }
    };

    const handleDisplayToggle = (section) => {
        const current = form.display_sections || [];
        if (current.includes(section)) {
            setForm({ ...form, display_sections: current.filter(s => s !== section) });
        } else {
            setForm({ ...form, display_sections: [...current, section] });
        }
    };

    const handleVibeChange = (cat, value) => {
        setForm({ ...form, custom_vibes: { ...form.custom_vibes, [cat]: parseInt(value) || 0 } });
    };

    const handleParentGuideChange = (cat, value) => {
        setForm({ ...form, custom_parent_guide: { ...form.custom_parent_guide, [cat]: value } });
    };

    const addPlatform = () => {
        if (newPlatform.name) {
            setForm({ ...form, streaming_platforms: [...(form.streaming_platforms || []), newPlatform] });
            setNewPlatform({ name: '', url: '' });
        }
    };

    const removePlatform = (index) => {
        const platforms = [...form.streaming_platforms];
        platforms.splice(index, 1);
        setForm({ ...form, streaming_platforms: platforms });
    };

    const handleSave = async () => {
        await onSave(movie.tmdb_id, form);
        onClose();
    };

    if (!movie) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/90 overflow-auto">
            <div className="bg-[#111] rounded-lg p-4 max-w-3xl w-full max-h-[95vh] overflow-y-auto border border-white/10">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-base font-bold text-white">Edit: {movie.title}</h3>
                    <button onClick={onClose} className="text-white/50 hover:text-white">✕</button>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                    {/* Left Column */}
                    <div className="space-y-3">
                        {/* Basic Info */}
                        <div className="bg-white/5 rounded p-3">
                            <h4 className="text-xs font-medium text-white/60 mb-2">Basic Info</h4>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] text-white/40">Priority</label>
                                    <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} className="w-full bg-black/30 rounded p-1.5 text-xs text-white border border-white/10" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-white/40">Certification</label>
                                    <input type="text" value={form.certification} onChange={(e) => setForm({ ...form, certification: e.target.value })} placeholder="PG-13, R..." className="w-full bg-black/30 rounded p-1.5 text-xs text-white border border-white/10" />
                                </div>
                            </div>
                            <div className="mt-2">
                                <label className="text-[10px] text-white/40">Admin Notes</label>
                                <textarea value={form.admin_notes} onChange={(e) => setForm({ ...form, admin_notes: e.target.value })} className="w-full bg-black/30 rounded p-1.5 text-xs text-white border border-white/10" rows={2} />
                            </div>
                        </div>

                        {/* Editor Review */}
                        <div className="bg-white/5 rounded p-3">
                            <h4 className="text-xs font-medium text-white/60 mb-2">Editor Review</h4>
                            <div>
                                <label className="text-[10px] text-white/40">Editor Rating (0-10)</label>
                                <input type="number" min="0" max="10" step="0.1" value={form.editor_rating} onChange={(e) => setForm({ ...form, editor_rating: parseFloat(e.target.value) || '' })} className="w-full bg-black/30 rounded p-1.5 text-xs text-white border border-white/10" />
                            </div>
                            <div className="mt-2">
                                <label className="text-[10px] text-white/40">Review Text</label>
                                <textarea value={form.editor_review} onChange={(e) => setForm({ ...form, editor_review: e.target.value })} className="w-full bg-black/30 rounded p-1.5 text-xs text-white border border-white/10" rows={3} placeholder="Your editorial review..." />
                            </div>
                        </div>

                        {/* Streaming Platforms */}
                        <div className="bg-white/5 rounded p-3">
                            <h4 className="text-xs font-medium text-white/60 mb-2">Streaming Platforms</h4>
                            <div className="flex gap-1 mb-2">
                                <input type="text" placeholder="Name (Netflix, Prime...)" value={newPlatform.name} onChange={(e) => setNewPlatform({ ...newPlatform, name: e.target.value })} className="flex-1 bg-black/30 rounded p-1.5 text-xs text-white border border-white/10" />
                                <input type="text" placeholder="URL" value={newPlatform.url} onChange={(e) => setNewPlatform({ ...newPlatform, url: e.target.value })} className="flex-1 bg-black/30 rounded p-1.5 text-xs text-white border border-white/10" />
                                <button onClick={addPlatform} className="px-2 bg-green-500/20 text-green-400 rounded text-xs">+</button>
                            </div>
                            <div className="space-y-1">
                                {(form.streaming_platforms || []).map((p, i) => (
                                    <div key={i} className="flex items-center justify-between bg-black/20 rounded p-1.5">
                                        <span className="text-xs text-white">{p.name}</span>
                                        <button onClick={() => removePlatform(i)} className="text-red-400 text-xs">✕</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-3">
                        {/* Collections */}
                        <div className="bg-white/5 rounded p-3">
                            <h4 className="text-xs font-medium text-white/60 mb-2">Collections</h4>
                            <div className="flex flex-wrap gap-1">
                                {collections.map(col => (
                                    <button
                                        key={col.slug}
                                        onClick={() => handleCollectionToggle(col.slug)}
                                        className={`px-2 py-1 text-[10px] rounded ${(form.collection_tags || []).includes(col.slug) ? 'bg-orange-500 text-white' : 'bg-white/5 text-white/50'}`}
                                    >
                                        {col.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Display Sections */}
                        <div className="bg-white/5 rounded p-3">
                            <h4 className="text-xs font-medium text-white/60 mb-2">Display Sections</h4>
                            <div className="flex flex-wrap gap-1">
                                {displaySectionOptions.map(section => (
                                    <button
                                        key={section}
                                        onClick={() => handleDisplayToggle(section)}
                                        className={`px-2 py-1 text-[10px] rounded ${(form.display_sections || []).includes(section) ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/50'}`}
                                    >
                                        {section.replace(/_/g, ' ')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Custom Vibe Meter */}
                        <div className="bg-white/5 rounded p-3">
                            <h4 className="text-xs font-medium text-white/60 mb-2">Custom Vibe Meter</h4>
                            <div className="grid grid-cols-3 gap-2">
                                {vibeCategories.map(cat => (
                                    <div key={cat}>
                                        <label className="text-[9px] text-white/40 capitalize">{cat}</label>
                                        <input type="number" min="0" max="100" value={form.custom_vibes?.[cat] || ''} onChange={(e) => handleVibeChange(cat, e.target.value)} className="w-full bg-black/30 rounded p-1 text-xs text-white border border-white/10" placeholder="0-100" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Parent Guide */}
                        <div className="bg-white/5 rounded p-3">
                            <h4 className="text-xs font-medium text-white/60 mb-2">Custom Parent Guide</h4>
                            <div className="grid grid-cols-2 gap-2">
                                {parentGuideCategories.map(cat => (
                                    <div key={cat}>
                                        <label className="text-[9px] text-white/40 capitalize">{cat}</label>
                                        <select value={form.custom_parent_guide?.[cat] || ''} onChange={(e) => handleParentGuideChange(cat, e.target.value)} className="w-full bg-black/30 rounded p-1 text-xs text-white border border-white/10">
                                            <option value="">Auto</option>
                                            {severityLevels.map(l => <option key={l} value={l}>{l}</option>)}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 mt-4">
                    <button onClick={onClose} className="flex-1 py-2 text-xs bg-white/5 text-white/70 rounded hover:bg-white/10">Cancel</button>
                    <button onClick={handleSave} className="flex-1 py-2 text-xs bg-orange-500 text-white rounded hover:bg-orange-600">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

// ========== MAIN ADMIN PANEL ==========
const AdminPanel = ({ initialTab = 'dashboard' }) => {
    const [activeTab, setActiveTab] = useState(initialTab);
    const [stats, setStats] = useState({ total: 0, movies: 0, tv: 0, featured: 0, active: 0, collections: {}, totalUsers: 0, liveViews: 0 });
    const [advancedStats, setAdvancedStats] = useState({ totalMovies: 0, featuredMovies: 0, totalPeople: 0, genreStats: [] });
    const [library, setLibrary] = useState([]);
    const [collections, setCollections] = useState([]);
    const [librarySearch, setLibrarySearch] = useState('');
    const [loading, setLoading] = useState(false);

    // Library filter state (NEW)
    const [libraryMediaFilter, setLibraryMediaFilter] = useState('all'); // 'all', 'movie', 'tv'
    const [librarySortBy, setLibrarySortBy] = useState('created_at'); // 'created_at', 'popularity', 'vote_average', 'release_date', 'title'
    const [librarySortOrder, setLibrarySortOrder] = useState('desc'); // 'asc', 'desc'
    const [libraryFeaturedFilter, setLibraryFeaturedFilter] = useState('all'); // 'all', 'featured', 'not_featured'
    const [libraryActiveFilter, setLibraryActiveFilter] = useState('all'); // 'all', 'active', 'hidden'

    // TMDB state
    const [tmdbSource, setTmdbSource] = useState('now_playing');
    const [tmdbMovies, setTmdbMovies] = useState([]);
    const [loadingTmdb, setLoadingTmdb] = useState(false);
    const [savedIds, setSavedIds] = useState(new Set());

    // Advanced library state
    const [advancedSavedIds, setAdvancedSavedIds] = useState(new Set());
    const [savingIds, setSavingIds] = useState(new Set());

    // Bulk state
    const [bulkSaving, setBulkSaving] = useState(false);
    const [bulkResult, setBulkResult] = useState(null);
    const [bulkFullSaving, setBulkFullSaving] = useState(false);
    const [bulkFullProgress, setBulkFullProgress] = useState({ current: 0, total: 0 });

    // Edit state
    const [editMovie, setEditMovie] = useState(null);

    // Collection form
    const [newCollection, setNewCollection] = useState({ slug: '', name: '', description: '' });

    // Homepage Sections state
    const [homepageSections, setHomepageSections] = useState([]);
    const [syncState, setSyncState] = useState([]);
    const [recentSyncRuns, setRecentSyncRuns] = useState([]);
    const [newSection, setNewSection] = useState({ name: '', icon: '🎬', section_type: 'manual', max_movies: 10 });
    const [editingSection, setEditingSection] = useState(null);
    const [sectionMovieSearch, setSectionMovieSearch] = useState('');
    const [sectionSearchResults, setSectionSearchResults] = useState([]);

    // TMDB Search state
    const [tmdbSearch, setTmdbSearch] = useState('');
    const [tmdbSearchType, setTmdbSearchType] = useState('movie');
    const [tmdbMediaType, setTmdbMediaType] = useState('movie'); // Global media type toggle
    const [tmdbYear, setTmdbYear] = useState(''); // Year filter
    const [tmdbCountry, setTmdbCountry] = useState(''); // Country filter
    const [tmdbRegion, setTmdbRegion] = useState('US'); // Region for Now Playing (matches frontend default)
    const [tmdbPage, setTmdbPage] = useState(1); // Current page
    const [tmdbTotalPages, setTmdbTotalPages] = useState(0); // Total pages available
    const [tmdbResultsLimit, setTmdbResultsLimit] = useState(60); // Number of movies to fetch
    const [selectedMovie, setSelectedMovie] = useState(null); // For modal
    const [movieDetails, setMovieDetails] = useState(null); // Full movie data
    const [loadingDetails, setLoadingDetails] = useState(false); // Loading state for modal

    const tabs = [
        { id: 'dashboard', label: 'Dashboard', icon: '📊' },
        { id: 'library', label: 'Library', icon: '📚' },
        { id: 'browse', label: 'Browse TMDB', icon: '🔍' },
        { id: 'bulk', label: 'Bulk Import', icon: '⚡' },
        { id: 'editor', label: 'Movie Editor', icon: '🎬' },
        { id: 'collections', label: 'Collections', icon: '🏷️' },
        { id: 'maintenance', label: 'Maintenance', icon: '🛠️' },
    ];

    // Universal category filters that work for both movies and TV
    const tmdbSources = [
        { id: 'popular', label: 'Popular' },
        { id: 'top_rated', label: 'Top Rated' },
        { id: 'now_playing', label: 'Now Playing / Airing' },
        { id: 'upcoming', label: 'Upcoming' },
        { id: 'trending', label: 'Trending' },
    ];

    useEffect(() => { loadData(); }, []);

    // Simulate live views
    useEffect(() => {
        const interval = setInterval(() => {
            setStats(prev => ({
                ...prev,
                liveViews: Math.max(1, (prev.liveViews || 3) + (Math.random() > 0.5 ? 1 : -1))
            }));
        }, 5000);
        return () => clearInterval(interval);
    }, []);
    useEffect(() => { setActiveTab(initialTab); }, [initialTab]);
    useEffect(() => { setSavedIds(new Set(library.map(m => m.tmdb_id))); }, [library]);
    useEffect(() => {
        if (activeTab === 'browse' || activeTab === 'bulk') {
            if (tmdbSource) {
                fetchTmdb(tmdbSource);
            } else {
                // Load popular by default when opening browse/bulk tab
                fetchTmdb('popular');
            }
        }
    }, [activeTab, tmdbYear, tmdbCountry, tmdbMediaType]);

    // Check which movies are already in advanced library when TMDB movies change
    useEffect(() => {
        const checkAdvancedLibrary = async () => {
            if (tmdbMovies.length > 0) {
                const ids = tmdbMovies.map(m => m.id);
                const savedSet = await checkMoviesInAdvancedLibrary(ids);
                setAdvancedSavedIds(savedSet);
            }
        };
        checkAdvancedLibrary();
    }, [tmdbMovies]);

    const loadData = async () => {
        setLoading(true);
        const [statsData, libraryData, collectionsData, advStatsData, sectionsData, userData, syncStateData, syncRunsData] = await Promise.all([
            getLibraryStats(),
            getMoviesLibrary({ limit: 200 }),
            getCollections(),
            getAdvancedLibraryStats(),
            getHomepageSections(),
            getGlobalUserStats(),
            getSyncState(),
            getSyncRuns({ limit: 5 }),
        ]);
        setStats({
            ...statsData,
            totalUsers: userData.totalUsers,
            liveViews: Math.floor(Math.random() * 5) + 3
        });
        setLibrary(libraryData);
        setCollections(collectionsData);
        setAdvancedStats(advStatsData);
        setHomepageSections(sectionsData);
        setSyncState(syncStateData);
        setRecentSyncRuns(syncRunsData);
        setLoading(false);
    };

    const loadLibrary = async () => {
        setLoading(true);
        try {
            let data;
            if (librarySearch) {
                data = await searchMoviesLibrary(librarySearch);
            } else {
                data = await getMoviesLibrary({ limit: 500 }); // Get more for client-side filtering
            }

            // Apply client-side filters for quick response
            let filtered = data || [];

            // Media type filter
            if (libraryMediaFilter !== 'all') {
                filtered = filtered.filter(m => m.media_type === libraryMediaFilter);
            }

            // Featured filter
            if (libraryFeaturedFilter === 'featured') {
                filtered = filtered.filter(m => m.featured === true);
            } else if (libraryFeaturedFilter === 'not_featured') {
                filtered = filtered.filter(m => m.featured !== true);
            }

            // Active filter
            if (libraryActiveFilter === 'active') {
                filtered = filtered.filter(m => m.is_active === true);
            } else if (libraryActiveFilter === 'hidden') {
                filtered = filtered.filter(m => m.is_active === false);
            }

            // Client-side sorting
            filtered.sort((a, b) => {
                let aVal, bVal;
                switch (librarySortBy) {
                    case 'popularity':
                        aVal = a.popularity || 0;
                        bVal = b.popularity || 0;
                        break;
                    case 'vote_average':
                        aVal = a.vote_average || 0;
                        bVal = b.vote_average || 0;
                        break;
                    case 'release_date':
                        aVal = new Date(a.release_date || 0).getTime();
                        bVal = new Date(b.release_date || 0).getTime();
                        break;
                    case 'title':
                        aVal = (a.title || '').toLowerCase();
                        bVal = (b.title || '').toLowerCase();
                        return librarySortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    case 'created_at':
                    default:
                        aVal = new Date(a.created_at || 0).getTime();
                        bVal = new Date(b.created_at || 0).getTime();
                        break;
                }
                return librarySortOrder === 'asc' ? aVal - bVal : bVal - aVal;
            });

            setLibrary(filtered);
        } catch (error) {
            console.error('Error loading library:', error);
        }
        setLoading(false);
    };

    const fetchTmdb = async (source, startPage = 1, append = false, limitOverride = null) => {
        setLoadingTmdb(true);
        setTmdbSource(source);
        try {
            // Build endpoint dynamically based on media type and category
            let endpoint = '';
            let useDiscover = false;

            // Map category to appropriate endpoint - MATCHING FRONTEND HOME PAGE
            if (source === 'trending') {
                // Use /trending/all/day to match frontend (includes movies AND TV)
                endpoint = '/trending/all/day';
            } else if (source === 'upcoming') {
                // Use discover endpoint for upcoming to enable popularity sorting
                useDiscover = true;
                endpoint = tmdbMediaType === 'movie' ? '/discover/movie' : '/discover/tv';
            } else if (tmdbMediaType === 'movie') {
                switch (source) {
                    case 'popular': endpoint = '/movie/popular'; break;
                    case 'top_rated': endpoint = '/movie/top_rated'; break;
                    case 'now_playing': endpoint = '/movie/now_playing'; break;
                    default: endpoint = '/movie/popular';
                }
            } else { // tv
                switch (source) {
                    case 'popular': endpoint = '/tv/popular'; break;
                    case 'top_rated': endpoint = '/tv/top_rated'; break;
                    case 'now_playing': endpoint = '/tv/airing_today'; break;
                    default: endpoint = '/tv/popular';
                }
            }

            // Calculate number of pages to fetch based on results limit (20 movies per page)
            const effectiveLimit = limitOverride || tmdbResultsLimit;
            const pagesToFetch = Math.ceil(effectiveLimit / 20);
            const requests = [];

            // If year or country filter is active, OR if it's upcoming category, use discover endpoint
            if ((tmdbYear || tmdbCountry || useDiscover) && source !== 'trending') {
                for (let i = 0; i < pagesToFetch; i++) {
                    const params = { page: startPage + i };

                    if (tmdbMediaType === 'movie') {
                        endpoint = '/discover/movie';
                        if (tmdbYear) params.primary_release_year = tmdbYear;
                        if (tmdbCountry) params.with_origin_country = tmdbCountry;

                        // Map source to appropriate sorting
                        switch (source) {
                            case 'popular':
                            case 'trending':
                                params.sort_by = 'popularity.desc';
                                break;
                            case 'top_rated':
                                params.sort_by = 'vote_average.desc';
                                params['vote_count.gte'] = 100;
                                break;
                            case 'upcoming':
                                // Get upcoming movies sorted by popularity
                                params.sort_by = 'popularity.desc';
                                params['primary_release_date.gte'] = new Date().toISOString().split('T')[0]; // Today or later
                                params['primary_release_date.lte'] = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Next 6 months
                                break;
                            default:
                                params.sort_by = 'popularity.desc';
                        }
                    } else { // tv
                        endpoint = '/discover/tv';
                        if (tmdbYear) params.first_air_date_year = tmdbYear;
                        if (tmdbCountry) params.with_origin_country = tmdbCountry;

                        switch (source) {
                            case 'popular':
                            case 'trending':
                                params.sort_by = 'popularity.desc';
                                break;
                            case 'top_rated':
                                params.sort_by = 'vote_average.desc';
                                params['vote_count.gte'] = 100;
                                break;
                            case 'upcoming':
                                // Get upcoming TV shows sorted by popularity
                                params.sort_by = 'popularity.desc';
                                params['first_air_date.gte'] = new Date().toISOString().split('T')[0];
                                params['first_air_date.lte'] = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                                break;
                            default:
                                params.sort_by = 'popularity.desc';
                        }
                    }

                    requests.push(tmdbApi.get(endpoint, { params }));
                }
            } else {
                // Without filters, just fetch from regular endpoint
                for (let i = 0; i < pagesToFetch; i++) {
                    const params = { page: startPage + i };

                    // Add region for Now Playing to get accurate theater data
                    // Default to US if 'All Regions' is selected for consistent behavior
                    if (source === 'now_playing') {
                        params.region = tmdbRegion || 'US';
                    }

                    requests.push(tmdbApi.get(endpoint, { params }));
                }
            }

            console.log(`🎬 TMDB Fetch - Category: ${source}, Type: ${tmdbMediaType}, Endpoint: ${endpoint}`);
            console.log(`📊 Fetching ${pagesToFetch} pages (${startPage} to ${startPage + pagesToFetch - 1}) - Year: ${tmdbYear || 'All'}, Country: ${tmdbCountry || 'All'}`);

            const responses = await Promise.all(requests);
            const allResults = responses.flatMap(r => r.data.results || []);
            const totalPages = responses[0]?.data.total_pages || 0;

            console.log(`Received ${allResults.length} results total. Total pages available: ${totalPages}`);

            setTmdbTotalPages(totalPages);
            setTmdbPage(startPage + pagesToFetch - 1); // Set to the last page fetched

            if (append) {
                setTmdbMovies(prev => [...prev, ...allResults]);
            } else {
                setTmdbMovies(allResults);
            }
        } catch (error) {
            console.error('Error fetching TMDB:', error);
        }
        setLoadingTmdb(false);
    };

    const loadMoreTmdb = () => {
        if (tmdbPage < tmdbTotalPages && !loadingTmdb) {
            fetchTmdb(tmdbSource, tmdbPage + 1, true); // Start from next page
        }
    };

    // Fetch full movie details for modal
    const fetchMovieDetails = async (movieId, mediaType = 'movie') => {
        setLoadingDetails(true);
        try {
            const endpoint = `/${mediaType}/${movieId}`;
            const response = await tmdbApi.get(endpoint, {
                params: {
                    append_to_response: 'credits,videos,images,release_dates,keywords'
                }
            });
            setMovieDetails(response.data);
        } catch (error) {
            console.error('Error fetching movie details:', error);
        }
        setLoadingDetails(false);
    };

    const openMovieModal = (movie, mediaType) => {
        setSelectedMovie(movie);
        fetchMovieDetails(movie.id, mediaType);
    };

    const closeMovieModal = () => {
        setSelectedMovie(null);
        setMovieDetails(null);
    };

    // Search TMDB for specific movies/TV shows
    const searchTmdb = async () => {
        if (!tmdbSearch.trim()) return;
        setLoadingTmdb(true);
        try {
            const endpoint = tmdbSearchType === 'movie' ? '/search/movie' : '/search/tv';
            const params = { query: tmdbSearch, page: 1 };

            // Add year filter if specified
            if (tmdbYear) {
                if (tmdbSearchType === 'movie') {
                    params.primary_release_year = tmdbYear;
                } else {
                    params.first_air_date_year = tmdbYear;
                }
            }

            const response = await tmdbApi.get(endpoint, { params });
            setTmdbMovies(response.data.results || []);
            setTmdbSource('search'); // Mark as search results
        } catch (error) {
            console.error('Error searching TMDB:', error);
        }
        setLoadingTmdb(false);
    };

    // Quick save (old behavior for movies_library table)
    const handleSave = async (movie, mediaType) => {
        const result = await saveMovieToLibrary(movie, mediaType);
        if (result.success) {
            const statsAfter = await getLibraryStats();
            setBulkResult({
                success: true,
                savedCount: 1,
                message: `✓ Saved ${movie.title || movie.name}. Library total: ${statsAfter?.total ?? '?'}.`,
            });
            await loadData();
        } else {
            const msg = result.error?.message || 'Could not save to library';
            setBulkResult({ success: false, message: `✗ ${msg}` });
            console.error('Quick save failed:', result.error);
        }
    };

    // Full save with all TMDB data to new normalized tables
    const handleSaveFull = async (movie, mediaType) => {
        const movieId = movie.id;

        // Mark as saving
        setSavingIds(prev => new Set([...prev, movieId]));

        try {
            // Fetch full movie details from TMDB with all append_to_response data
            const appendTo = 'credits,videos,images,release_dates,keywords,reviews,similar,recommendations';
            const endpoint = mediaType === 'tv' ? `/tv/${movieId}` : `/movie/${movieId}`;

            console.log(`Fetching full data for: ${movie.title || movie.name} (ID: ${movieId})`);

            const response = await tmdbApi.get(endpoint, {
                params: { append_to_response: appendTo }
            });

            const fullMovieData = response.data;

            const result = await saveFullMovieToLibrary(fullMovieData, { media_type: mediaType });

            if (result.success) {
                setAdvancedSavedIds(prev => new Set([...prev, movieId]));
                const statsAfter = await getLibraryStats();
                setBulkResult({
                    success: true,
                    savedCount: 1,
                    message: `✓ Saved ${fullMovieData.title || fullMovieData.name}. Library total: ${statsAfter?.total ?? '?'}.`,
                });
                await loadData();
            } else {
                const msg = result.error?.message || 'Could not save full movie data';
                setBulkResult({ success: false, message: `✗ ${msg}` });
                console.error(`Failed to save: ${fullMovieData.title}`, result.error);
            }

        } catch (error) {
            console.error('Error fetching/saving full movie data:', error);
            setBulkResult({ success: false, message: `✗ ${error.message || 'Save failed'}` });
        } finally {
            // Remove from saving set
            setSavingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(movieId);
                return newSet;
            });
        }
    };

    // Bulk save with full data - OPTIMIZED with parallel processing
    const handleBulkSaveFull = async () => {
        setBulkFullSaving(true);
        setBulkResult(null);

        const mediaType = tmdbMediaType;

        // Filter only unsaved movies
        const moviesToSave = tmdbMovies.filter(m =>
            !advancedSavedIds.has(m.id) && !savedIds.has(m.id.toString())
        );

        setBulkFullProgress({ current: 0, total: moviesToSave.length });

        let successCount = 0;
        let failCount = 0;
        const BATCH_SIZE = 5; // Process 5 movies in parallel

        // Process in batches for speed
        for (let i = 0; i < moviesToSave.length; i += BATCH_SIZE) {
            const batch = moviesToSave.slice(i, i + BATCH_SIZE);

            // Process batch in parallel
            const results = await Promise.allSettled(
                batch.map(async (movie) => {
                    try {
                        const appendTo = 'credits,videos,images,release_dates,keywords,reviews,similar,recommendations';
                        const endpoint = mediaType === 'tv' ? `/tv/${movie.id}` : `/movie/${movie.id}`;

                        const response = await tmdbApi.get(endpoint, {
                            params: { append_to_response: appendTo }
                        });

                        const fullMovieData = response.data;
                        const result = await saveFullMovieToLibrary(fullMovieData, { media_type: mediaType });

                        if (result.success) {
                            setAdvancedSavedIds(prev => new Set([...prev, movie.id]));
                            return { success: true, movie };
                        }

                        return { success: false, movie, error: result.error };
                    } catch (error) {
                        console.error(`Failed to save ${movie.title || movie.name}:`, error);
                        return { success: false, movie, error };
                    }
                })
            );

            // Count results
            results.forEach(result => {
                if (result.status === 'fulfilled' && result.value.success) {
                    successCount++;
                } else {
                    failCount++;
                }
            });

            // Update progress
            setBulkFullProgress({ current: Math.min(i + BATCH_SIZE, moviesToSave.length), total: moviesToSave.length });

            // Small delay between batches to avoid rate limiting
            if (i + BATCH_SIZE < moviesToSave.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        const statsAfter = successCount > 0 ? await getLibraryStats() : null;
        setBulkResult({
            success: successCount > 0,
            savedCount: successCount,
            failedCount: failCount,
            message: successCount > 0
                ? `✓ Saved ${successCount} with full data. Library total: ${statsAfter?.total ?? '?'}.${failCount > 0 ? ` ${failCount} failed.` : ''}`
                : `✗ All saves failed (${failCount}). Check console and SUPABASE_SERVICE_ROLE_KEY in .env.local.`,
        });

        await loadData(); // Only load data once at the end
        setBulkFullSaving(false);
    };

    // Maintenance Script: Sync Upcoming Movies & Series
    const [syncingUpcoming, setSyncingUpcoming] = useState(false);
    const [upcomingProgress, setUpcomingProgress] = useState({ current: 0, total: 0, saved: 0 });
    const [upcomingLogs, setUpcomingLogs] = useState([]);

    const handleSyncUpcoming = async () => {
        if (!confirm("This will fetch upcoming movies and series from TMDB and save them to your database. Continue?")) return;

        setSyncingUpcoming(true);
        setUpcomingLogs([]);
        setUpcomingProgress({ current: 0, total: 0, saved: 0 });

        try {
            const regions = ['US', 'IN', 'GB'];
            let allMovies = new Map();
            let allTV = new Map();

            // 1. Fetch upcoming movies from multiple pages and regions
            setUpcomingLogs(prev => [...prev, "📽️ Fetching upcoming movies..."]);
            for (const region of regions) {
                for (let page = 1; page <= 5; page++) {
                    try {
                        const res = await tmdbApi.get('/movie/upcoming', { params: { region, page } });
                        const movies = res.data.results || [];
                        movies.forEach(m => { if (!allMovies.has(m.id)) allMovies.set(m.id, m); });
                    } catch (e) { break; }
                }
            }

            // Also fetch from discover for wider upcoming range (next 6 months)
            const today = new Date().toISOString().split('T')[0];
            const sixMonths = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            for (let page = 1; page <= 5; page++) {
                try {
                    const res = await tmdbApi.get('/discover/movie', {
                        params: {
                            'primary_release_date.gte': today,
                            'primary_release_date.lte': sixMonths,
                            sort_by: 'popularity.desc',
                            page,
                        }
                    });
                    const movies = res.data.results || [];
                    movies.forEach(m => { if (!allMovies.has(m.id)) allMovies.set(m.id, m); });
                } catch (e) { break; }
            }

            setUpcomingLogs(prev => [...prev, `Found ${allMovies.size} unique upcoming movies`]);

            // 2. Fetch upcoming TV series (on the air + future)
            setUpcomingLogs(prev => [...prev, "📺 Fetching upcoming TV series..."]);
            for (let page = 1; page <= 3; page++) {
                try {
                    const res = await tmdbApi.get('/tv/on_the_air', { params: { page } });
                    const shows = res.data.results || [];
                    shows.forEach(s => { if (!allTV.has(s.id)) allTV.set(s.id, s); });
                } catch (e) { break; }
            }
            for (let page = 1; page <= 3; page++) {
                try {
                    const res = await tmdbApi.get('/discover/tv', {
                        params: {
                            'first_air_date.gte': today,
                            sort_by: 'popularity.desc',
                            page,
                        }
                    });
                    const shows = res.data.results || [];
                    shows.forEach(s => { if (!allTV.has(s.id)) allTV.set(s.id, s); });
                } catch (e) { break; }
            }

            setUpcomingLogs(prev => [...prev, `Found ${allTV.size} unique upcoming TV series`]);

            // 3. Save all to DB with full details
            const allItems = [
                ...[...allMovies.values()].map(m => ({ ...m, _type: 'movie' })),
                ...[...allTV.values()].map(s => ({ ...s, _type: 'tv' })),
            ];

            const totalItems = allItems.length;
            setUpcomingProgress({ current: 0, total: totalItems, saved: 0 });
            setUpcomingLogs(prev => [...prev, `🚀 Saving ${totalItems} items to database...`]);

            let savedCount = 0;
            const BATCH_SIZE = 3;

            for (let i = 0; i < totalItems; i += BATCH_SIZE) {
                const batch = allItems.slice(i, i + BATCH_SIZE);

                await Promise.all(batch.map(async (item) => {
                    const mediaType = item._type;
                    const title = item.title || item.name;
                    try {
                        const endpoint = mediaType === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`;
                        const detailRes = await tmdbApi.get(endpoint, {
                            params: { append_to_response: 'credits,videos,images,release_dates,keywords' }
                        });
                        const fullData = detailRes.data;

                        await saveFullMovieToLibrary(fullData, { media_type: mediaType });
                        savedCount++;
                        setUpcomingLogs(prev => [`✓ ${title}`, ...prev].slice(0, 80));
                    } catch (err) {
                        // Quick save fallback
                        try {
                            await saveMovieToLibrary(item, mediaType);
                            savedCount++;
                            setUpcomingLogs(prev => [`⚡ ${title} (quick)`, ...prev].slice(0, 80));
                        } catch (e2) {
                            setUpcomingLogs(prev => [`❌ Failed: ${title}`, ...prev].slice(0, 80));
                        }
                    }
                }));

                setUpcomingProgress(prev => ({
                    ...prev,
                    current: Math.min(i + BATCH_SIZE, totalItems),
                    saved: savedCount
                }));
            }

            setUpcomingLogs(prev => [`✅ Sync Complete! Saved ${savedCount}/${totalItems} items to database.`, ...prev]);
            await loadData(); // Refresh stats

        } catch (error) {
            console.error("Upcoming sync failed:", error);
            setUpcomingLogs(prev => [`❌ Error: ${error.message}`, ...prev]);
        } finally {
            setSyncingUpcoming(false);
        }
    };

    // Maintenance Script: Sync Cast Images (Base64)
    const [syncingImages, setSyncingImages] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, updated: 0 });
    const [syncLogs, setSyncLogs] = useState([]);

    const handleSyncCastImages = async () => {
        if (!confirm("This will scan ALL movies in your library and download cast images for offline access. This process may take a while. Continue?")) return;

        setSyncingImages(true);
        setSyncLogs([]);
        setSyncProgress({ current: 0, total: 0, updated: 0 });

        try {
            // 1. Fetch all movies (using limit for safety, maybe loop if needed, but 1000 is likely enough for now)
            // Ideally should use pagination, but let's grab a large chunk
            setSyncLogs(prev => [...prev, "Fetching library movies..."]);
            const { data: movies, error } = await supabase.from('movies_library').select('tmdb_id, title, credits');

            if (error) throw error;

            const totalMovies = movies.length;
            setSyncProgress({ current: 0, total: totalMovies, updated: 0 });
            setSyncLogs(prev => [...prev, `Found ${totalMovies} movies to scan.`]);

            let updatedCount = 0;
            const BATCH_SIZE = 5;

            // Process in batches
            for (let i = 0; i < totalMovies; i += BATCH_SIZE) {
                const batch = movies.slice(i, i + BATCH_SIZE);

                await Promise.all(batch.map(async (movie) => {
                    try {
                        let hasChanges = false;
                        const cast = movie.credits?.cast || [];

                        // Check if top 10 cast needs images
                        const topCast = cast.slice(0, 10);
                        let imagesProcessed = 0;

                        await Promise.all(topCast.map(async (actor) => {
                            // If has path but NO base64, fetch it
                            if (actor.profile_path && !actor.profile_base64) {
                                try {
                                    const profileUrl = `https://image.tmdb.org/t/p/w185${actor.profile_path}`;
                                    const profileBase64 = await convertImageToBase64(profileUrl);
                                    if (profileBase64) {
                                        actor.profile_base64 = profileBase64;
                                        hasChanges = true;
                                        imagesProcessed++;
                                    }
                                } catch (e) {
                                    // console.warn(`Failed image for ${actor.name}`);
                                }
                            }
                        }));

                        if (hasChanges) {
                            // Update the cast array in the movie record
                            // Note: 'cast' is a reference to movie.credits.cast? No, we sliced for topCast loop
                            // We updated objects inside 'topCast'. Does that update 'movie.credits.cast'?
                            // Arrays of objects: yes, objects are references.
                            // So movie.credits.cast objects are modified. 

                            // Update DB
                            await supabase
                                .from('movies_library')
                                .update({ credits: movie.credits })
                                .eq('tmdb_id', movie.tmdb_id);

                            updatedCount++;
                            setSyncLogs(prev => [`Updated ${movie.title} (${imagesProcessed} images)`, ...prev].slice(0, 50));
                        }

                    } catch (err) {
                        console.error(`Error processing ${movie.title}`, err);
                    }
                }));

                setSyncProgress(prev => ({
                    ...prev,
                    current: Math.min(i + BATCH_SIZE, totalMovies),
                    updated: updatedCount
                }));
            }

            setSyncLogs(prev => [`✓ Sync Complete! Updated ${updatedCount} movies.`, ...prev]);

        } catch (error) {
            console.error("Sync failed:", error);
            setSyncLogs(prev => [`❌ Error: ${error.message}`, ...prev]);
        } finally {
            setSyncingImages(false);
        }
    };

    const handleBulkSave = async () => {
        setBulkSaving(true);
        setBulkResult(null);
        const sourceConfig = tmdbSources.find(s => s.id === tmdbSource);
        const result = await bulkSaveMoviesToLibrary(tmdbMovies, sourceConfig?.type || tmdbMediaType);
        const statsAfter = result.success ? await getLibraryStats() : null;
        if (result.success) {
            const dupNote = result.duplicatesSkipped > 0
                ? ` (${result.duplicatesSkipped} duplicate IDs skipped)`
                : '';
            setBulkResult({
                success: true,
                savedCount: result.savedCount,
                message: `✓ Saved ${result.savedCount} title(s). Library now has ${statsAfter?.total ?? '?'} total.${dupNote}`,
            });
            await loadData();
        } else {
            const partial = result.partial ? ` (${result.savedCount} saved before error)` : '';
            setBulkResult({
                success: false,
                message: `✗ ${result.error?.message || 'Bulk save failed'}${partial}`,
            });
            if (result.partial) await loadData();
        }
        setBulkSaving(false);
    };

    const handleToggleFeatured = async (id) => { await toggleMovieFeatured(id); await loadData(); };
    const handleToggleActive = async (id) => { await toggleMovieActive(id); await loadData(); };
    const handleDelete = async (id) => { if (confirm('Delete?')) { await deleteMovieFromLibrary(id); await loadData(); } };
    const handleUpdate = async (id, updates) => { await updateMovieInLibrary(id, updates); await loadData(); };

    const handleCreateCollection = async () => {
        if (newCollection.slug && newCollection.name) {
            await createCollection(newCollection);
            setNewCollection({ slug: '', name: '', description: '' });
            await loadData();
        }
    };

    const handleDeleteCollection = async (slug) => {
        if (confirm('Delete collection?')) {
            await deleteCollection(slug);
            await loadData();
        }
    };

    // ===== SECTION HANDLERS =====
    const handleCreateSection = async () => {
        if (newSection.name) {
            const result = await createHomepageSection(newSection);
            if (result.success) {
                setNewSection({ name: '', icon: '🎬', section_type: 'manual', max_movies: 10 });
                await loadData();
            }
        }
    };

    const handleDeleteSection = async (id) => {
        if (confirm('Delete this section?')) {
            await deleteHomepageSection(id);
            await loadData();
        }
    };

    const handleToggleSection = async (id) => {
        await toggleHomepageSectionActive(id);
        await loadData();
    };

    const searchMoviesForSection = async () => {
        if (!sectionMovieSearch.trim()) return;
        try {
            const response = await tmdbApi.get('/search/multi', {
                params: { query: sectionMovieSearch, page: 1 }
            });
            setSectionSearchResults(response.data.results?.filter(r => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 10) || []);
        } catch (error) {
            console.error('Search error:', error);
        }
    };

    const handleAddMovieToSection = async (sectionId, movie) => {
        await addMovieToSection(sectionId, {
            tmdb_id: movie.id,
            title: movie.title || movie.name,
            poster_path: movie.poster_path,
            media_type: movie.media_type || 'movie'
        });
        await loadData();
    };

    const handleRemoveMovieFromSection = async (sectionId, tmdbId) => {
        await removeMovieFromSection(sectionId, tmdbId);
        await loadData();
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] py-6">
            <div className="container mx-auto px-4 max-w-6xl">
                {/* Tabs Navigation */}
                <div className="flex gap-4 mb-6">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
                    >
                        📊 Dashboard
                    </button>
                    <button
                        onClick={() => setActiveTab('library')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'library' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
                    >
                        📚 Library
                    </button>
                    <button
                        onClick={() => setActiveTab('browse')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'browse' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
                    >
                        🔍 Browse TMDB
                    </button>
                    <button
                        onClick={() => setActiveTab('editor')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'editor' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
                    >
                        🎬 Movie Editor
                    </button>
                    <button
                        onClick={() => setActiveTab('sections')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'sections' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
                    >
                        📐 Sections
                    </button>
                    <button
                        onClick={() => setActiveTab('collections')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'collections' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
                    >
                        📦 Collections
                    </button>
                    <button
                        onClick={() => setActiveTab('maintenance')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'maintenance' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
                    >
                        🛠️ Maintenance
                    </button>
                </div>

                {/* Dashboard View - Only stats, no tabs */}
                {activeTab === 'dashboard' && (
                    <div>
                        <div className="mb-6">
                            <h1 className="text-xl font-bold text-white">📊 Dashboard</h1>
                            <p className="text-xs text-white/40">Overview of your content library</p>
                        </div>
                        {/* Stats Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                            <div className="bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-xl p-4 border border-red-500/20">
                                <div className="text-2xl font-bold text-white flex items-center gap-2">
                                    {stats.liveViews}
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                    </span>
                                </div>
                                <div className="text-xs text-red-300/70">Live Views</div>
                            </div>
                            <div className="bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 rounded-xl p-4 border border-cyan-500/20">
                                <div className="text-2xl font-bold text-white">{stats.totalUsers}</div>
                                <div className="text-xs text-cyan-300/70">Total Users</div>
                            </div>
                            <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 rounded-xl p-4 border border-blue-500/20">
                                <div className="text-2xl font-bold text-white">{stats.total}</div>
                                <div className="text-xs text-blue-300/70">Total Content</div>
                            </div>
                            <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-xl p-4 border border-purple-500/20">
                                <div className="text-2xl font-bold text-white">{stats.movies}</div>
                                <div className="text-xs text-purple-300/70">Movies</div>
                            </div>
                            <div className="bg-gradient-to-br from-pink-500/20 to-pink-600/10 rounded-xl p-4 border border-pink-500/20">
                                <div className="text-2xl font-bold text-white">{stats.tv}</div>
                                <div className="text-xs text-pink-300/70">TV Shows</div>
                            </div>
                            <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 rounded-xl p-4 border border-yellow-500/20">
                                <div className="text-2xl font-bold text-white">{stats.featured}</div>
                                <div className="text-xs text-yellow-300/70">Featured</div>
                            </div>
                            <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 rounded-xl p-4 border border-green-500/20">
                                <div className="text-2xl font-bold text-white">{stats.active}</div>
                                <div className="text-xs text-green-300/70">Active</div>
                            </div>
                        </div>

                        <div className="mt-8">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide">Sync Pipeline</h2>
                                <Link to="/admin/pipeline" className="text-xs text-orange-400 hover:text-orange-300">
                                    Open Control Tower →
                                </Link>
                            </div>
                            <div className="grid gap-3 md:grid-cols-3 mb-4">
                                {syncState.slice(0, 3).map((job) => (
                                    <div key={job.job_name} className="bg-white/5 rounded-xl p-4 border border-white/10">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-white text-sm font-medium">{job.job_name}</span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase ${job.last_status === 'completed' ? 'bg-green-500/20 text-green-400' : job.last_status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/50'}`}>
                                                {job.last_status || 'idle'}
                                            </span>
                                        </div>
                                        <div className="text-[11px] text-white/45">
                                            Last success: {job.last_success_at ? new Date(job.last_success_at).toLocaleString() : '—'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {recentSyncRuns.length > 0 && (
                                <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                                    <div className="px-4 py-3 border-b border-white/10 text-xs text-white/50">Recent runs</div>
                                    <div className="divide-y divide-white/5">
                                        {recentSyncRuns.map((run) => (
                                            <div key={run.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                                                <span className="text-white/80">{run.job_name}</span>
                                                <span className={`px-2 py-0.5 rounded-full uppercase ${run.status === 'completed' ? 'bg-green-500/20 text-green-400' : run.status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>{run.status}</span>
                                                <span className="text-white/40 ml-auto">+{run.movies_added} / ~{run.movies_updated} upd</span>
                                                <span className="text-white/30">{new Date(run.started_at).toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Library Tab */}
                {activeTab === 'library' && (
                    <div>
                        <div className="mb-4">
                            <h1 className="text-xl font-bold text-white">📚 Library</h1>
                            <p className="text-xs text-white/40">Manage your movies and TV shows</p>
                        </div>

                        {/* Sub-tabs for Library page */}
                        <div className="flex gap-1 border-b border-white/10 mb-4">
                            <button
                                onClick={() => setActiveTab('library')}
                                className="px-3 py-2 text-xs font-medium text-white border-b-2 border-orange-500"
                            >
                                📚 Library
                            </button>
                            <button
                                onClick={() => setActiveTab('browse')}
                                className="px-3 py-2 text-xs font-medium text-white/50 hover:text-white"
                            >
                                🔍 Browse TMDB
                            </button>
                            <button
                                onClick={() => setActiveTab('bulk')}
                                className="px-3 py-2 text-xs font-medium text-white/50 hover:text-white"
                            >
                                ⚡ Bulk Import
                            </button>
                        </div>
                        <div className="flex gap-2 mb-3">
                            <input
                                type="text"
                                placeholder="Search..."
                                value={librarySearch}
                                onChange={(e) => setLibrarySearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && loadLibrary()}
                                className="flex-1 bg-white/5 rounded p-2 text-xs text-white border border-white/10"
                            />
                            <button onClick={loadLibrary} className="px-3 py-2 text-xs bg-white/10 text-white rounded">Search</button>
                            <button onClick={() => { setLibrarySearch(''); loadData(); }} className="px-3 py-2 text-xs bg-white/5 text-white/50 rounded">Clear</button>
                        </div>

                        {/* Advanced Filters */}
                        <div className="bg-white/[0.02] rounded-lg p-3 mb-4 border border-white/5">
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Media Type Filter */}
                                <div className="flex gap-1">
                                    {[
                                        { id: 'all', label: '📚 All', count: stats.total },
                                        { id: 'movie', label: '🎬 Movies', count: stats.movies },
                                        { id: 'tv', label: '📺 TV', count: stats.tv }
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => { setLibraryMediaFilter(opt.id); loadLibrary(); }}
                                            className={`px-2 py-1 text-[10px] rounded transition-colors ${libraryMediaFilter === opt.id
                                                ? 'bg-orange-500/30 text-orange-300 border border-orange-500/50'
                                                : 'bg-white/5 text-white/50 hover:bg-white/10 border border-white/10'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="w-px h-4 bg-white/10" />

                                {/* Sort Controls */}
                                <div className="flex items-center gap-2">
                                    <select
                                        value={librarySortBy}
                                        onChange={(e) => { setLibrarySortBy(e.target.value); loadLibrary(); }}
                                        className="bg-white/5 rounded px-2 py-1 text-[10px] text-white border border-white/10"
                                    >
                                        <option value="created_at">Date Added</option>
                                        <option value="popularity">Popularity</option>
                                        <option value="vote_average">Rating</option>
                                        <option value="release_date">Release Date</option>
                                        <option value="title">Title</option>
                                    </select>
                                    <button
                                        onClick={() => { setLibrarySortOrder(librarySortOrder === 'desc' ? 'asc' : 'desc'); loadLibrary(); }}
                                        className="px-2 py-1 text-[10px] rounded bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
                                        title={librarySortOrder === 'desc' ? 'Descending' : 'Ascending'}
                                    >
                                        {librarySortOrder === 'desc' ? '↓' : '↑'}
                                    </button>
                                </div>

                                <div className="w-px h-4 bg-white/10" />

                                {/* Featured Filter */}
                                <div className="flex gap-1">
                                    {[
                                        { id: 'all', label: 'All' },
                                        { id: 'featured', label: '⭐ Featured' },
                                        { id: 'not_featured', label: 'Not Featured' }
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => { setLibraryFeaturedFilter(opt.id); loadLibrary(); }}
                                            className={`px-2 py-1 text-[10px] rounded transition-colors ${libraryFeaturedFilter === opt.id
                                                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                                                : 'bg-white/5 text-white/40 hover:bg-white/10 border border-white/10'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="w-px h-4 bg-white/10" />

                                {/* Active Filter */}
                                <div className="flex gap-1">
                                    {[
                                        { id: 'all', label: 'All' },
                                        { id: 'active', label: '✓ Active' },
                                        { id: 'hidden', label: '✗ Hidden' }
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => { setLibraryActiveFilter(opt.id); loadLibrary(); }}
                                            className={`px-2 py-1 text-[10px] rounded transition-colors ${libraryActiveFilter === opt.id
                                                ? opt.id === 'hidden' ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-green-500/20 text-green-300 border border-green-500/40'
                                                : 'bg-white/5 text-white/40 hover:bg-white/10 border border-white/10'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Results count */}
                            <div className="mt-2 text-[10px] text-white/30">
                                Showing {library.length} items
                                {libraryMediaFilter !== 'all' && ` (${libraryMediaFilter})`}
                                {libraryFeaturedFilter !== 'all' && ` • ${libraryFeaturedFilter}`}
                                {libraryActiveFilter !== 'all' && ` • ${libraryActiveFilter}`}
                            </div>
                        </div>
                        {loading ? (
                            <div className="text-center py-8 text-white/40 text-sm">Loading...</div>
                        ) : library.length > 0 ? (
                            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                                {library.map(m => (
                                    <MovieRow key={m.id} movie={m} onEdit={setEditMovie} onDelete={handleDelete} onToggleFeatured={handleToggleFeatured} onToggleActive={handleToggleActive} />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-white/40 text-sm">No movies. Use Browse TMDB to add.</div>
                        )}
                    </div>
                )}

                {/* Sections Tab */}
                {activeTab === 'sections' && (
                    <div>
                        {/* Create Section Form */}
                        <div className="bg-white/5 rounded p-3 mb-4">
                            <h4 className="text-xs font-medium text-white mb-2">📐 Create New Section</h4>
                            <div className="flex gap-2 flex-wrap">
                                <input
                                    type="text"
                                    placeholder="Section name (e.g., Staff Picks)"
                                    value={newSection.name}
                                    onChange={(e) => setNewSection({ ...newSection, name: e.target.value })}
                                    className="flex-1 min-w-[200px] bg-black/30 rounded p-2 text-xs text-white border border-white/10"
                                />
                                <input
                                    type="text"
                                    placeholder="Icon"
                                    value={newSection.icon}
                                    onChange={(e) => setNewSection({ ...newSection, icon: e.target.value })}
                                    className="w-16 bg-black/30 rounded p-2 text-xs text-white border border-white/10 text-center"
                                />
                                <select
                                    value={newSection.section_type}
                                    onChange={(e) => setNewSection({ ...newSection, section_type: e.target.value })}
                                    className="bg-black/30 rounded px-2 text-xs text-white border border-white/10"
                                >
                                    <option value="manual">Manual</option>
                                    <option value="api">API (Auto)</option>
                                </select>
                                <input
                                    type="number"
                                    placeholder="Limit"
                                    value={newSection.max_movies}
                                    onChange={(e) => setNewSection({ ...newSection, max_movies: parseInt(e.target.value) || 10 })}
                                    className="w-16 bg-black/30 rounded p-2 text-xs text-white border border-white/10"
                                />
                                <button onClick={handleCreateSection} className="px-4 py-2 text-xs bg-green-500 text-white rounded hover:bg-green-600">
                                    Create
                                </button>
                            </div>
                        </div>

                        {/* Sections List */}
                        <div className="space-y-3">
                            {homepageSections.length === 0 ? (
                                <div className="text-center py-8 text-white/40 text-sm">No sections yet. Create one above!</div>
                            ) : (
                                homepageSections.map((section) => (
                                    <div key={section.id} className="bg-white/[0.02] rounded-lg border border-white/10 overflow-hidden">
                                        {/* Section Header */}
                                        <div className="flex items-center justify-between p-3 border-b border-white/5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">{section.icon}</span>
                                                <div>
                                                    <span className="text-sm font-medium text-white">{section.name}</span>
                                                    <span className="text-[10px] text-white/40 ml-2">({section.slug})</span>
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 ml-2">
                                                        {section.section_type}
                                                    </span>
                                                    <span className="text-[10px] text-white/40 ml-2">
                                                        Order: {section.display_order}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleToggleSection(section.id)}
                                                    className={`px-2 py-1 text-[10px] rounded ${section.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}
                                                >
                                                    {section.is_active ? 'Active' : 'Hidden'}
                                                </button>
                                                <button
                                                    onClick={() => setEditingSection(editingSection === section.id ? null : section.id)}
                                                    className="px-2 py-1 text-[10px] rounded bg-blue-500/20 text-blue-400"
                                                >
                                                    {editingSection === section.id ? 'Close' : 'Edit'}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteSection(section.id)}
                                                    className="px-2 py-1 text-[10px] rounded bg-red-500/20 text-red-400"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>

                                        {/* Section Movies Preview */}
                                        <div className="p-3">
                                            {section.movies && section.movies.length > 0 ? (
                                                <div className="flex gap-2 overflow-x-auto pb-2">
                                                    {section.movies.map((movie) => (
                                                        <div key={movie.tmdb_id} className="relative flex-shrink-0 group">
                                                            <img
                                                                src={movie.poster_path ? `https://image.tmdb.org/t/p/w92${movie.poster_path}` : '/placeholder.png'}
                                                                alt={movie.title}
                                                                className="w-12 h-18 rounded"
                                                            />
                                                            {editingSection === section.id && (
                                                                <button
                                                                    onClick={() => handleRemoveMovieFromSection(section.id, movie.tmdb_id)}
                                                                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                                                                >
                                                                    ×
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-xs text-white/30 py-2">No movies added yet</div>
                                            )}
                                        </div>

                                        {/* Expanded Edit Section */}
                                        {editingSection === section.id && (
                                            <div className="p-3 border-t border-white/5 bg-black/20">
                                                <h5 className="text-xs font-medium text-white/60 mb-2">Add Movies to Section</h5>
                                                <div className="flex gap-2 mb-3">
                                                    <input
                                                        type="text"
                                                        placeholder="Search for movies..."
                                                        value={sectionMovieSearch}
                                                        onChange={(e) => setSectionMovieSearch(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && searchMoviesForSection()}
                                                        className="flex-1 bg-black/30 rounded p-2 text-xs text-white border border-white/10"
                                                    />
                                                    <button
                                                        onClick={searchMoviesForSection}
                                                        className="px-3 py-2 text-xs bg-orange-500 text-white rounded"
                                                    >
                                                        Search
                                                    </button>
                                                </div>
                                                {sectionSearchResults.length > 0 && (
                                                    <div className="flex gap-2 overflow-x-auto pb-2">
                                                        {sectionSearchResults.map((movie) => {
                                                            const alreadyAdded = section.movies?.some(m => m.tmdb_id === movie.id);
                                                            return (
                                                                <div key={movie.id} className="relative flex-shrink-0">
                                                                    <img
                                                                        src={movie.poster_path ? `https://image.tmdb.org/t/p/w92${movie.poster_path}` : '/placeholder.png'}
                                                                        alt={movie.title || movie.name}
                                                                        className="w-12 h-18 rounded"
                                                                    />
                                                                    <button
                                                                        onClick={() => handleAddMovieToSection(section.id, movie)}
                                                                        disabled={alreadyAdded}
                                                                        className={`absolute inset-0 flex items-center justify-center bg-black/60 text-white text-lg rounded ${alreadyAdded ? 'opacity-50 cursor-not-allowed' : 'opacity-0 hover:opacity-100'} transition-opacity`}
                                                                    >
                                                                        {alreadyAdded ? '✓' : '+'}
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Browse Tab */}
                {activeTab === 'browse' && (
                    <div>
                        <div className="mb-4">
                            <h1 className="text-xl font-bold text-white">🔍 Browse TMDB</h1>
                            <p className="text-xs text-white/40">Search and import movies from TMDB</p>
                        </div>

                        {/* Sub-tabs for Library page */}
                        <div className="flex gap-1 border-b border-white/10 mb-4">
                            <button
                                onClick={() => setActiveTab('library')}
                                className="px-3 py-2 text-xs font-medium text-white/50 hover:text-white"
                            >
                                📚 Library
                            </button>
                            <button
                                onClick={() => setActiveTab('browse')}
                                className="px-3 py-2 text-xs font-medium text-white border-b-2 border-orange-500"
                            >
                                🔍 Browse TMDB
                            </button>
                            <button
                                onClick={() => setActiveTab('bulk')}
                                className="px-3 py-2 text-xs font-medium text-white/50 hover:text-white"
                            >
                                ⚡ Bulk Import
                            </button>
                        </div>

                        {/* TMDB Search */}
                        <div className="bg-white/5 rounded p-3 mb-4">
                            <h4 className="text-xs font-medium text-white mb-2">🔍 Search TMDB</h4>
                            <div className="flex flex-col gap-2">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Search for a movie or TV show..."
                                        value={tmdbSearch}
                                        onChange={(e) => setTmdbSearch(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && searchTmdb()}
                                        className="flex-1 bg-black/30 rounded p-2 text-xs text-white border border-white/10"
                                    />
                                    <select
                                        value={tmdbSearchType}
                                        onChange={(e) => setTmdbSearchType(e.target.value)}
                                        className="bg-black/30 rounded px-2 text-xs text-white border border-white/10"
                                    >
                                        <option value="movie">Movie</option>
                                        <option value="tv">TV Show</option>
                                    </select>
                                    <button
                                        onClick={searchTmdb}
                                        className="px-3 py-2 text-xs bg-orange-500 text-white rounded hover:bg-orange-600"
                                    >
                                        Search
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Filters Row - Compact */}
                        <div className="bg-white/5 rounded p-3 mb-3">
                            <div className="grid grid-cols-5 gap-3">
                                {/* Media Type Dropdown */}
                                <div>
                                    <label className="text-xs text-white/60 mb-1 block">Content Type</label>
                                    <select
                                        value={tmdbMediaType}
                                        onChange={(e) => {
                                            setTmdbMediaType(e.target.value);
                                            if (tmdbSource && tmdbSource !== 'search') {
                                                fetchTmdb(tmdbSource);
                                            }
                                        }}
                                        className="w-full bg-black/30 rounded px-3 py-1.5 text-xs text-white border border-white/10"
                                    >
                                        <option value="movie">🎬 Movies</option>
                                        <option value="tv">📺 TV Series</option>
                                    </select>
                                </div>

                                {/* Results Limit Dropdown */}
                                <div>
                                    <label className="text-xs text-white/60 mb-1 block">Results Limit</label>
                                    <select
                                        value={tmdbResultsLimit}
                                        onChange={(e) => {
                                            const newLimit = Number(e.target.value);
                                            setTmdbResultsLimit(newLimit);
                                            if (tmdbSource && tmdbSource !== 'search') {
                                                fetchTmdb(tmdbSource, 1, false, newLimit);
                                            }
                                        }}
                                        className="w-full bg-black/30 rounded px-3 py-1.5 text-xs text-white border border-white/10"
                                    >
                                        <option value="20">20 movies</option>
                                        <option value="40">40 movies</option>
                                        <option value="60">60 movies</option>
                                        <option value="100">100 movies</option>
                                        <option value="150">150 movies</option>
                                        <option value="200">200 movies</option>
                                    </select>
                                </div>

                                {/* Region Filter (for Now Playing) */}
                                <div>
                                    <label className="text-xs text-white/60 mb-1 block">Region</label>
                                    <select
                                        value={tmdbRegion}
                                        onChange={(e) => {
                                            setTmdbRegion(e.target.value);
                                            if (tmdbSource && tmdbSource !== 'search') {
                                                fetchTmdb(tmdbSource);
                                            }
                                        }}
                                        className="w-full bg-black/30 rounded px-3 py-1.5 text-xs text-white border border-white/10"
                                    >
                                        <option value="">🌍 All Regions</option>
                                        <option value="US">🇺🇸 USA</option>
                                        <option value="IN">🇮🇳 India</option>
                                        <option value="GB">🇬🇧 UK</option>
                                        <option value="CA">🇨🇦 Canada</option>
                                        <option value="AU">🇦🇺 Australia</option>
                                    </select>
                                </div>

                                {/* Year Filter */}
                                <div>
                                    <label className="text-xs text-white/60 mb-1 block">Year</label>
                                    <div className="flex gap-1">
                                        <select
                                            value={tmdbYear}
                                            onChange={(e) => {
                                                setTmdbYear(e.target.value);
                                                if (tmdbSource && tmdbSource !== 'search') {
                                                    fetchTmdb(tmdbSource);
                                                }
                                            }}
                                            className="bg-black/30 rounded px-3 py-1.5 text-xs text-white border border-white/10"
                                        >
                                            <option value="">All Years</option>
                                            <option value="2030">2030</option>
                                            <option value="2029">2029</option>
                                            <option value="2028">2028</option>
                                            <option value="2027">2027</option>
                                            <option value="2026">2026</option>
                                            <option value="2025">2025</option>
                                            <option value="2024">2024</option>
                                            <option value="2023">2023</option>
                                            <option value="2022">2022</option>
                                            <option value="2021">2021</option>
                                            <option value="2020">2020</option>
                                            <option value="2019">2019</option>
                                            <option value="2018">2018</option>
                                            <option value="2017">2017</option>
                                            <option value="2016">2016</option>
                                            <option value="2015">2015</option>
                                            <option value="2010">2010</option>
                                            <option value="2005">2005</option>
                                            <option value="2000">2000</option>
                                            <option value="1995">1995</option>
                                            <option value="1990">1990</option>
                                            <option value="1985">1985</option>
                                            <option value="1980">1980</option>
                                            <option value="1975">1975</option>
                                            <option value="1970">1970</option>
                                            <option value="1965">1965</option>
                                            <option value="1960">1960</option>
                                            <option value="1955">1955</option>
                                            <option value="1950">1950</option>
                                            <option value="1945">1945</option>
                                            <option value="1940">1940</option>
                                        </select>
                                        <input
                                            type="number"
                                            placeholder="Custom"
                                            min="1900"
                                            max="2030"
                                            value={tmdbYear}
                                            onChange={(e) => {
                                                setTmdbYear(e.target.value);
                                                if (tmdbSource && tmdbSource !== 'search') {
                                                    fetchTmdb(tmdbSource);
                                                }
                                            }}
                                            className="w-20 bg-black/30 rounded px-2 py-1.5 text-xs text-white border border-white/10"
                                        />
                                        {tmdbYear && (
                                            <button
                                                onClick={() => {
                                                    setTmdbYear('');
                                                    if (tmdbSource && tmdbSource !== 'search') {
                                                        fetchTmdb(tmdbSource);
                                                    }
                                                }}
                                                className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Country Filter */}
                                <div>
                                    <label className="text-xs text-white/60 mb-1 block">Country</label>
                                    <select
                                        value={tmdbCountry}
                                        onChange={(e) => {
                                            setTmdbCountry(e.target.value);
                                            if (tmdbSource && tmdbSource !== 'search') {
                                                fetchTmdb(tmdbSource);
                                            }
                                        }}
                                        className="w-full bg-black/30 rounded px-3 py-1.5 text-xs text-white border border-white/10"
                                    >
                                        <option value="">All Countries</option>
                                        <option value="US">🇺🇸 United States</option>
                                        <option value="IN">🇮🇳 India</option>
                                        <option value="GB">🇬🇧 United Kingdom</option>
                                        <option value="FR">🇫🇷 France</option>
                                        <option value="DE">🇩🇪 Germany</option>
                                        <option value="JP">🇯🇵 Japan</option>
                                        <option value="KR">🇰🇷 South Korea</option>
                                        <option value="CN">🇨🇳 China</option>
                                        <option value="ES">🇪🇸 Spain</option>
                                        <option value="IT">🇮🇹 Italy</option>
                                        <option value="CA">🇨🇦 Canada</option>
                                        <option value="AU">🇦🇺 Australia</option>
                                        <option value="MX">🇲🇽 Mexico</option>
                                        <option value="BR">🇧🇷 Brazil</option>
                                        <option value="RU">🇷🇺 Russia</option>
                                        <option value="SE">🇸🇪 Sweden</option>
                                        <option value="NO">🇳🇴 Norway</option>
                                        <option value="DK">🇩🇰 Denmark</option>
                                        <option value="NL">🇳🇱 Netherlands</option>
                                    </select>
                                    {tmdbCountry && (
                                        <button
                                            onClick={() => {
                                                setTmdbCountry('');
                                                if (tmdbSource && tmdbSource !== 'search') {
                                                    fetchTmdb(tmdbSource);
                                                }
                                            }}
                                            className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Source Pills */}
                        <div className="flex gap-1 mb-3 overflow-x-auto pb-2">
                            {tmdbSources.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => { setTmdbSearch(''); fetchTmdb(s.id); }}
                                    className={`px-2 py-1 text-[10px] rounded whitespace-nowrap ${tmdbSource === s.id ? 'bg-orange-500 text-white' : 'bg-white/5 text-white/50'}`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>

                        {/* Results info */}
                        {bulkResult && (activeTab === 'browse' || activeTab === 'bulk') && (
                            <div className={`mb-3 p-2 rounded text-xs ${bulkResult.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {bulkResult.message || (bulkResult.success ? `✓ Saved ${bulkResult.savedCount} items` : '✗ Save failed')}
                            </div>
                        )}
                        {tmdbSource === 'search' && tmdbSearch && (
                            <div className="text-xs text-white/50 mb-2">
                                Search results for "{tmdbSearch}" ({tmdbSearchType === 'movie' ? 'Movies' : 'TV Shows'}) - {tmdbMovies.length} found
                            </div>
                        )}

                        {loadingTmdb ? (
                            <div className="text-center py-8 text-white/40 text-sm">Loading...</div>
                        ) : tmdbMovies.length > 0 ? (
                            <>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                                    {tmdbMovies.map(m => (
                                        <TMDBCard
                                            key={m.id}
                                            movie={m}
                                            mediaType={tmdbSource === 'search' ? tmdbSearchType : tmdbSources.find(s => s.id === tmdbSource)?.type}
                                            onSave={handleSave}
                                            onSaveFull={handleSaveFull}
                                            isSaved={advancedSavedIds.has(m.id) || savedIds.has(m.id.toString())}
                                            isSaving={savingIds.has(m.id)}
                                        />
                                    ))}
                                </div>

                                {/* Load More Button */}
                                {tmdbPage < tmdbTotalPages && (
                                    <div className="mt-4 text-center">
                                        <button
                                            onClick={loadMoreTmdb}
                                            disabled={loadingTmdb}
                                            className="px-6 py-2 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                                        >
                                            {loadingTmdb ? 'Loading...' : `Load More (Page ${tmdbPage + 1} of ${tmdbTotalPages})`}
                                        </button>
                                        <p className="text-xs text-white/40 mt-2">
                                            Showing {tmdbMovies.length} movies • Click to load ~60 more
                                        </p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-8 text-white/40 text-sm">
                                {tmdbSource === 'search' ? 'No results found. Try a different search.' : 'Select a source or search for movies.'}
                            </div>
                        )}
                    </div>
                )
                }

                {/* Bulk Tab */}
                {
                    activeTab === 'bulk' && (
                        <div>
                            <div className="mb-4">
                                <h1 className="text-xl font-bold text-white">⚡ Bulk Import</h1>
                                <p className="text-xs text-white/40">Import multiple movies or TV shows at once</p>
                            </div>

                            {/* Sub-tabs for Library page */}
                            <div className="flex gap-1 border-b border-white/10 mb-4">
                                <button
                                    onClick={() => setActiveTab('library')}
                                    className="px-3 py-2 text-xs font-medium text-white/50 hover:text-white"
                                >
                                    📚 Library
                                </button>
                                <button
                                    onClick={() => setActiveTab('browse')}
                                    className="px-3 py-2 text-xs font-medium text-white/50 hover:text-white"
                                >
                                    🔍 Browse TMDB
                                </button>
                                <button
                                    onClick={() => setActiveTab('bulk')}
                                    className="px-3 py-2 text-xs font-medium text-white border-b-2 border-orange-500"
                                >
                                    ⚡ Bulk Import
                                </button>
                            </div>


                            {/* Filters Row - Compact */}
                            <div className="bg-white/5 rounded p-3 mb-3">
                                <div className="grid grid-cols-5 gap-3">
                                    {/* Media Type Dropdown */}
                                    <div>
                                        <label className="text-xs text-white/60 mb-1 block">Content Type</label>
                                        <select
                                            value={tmdbMediaType}
                                            onChange={(e) => setTmdbMediaType(e.target.value)}
                                            className="w-full bg-black/30 rounded px-3 py-1.5 text-xs text-white border border-white/10"
                                        >
                                            <option value="movie">🎬 Movies</option>
                                            <option value="tv">📺 TV Series</option>
                                        </select>
                                    </div>

                                    {/* Results Limit Dropdown */}
                                    <div>
                                        <label className="text-xs text-white/60 mb-1 block">Results Limit</label>
                                        <select
                                            value={tmdbResultsLimit}
                                            onChange={(e) => setTmdbResultsLimit(parseInt(e.target.value))}
                                            className="w-full bg-black/30 rounded px-3 py-1.5 text-xs text-white border border-white/10"
                                        >
                                            <option value="20">20 movies</option>
                                            <option value="40">40 movies</option>
                                            <option value="60">60 movies</option>
                                            <option value="100">100 movies</option>
                                            <option value="150">150 movies</option>
                                            <option value="200">200 movies</option>
                                        </select>
                                    </div>

                                    {/* Region Filter (for Now Playing) */}
                                    <div>
                                        <label className="text-xs text-white/60 mb-1 block">Region</label>
                                        <select
                                            value={tmdbRegion}
                                            onChange={(e) => setTmdbRegion(e.target.value)}
                                            className="w-full bg-black/30 rounded px-3 py-1.5 text-xs text-white border border-white/10"
                                        >
                                            <option value="IN">🇮🇳 India</option>
                                            <option value="US">🇺🇸 USA</option>
                                            <option value="GB">🇬🇧 UK</option>
                                            <option value="CA">🇨🇦 Canada</option>
                                            <option value="AU">🇦🇺 Australia</option>
                                        </select>
                                    </div>

                                    {/* Year Filter */}
                                    <div>
                                        <label className="text-xs text-white/60 mb-1 block">Year</label>
                                        <div className="flex gap-1">
                                            <select
                                                value={tmdbYear}
                                                onChange={(e) => setTmdbYear(e.target.value)}
                                                className="bg-black/30 rounded px-3 py-1.5 text-xs text-white border border-white/10"
                                            >
                                                <option value="">All Years</option>
                                                <option value="2030">2030</option>
                                                <option value="2029">2029</option>
                                                <option value="2028">2028</option>
                                                <option value="2027">2027</option>
                                                <option value="2026">2026</option>
                                                <option value="2025">2025</option>
                                                <option value="2024">2024</option>
                                                <option value="2023">2023</option>
                                                <option value="2022">2022</option>
                                                <option value="2021">2021</option>
                                                <option value="2020">2020</option>
                                                <option value="2019">2019</option>
                                                <option value="2018">2018</option>
                                                <option value="2017">2017</option>
                                                <option value="2016">2016</option>
                                                <option value="2015">2015</option>
                                                <option value="2010">2010</option>
                                                <option value="2005">2005</option>
                                                <option value="2000">2000</option>
                                                <option value="1995">1995</option>
                                                <option value="1990">1990</option>
                                                <option value="1985">1985</option>
                                                <option value="1980">1980</option>
                                                <option value="1975">1975</option>
                                                <option value="1970">1970</option>
                                                <option value="1965">1965</option>
                                                <option value="1960">1960</option>
                                                <option value="1955">1955</option>
                                                <option value="1950">1950</option>
                                                <option value="1945">1945</option>
                                                <option value="1940">1940</option>
                                            </select>
                                            <input
                                                type="number"
                                                placeholder="Custom"
                                                min="1900"
                                                max="2030"
                                                value={tmdbYear}
                                                onChange={(e) => setTmdbYear(e.target.value)}
                                                className="w-20 bg-black/30 rounded px-2 py-1.5 text-xs text-white border border-white/10"
                                            />
                                            {tmdbYear && (
                                                <button
                                                    onClick={() => setTmdbYear('')}
                                                    className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Country Filter */}
                                    <div>
                                        <label className="text-xs text-white/60 mb-1 block">Country</label>
                                        <select
                                            value={tmdbCountry}
                                            onChange={(e) => setTmdbCountry(e.target.value)}
                                            className="w-full bg-black/30 rounded px-3 py-1.5 text-xs text-white border border-white/10"
                                        >
                                            <option value="">All Countries</option>
                                            <option value="US">🇺🇸 United States</option>
                                            <option value="IN">🇮🇳 India</option>
                                            <option value="GB">🇬🇧 United Kingdom</option>
                                            <option value="FR">🇫🇷 France</option>
                                            <option value="DE">🇩🇪 Germany</option>
                                            <option value="JP">🇯🇵 Japan</option>
                                            <option value="KR">🇰🇷 South Korea</option>
                                            <option value="CN">🇨🇳 China</option>
                                            <option value="ES">🇪🇸 Spain</option>
                                            <option value="IT">🇮🇹 Italy</option>
                                            <option value="CA">🇨🇦 Canada</option>
                                            <option value="AU">🇦🇺 Australia</option>
                                            <option value="MX">🇲🇽 Mexico</option>
                                            <option value="BR">🇧🇷 Brazil</option>
                                            <option value="RU">🇷🇺 Russia</option>
                                            <option value="SE">🇸🇪 Sweden</option>
                                            <option value="NO">🇳🇴 Norway</option>
                                            <option value="DK">🇩🇰 Denmark</option>
                                            <option value="NL">🇳🇱 Netherlands</option>
                                        </select>
                                        {tmdbCountry && (
                                            <button
                                                onClick={() => setTmdbCountry('')}
                                                className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 flex justify-end">
                                <button
                                    onClick={() => fetchTmdb(tmdbSource)}
                                    className="px-6 py-2 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 shadow-lg flex items-center gap-2"
                                >
                                    🔍 Search / Update Results
                                </button>
                            </div>

                            {/* Source Pills */}
                            <div className="flex gap-1 mb-3 overflow-x-auto pb-2">
                                {tmdbSources.map(s => (
                                    <button key={s.id} onClick={() => fetchTmdb(s.id)} className={`px-2 py-1 text-[10px] rounded whitespace-nowrap ${tmdbSource === s.id ? 'bg-orange-500 text-white' : 'bg-white/5 text-white/50'}`}>
                                        {s.label}
                                    </button>
                                ))}
                            </div>

                            {/* Bulk Save Section */}
                            {(() => {
                                const unsavedCount = tmdbMovies.filter(m => !advancedSavedIds.has(m.id) && !savedIds.has(m.id.toString())).length;
                                const savedCount = tmdbMovies.length - unsavedCount;
                                return (
                                    <div className="bg-white/5 rounded p-3 mb-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <span className="text-sm text-white font-medium">Bulk Import</span>
                                                <p className="text-[10px] text-white/40">
                                                    From: {tmdbSources.find(s => s.id === tmdbSource)?.label} ({tmdbMediaType === 'movie' ? 'Movies' : 'TV'})
                                                    {tmdbYear && ` • Year: ${tmdbYear}`}
                                                    {tmdbCountry && ` • Country: ${tmdbCountry}`}
                                                </p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={handleBulkSave} disabled={bulkSaving || bulkFullSaving || unsavedCount === 0} className="px-3 py-2 text-xs bg-white/10 text-white rounded disabled:opacity-50 hover:bg-white/20">
                                                    {bulkSaving ? 'Saving...' : `Quick Save`}
                                                </button>
                                                <button onClick={handleBulkSaveFull} disabled={bulkSaving || bulkFullSaving || unsavedCount === 0} className="px-3 py-2 text-xs bg-orange-500 text-white rounded disabled:opacity-50 hover:bg-orange-600 flex items-center gap-2">
                                                    {bulkFullSaving && (
                                                        <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                    )}
                                                    {bulkFullSaving ? `Saving...` : `⚡ Save Full Data (${unsavedCount})`}
                                                </button>
                                            </div>
                                        </div>
                                        {/* Stats Row */}
                                        <div className="flex gap-4 text-xs">
                                            <span className="text-white/60">
                                                📦 Total Loaded: <span className="text-white font-medium">{tmdbMovies.length}</span>
                                            </span>
                                            <span className="text-green-400">
                                                ✓ Already Saved: <span className="font-medium">{savedCount}</span>
                                            </span>
                                            <span className="text-orange-400">
                                                ↻ Ready to Save: <span className="font-medium">{unsavedCount}</span>
                                            </span>
                                        </div>
                                        {bulkResult && (
                                            <div className={`mt-2 p-2 rounded text-xs ${bulkResult.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {bulkResult.message || (bulkResult.success ? `✓ Saved ${bulkResult.savedCount} items` : `✗ Error`)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Load More Button */}
                            {tmdbPage < tmdbTotalPages && (
                                <div className="mb-3 text-center bg-white/5 rounded p-3">
                                    <button
                                        onClick={loadMoreTmdb}
                                        disabled={loadingTmdb}
                                        className="px-6 py-2 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                                    >
                                        {loadingTmdb ? 'Loading...' : `Load More Movies (Page ${tmdbPage + 1} of ${tmdbTotalPages})`}
                                    </button>
                                    <p className="text-xs text-white/40 mt-2">
                                        Currently loaded: {tmdbMovies.length} movies • Click to load ~60 more
                                    </p>
                                </div>
                            )}

                            {/* Movie Grid */}
                            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1">
                                {tmdbMovies.map(m => {
                                    const isSaved = advancedSavedIds.has(m.id) || savedIds.has(m.id.toString());
                                    const mediaType = tmdbSource === 'search' ? tmdbSearchType : tmdbMediaType;
                                    return (
                                        <div
                                            key={m.id}
                                            className="relative group cursor-pointer"
                                            onClick={() => openMovieModal(m, mediaType)}
                                        >
                                            <img
                                                src={m.poster_path ? `https://image.tmdb.org/t/p/w92${m.poster_path}` : '/placeholder.png'}
                                                alt={m.title || m.name}
                                                className="w-full rounded transition-transform group-hover:scale-105"
                                            />
                                            {isSaved && (
                                                <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5 pointer-events-none shadow-md border border-white/20">
                                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            )}
                                            {/* Hover tooltip */}
                                            <div className="absolute inset-x-0 bottom-0 bg-black/80 text-white text-[8px] p-1 opacity-0 group-hover:opacity-100 transition-opacity truncate pointer-events-none">
                                                {m.title || m.name}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )
                }

                {/* Movie Editor Tab */}
                {activeTab === 'editor' && (
                    <div className="max-w-5xl mx-auto">
                        <AdminMovieEditorPage />
                    </div>
                )}

                {/* Collections Tab */}
                {
                    activeTab === 'collections' && (
                        <div>
                            <div className="bg-white/5 rounded p-3 mb-4">
                                <h4 className="text-xs font-medium text-white mb-2">Create Collection</h4>
                                <div className="flex gap-2">
                                    <input type="text" placeholder="slug (e.g., must_watch)" value={newCollection.slug} onChange={(e) => setNewCollection({ ...newCollection, slug: e.target.value.toLowerCase().replace(/\s/g, '_') })} className="flex-1 bg-black/30 rounded p-2 text-xs text-white border border-white/10" />
                                    <input type="text" placeholder="Name" value={newCollection.name} onChange={(e) => setNewCollection({ ...newCollection, name: e.target.value })} className="flex-1 bg-black/30 rounded p-2 text-xs text-white border border-white/10" />
                                    <button onClick={handleCreateCollection} className="px-3 py-2 text-xs bg-green-500 text-white rounded">Create</button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {collections.map(c => (
                                    <div key={c.slug} className="flex items-center justify-between p-3 bg-white/[0.02] rounded border border-white/5">
                                        <div>
                                            <span className="text-sm text-white font-medium">{c.name}</span>
                                            <span className="text-xs text-white/40 ml-2">({c.slug})</span>
                                            {stats.collections?.[c.slug] && <span className="ml-2 text-xs text-orange-400">{stats.collections[c.slug]} movies</span>}
                                        </div>
                                        <button onClick={() => handleDeleteCollection(c.slug)} className="text-xs text-red-400">Delete</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                }

                {/* Maintenance Tab */}
                {activeTab === 'maintenance' && (
                    <div className="max-w-4xl mx-auto">
                        <div className="mb-6">
                            <h1 className="text-xl font-bold text-white">🛠️ Maintenance & Tools</h1>
                            <p className="text-xs text-white/40">Run scripts to fix data, migrate formats, or clean up the database.</p>
                        </div>

                        <div className="grid gap-6">

                            {/* Sync Upcoming Movies & Series Card */}
                            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-white mb-1">🎬 Sync Upcoming Movies & Series</h3>
                                        <p className="text-sm text-white/60 max-w-2xl">
                                            Fetches all upcoming movies and TV series from TMDB (multiple regions & pages) and saves them with full details to your database.
                                            The frontend Upcoming page will then load directly from DB — no TMDB API calls needed.
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-purple-400 font-mono bg-purple-500/10 px-2 py-1 rounded">
                                            Heavy Operation
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-black/30 rounded-lg p-4 border border-white/5 mb-4">
                                    <h4 className="text-xs font-bold text-white/40 uppercase mb-2">What This Does</h4>
                                    <ul className="text-xs text-white/60 space-y-1 list-disc pl-4">
                                        <li>Fetches upcoming movies from TMDB (US, IN, GB regions × 5 pages each)</li>
                                        <li>Fetches upcoming movies from Discover API (next 6 months, sorted by popularity)</li>
                                        <li>Fetches upcoming TV series (On The Air + future first air dates)</li>
                                        <li>Saves each item with full details (cast, videos, keywords)</li>
                                        <li>Stores poster/backdrop paths for TMDB CDN — no base64 bloat</li>
                                        <li>Deduplicates across regions — each movie saved once</li>
                                    </ul>
                                </div>

                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={handleSyncUpcoming}
                                        disabled={syncingUpcoming}
                                        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        {syncingUpcoming ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                                                Syncing... ({Math.round((upcomingProgress.current / (upcomingProgress.total || 1)) * 100)}%)
                                            </>
                                        ) : (
                                            <>🚀 Sync Upcoming Content</>
                                        )}
                                    </button>

                                    {syncingUpcoming && (
                                        <div className="text-xs text-white/50">
                                            Processed: {upcomingProgress.current} / {upcomingProgress.total} <br />
                                            Saved: {upcomingProgress.saved} items
                                        </div>
                                    )}
                                </div>

                                {/* Logs Console */}
                                {upcomingLogs.length > 0 && (
                                    <div className="mt-6">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-white/50">Execution Logs</span>
                                            <button onClick={() => setUpcomingLogs([])} className="text-[10px] text-white/30 hover:text-white">Clear</button>
                                        </div>
                                        <div className="bg-black/50 rounded-lg p-3 h-48 overflow-y-auto font-mono text-[10px] space-y-1 border border-white/5">
                                            {upcomingLogs.map((log, i) => (
                                                <div key={i} className={log.startsWith('❌') ? 'text-red-400' : log.startsWith('✅') || log.startsWith('✓') ? 'text-green-400' : log.startsWith('⚡') ? 'text-yellow-400' : 'text-gray-400'}>
                                                    {log}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Sync Cast Images Card */}
                            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-white mb-1">Sync Cast Images to Database</h3>
                                        <p className="text-sm text-white/60 max-w-2xl">
                                            This script scans your entire library and downloads base64 profile images for the top 10 cast members of each movie/show.
                                            This fixes missing cast images on mobile/offline views.
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-orange-400 font-mono bg-orange-500/10 px-2 py-1 rounded">
                                            Heavy Operation
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-black/30 rounded-lg p-4 border border-white/5 mb-4">
                                    <h4 className="text-xs font-bold text-white/40 uppercase mb-2">Process Details</h4>
                                    <ul className="text-xs text-white/60 space-y-1 list-disc pl-4">
                                        <li>Fetches all movies from <code>movies_library</code></li>
                                        <li>Checks <code>credits.cast</code> for missing <code>profile_base64</code></li>
                                        <li>Downloads images from TMDB and converts to Base64</li>
                                        <li>Updates the database record</li>
                                        <li>Skips movies that are already optimized.</li>
                                    </ul>
                                </div>

                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={handleSyncCastImages}
                                        disabled={syncingImages}
                                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        {syncingImages ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                                                Syncing... ({Math.round((syncProgress.current / (syncProgress.total || 1)) * 100)}%)
                                            </>
                                        ) : (
                                            <>🚀 Start Sync Process</>
                                        )}
                                    </button>

                                    {syncingImages && (
                                        <div className="text-xs text-white/50">
                                            Processed: {syncProgress.current} / {syncProgress.total} <br />
                                            Updated: {syncProgress.updated} records
                                        </div>
                                    )}
                                </div>

                                {/* Logs Console */}
                                {syncLogs.length > 0 && (
                                    <div className="mt-6">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-white/50">Execution Logs</span>
                                            <button onClick={() => setSyncLogs([])} className="text-[10px] text-white/30 hover:text-white">Clear</button>
                                        </div>
                                        <div className="bg-black/50 rounded-lg p-3 h-48 overflow-y-auto font-mono text-[10px] space-y-1 border border-white/5">
                                            {syncLogs.map((log, i) => (
                                                <div key={i} className={log.startsWith('❌') ? 'text-red-400' : log.startsWith('✓') ? 'text-green-400' : 'text-gray-400'}>
                                                    {log}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                )}
            </div >

            {/* Edit Modal */}
            {editMovie && <EditModal movie={editMovie} collections={collections} onClose={() => setEditMovie(null)} onSave={handleUpdate} />}

            {/* Movie Details Modal */}
            <MovieDetailsModal
                selectedMovie={selectedMovie}
                movieDetails={movieDetails}
                loadingDetails={loadingDetails}
                onClose={closeMovieModal}
            />

            {/* Bulk Saving Overlay - Full screen loader */}
            {
                bulkFullSaving && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center">
                        {/* Blurred backdrop */}
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>

                        {/* Loading Card */}
                        <div className="relative z-10 bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 shadow-2xl border border-white/10 min-w-[400px] max-w-md">
                            {/* Header */}
                            <div className="text-center mb-6">
                                <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500/20 rounded-full mb-4">
                                    <svg className="animate-spin h-8 w-8 text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-1">Saving Movies</h3>
                                <p className="text-white/60 text-sm">Please wait while we save your movies with full data...</p>
                            </div>

                            {/* Progress Bar */}
                            <div className="mb-4">
                                <div className="flex justify-between text-sm text-white/80 mb-2">
                                    <span>Progress</span>
                                    <span>{bulkFullProgress.current} of {bulkFullProgress.total}</span>
                                </div>
                                <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                                    <div
                                        className="bg-gradient-to-r from-orange-500 to-orange-400 h-3 rounded-full transition-all duration-300 ease-out"
                                        style={{ width: `${(bulkFullProgress.current / bulkFullProgress.total) * 100}%` }}
                                    ></div>
                                </div>
                            </div>

                            {/* Percentage */}
                            <div className="text-center">
                                <span className="text-3xl font-bold text-orange-500">
                                    {Math.round((bulkFullProgress.current / bulkFullProgress.total) * 100)}%
                                </span>
                                <p className="text-white/40 text-xs mt-2">
                                    ⚡ Fetching full TMDB data including cast, crew, videos, images...
                                </p>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default AdminPanel;
