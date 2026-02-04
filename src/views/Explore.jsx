import axios from "axios";
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Card from "../components/Card";
import { FaDatabase, FaGlobe } from "react-icons/fa";
import { getExploreContent, getMoviesFromDb, getTrendingContent, MOVIE_GENRES, TV_GENRES } from "../lib/contentApi";

const ExplorePage = () => {
  const params = useParams();
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Source toggle: 'library' or 'tmdb'
  const [dataSource, setDataSource] = useState('library');

  // For genre filtering
  const [selectedGenre, setSelectedGenre] = useState(null);

  const PAGE_SIZE = 24;

  // Fetch from database (primary source)
  const fetchFromDatabase = async (page = 1, reset = false) => {
    try {
      setLoading(true);
      const exploreType = params.explore;
      const offset = (page - 1) * PAGE_SIZE;

      let result;

      // Map explore routes to database queries
      if (exploreType === "trending") {
        const trending = await getTrendingContent(null, PAGE_SIZE);
        result = { data: trending, total: trending.length };
      } else if (exploreType === "movie") {
        result = await getExploreContent({
          mediaType: 'movie',
          category: 'popular',
          genreId: selectedGenre,
          limit: PAGE_SIZE,
          offset,
        });
      } else if (exploreType === "tv") {
        result = await getExploreContent({
          mediaType: 'tv',
          category: 'popular',
          genreId: selectedGenre,
          limit: PAGE_SIZE,
          offset,
        });
      } else if (exploreType === "popular") {
        result = await getExploreContent({
          mediaType: 'movie',
          category: 'popular',
          genreId: selectedGenre,
          limit: PAGE_SIZE,
          offset,
        });
      } else if (exploreType === "top-rated") {
        result = await getExploreContent({
          mediaType: 'movie',
          category: 'top_rated',
          genreId: selectedGenre,
          limit: PAGE_SIZE,
          offset,
        });
      } else if (exploreType === "new-releases" || exploreType === "now-playing") {
        result = await getExploreContent({
          mediaType: 'movie',
          category: 'new_releases',
          genreId: selectedGenre,
          limit: PAGE_SIZE,
          offset,
        });
      } else if (exploreType === "upcoming" || exploreType === "coming-soon") {
        // For upcoming, get future releases
        const today = new Date().toISOString().split('T')[0];
        result = await getMoviesFromDb({
          mediaType: 'movie',
          sortBy: 'release_date',
          sortOrder: 'asc',
          limit: PAGE_SIZE,
          offset,
        });
        // Filter to only future dates client-side as a simple approach
        if (result.data) {
          result.data = result.data.filter(m => m.release_date >= today);
        }
      } else {
        // Default: popular movies
        result = await getExploreContent({
          mediaType: 'movie',
          category: 'popular',
          limit: PAGE_SIZE,
          offset,
        });
      }

      const newData = result.data || [];

      if (reset || page === 1) {
        setData(newData);
      } else {
        setData(prev => [...prev, ...newData]);
      }

      setTotalItems(result.total || 0);
      setHasMore(newData.length >= PAGE_SIZE);

      console.log(`📀 Loaded ${newData.length} items from database (total: ${result.total})`);
    } catch (error) {
      console.error("Database error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch from TMDB (fallback)
  const fetchFromTmdb = async (page = 1, reset = false) => {
    try {
      setLoading(true);
      let endpoint = "";
      let apiParams = {
        api_key: import.meta.env.VITE_MOVIE_API_KEY,
        language: "en-US",
        page: page,
      };

      const exploreType = params.explore;

      if (exploreType === "upcoming" || exploreType === "coming-soon") {
        endpoint = "https://api.themoviedb.org/3/movie/upcoming";
      } else if (exploreType === "movie") {
        endpoint = "https://api.themoviedb.org/3/discover/movie";
        if (selectedGenre) apiParams.with_genres = selectedGenre;
      } else if (exploreType === "tv") {
        endpoint = "https://api.themoviedb.org/3/discover/tv";
        if (selectedGenre) apiParams.with_genres = selectedGenre;
      } else if (exploreType === "trending") {
        endpoint = "https://api.themoviedb.org/3/trending/all/week";
      } else if (exploreType === "top-rated") {
        endpoint = "https://api.themoviedb.org/3/movie/top_rated";
      } else if (exploreType === "popular") {
        endpoint = "https://api.themoviedb.org/3/movie/popular";
      } else if (exploreType === "now-playing" || exploreType === "new-releases") {
        endpoint = "https://api.themoviedb.org/3/movie/now_playing";
      } else {
        endpoint = "https://api.themoviedb.org/3/discover/movie";
      }

      const response = await axios.get(endpoint, { params: apiParams });
      const newData = response.data.results || [];

      if (reset || page === 1) {
        setData(newData);
      } else {
        setData(prev => [...prev, ...newData]);
      }

      setTotalItems(response.data.total_results || 0);
      setHasMore(page < response.data.total_pages);

      console.log(`🌐 Loaded ${newData.length} items from TMDB`);
    } catch (error) {
      console.error("TMDB API Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Main fetch function
  const fetchData = async (page = 1, reset = false) => {
    if (dataSource === 'library') {
      await fetchFromDatabase(page, reset);
    } else {
      await fetchFromTmdb(page, reset);
    }
  };

  const handleScroll = () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
      if (!loading && hasMore) {
        setPageNo(prev => prev + 1);
      }
    }
  };

  // Load more on page change
  useEffect(() => {
    if (pageNo > 1) {
      fetchData(pageNo, false);
    }
  }, [pageNo]);

  // Reset on explore type change
  useEffect(() => {
    setPageNo(1);
    setData([]);
    setSelectedGenre(null);
    fetchData(1, true);
  }, [params.explore]);

  // Refetch on source or genre change
  useEffect(() => {
    setPageNo(1);
    setData([]);
    fetchData(1, true);
  }, [dataSource, selectedGenre]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loading, hasMore]);

  const getPageTitle = () => {
    const exploreType = params.explore;
    if (exploreType === "upcoming" || exploreType === "coming-soon") return "Coming Soon";
    if (exploreType === "movie") return "Movies";
    if (exploreType === "tv") return "TV Shows";
    if (exploreType === "trending") return "Trending";
    if (exploreType === "top-rated") return "Top Rated";
    if (exploreType === "popular") return "Popular";
    if (exploreType === "now-playing" || exploreType === "new-releases") return "New Releases";
    return params.explore?.charAt(0).toUpperCase() + params.explore?.slice(1) || "Explore";
  };

  const getPageDescription = () => {
    const exploreType = params.explore;
    if (exploreType === "upcoming" || exploreType === "coming-soon") return "Upcoming theatrical releases";
    if (exploreType === "movie") return "Discover movies from all genres";
    if (exploreType === "tv") return "Discover popular TV shows";
    if (exploreType === "trending") return "What everyone is watching";
    if (exploreType === "top-rated") return "Critically acclaimed films";
    if (exploreType === "popular") return "Most watched right now";
    if (exploreType === "now-playing" || exploreType === "new-releases") return "Recently released content";
    return "Browse content";
  };

  const getMediaType = () => {
    const exploreType = params.explore;
    if (exploreType === "tv") return "tv";
    return "movie";
  };

  const getGenres = () => {
    const exploreType = params.explore;
    if (exploreType === "tv") return TV_GENRES;
    return MOVIE_GENRES;
  };

  // Show genre filter for movie/tv pages
  const showGenreFilter = ['movie', 'tv', 'popular', 'top-rated'].includes(params.explore);

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-20 lg:pb-0">
      {/* Hero Section */}
      <section className="relative pt-20 sm:pt-32 pb-8 sm:pb-16 px-3 sm:px-6">
        <div className="container mx-auto">
          <div className="max-w-2xl animate-fadeInUp">
            <span className="inline-block px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs sm:text-sm font-medium mb-4 sm:mb-6">
              🎬 {getPageTitle()}
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-3 sm:mb-4">
              <span className="text-gradient">{getPageTitle()}</span>
            </h1>
            <p className="text-sm sm:text-lg text-white/50 max-w-lg">
              {getPageDescription()}
            </p>
          </div>
        </div>

        {/* Decorative gradient orb */}
        <div className="absolute top-20 right-0 w-48 sm:w-96 h-48 sm:h-96 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* Filters Section */}
      <section className="px-3 sm:px-6 pb-6">
        <div className="container mx-auto">
          <div className="flex flex-wrap items-center gap-4 mb-6">
            {/* Source Toggle */}
            <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
              <button
                onClick={() => setDataSource('library')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${dataSource === 'library'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
                  }`}
              >
                <FaDatabase className="text-[10px]" />
                Library
              </button>
              <button
                onClick={() => setDataSource('tmdb')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${dataSource === 'tmdb'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
                  }`}
              >
                <FaGlobe className="text-[10px]" />
                TMDB
              </button>
            </div>

            {/* Results count */}
            <p className="text-sm text-white/40">
              {data?.length || 0} titles {totalItems > 0 && `of ${totalItems}`}
            </p>
          </div>

          {/* Genre Filter Pills */}
          {showGenreFilter && (
            <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide -mx-3 px-3">
              <button
                onClick={() => setSelectedGenre(null)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-medium transition-all ${!selectedGenre
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                  }`}
              >
                All
              </button>
              {getGenres().map((genre) => (
                <button
                  key={genre.id}
                  onClick={() => setSelectedGenre(genre.id)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${selectedGenre === genre.id
                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                    : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                    }`}
                >
                  {genre.name}
                </button>
              ))}
            </div>
          )}

          {/* Source info */}
          <p className="text-xs text-white/30 mt-2 flex items-center gap-2">
            {dataSource === 'library' ? (
              <>
                <FaDatabase className="text-green-400" />
                Showing curated library content • Switch to TMDB for all content
              </>
            ) : (
              <>
                <FaGlobe className="text-blue-400" />
                Showing all TMDB content • Switch to Library for curated picks
              </>
            )}
          </p>
        </div>
      </section>

      {/* Content Grid */}
      <section className="px-3 sm:px-6 pb-24">
        <div className="container mx-auto">
          {/* Grid */}
          {data.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-4 md:gap-6">
              {data.map((item, index) => (
                <Card
                  key={(item.tmdb_id || item.id) + params.explore + index}
                  data={{
                    id: item.tmdb_id || item.id,
                    title: item.title || item.name,
                    poster_path: item.poster_path,
                    backdrop_path: item.backdrop_path,
                    media_type: item.media_type || getMediaType(),
                    vote_average: item.vote_average,
                    release_date: item.release_date || item.first_air_date,
                    overview: item.overview,
                  }}
                  media_type={item.media_type || getMediaType()}
                  index={index}
                />
              ))}
            </div>
          ) : !loading ? (
            <div className="text-center py-20">
              <span className="text-5xl sm:text-6xl mb-4 block">
                {dataSource === 'library' ? '📀' : '🎬'}
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                {dataSource === 'library' ? 'No content in library' : 'No content found'}
              </h3>
              <p className="text-white/50 mb-4">
                {dataSource === 'library'
                  ? 'Add content via Admin Panel or switch to TMDB'
                  : 'Try a different category'}
              </p>
              {dataSource === 'library' && (
                <button
                  onClick={() => setDataSource('tmdb')}
                  className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-500/30 transition-colors"
                >
                  <FaGlobe className="inline mr-2" />
                  Browse TMDB instead
                </button>
              )}
            </div>
          ) : null}

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-center mt-8 sm:mt-12">
              <div className="w-8 h-8 border-2 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin" />
            </div>
          )}

          {/* End of results */}
          {data.length > 0 && !hasMore && !loading && (
            <div className="text-center mt-12 py-4">
              <p className="text-white/30 text-sm">
                {dataSource === 'library'
                  ? `All ${data.length} library items shown`
                  : 'No more results'}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ExplorePage;
