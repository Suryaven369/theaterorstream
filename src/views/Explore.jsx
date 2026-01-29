import axios from "axios";
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Card from "../components/Card";

const ExplorePage = () => {
  const params = useParams();
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState([]);
  const [totalPageNo, setTotalPageNo] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      let endpoint = "";
      let apiParams = {
        api_key: import.meta.env.VITE_MOVIE_API_KEY,
        language: "en-US",
        page: pageNo,
      };

      // Handle different explore types - fix for TMDB API endpoints
      const exploreType = params.explore;

      if (exploreType === "upcoming" || exploreType === "coming-soon") {
        // Use the correct TMDB upcoming endpoint
        endpoint = "https://api.themoviedb.org/3/movie/upcoming";
      } else if (exploreType === "movie") {
        // Discover movies
        endpoint = "https://api.themoviedb.org/3/discover/movie";
      } else if (exploreType === "tv") {
        // Discover TV shows
        endpoint = "https://api.themoviedb.org/3/discover/tv";
      } else if (exploreType === "trending") {
        // Trending content
        endpoint = "https://api.themoviedb.org/3/trending/all/week";
      } else if (exploreType === "top-rated") {
        // Top rated movies
        endpoint = "https://api.themoviedb.org/3/movie/top_rated";
      } else if (exploreType === "popular") {
        // Popular movies
        endpoint = "https://api.themoviedb.org/3/movie/popular";
      } else if (exploreType === "now-playing") {
        // Now playing in theaters
        endpoint = "https://api.themoviedb.org/3/movie/now_playing";
      } else {
        // Default: try discover with the explore type (movie/tv)
        endpoint = `https://api.themoviedb.org/3/discover/movie`;
      }

      const response = await axios.get(endpoint, {
        params: apiParams,
      });

      setData((prev) => {
        return [...prev, ...response.data.results];
      });
      setTotalPageNo(response.data.total_pages);
    } catch (error) {
      console.log("API Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleScroll = () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
      if (!loading && pageNo < totalPageNo) {
        setPageNo((prev) => prev + 1);
      }
    }
  };

  useEffect(() => {
    if (pageNo > 1) {
      fetchData();
    }
  }, [pageNo]);

  useEffect(() => {
    setPageNo(1);
    setData([]);
    fetchData();
  }, [params.explore]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [loading, pageNo, totalPageNo]);

  const getPageTitle = () => {
    const exploreType = params.explore;
    if (exploreType === "upcoming" || exploreType === "coming-soon") return "Coming Soon";
    if (exploreType === "movie") return "Movies";
    if (exploreType === "tv") return "TV Shows";
    if (exploreType === "trending") return "Trending";
    if (exploreType === "top-rated") return "Top Rated";
    if (exploreType === "popular") return "Popular";
    if (exploreType === "now-playing") return "Now Playing";
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
    if (exploreType === "now-playing") return "Currently in theaters";
    return "Browse content";
  };

  const getMediaType = () => {
    const exploreType = params.explore;
    if (exploreType === "tv") return "tv";
    return "movie";
  };

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

      {/* Movies Grid */}
      <section className="px-3 sm:px-6 pb-24">
        <div className="container mx-auto">
          {/* Section Header */}
          <div className="flex items-center justify-between mb-6 sm:mb-10">
            <p className="text-sm sm:text-base text-white/40">
              {data?.length || 0} titles found
            </p>
          </div>

          {/* Grid */}
          {data.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-4 md:gap-6">
              {data.map((item, index) => (
                <Card
                  key={item.id + params.explore + index}
                  data={item}
                  media_type={item.media_type || getMediaType()}
                  index={index}
                />
              ))}
            </div>
          ) : !loading ? (
            <div className="text-center py-20">
              <span className="text-5xl sm:text-6xl mb-4 block">🎬</span>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">No content found</h3>
              <p className="text-white/50">Try a different category</p>
            </div>
          ) : null}

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-center mt-8 sm:mt-12">
              <div className="w-8 h-8 border-2 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin" />
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ExplorePage;
