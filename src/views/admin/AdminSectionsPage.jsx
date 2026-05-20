import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import {
    supabase,
    getHomepageSections,
    createHomepageSection,
    updateHomepageSection,
    deleteHomepageSection,
    toggleHomepageSectionActive,
    reorderHomepageSections,
    saveFullMovieToLibrary
} from "../../lib/supabase";
import { useToast } from "../../components/Toast";

// Available regions for fetching content
const REGIONS = [
    { code: "IN", name: "India", flag: "🇮🇳" },
    { code: "US", name: "United States", flag: "🇺🇸" },
    { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
    { code: "CA", name: "Canada", flag: "🇨🇦" },
    { code: "AU", name: "Australia", flag: "🇦🇺" },
    { code: "DE", name: "Germany", flag: "🇩🇪" },
    { code: "FR", name: "France", flag: "🇫🇷" },
    { code: "JP", name: "Japan", flag: "🇯🇵" },
    { code: "KR", name: "South Korea", flag: "🇰🇷" },
    { code: "BR", name: "Brazil", flag: "🇧🇷" },
];

// Language codes by region for discover API
const REGION_LANGUAGES = {
    IN: 'en|hi|ta|te|ml|kn|bn|mr',
    US: 'en',
    GB: 'en',
    CA: 'en|fr',
    AU: 'en',
    DE: 'de|en',
    FR: 'fr|en',
    JP: 'ja|en',
    KR: 'ko|en',
    BR: 'pt|en',
};

// API endpoints for fetching movies based on section type
const API_ENDPOINTS = {
    trending: "/trending/all/week",
    trending_movies: "/trending/movie/week",
    trending_tv: "/trending/tv/week",
    now_playing: "/movie/now_playing", // Needs region parameter
    popular: "/movie/popular",
    popular_tv: "/tv/popular",
    top_rated: "/movie/top_rated",
    top_rated_tv: "/tv/top_rated",
    upcoming: "/movie/upcoming", // Use official upcoming endpoint with region
    coming_soon: "/discover/movie", // Use discover for flexible date filtering
    airing_today: "/tv/airing_today",
    on_the_air: "/tv/on_the_air",
    provider_8: "/discover/movie",
    provider_119: "/discover/movie",
    provider_122: "/discover/movie",
    provider_337: "/discover/movie",
    provider_350: "/discover/movie",
};

const AdminSectionsPage = () => {
    // Toast notifications
    const toast = useToast();

    // Saved sections from DB
    const [savedSections, setSavedSections] = useState([]);
    // Working copy for editing (staged changes)
    const [sections, setSections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newSection, setNewSection] = useState({ name: "", icon: "🎬", section_type: "manual", api_source: "trending", max_movies: 10 });
    const [editingSection, setEditingSection] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [fetchingApi, setFetchingApi] = useState(null);

    // Region selection for API fetches
    const [selectedRegion, setSelectedRegion] = useState(REGIONS[0]); // Default India

    // Content mode: 'movies' or 'tv' - for managing different section types
    const [contentMode, setContentMode] = useState('movies');

    // Track if there are unsaved changes
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [saving, setSaving] = useState(false);

    // Ref to preserve scroll position
    const containerRef = useRef(null);
    const scrollPositionRef = useRef(0);

    // Load sections from DB based on content mode
    const loadSections = useCallback(async (preserveScroll = false) => {
        if (preserveScroll && containerRef.current) {
            scrollPositionRef.current = containerRef.current.scrollTop;
        }

        setLoading(true);

        // Load from appropriate table based on content mode
        const tableName = contentMode === 'tv' ? 'tv_sections' : 'homepage_sections';

        try {
            // For TV mode, try tv_sections first, fall back to homepage_sections
            let data;
            if (contentMode === 'tv') {
                const { data: tvData, error: tvError } = await supabase
                    .from('tv_sections')
                    .select('*')
                    .order('display_order', { ascending: true });

                if (!tvError && tvData && tvData.length > 0) {
                    data = tvData;
                } else {
                    // Fall back to homepage_sections but filter for TV
                    data = await getHomepageSections();
                    // You may want to filter or mark these
                }
            } else {
                data = await getHomepageSections();
            }

            setSavedSections(data || []);
            setSections(data || []);
        } catch (err) {
            console.error('Error loading sections:', err);
            const data = await getHomepageSections();
            setSavedSections(data || []);
            setSections(data || []);
        }

        setHasUnsavedChanges(false);
        setLoading(false);

        // Restore scroll position
        if (preserveScroll && containerRef.current) {
            requestAnimationFrame(() => {
                containerRef.current.scrollTop = scrollPositionRef.current;
            });
        }
    }, [contentMode]);

    useEffect(() => {
        loadSections();
    }, [loadSections, contentMode]);

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
            // Filter results based on content mode
            const targetType = contentMode === 'tv' ? 'tv' : 'movie';
            const results = response.data.results
                ?.filter(r => r.media_type === targetType)
                .slice(0, 12) || [];
            setSearchResults(results);
        } catch (error) {
            console.error("Search error:", error);
        }
        setSearchLoading(false);
    };

    // Helper to get date strings for API filters
    const getDateFilters = () => {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const threeMonthsAhead = new Date(today);
        threeMonthsAhead.setMonth(threeMonthsAhead.getMonth() + 3);
        const threeMonthsStr = threeMonthsAhead.toISOString().split('T')[0];
        const sixMonthsAhead = new Date(today);
        sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6);
        const sixMonthsStr = sixMonthsAhead.toISOString().split('T')[0];
        return { todayStr, threeMonthsStr, sixMonthsStr };
    };

    // Fetch content from API for a section - STAGES changes locally
    const handleFetchFromApi = async (section) => {
        setFetchingApi(section.id);
        try {
            let endpoint = "/trending/all/week";
            let params = { page: 1 };
            const { todayStr, sixMonthsStr } = getDateFilters();
            const regionCode = selectedRegion.code;
            const regionLanguages = REGION_LANGUAGES[regionCode] || 'en';

            console.log(`🌍 Fetching for region: ${selectedRegion.name} (${regionCode}), Mode: ${contentMode}`);

            // ============================================
            // TV MODE: Override ALL endpoints to fetch TV content
            // ============================================
            if (contentMode === 'tv') {
                console.log(`📺 TV Mode active - forcing TV endpoints`);

                if (section.api_source?.startsWith("provider_")) {
                    // Streaming provider - use /discover/tv
                    const providerId = section.api_source.split("_")[1];
                    endpoint = "/discover/tv";
                    params = {
                        with_watch_providers: providerId,
                        watch_region: regionCode,
                        sort_by: "popularity.desc",
                        page: 1
                    };
                } else if (section.api_source === 'trending' || section.api_source === 'trending_tv' || section.api_source === 'trending_movies') {
                    // Trending - use TV trending
                    endpoint = "/trending/tv/week";
                    params = { page: 1 };
                } else if (section.api_source === 'popular' || section.api_source === 'popular_tv') {
                    endpoint = "/tv/popular";
                    params = { page: 1 };
                } else if (section.api_source === 'top_rated' || section.api_source === 'top_rated_tv') {
                    endpoint = "/tv/top_rated";
                    params = { page: 1 };
                } else if (section.api_source === 'airing_today') {
                    endpoint = "/tv/airing_today";
                    params = { page: 1 };
                } else if (section.api_source === 'on_the_air') {
                    endpoint = "/tv/on_the_air";
                    params = { page: 1 };
                } else {
                    // Default for TV mode - trending TV
                    endpoint = "/trending/tv/week";
                    params = { page: 1 };
                }
            } else {
                // ============================================
                // MOVIES MODE: Use movie endpoints
                // ============================================
                endpoint = API_ENDPOINTS[section.api_source] || "/trending/movie/week";

                if (section.api_source === 'now_playing') {
                    params = { region: regionCode, page: 1 };
                } else if (section.api_source === 'upcoming') {
                    params = { region: regionCode, page: 1 };
                } else if (section.api_source === 'coming_soon') {
                    endpoint = "/discover/movie";
                    params = {
                        region: regionCode,
                        'primary_release_date.gte': todayStr,
                        'primary_release_date.lte': sixMonthsStr,
                        sort_by: 'popularity.desc',
                        with_original_language: regionLanguages,
                        page: 1
                    };
                } else if (section.api_source?.startsWith("provider_")) {
                    const providerId = section.api_source.split("_")[1];
                    endpoint = "/discover/movie";
                    params = {
                        with_watch_providers: providerId,
                        watch_region: regionCode,
                        sort_by: "popularity.desc",
                        page: 1
                    };
                } else if (['popular', 'top_rated'].includes(section.api_source)) {
                    params = { region: regionCode, page: 1 };
                }
            }

            // Determine media type based on content mode
            const defaultMediaType = contentMode === 'tv' ? 'tv' : 'movie';

            console.log(`🔄 Fetching ${section.api_source} from: ${endpoint} (mediaType: ${defaultMediaType})`, params);

            const response = await axios.get(endpoint, { params });
            let items = response.data.results?.slice(0, section.max_movies || 10) || [];

            // Filter for upcoming (movies only)
            if (contentMode !== 'tv' && (section.api_source === 'upcoming' || section.api_source === 'coming_soon')) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                items = items.filter(item => {
                    const releaseDate = new Date(item.release_date);
                    return releaseDate >= today;
                });
            }

            console.log(`📦 Found ${items.length} ${defaultMediaType === 'tv' ? 'TV shows' : 'movies'} for ${section.name}`);

            // Save each item to library and prepare section data
            const itemDataPromises = items.map(async (item) => {
                const mediaType = item.media_type || defaultMediaType;
                try {
                    const detailEndpoint = mediaType === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`;
                    const detailResponse = await axios.get(detailEndpoint, {
                        params: { append_to_response: 'credits,videos,images,release_dates,keywords,similar,recommendations,reviews' }
                    });
                    const fullData = detailResponse.data;

                    // Save to library with correct media_type
                    await saveFullMovieToLibrary(fullData, { media_type: mediaType });

                    return {
                        tmdb_id: item.id,
                        title: fullData.title || fullData.name,
                        poster_path: fullData.poster_path,
                        backdrop_path: fullData.backdrop_path,
                        media_type: mediaType,
                        release_date: fullData.release_date || fullData.first_air_date,
                        vote_average: fullData.vote_average,
                        overview: fullData.overview,
                        popularity: fullData.popularity,
                        original_language: fullData.original_language,
                        genres: fullData.genres,
                        runtime: fullData.runtime || fullData.episode_run_time?.[0],
                        number_of_seasons: fullData.number_of_seasons,
                        number_of_episodes: fullData.number_of_episodes,
                        order: items.indexOf(item) + 1
                    };
                } catch (err) {
                    console.log(`⚠️ Fallback for ${item.title || item.name}`);
                    return {
                        tmdb_id: item.id,
                        title: item.title || item.name,
                        poster_path: item.poster_path,
                        backdrop_path: item.backdrop_path,
                        media_type: mediaType,
                        release_date: item.release_date || item.first_air_date,
                        vote_average: item.vote_average,
                        overview: item.overview,
                        order: items.indexOf(item) + 1
                    };
                }
            });

            const itemData = await Promise.all(itemDataPromises);

            // Update locally (staged) - save items BY REGION
            setSections(prev => prev.map(s => {
                if (s.id !== section.id) return s;
                const existingMoviesByRegion = s.movies_by_region || {};
                return {
                    ...s,
                    movies_by_region: {
                        ...existingMoviesByRegion,
                        [selectedRegion.code]: itemData
                    }
                };
            }));
            setHasUnsavedChanges(true);
            console.log(`✅ Staged ${itemData.length} ${defaultMediaType === 'tv' ? 'TV shows' : 'movies'} for "${section.name}" in ${selectedRegion.name} region`);
            toast.success(`Saved ${itemData.length} ${defaultMediaType === 'tv' ? 'TV shows' : 'movies'} for ${selectedRegion.flag} ${selectedRegion.name}`);

        } catch (error) {
            console.error("Error fetching from API:", error);
            toast.error("Failed to fetch content. Check console for details.");
        }
        setFetchingApi(null);
    };

    // Create section (immediate save since it's a new item)
    const handleCreateSection = async () => {
        if (!newSection.name.trim()) return;
        const slug = newSection.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        if (contentMode === 'tv') {
            // Create in tv_sections table
            const { error } = await supabase
                .from('tv_sections')
                .insert({
                    ...newSection,
                    slug,
                    display_order: sections.length + 1,
                    movies_by_region: {}
                });

            if (error) {
                console.error('Error creating TV section:', error);
                toast.error('Failed to create TV section');
                return;
            }
            toast.success(`TV Section "${newSection.name}" created!`);
        } else {
            await createHomepageSection({ ...newSection, slug });
            toast.success(`Section "${newSection.name}" created!`);
        }

        setNewSection({ name: "", icon: "🎬", section_type: "manual", api_source: "trending", max_movies: 10 });
        await loadSections(true);
    };

    // Delete section (immediate save)
    const handleDelete = async (id, isSystem) => {
        if (isSystem) {
            toast.warning("System sections cannot be deleted");
            return;
        }
        if (confirm("Delete this section?")) {
            await deleteHomepageSection(id);
            toast.success("Section deleted");
            await loadSections(true);
        }
    };

    // Toggle active - stages locally
    const handleToggle = (id) => {
        setSections(prev => prev.map(s =>
            s.id === id ? { ...s, is_active: !s.is_active } : s
        ));
        setHasUnsavedChanges(true);
    };

    // Processing state for specific sections (loader)
    const [processingSectionId, setProcessingSectionId] = useState(null);
    const [addingMovieId, setAddingMovieId] = useState(null);

    // Add movie to section - AUTO SAVES to DB
    const handleAddMovie = async (sectionId, movie) => {
        try {
            setProcessingSectionId(sectionId); // Start loading section
            setAddingMovieId(movie.id); // Start loading specific movie card
            const mediaType = movie.media_type || "movie";
            console.log(`📥 Fetching full data for: ${movie.title || movie.name}`);

            // Fetch full movie details
            const detailEndpoint = mediaType === "tv" ? `/tv/${movie.id}` : `/movie/${movie.id}`;
            const detailResponse = await axios.get(detailEndpoint, {
                params: { append_to_response: 'credits,videos,images,release_dates,keywords,similar,recommendations,reviews' }
            });
            const fullData = detailResponse.data;

            // Save to library (immediate)
            await saveFullMovieToLibrary(fullData);
            console.log(`✓ Saved to library: ${fullData.title || fullData.name}`);

            // Get existing movies for this section (for selected region)
            const section = sections.find(s => s.id === sectionId);
            const regionCode = selectedRegion.code;
            const currentMovies = section?.movies_by_region?.[regionCode] || [];

            // Check if already added
            if (currentMovies.some(m => m.tmdb_id === movie.id)) {
                console.log('Movie already in section');
                toast.warning('Movie is already in this section');
                setProcessingSectionId(null);
                return;
            }

            const newMovie = {
                tmdb_id: movie.id,
                title: fullData.title || fullData.name,
                poster_path: fullData.poster_path,
                backdrop_path: fullData.backdrop_path,
                media_type: mediaType,
                release_date: fullData.release_date || fullData.first_air_date,
                vote_average: fullData.vote_average,
                overview: fullData.overview,
                popularity: fullData.popularity,
                original_language: fullData.original_language,
                genres: fullData.genres,
                runtime: fullData.runtime || fullData.episode_run_time?.[0],
                order: currentMovies.length + 1
            };

            // Calculate updated section data
            const updatedMoviesByRegion = {
                ...section.movies_by_region,
                [regionCode]: [...(section.movies_by_region?.[regionCode] || []), newMovie]
            };

            const updatedSection = {
                ...section,
                movies_by_region: updatedMoviesByRegion
            };

            // Update locally
            setSections(prev => prev.map(s => s.id === sectionId ? updatedSection : s));

            // AUTO SAVE: Save this specific section immediately
            // Optimization: Strip heavy images before saving section
            const optimizedMoviesByRegion = {};
            Object.keys(updatedMoviesByRegion).forEach(code => {
                const movies = updatedMoviesByRegion[code] || [];
                optimizedMoviesByRegion[code] = movies.map(m => {
                    const { images, videos, credits, similar, recommendations, reviews, ...cleanMovie } = m;
                    return cleanMovie;
                });
            });

            if (contentMode === 'tv') {
                await supabase.from('tv_sections')
                    .update({
                        movies_by_region: optimizedMoviesByRegion,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', sectionId);
            } else {
                await updateHomepageSection(sectionId, {
                    movies_by_region: optimizedMoviesByRegion
                });
            }

            setSearchQuery("");
            setSearchResults([]);
            console.log(`✅ Auto-saved movie "${newMovie.title}"`);
            toast.success(`Added & Saved "${newMovie.title}"`);

        } catch (error) {
            console.error("Error adding movie:", error);
            toast.error("Failed to add movie");
        } finally {
            setProcessingSectionId(null); // Stop loading
            setAddingMovieId(null);
        }
    };

    // Remove movie from section - STAGES locally (removes from SELECTED region)
    const handleRemoveMovie = (sectionId, tmdbId) => {
        setSections(prev => prev.map(s => {
            if (s.id !== sectionId) return s;
            const regionCode = selectedRegion.code;
            const currentMovies = s.movies_by_region?.[regionCode] || [];
            return {
                ...s,
                movies_by_region: {
                    ...s.movies_by_region,
                    [regionCode]: currentMovies.filter(m => m.tmdb_id !== tmdbId)
                }
            };
        }));
        setHasUnsavedChanges(true);
    };

    // Movie drag state for reordering within a section
    const [draggedMovie, setDraggedMovie] = useState(null);
    const [draggedMovieSectionId, setDraggedMovieSectionId] = useState(null);

    // Handle movie drag start
    const handleMovieDragStart = (e, sectionId, movieIndex) => {
        e.stopPropagation(); // Prevent section drag
        setDraggedMovie(movieIndex);
        setDraggedMovieSectionId(sectionId);
        e.dataTransfer.effectAllowed = 'move';
    };

    // Handle movie drag over - reorder within SELECTED region
    const handleMovieDragOver = (e, sectionId, movieIndex) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedMovie === null || draggedMovieSectionId !== sectionId || draggedMovie === movieIndex) return;

        const regionCode = selectedRegion.code;

        // Reorder movies within the selected region
        setSections(prev => prev.map(s => {
            if (s.id !== sectionId) return s;
            const movies = [...(s.movies_by_region?.[regionCode] || [])];
            const [removed] = movies.splice(draggedMovie, 1);
            movies.splice(movieIndex, 0, removed);
            return {
                ...s,
                movies_by_region: {
                    ...s.movies_by_region,
                    [regionCode]: movies
                }
            };
        }));
        setDraggedMovie(movieIndex);
        setHasUnsavedChanges(true);
    };

    // Handle movie drag end
    const handleMovieDragEnd = () => {
        setDraggedMovie(null);
        setDraggedMovieSectionId(null);
    };

    // Move movie left/right with buttons (for selected region)
    const handleMoveMovie = (sectionId, currentIndex, direction) => {
        const regionCode = selectedRegion.code;
        setSections(prev => prev.map(s => {
            if (s.id !== sectionId) return s;
            const movies = [...(s.movies_by_region?.[regionCode] || [])];
            const newIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
            if (newIndex < 0 || newIndex >= movies.length) return s;
            [movies[currentIndex], movies[newIndex]] = [movies[newIndex], movies[currentIndex]];
            return {
                ...s,
                movies_by_region: {
                    ...s.movies_by_region,
                    [regionCode]: movies
                }
            };
        }));
        setHasUnsavedChanges(true);
    };

    // Clear all movies from section - STAGES locally
    const handleClearMovies = (sectionId) => {
        if (confirm("Remove all movies from this section?")) {
            setSections(prev => prev.map(s =>
                s.id === sectionId ? { ...s, movies: [] } : s
            ));
            setHasUnsavedChanges(true);
        }
    };

    // SAVE ALL CHANGES TO DATABASE
    const handleSaveChanges = async () => {
        setSaving(true);
        try {
            const tableName = contentMode === 'tv' ? 'tv_sections' : 'homepage_sections';
            console.log(`💾 Saving all changes to ${tableName}...`);

            // Find changed sections and save them
            for (const section of sections) {
                const savedVersion = savedSections.find(s => s.id === section.id);
                if (!savedVersion) continue;

                // Check if anything changed
                const moviesByRegionChanged = JSON.stringify(section.movies_by_region) !== JSON.stringify(savedVersion.movies_by_region);
                const activeChanged = section.is_active !== savedVersion.is_active;

                if (moviesByRegionChanged || activeChanged) {
                    // Count total items across all regions
                    const totalItems = Object.values(section.movies_by_region || {}).reduce((acc, arr) => acc + (arr?.length || 0), 0);
                    const regionCount = Object.keys(section.movies_by_region || {}).length;
                    console.log(`  Updating section: ${section.name} (${totalItems} ${contentMode === 'tv' ? 'shows' : 'movies'} across ${regionCount} regions)`);

                    // ========================================================
                    // OPTIMIZATION: Strip heavy Base64 images before saving section
                    // We only need TMDB ID + basic info. Images are now in movies_library.
                    // This creates a lightweight payload for fast saving.
                    // ========================================================
                    const optimizedMoviesByRegion = {};
                    if (section.movies_by_region) {
                        Object.keys(section.movies_by_region).forEach(code => {
                            const movies = section.movies_by_region[code] || [];
                            optimizedMoviesByRegion[code] = movies.map(m => {
                                // Create a clean copy WITHOUT images/videos arrays
                                // We keep essential UI data for fast initial render if hydration fails
                                const { images, videos, credits, similar, recommendations, reviews, ...cleanMovie } = m;
                                return cleanMovie;
                            });
                        });
                    }

                    // Save to appropriate table
                    if (contentMode === 'tv') {
                        // For TV mode - check if this section exists in tv_sections or needs to be created
                        // First try to update, if not found, insert
                        const { data: existingSection, error: checkError } = await supabase
                            .from('tv_sections')
                            .select('id')
                            .eq('id', section.id)
                            .maybeSingle(); // Changed from single() to maybeSingle() to avoid 406 error

                        if (existingSection) {
                            // Update existing tv_sections record
                            const { error } = await supabase
                                .from('tv_sections')
                                .update({
                                    movies_by_region: optimizedMoviesByRegion, // Save CLEAN data
                                    is_active: section.is_active,
                                    updated_at: new Date().toISOString()
                                })
                                .eq('id', section.id);

                            if (error) {
                                console.error('Error updating tv_sections:', error);
                                throw error;
                            }
                        } else {
                            // Section doesn't exist in tv_sections - need to create it
                            // This happens when falling back to homepage_sections
                            console.log(`  Creating new TV section for: ${section.name}`);
                            const { error } = await supabase
                                .from('tv_sections')
                                .insert({
                                    name: section.name,
                                    slug: section.slug || section.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                                    icon: section.icon,
                                    description: section.description,
                                    section_type: section.section_type,
                                    api_source: section.api_source,
                                    display_order: section.display_order,
                                    movies_by_region: optimizedMoviesByRegion, // Save CLEAN data
                                    is_active: section.is_active
                                });

                            if (error) {
                                console.error('Error creating tv_section:', error);
                                throw error;
                            }
                        }
                    } else {
                        // Movies mode - saves to homepage_sections
                        const { error } = await updateHomepageSection(section.id, {
                            movies_by_region: optimizedMoviesByRegion, // Save CLEAN data
                            is_active: section.is_active
                        });

                        if (error) throw error;
                    }
                }
            }



            // Save reorder if changed
            const orderChanged = JSON.stringify(sections.map(s => s.id)) !== JSON.stringify(savedSections.map(s => s.id));
            if (orderChanged) {
                console.log('  Updating section order...');
                if (contentMode === 'tv') {
                    // Reorder tv_sections
                    for (let i = 0; i < sections.length; i++) {
                        await supabase
                            .from('tv_sections')
                            .update({ display_order: i + 1 })
                            .eq('id', sections[i].id);
                    }
                } else {
                    await reorderHomepageSections(sections.map(s => s.id));
                }
            }

            // Reload from DB to confirm
            await loadSections(true);
            console.log('✅ All changes saved and published!');
            toast.success(`Changes saved and published to the ${contentMode === 'tv' ? 'Series page' : 'Homepage'}!`);

        } catch (error) {
            console.error('Error saving changes:', error);
            toast.error('Failed to save changes. Please try again.');
        }
        setSaving(false);
    };

    // Discard changes
    const handleDiscardChanges = () => {
        if (confirm("Discard all unsaved changes?")) {
            setSections([...savedSections]);
            setHasUnsavedChanges(false);
        }
    };

    // Drag and drop handlers - STAGES locally
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
        setHasUnsavedChanges(true);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        // Don't save to DB here - just mark as having changes
    };

    return (
        <div className="p-6 h-full overflow-auto" ref={containerRef}>
            {/* Header with Save Button and Content Mode Toggle */}
            <div className="mb-6 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-white">
                            {contentMode === 'movies' ? '🎬 Movie Sections' : '📺 TV Series Sections'}
                        </h1>
                        <p className="text-white/50 text-sm">
                            Manage {contentMode === 'movies' ? 'movie' : 'TV series'} sections displayed on the {contentMode === 'movies' ? 'homepage' : 'Series page'}. Changes are staged locally until you click Save.
                        </p>
                    </div>

                    {/* Save/Discard Buttons */}
                    <div className="flex items-center gap-3">
                        {hasUnsavedChanges && (
                            <>
                                <span className="text-yellow-400 text-sm animate-pulse">● Unsaved changes</span>
                                <button
                                    onClick={handleDiscardChanges}
                                    className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
                                >
                                    Discard
                                </button>
                            </>
                        )}
                        <button
                            onClick={handleSaveChanges}
                            disabled={!hasUnsavedChanges || saving}
                            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${hasUnsavedChanges
                                ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-lg shadow-green-500/20'
                                : 'bg-white/10 text-white/30 cursor-not-allowed'
                                }`}
                        >
                            {saving ? '⏳ Saving...' : '💾 Save & Publish'}
                        </button>
                    </div>
                </div>

                {/* Content Mode Toggle - Movies / TV */}
                <div className="flex items-center gap-2">
                    <span className="text-white/40 text-sm mr-2">Content Type:</span>
                    <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
                        <button
                            onClick={() => setContentMode('movies')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${contentMode === 'movies'
                                ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/20'
                                : 'text-white/50 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            🎬 Movies
                        </button>
                        <button
                            onClick={() => setContentMode('tv')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${contentMode === 'tv'
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20'
                                : 'text-white/50 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            📺 TV Series
                        </button>
                    </div>
                    <span className="text-xs text-white/30 ml-3">
                        {contentMode === 'movies'
                            ? 'Managing sections for the In Theaters / Homepage'
                            : 'Managing sections for the Series page'
                        }
                    </span>
                </div>
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
                        className="w-16 bg-black/30 rounded-lg px-3 py-2 text-sm text-center text-white border border-white/10 focus:border-orange-500/50 outline-none"
                    />
                    <select
                        value={newSection.section_type}
                        onChange={(e) => setNewSection({ ...newSection, section_type: e.target.value })}
                        className="bg-black/30 rounded-lg px-4 py-2 text-sm text-white border border-white/10 outline-none"
                    >
                        <option value="manual">Manual</option>
                        <option value="api">API Source</option>
                    </select>
                    {newSection.section_type === 'api' && (
                        <select
                            value={newSection.api_source}
                            onChange={(e) => setNewSection({ ...newSection, api_source: e.target.value })}
                            className="bg-black/30 rounded-lg px-4 py-2 text-sm text-white border border-white/10 outline-none"
                        >
                            <option value="trending">Trending</option>
                            <option value="now_playing">Now Playing</option>
                            <option value="popular">Popular</option>
                            <option value="top_rated">Top Rated</option>
                            <option value="upcoming">Upcoming</option>
                            <option value="coming_soon">Coming Soon</option>
                            <option value="airing_today">Airing Today (TV)</option>
                            <option value="on_the_air">On The Air (TV)</option>
                            <option value="popular_tv">Popular TV</option>
                            <option value="top_rated_tv">Top Rated TV</option>
                        </select>
                    )}
                    <input
                        type="number"
                        placeholder="Max"
                        value={newSection.max_movies}
                        onChange={(e) => setNewSection({ ...newSection, max_movies: parseInt(e.target.value) || 10 })}
                        className="w-20 bg-black/30 rounded-lg px-3 py-2 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none"
                    />
                    <button
                        onClick={handleCreateSection}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                    >
                        + Create
                    </button>
                </div>
            </div>

            {/* Region Selector for API Fetches */}
            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl p-4 mb-6 border border-blue-500/20">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">🌍</span>
                        <h3 className="text-sm font-medium text-white">Region for API Fetches</h3>
                    </div>
                    <span className="text-xs text-white/50">
                        Currently: {selectedRegion.flag} {selectedRegion.name}
                    </span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {REGIONS.map((region) => (
                        <button
                            key={region.code}
                            onClick={() => setSelectedRegion(region)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${selectedRegion.code === region.code
                                ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/20'
                                : 'bg-white/5 text-white/70 hover:bg-white/10'
                                }`}
                        >
                            <span>{region.flag}</span>
                            <span>{region.name}</span>
                        </button>
                    ))}
                </div>
                <p className="text-xs text-white/40 mt-3">
                    💡 Select a region before clicking "Fetch from API" on sections. This affects Now Playing, Upcoming, Coming Soon, and streaming provider results.
                </p>
            </div>

            {/* Sections List */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full"></div>
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
                            className={`bg-white/5 rounded-xl border transition-all ${draggedIndex === index ? "border-orange-500 scale-[1.02]" : "border-white/10"
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
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-white font-medium">{section.name}</span>
                                        {section.is_system && (
                                            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-medium">SYSTEM</span>
                                        )}
                                        <span className="px-2 py-0.5 rounded bg-white/10 text-white/50 text-[10px]">
                                            {section.section_type === 'api' ? `API: ${section.api_source}` : 'Manual'}
                                        </span>
                                    </div>
                                    {/* Region movie counts */}
                                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                                        {section.movies_by_region && Object.keys(section.movies_by_region).length > 0 ? (
                                            Object.entries(section.movies_by_region).map(([regionCode, movies]) => (
                                                <span
                                                    key={regionCode}
                                                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${selectedRegion.code === regionCode
                                                        ? 'bg-orange-500/30 text-orange-300 ring-1 ring-orange-500/50'
                                                        : 'bg-purple-500/20 text-purple-400'
                                                        }`}
                                                >
                                                    {REGIONS.find(r => r.code === regionCode)?.flag || '🌍'} {regionCode}: {movies?.length || 0}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-white/30 text-xs">No movies saved yet</span>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2">
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

                            {/* Movies Preview - Shows movies for SELECTED REGION */}
                            {(() => {
                                const regionMovies = section.movies_by_region?.[selectedRegion.code] || [];
                                const hasAnyMovies = Object.values(section.movies_by_region || {}).some(arr => arr?.length > 0);

                                if (regionMovies.length > 0) {
                                    return (
                                        <div className="px-4 pb-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-xs text-white/50">
                                                    {selectedRegion.flag} Showing {regionMovies.length} movies for <span className="text-orange-400">{selectedRegion.name}</span>
                                                </p>
                                                {editingSection === section.id && (
                                                    <span className="text-xs text-white/40">💡 Drag to reorder</span>
                                                )}
                                            </div>
                                            <div className="flex gap-3 overflow-x-auto pb-2">
                                                {regionMovies.map((movie, idx) => (
                                                    <div
                                                        key={`${movie.tmdb_id}-${idx}`}
                                                        className={`relative flex-shrink-0 group transition-all duration-200 ${editingSection === section.id ? 'cursor-grab active:cursor-grabbing hover:scale-105' : ''
                                                            } ${draggedMovie === idx && draggedMovieSectionId === section.id ? 'opacity-40 scale-90 rotate-2' : ''}`}
                                                        draggable={editingSection === section.id}
                                                        onDragStart={(e) => handleMovieDragStart(e, section.id, idx)}
                                                        onDragOver={(e) => handleMovieDragOver(e, section.id, idx)}
                                                        onDragEnd={handleMovieDragEnd}
                                                    >
                                                        {/* Position Badge */}
                                                        {editingSection === section.id && (
                                                            <div className="absolute -top-2 -left-2 w-6 h-6 bg-gradient-to-br from-orange-500 to-red-500 rounded-full text-white text-xs font-bold flex items-center justify-center z-10 shadow-lg border-2 border-black/50">
                                                                {idx + 1}
                                                            </div>
                                                        )}

                                                        <img
                                                            src={movie.poster_path ? `https://image.tmdb.org/t/p/w92${movie.poster_path}` : "/placeholder.png"}
                                                            alt={movie.title}
                                                            className={`w-16 h-24 rounded-lg object-cover border-2 transition-all ${editingSection === section.id
                                                                ? 'border-orange-500/50 hover:border-orange-400 shadow-lg shadow-orange-500/20'
                                                                : 'border-white/10'
                                                                }`}
                                                        />

                                                        {/* Drag indicator overlay */}
                                                        {editingSection === section.id && (
                                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-1">
                                                                <span className="text-white/80 text-[10px]">⋮⋮</span>
                                                            </div>
                                                        )}

                                                        {/* Remove button */}
                                                        {editingSection === section.id && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleRemoveMovie(section.id, movie.tmdb_id); }}
                                                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full text-white text-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg z-20 border-2 border-black/50"
                                                            >
                                                                ×
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                } else if (hasAnyMovies) {
                                    // Has movies in other regions but not this one
                                    return (
                                        <div className="px-4 pb-4">
                                            <div className="py-3 px-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
                                                <p className="text-yellow-400 text-xs">
                                                    {selectedRegion.flag} No movies saved for {selectedRegion.name}.
                                                    <span className="text-white/50 ml-1">Select this region above and click "Fetch from API" to add movies.</span>
                                                </p>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            {/* Expanded Edit Panel */}
                            {editingSection === section.id && (
                                <div className="p-4 border-t border-white/5 bg-black/20">
                                    {/* Section Settings Editor */}
                                    <div className="mb-6 bg-black/40 p-4 rounded-xl border border-white/10">
                                        <h4 className="text-xs font-medium text-white/50 uppercase tracking-widest mb-3">Settings & Configuration</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs text-white/60 block mb-1">Section Name</label>
                                                <input
                                                    type="text"
                                                    value={section.name}
                                                    onChange={(e) => {
                                                        const newSections = sections.map(s => s.id === section.id ? { ...s, name: e.target.value } : s);
                                                        setSections(newSections);
                                                        setHasUnsavedChanges(true);
                                                    }}
                                                    className="w-full bg-black/30 rounded px-3 py-2 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none"
                                                />
                                            </div>
                                            <div className="flex gap-4">
                                                <div>
                                                    <label className="text-xs text-white/60 block mb-1">Icon</label>
                                                    <input
                                                        type="text"
                                                        value={section.icon}
                                                        onChange={(e) => {
                                                            const newSections = sections.map(s => s.id === section.id ? { ...s, icon: e.target.value } : s);
                                                            setSections(newSections);
                                                            setHasUnsavedChanges(true);
                                                        }}
                                                        className="w-16 bg-black/30 rounded px-3 py-2 text-center text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none"
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="text-xs text-white/60 block mb-1">Limit (Fetch Qty)</label>
                                                    <input
                                                        type="number"
                                                        value={section.max_movies || 10}
                                                        onChange={(e) => {
                                                            const newSections = sections.map(s => s.id === section.id ? { ...s, max_movies: parseInt(e.target.value) || 10 } : s);
                                                            setSections(newSections);
                                                            setHasUnsavedChanges(true);
                                                        }}
                                                        className="w-full bg-black/30 rounded px-3 py-2 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none"
                                                    />
                                                </div>
                                            </div>

                                            {section.section_type === 'api' && (
                                                <div className="md:col-span-2">
                                                    <label className="text-xs text-white/60 block mb-1">API Source</label>
                                                    <select
                                                        value={section.api_source}
                                                        onChange={(e) => {
                                                            const newSections = sections.map(s => s.id === section.id ? { ...s, api_source: e.target.value } : s);
                                                            setSections(newSections);
                                                            setHasUnsavedChanges(true);
                                                        }}
                                                        className="w-full bg-black/30 rounded px-3 py-2 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none"
                                                    >
                                                        <option value="trending">Trending (All)</option>
                                                        <option value="trending_movies">Trending Movies</option>
                                                        <option value="trending_tv">Trending TV</option>
                                                        <option value="now_playing">Now Playing (In Theaters)</option>
                                                        <option value="popular">Popular Movies</option>
                                                        <option value="top_rated">Top Rated Movies</option>
                                                        <option value="upcoming">Upcoming Movies</option>
                                                        <option value="coming_soon">Coming Soon (Discover)</option>
                                                        <option value="popular_tv">Popular TV</option>
                                                        <option value="top_rated_tv">Top Rated TV</option>
                                                        <option value="airing_today">Airing Today (TV)</option>
                                                        <option value="on_the_air">On The Air (TV)</option>
                                                        <option value="provider_8">Netflix</option>
                                                        <option value="provider_119">Prime Video</option>
                                                        <option value="provider_337">Disney+</option>
                                                        <option value="provider_350">Apple TV+</option>
                                                        <option value="provider_122">Hotstar</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-sm font-medium text-white">Add Movies to "{section.name}"</h4>
                                        <div className="flex gap-2">
                                            {section.section_type === 'api' && (
                                                <button
                                                    onClick={() => handleFetchFromApi(section)}
                                                    disabled={fetchingApi === section.id}
                                                    className="px-4 py-2 rounded-lg text-xs font-medium bg-purple-500 text-white hover:bg-purple-600 transition-colors disabled:opacity-50 shadow-lg shadow-purple-500/20"
                                                >
                                                    {fetchingApi === section.id ? "⏳ Fetching..." : "🔄 Refresh & Fetch API"}
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
                                                const isAddingThis = addingMovieId === movie.id && processingSectionId === section.id;

                                                return (
                                                    <div
                                                        key={movie.id}
                                                        onClick={() => !alreadyAdded && !processingSectionId && handleAddMovie(section.id, movie)}
                                                        className={`relative cursor-pointer group rounded-lg overflow-hidden ${alreadyAdded ? "opacity-50 cursor-not-allowed" : "hover:scale-105 transition-transform"} ${isAddingThis ? "ring-2 ring-orange-500 scale-95" : ""}`}
                                                    >
                                                        <img
                                                            src={movie.poster_path ? `https://image.tmdb.org/t/p/w154${movie.poster_path}` : "/placeholder.png"}
                                                            alt={movie.title || movie.name}
                                                            className="w-full h-full object-cover"
                                                        />

                                                        {/* Overlay for Add/Added status */}
                                                        <div className={`absolute inset-0 flex items-center justify-center bg-black/60 transition-opacity ${alreadyAdded || isAddingThis ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                                                            {isAddingThis ? (
                                                                <div className="flex flex-col items-center">
                                                                    <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-1"></div>
                                                                    <span className="text-[10px] text-orange-400 font-bold">SAVING</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-white text-3xl font-bold">{alreadyAdded ? "✓" : "+"}</span>
                                                            )}
                                                        </div>

                                                        <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-black/90 to-transparent">
                                                            <div className="text-[10px] text-white/90 truncate text-center font-medium">{movie.title || movie.name}</div>
                                                        </div>
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

            {/* Floating Save Button when scrolled */}
            {hasUnsavedChanges && (
                <div className="fixed bottom-6 right-6 z-50">
                    <button
                        onClick={handleSaveChanges}
                        disabled={saving}
                        className="px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-2xl shadow-green-500/30 flex items-center gap-2 transition-all hover:scale-105"
                    >
                        {saving ? '⏳ Saving...' : '💾 Save & Publish'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default AdminSectionsPage;
