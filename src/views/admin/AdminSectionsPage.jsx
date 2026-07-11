import { useState, useEffect, useCallback, useRef } from "react";
import { useDispatch } from "react-redux";
import tmdbApi from "../../lib/tmdbApi";
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
import { REGIONS } from "../../constants/regions";
import { invalidateHomepageSections } from "../../store/movieSlice";

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
    airing_today: "/tv/on_the_air", // legacy — remapped away from airing_today
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
    const dispatch = useDispatch();

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

    // My Feed only — movies + series live in homepage_sections together
    const contentMode = 'movies';

    // Track if there are unsaved changes
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [saving, setSaving] = useState(false);

    // Ref to preserve scroll position
    const containerRef = useRef(null);
    const scrollPositionRef = useRef(0);

    // Load raw homepage sections (do not merge TV table — that is for the public My Feed only)
    const loadSections = useCallback(async (preserveScroll = false) => {
        if (preserveScroll && containerRef.current) {
            scrollPositionRef.current = containerRef.current.scrollTop;
        }

        setLoading(true);

        try {
            const data = await getHomepageSections(false, { mergeTv: false });
            setSavedSections(data || []);
            setSections(data || []);
        } catch (err) {
            console.error('Error loading sections:', err);
            setSavedSections([]);
            setSections([]);
        }

        setHasUnsavedChanges(false);
        setLoading(false);

        if (preserveScroll && containerRef.current) {
            requestAnimationFrame(() => {
                containerRef.current.scrollTop = scrollPositionRef.current;
            });
        }
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

    // Guards against a slower earlier request resolving after a faster later one
    // and overwriting it with stale results while the user is still typing.
    const searchRequestId = useRef(0);
    const performSearch = async (query) => {
        const requestId = ++searchRequestId.current;
        setSearchLoading(true);
        try {
            const response = await tmdbApi.get("/search/multi", {
                params: { query, page: 1 }
            });
            const results = response.data.results
                ?.filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
                .slice(0, 12) || [];
            if (requestId === searchRequestId.current) setSearchResults(results);
        } catch (error) {
            console.error("Search error:", error);
        }
        if (requestId === searchRequestId.current) setSearchLoading(false);
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
            // Params WITHOUT `page` — page is added per-request below based on max_movies, since a
            // single TMDB page only returns 20 items and previously this never fetched more than
            // page 1, so raising the limit above 20 had no effect.
            let baseParams = {};
            const { todayStr, sixMonthsStr } = getDateFilters();
            const regionCode = selectedRegion.code;
            const regionLanguages = REGION_LANGUAGES[regionCode] || 'en';

            console.log(
                section.api_source === 'now_playing' || section.api_source === 'on_the_air'
                    ? `🌍 Fetching theater movies for ${selectedRegion.name} (${regionCode})`
                    : `🌍 Fetching movies + series for ${selectedRegion.name} (${regionCode})`
            );

            // Always mix series into My Feed section fetches
            const mixTvIntoHomepage = true;
            let tvCompanion = null;

            {
                // My Feed: movies + series in the same rows
                endpoint = API_ENDPOINTS[section.api_source] || "/trending/movie/week";

                if (section.api_source === 'now_playing' || section.api_source === 'on_the_air') {
                    // In Theaters = theatrical movies only (no series)
                    endpoint = "/movie/now_playing";
                    baseParams = { region: regionCode };
                    tvCompanion = null;
                } else if (section.api_source === 'upcoming') {
                    baseParams = { region: regionCode };
                    tvCompanion = {
                        endpoint: "/discover/tv",
                        params: {
                            'first_air_date.gte': todayStr,
                            'first_air_date.lte': sixMonthsStr,
                            sort_by: 'popularity.desc',
                            with_original_language: regionLanguages,
                        },
                    };
                } else if (section.api_source === 'coming_soon') {
                    endpoint = "/discover/movie";
                    baseParams = {
                        region: regionCode,
                        'primary_release_date.gte': todayStr,
                        'primary_release_date.lte': sixMonthsStr,
                        sort_by: 'popularity.desc',
                        with_original_language: regionLanguages,
                    };
                    tvCompanion = {
                        endpoint: "/discover/tv",
                        params: {
                            'first_air_date.gte': todayStr,
                            'first_air_date.lte': sixMonthsStr,
                            sort_by: 'popularity.desc',
                            with_original_language: regionLanguages,
                        },
                    };
                } else if (section.api_source?.startsWith("provider_")) {
                    const providerId = section.api_source.split("_")[1];
                    endpoint = "/discover/movie";
                    baseParams = {
                        with_watch_providers: providerId,
                        watch_region: regionCode,
                        with_watch_monetization_types: "flatrate",
                        sort_by: "popularity.desc",
                    };
                    tvCompanion = {
                        endpoint: "/discover/tv",
                        params: {
                            with_watch_providers: providerId,
                            watch_region: regionCode,
                            with_watch_monetization_types: "flatrate",
                            sort_by: "popularity.desc",
                        },
                    };
                } else if (
                    section.api_source === 'trending'
                    || section.api_source === 'trending_movies'
                    || section.api_source === 'trending_tv'
                    || !section.api_source
                ) {
                    endpoint = "/trending/movie/week";
                    tvCompanion = { endpoint: "/trending/tv/week", params: {} };
                } else if (['popular', 'popular_tv', 'top_rated', 'top_rated_tv'].includes(section.api_source)) {
                    const isTop = section.api_source.includes('top_rated');
                    endpoint = isTop ? "/movie/top_rated" : "/movie/popular";
                    baseParams = { region: regionCode };
                    tvCompanion = {
                        endpoint: isTop ? "/tv/top_rated" : "/tv/popular",
                        params: {},
                    };
                } else if (section.api_source === 'airing_today') {
                    // Remap legacy airing_today → In Theaters (movies only)
                    endpoint = "/movie/now_playing";
                    baseParams = { region: regionCode };
                    tvCompanion = null;
                }
            }

            const defaultMediaType = 'movie';
            const isOttProvider = section.api_source?.startsWith('provider_');
            // OTT rows always pull a balanced 3 movies + 3 series
            const OTT_MOVIE_COUNT = 3;
            const OTT_SERIES_COUNT = 3;

            const desiredCount = isOttProvider
                ? OTT_MOVIE_COUNT + OTT_SERIES_COUNT
                : (section.max_movies || 10);
            const isUpcomingFilter = section.api_source === 'upcoming' || section.api_source === 'coming_soon';
            const pagesToFetch = Math.min(10, Math.ceil(desiredCount / 20) + (isUpcomingFilter ? 1 : 0));

            console.log(`🔄 Fetching ${section.api_source} from: ${endpoint} (+ TV companion), ${pagesToFetch} page(s)`, baseParams);

            const fetchPages = async (ep, params, pages) => {
                const pageResponses = await Promise.all(
                    Array.from({ length: pages }, (_, i) =>
                        tmdbApi.get(ep, { params: { ...params, page: i + 1 } })
                    )
                );
                const seen = new Set();
                const out = [];
                for (const response of pageResponses) {
                    for (const item of response.data.results || []) {
                        if (!seen.has(item.id)) {
                            seen.add(item.id);
                            out.push(item);
                        }
                    }
                }
                return out;
            };

            let items = await fetchPages(endpoint, baseParams, pagesToFetch);

            // Mix TV into homepage sections (Hot / OTT / Coming Soon) — never In Theaters
            if (mixTvIntoHomepage && tvCompanion) {
                try {
                    const tvPages = isOttProvider ? 1 : Math.min(5, Math.ceil(desiredCount / 20) + 1);
                    const tvItems = await fetchPages(tvCompanion.endpoint, tvCompanion.params, tvPages);
                    const taggedMovies = items.map((i) => ({ ...i, media_type: i.media_type || 'movie' }));
                    const taggedTv = tvItems.map((i) => ({ ...i, media_type: 'tv' }));

                    if (isOttProvider) {
                        // Exactly 3 movies + 3 series, interleaved for the row
                        const topMovies = taggedMovies
                            .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
                            .slice(0, OTT_MOVIE_COUNT);
                        const topSeries = taggedTv
                            .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
                            .slice(0, OTT_SERIES_COUNT);
                        items = [];
                        for (let i = 0; i < Math.max(topMovies.length, topSeries.length); i++) {
                            if (topMovies[i]) items.push(topMovies[i]);
                            if (topSeries[i]) items.push(topSeries[i]);
                        }
                        console.log(`📺 OTT mix for "${section.name}": ${topMovies.length} movies + ${topSeries.length} series`);
                    } else {
                        items = [...taggedMovies, ...taggedTv]
                            .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
                        console.log(`📺 Mixed ${taggedTv.length} series into "${section.name}"`);
                    }
                } catch (tvErr) {
                    console.warn('TV companion fetch failed, keeping movies only', tvErr);
                    if (isOttProvider) {
                        items = items
                            .map((i) => ({ ...i, media_type: i.media_type || 'movie' }))
                            .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
                            .slice(0, OTT_MOVIE_COUNT);
                    }
                }
            }

            const isTheaterSection =
                section.api_source === 'now_playing'
                || section.api_source === 'on_the_air'
                || section.api_source === 'airing_today';

            // In Theaters: movies only — drop any series
            if (isTheaterSection) {
                items = items
                    .filter((item) => (item.media_type || 'movie') !== 'tv')
                    .map((item) => ({ ...item, media_type: 'movie' }));
            }

            // Filter for upcoming (movies only) BEFORE truncating to max_movies — filtering after
            // slicing could drop already-released items out of the requested count entirely.
            if (isUpcomingFilter) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                items = items.filter((item) => {
                    const dateStr = item.release_date || item.first_air_date;
                    if (!dateStr) return item.media_type === 'tv';
                    return new Date(dateStr) >= today;
                });
            }

            if (!isOttProvider) {
                items = items.slice(0, desiredCount);
            }

            console.log(`📦 Found ${items.length} titles for ${section.name}`);

            // Save each item to library and prepare section data
            const itemDataPromises = items.map(async (item) => {
                const mediaType = item.media_type || defaultMediaType;
                try {
                    const detailEndpoint = mediaType === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`;
                    const detailResponse = await tmdbApi.get(detailEndpoint, {
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

            // Build the region payload and persist immediately (Fetch = publish for this region)
            const existingMoviesByRegion = section.movies_by_region || {};
            const nextMoviesByRegion = {
                ...existingMoviesByRegion,
                [selectedRegion.code]: itemData,
            };
            const nextMaxMovies = isOttProvider
                ? OTT_MOVIE_COUNT + OTT_SERIES_COUNT
                : section.max_movies;

            setSections(prev => prev.map(s => {
                if (s.id !== section.id) return s;
                return {
                    ...s,
                    ...(isOttProvider ? { max_movies: nextMaxMovies } : {}),
                    movies_by_region: nextMoviesByRegion,
                };
            }));

            const result = await updateHomepageSection(section.id, {
                movies_by_region: nextMoviesByRegion,
                ...(isOttProvider ? { max_movies: nextMaxMovies } : {}),
            });
            if (!result.success) throw result.error || new Error('Failed to publish section');

            setSavedSections(prev => prev.map(s => {
                if (s.id !== section.id) return s;
                return {
                    ...s,
                    ...(isOttProvider ? { max_movies: nextMaxMovies } : {}),
                    movies_by_region: nextMoviesByRegion,
                };
            }));
            setHasUnsavedChanges(false);
            dispatch(invalidateHomepageSections());
            try {
                localStorage.setItem('homepage_sections_rev', String(Date.now()));
            } catch { /* ignore */ }

            console.log(`✅ Published ${itemData.length} titles for "${section.name}" in ${selectedRegion.name}`);
            toast.success(
                isOttProvider
                    ? `Published ${OTT_MOVIE_COUNT} movies + ${OTT_SERIES_COUNT} series for ${selectedRegion.flag} ${selectedRegion.name}`
                    : `Published ${itemData.length} titles for ${selectedRegion.flag} ${selectedRegion.name}`
            );

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
        await createHomepageSection({ ...newSection, slug });
        toast.success(`Section "${newSection.name}" created!`);
        setNewSection({ name: "", icon: "🎬", section_type: "manual", api_source: "trending", max_movies: 10 });
        await loadSections(true);
        dispatch(invalidateHomepageSections());
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
            dispatch(invalidateHomepageSections());
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
            const detailResponse = await tmdbApi.get(detailEndpoint, {
                params: { append_to_response: 'credits,videos,images,release_dates,keywords,similar,recommendations,reviews' }
            });
            const fullData = detailResponse.data;

            // Save to library (immediate)
            await saveFullMovieToLibrary(fullData, { media_type: mediaType });
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
            dispatch(invalidateHomepageSections());

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

    // Clear all movies from section (every region) - STAGES locally
    const handleClearMovies = (sectionId) => {
        if (confirm("Remove all movies from this section?")) {
            setSections(prev => prev.map(s =>
                s.id === sectionId ? { ...s, movies_by_region: {} } : s
            ));
            setHasUnsavedChanges(true);
        }
    };

    // SAVE ALL CHANGES TO DATABASE
    const handleSaveChanges = async () => {
        setSaving(true);
        try {
            console.log('💾 Saving all changes to homepage_sections...');

            for (const section of sections) {
                const savedVersion = savedSections.find(s => s.id === section.id);
                if (!savedVersion) continue;

                const moviesByRegionChanged = JSON.stringify(section.movies_by_region) !== JSON.stringify(savedVersion.movies_by_region);
                const metaChanged =
                    section.is_active !== savedVersion.is_active
                    || section.name !== savedVersion.name
                    || section.icon !== savedVersion.icon
                    || section.description !== savedVersion.description
                    || section.api_source !== savedVersion.api_source
                    || section.section_type !== savedVersion.section_type
                    || section.max_movies !== savedVersion.max_movies;

                if (moviesByRegionChanged || metaChanged) {
                    const totalItems = Object.values(section.movies_by_region || {}).reduce((acc, arr) => acc + (arr?.length || 0), 0);
                    const regionCount = Object.keys(section.movies_by_region || {}).length;
                    console.log(`  Updating section: ${section.name} (${totalItems} titles across ${regionCount} regions)`);

                    const optimizedMoviesByRegion = {};
                    if (section.movies_by_region) {
                        Object.keys(section.movies_by_region).forEach(code => {
                            const movies = section.movies_by_region[code] || [];
                            optimizedMoviesByRegion[code] = movies.map(m => {
                                const { images, videos, credits, similar, recommendations, reviews, ...cleanMovie } = m;
                                return cleanMovie;
                            });
                        });
                    }

                    const result = await updateHomepageSection(section.id, {
                        name: section.name,
                        icon: section.icon,
                        description: section.description,
                        api_source: section.api_source,
                        section_type: section.section_type,
                        max_movies: section.max_movies,
                        movies_by_region: optimizedMoviesByRegion,
                        is_active: section.is_active,
                    });

                    if (!result.success) throw result.error || new Error('Failed to update section');
                }
            }

            const orderChanged = JSON.stringify(sections.map(s => s.id)) !== JSON.stringify(savedSections.map(s => s.id));
            if (orderChanged) {
                console.log('  Updating section order...');
                await reorderHomepageSections(sections.map(s => s.id));
            }

            await loadSections(true);
            dispatch(invalidateHomepageSections());
            try {
                localStorage.setItem('homepage_sections_rev', String(Date.now()));
            } catch { /* ignore */ }
            console.log('✅ All changes saved and published!');
            toast.success('Changes saved and published to Explore!');

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
            {/* Header */}
            <div className="mb-6 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Explore Sections</h1>
                        <p className="text-white/50 text-sm max-w-xl">
                            Manage rows on Explore. <span className="text-white/70">Fetch from API</span> pulls
                            movies and TV series together for the selected region. Fetch publishes that region immediately.
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

                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/50">
                    Tip: pick a region → open a section → <span className="text-purple-300">Fetch Movies + Series</span> →
                    Save & Publish. Hot / OTT mix movies + series; In Theaters is movies only.
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
                            <option value="trending">Hot / Trending (Movies + Series)</option>
                            <option value="now_playing">In Theaters (movies only)</option>
                            <option value="popular">Popular (Movies + Series)</option>
                            <option value="top_rated">Top Rated (Movies + Series)</option>
                            <option value="upcoming">Upcoming</option>
                            <option value="coming_soon">Coming Soon</option>
                            <option value="provider_8">Netflix (3 movies + 3 series)</option>
                            <option value="provider_119">Prime Video (3 movies + 3 series)</option>
                            <option value="provider_337">Disney+ (3 movies + 3 series)</option>
                            <option value="provider_350">Apple TV+ (3 movies + 3 series)</option>
                            <option value="provider_122">Hotstar (3 movies + 3 series)</option>
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
                    Select a region, then click <span className="text-purple-300">Fetch Movies + Series</span> on a section.
                    That fills Hot / OTT / Coming Soon with movies + TV. In Theaters stays movies only.
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
                                            {fetchingApi === section.id ? "⏳ Fetching…" : "🔄 Fetch Movies + Series"}
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
                                                    {selectedRegion.flag} Showing {regionMovies.length} titles for <span className="text-orange-400">{selectedRegion.name}</span>
                                                    <span className="text-white/30 ml-2">
                                                        ({regionMovies.filter((m) => m.media_type === 'tv').length} series · {regionMovies.filter((m) => m.media_type !== 'tv').length} movies)
                                                    </span>
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
                                                        <span className={`absolute bottom-1 left-1 right-1 text-center text-[9px] font-bold rounded px-0.5 ${movie.media_type === 'tv' ? 'bg-purple-600/90 text-white' : 'bg-black/70 text-white/80'}`}>
                                                            {movie.media_type === 'tv' ? 'TV' : 'Movie'}
                                                        </span>

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
                                                            const api_source = e.target.value;
                                                            const newSections = sections.map(s => s.id === section.id ? {
                                                                ...s,
                                                                api_source,
                                                                ...(api_source.startsWith('provider_') ? { max_movies: 6 } : {}),
                                                            } : s);
                                                            setSections(newSections);
                                                            setHasUnsavedChanges(true);
                                                        }}
                                                        className="w-full bg-black/30 rounded px-3 py-2 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none"
                                                    >
                                                        <option value="trending">Hot / Trending (Movies + Series)</option>
                                                        <option value="now_playing">In Theaters (movies only)</option>
                                                        <option value="popular">Popular (Movies + Series)</option>
                                                        <option value="top_rated">Top Rated (Movies + Series)</option>
                                                        <option value="upcoming">Upcoming</option>
                                                        <option value="coming_soon">Coming Soon</option>
                                                        <option value="provider_8">Netflix (3 movies + 3 series)</option>
                                                        <option value="provider_119">Prime Video (3 movies + 3 series)</option>
                                                        <option value="provider_337">Disney+ (3 movies + 3 series)</option>
                                                        <option value="provider_350">Apple TV+ (3 movies + 3 series)</option>
                                                        <option value="provider_122">Hotstar (3 movies + 3 series)</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-sm font-medium text-white">Titles in "{section.name}"</h4>
                                        <div className="flex gap-2">
                                            {section.section_type === 'api' && (
                                                <button
                                                    onClick={() => handleFetchFromApi(section)}
                                                    disabled={fetchingApi === section.id}
                                                    className="px-4 py-2 rounded-lg text-xs font-medium bg-purple-500 text-white hover:bg-purple-600 transition-colors disabled:opacity-50 shadow-lg shadow-purple-500/20"
                                                >
                                                    {fetchingApi === section.id ? "⏳ Fetching…" : "🔄 Fetch Movies + Series"}
                                                </button>
                                            )}
                                            {Object.values(section.movies_by_region || {}).some(arr => arr?.length > 0) && (
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
                                                const alreadyAdded = section.movies_by_region?.[selectedRegion.code]?.some(m => m.tmdb_id === movie.id);
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
