import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Card from "../components/Card";
import { FaDatabase } from "react-icons/fa";
import {
  getExploreContentFromEdge,
  getTrendingContentFromEdge,
  getUpcomingFromEdge,
} from "../lib/contentEdgeApi";
import { MOVIE_GENRES, TV_GENRES } from "../lib/contentApi";

const ExplorePage = () => {
  const params = useParams();
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState(null);

  const PAGE_SIZE = 24;

  const fetchFromDatabase = async (page = 1, reset = false) => {
    try {
      setLoading(true);
      const exploreType = params.explore;
      const offset = (page - 1) * PAGE_SIZE;

      let result;

      if (exploreType === "trending") {
        const trending = await getTrendingContentFromEdge(null, PAGE_SIZE);
        result = { data: trending, total: trending.length };
      } else if (exploreType === "movie") {
        result = await getExploreContentFromEdge({
          mediaType: 'movie',
          category: 'popular',
          genreId: selectedGenre,
          limit: PAGE_SIZE,
          offset,
        });
      } else if (exploreType === "tv") {
        result = await getExploreContentFromEdge({
          mediaType: 'tv',
          category: 'popular',
          genreId: selectedGenre,
          limit: PAGE_SIZE,
          offset,
        });
      } else if (exploreType === "popular") {
        result = await getExploreContentFromEdge({
          mediaType: 'movie',
          category: 'popular',
          genreId: selectedGenre,
          limit: PAGE_SIZE,
          offset,
        });
      } else if (exploreType === "top-rated") {
        result = await getExploreContentFromEdge({
          mediaType: 'movie',
          category: 'top_rated',
          genreId: selectedGenre,
          limit: PAGE_SIZE,
          offset,
        });
      } else if (exploreType === "new-releases" || exploreType === "now-playing") {
        result = await getExploreContentFromEdge({
          mediaType: 'movie',
          category: 'new_releases',
          genreId: selectedGenre,
          limit: PAGE_SIZE,
          offset,
        });
      } else if (exploreType === "upcoming" || exploreType === "coming-soon") {
        result = await getUpcomingFromEdge({
          limit: PAGE_SIZE,
          offset,
        });
      } else {
        result = await getExploreContentFromEdge({
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
    } catch (error) {
      console.error("Database error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleScroll = () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
      if (!loading && hasMore) {
        setPageNo(prev => prev + 1);
      }
    }
  };

  useEffect(() => {
    if (pageNo > 1) {
      fetchFromDatabase(pageNo, false);
    }
  }, [pageNo]);

  useEffect(() => {
    setPageNo(1);
    setData([]);
    setSelectedGenre(null);
    fetchFromDatabase(1, true);
  }, [params.explore]);

  useEffect(() => {
    setPageNo(1);
    setData([]);
    fetchFromDatabase(1, true);
  }, [selectedGenre]);

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

  const showGenreFilter = ['movie', 'tv', 'popular', 'top-rated'].includes(params.explore);

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-20 lg:pb-0">
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
        <div className="absolute top-20 right-0 w-48 sm:w-96 h-48 sm:h-96 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      <section className="px-3 sm:px-6 pb-6">
        <div className="container mx-auto">
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <p className="text-sm text-white/40">
              {data?.length || 0} titles {totalItems > 0 && `of ${totalItems}`}
            </p>
          </div>

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

          <p className="text-xs text-white/30 mt-2 flex items-center gap-2">
            <FaDatabase className="text-green-400" />
            Showing curated library content
          </p>
        </div>
      </section>

      <section className="px-3 sm:px-6 pb-24">
        <div className="container mx-auto">
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
              <span className="text-5xl sm:text-6xl mb-4 block">📀</span>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">No content in library</h3>
              <p className="text-white/50 mb-4">
                Add content via Admin Panel to populate this section.
              </p>
            </div>
          ) : null}

          {loading && (
            <div className="flex justify-center mt-8 sm:mt-12">
              <div className="w-8 h-8 border-2 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin" />
            </div>
          )}

          {data.length > 0 && !hasMore && !loading && (
            <div className="text-center mt-12 py-4">
              <p className="text-white/30 text-sm">
                All {data.length} library items shown
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ExplorePage;
