import React, { useState, useEffect } from "react";
import axios from "axios";
import Card from "../components/Card";
import { FaGlobe, FaChevronDown, FaFire, FaCalendarAlt, FaPlay } from "react-icons/fa";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { getHomepageSections } from "../lib/supabase";

// Available regions
const REGIONS = [
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
];

// Custom streaming provider icons as text
const NetflixIcon = () => (
  <span className="font-bold text-xs tracking-tighter">N</span>
);
const PrimeIcon = () => (
  <span className="font-bold text-xs">P</span>
);
const HotstarIcon = () => (
  <span className="font-bold text-xs">H</span>
);

// Streaming providers with TMDB watch provider IDs
const STREAMING_PROVIDERS = [
  { id: 8, name: "Netflix", icon: NetflixIcon, color: "#E50914", bgColor: "bg-red-600/10", borderColor: "border-red-500/30" },
  { id: 119, name: "Amazon Prime", icon: PrimeIcon, color: "#00A8E1", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30" },
  { id: 122, name: "Hotstar", icon: HotstarIcon, color: "#1F80E0", bgColor: "bg-sky-500/10", borderColor: "border-sky-500/30" },
];

const Home = () => {
  const [selectedRegion, setSelectedRegion] = useState(REGIONS[0]);
  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const [nowPlayingData, setNowPlayingData] = useState([]);
  const [trendingData, setTrendingData] = useState([]);
  const [upcomingData, setUpcomingData] = useState([]);
  const [streamingData, setStreamingData] = useState({});
  const [loadingNowPlaying, setLoadingNowPlaying] = useState(true);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [cmsSections, setCmsSections] = useState([]);
  const imageURL = useSelector((state) => state.movieData.imageURL);

  // Fetch Now Playing movies for selected region
  const fetchNowPlaying = async () => {
    try {
      setLoadingNowPlaying(true);
      const response = await axios.get("/movie/now_playing", {
        params: { region: selectedRegion.code, language: "en-US", page: 1 },
      });
      setNowPlayingData(response.data.results);
    } catch (error) {
      console.log("Error fetching now playing:", error);
    } finally {
      setLoadingNowPlaying(false);
    }
  };

  // Fetch Trending movies
  const fetchTrending = async () => {
    try {
      setLoadingTrending(true);
      const response = await axios.get("/trending/all/day");
      setTrendingData(response.data.results);
    } catch (error) {
      console.log("Error fetching trending:", error);
    } finally {
      setLoadingTrending(false);
    }
  };

  // Fetch Upcoming movies for sidebar - top 5 most popular, sorted by date
  const fetchUpcoming = async () => {
    try {
      const response = await axios.get("/movie/upcoming", {
        params: { page: 1, region: selectedRegion.code },
      });

      // Get top 5 most popular upcoming movies, then sort by release date
      const top5Popular = response.data.results
        .filter(movie => movie.release_date)
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0)) // Most popular first
        .slice(0, 5)
        .sort((a, b) => new Date(a.release_date) - new Date(b.release_date)); // Then sort by date

      setUpcomingData(top5Popular);
    } catch (error) {
      console.log("Error fetching upcoming:", error);
    }
  };

  // Fetch trending on streaming platforms using TMDB Weekly Trending + Provider Filter
  // This is the most accurate approach using TMDB's data:
  // Strategy 1: Get TMDB's weekly trending movies, then check provider availability
  // Strategy 2: Get recently released popular content on each platform
  // Strategy 3: Get all-time popular content as fallback
  const fetchStreamingTrending = async () => {
    try {
      const results = {};
      const today = new Date();
      const sixMonthsAgo = new Date(new Date().setMonth(today.getMonth() - 6)).toISOString().split('T')[0];

      // First, fetch TMDB's actual weekly trending movies
      const trendingResponse = await axios.get("/trending/movie/week");
      const trendingMovies = trendingResponse.data.results || [];

      // Pre-fetch provider availability for all trending movies in parallel (optimization)
      const providerPromises = trendingMovies.map(movie =>
        axios.get(`/movie/${movie.id}/watch/providers`).catch(() => null)
      );
      const providerResults = await Promise.allSettled(providerPromises);

      // Build a map of movie ID -> available provider IDs for the selected region
      const movieProviderMap = new Map();
      trendingMovies.forEach((movie, index) => {
        const result = providerResults[index];
        if (result.status === 'fulfilled' && result.value) {
          const regionData = result.value.data.results?.[selectedRegion.code];
          const flatrateProviders = regionData?.flatrate || [];
          movieProviderMap.set(movie.id, flatrateProviders.map(p => p.provider_id));
        } else {
          movieProviderMap.set(movie.id, []);
        }
      });

      for (const provider of STREAMING_PROVIDERS) {
        const providerMovies = [];
        const seen = new Set();

        // Strategy 1: Filter trending movies available on this provider
        for (const movie of trendingMovies) {
          if (providerMovies.length >= 6) break;

          const movieProviders = movieProviderMap.get(movie.id) || [];
          if (movieProviders.includes(provider.id) && !seen.has(movie.id)) {
            seen.add(movie.id);
            providerMovies.push(movie);
          }
        }

        // Strategy 2: If we don't have enough from trending, get recent popular content
        if (providerMovies.length < 6) {
          const recentPopular = await axios.get("/discover/movie", {
            params: {
              with_watch_providers: provider.id,
              watch_region: selectedRegion.code,
              sort_by: "popularity.desc",
              "vote_count.gte": 50,
              "release_date.gte": sixMonthsAgo,
              page: 1,
            },
          });

          for (const movie of (recentPopular.data.results || [])) {
            if (!seen.has(movie.id) && providerMovies.length < 6) {
              seen.add(movie.id);
              providerMovies.push(movie);
            }
          }
        }

        // Strategy 3: If still not enough, get all-time popular as fallback
        if (providerMovies.length < 6) {
          const allTimePopular = await axios.get("/discover/movie", {
            params: {
              with_watch_providers: provider.id,
              watch_region: selectedRegion.code,
              sort_by: "vote_count.desc",
              "vote_average.gte": 6.0,
              page: 1,
            },
          });

          for (const movie of (allTimePopular.data.results || [])) {
            if (!seen.has(movie.id) && providerMovies.length < 6) {
              seen.add(movie.id);
              providerMovies.push(movie);
            }
          }
        }

        results[provider.id] = providerMovies;
      }
      setStreamingData(results);
    } catch (error) {
      console.log("Error fetching streaming data:", error);
    }
  };

  useEffect(() => {
    fetchNowPlaying();
    fetchStreamingTrending();
  }, [selectedRegion]);

  useEffect(() => {
    fetchTrending();
  }, []);

  useEffect(() => {
    fetchUpcoming();
  }, [selectedRegion]);

  // Fetch CMS Sections
  useEffect(() => {
    const fetchCmsSections = async () => {
      const sections = await getHomepageSections(true); // Only active sections
      setCmsSections(sections);
    };
    fetchCmsSections();
  }, []);

  const handleRegionSelect = (region) => {
    setSelectedRegion(region);
    setIsRegionOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-20 lg:pb-0">
      {/* Header Section with Region */}
      <section className="pt-20 sm:pt-24 pb-6 sm:pb-8 px-3 sm:px-6">
        <div className="container mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1 sm:mb-2">
                Discover <span className="text-gradient">What to Watch</span>
              </h1>
              <p className="text-sm sm:text-base text-white/50">Movies in theaters & trending on streaming</p>
            </div>

            {/* Region Selector */}
            <div className="relative">
              <button
                onClick={() => setIsRegionOpen(!isRegionOpen)}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-yellow-500/30 transition-all"
              >
                <FaGlobe className="text-yellow-400 text-sm" />
                <span className="text-xl">{selectedRegion.flag}</span>
                <span className="text-white text-sm font-medium">{selectedRegion.name}</span>
                <FaChevronDown className={`text-white/50 text-xs transition-transform ${isRegionOpen ? "rotate-180" : ""}`} />
              </button>

              {isRegionOpen && (
                <div className="absolute top-full right-0 mt-2 w-52 py-2 rounded-xl bg-[#1a1a1a] border border-white/10 shadow-2xl z-50 animate-fadeIn">
                  {REGIONS.map((region) => (
                    <button
                      key={region.code}
                      onClick={() => handleRegionSelect(region)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-sm ${selectedRegion.code === region.code ? "bg-yellow-500/10 text-yellow-400" : "text-white"
                        }`}
                    >
                      <span className="text-lg">{region.flag}</span>
                      <span className="font-medium">{region.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Grid */}
      <section className="px-3 sm:px-6 pb-8">
        <div className="container mx-auto">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 sm:gap-8">
            {/* Left Content - 3 columns */}
            <div className="xl:col-span-3 space-y-8 sm:space-y-12">

              {/* CMS Managed Sections */}
              {cmsSections.map((section) => (
                <div key={section.id}>
                  <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                    <div className="p-1.5 sm:p-2 rounded-lg bg-purple-500/10">
                      <span className="text-base sm:text-lg">{section.icon}</span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-semibold text-white">{section.name}</h2>
                    {section.description && (
                      <span className="text-xs text-white/40 hidden sm:inline">{section.description}</span>
                    )}
                  </div>

                  {section.movies && section.movies.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
                      {section.movies.slice(0, section.max_movies || 10).map((movie, index) => (
                        <Card
                          key={movie.tmdb_id}
                          data={{
                            id: movie.tmdb_id,
                            title: movie.title,
                            poster_path: movie.poster_path,
                            media_type: movie.media_type
                          }}
                          media_type={movie.media_type || "movie"}
                          index={index}
                        />
                      ))}
                    </div>
                  ) : section.section_type === 'manual' ? (
                    <div className="text-center py-8 text-white/30 text-sm bg-white/5 rounded-xl">
                      No movies in this section yet
                    </div>
                  ) : null}
                </div>
              ))}

              {/* Show message if no CMS sections found */}
              {cmsSections.length === 0 && (
                <div className="text-center py-12 text-white/40">
                  <p className="text-lg">No sections configured yet</p>
                  <p className="text-sm mt-2">Add sections from the admin panel to display content here.</p>
                </div>
              )}
            </div>

            {/* Right Sidebar - Upcoming (Hidden on mobile) */}
            <div className="xl:col-span-1 hidden xl:block">
              <div className="sticky top-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <FaCalendarAlt className="text-green-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">Coming Soon</h2>
                </div>

                <div className="space-y-4">
                  {upcomingData.map((movie, index) => (
                    <Link
                      key={movie.id}
                      to={`/movie/${movie.id}`}
                      className="flex items-start gap-4 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all group"
                    >
                      {/* Rank Number */}
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center font-bold text-black text-sm">
                        {index + 1}
                      </div>

                      {/* Poster */}
                      <div className="flex-shrink-0 w-12 h-16 rounded-lg overflow-hidden">
                        {movie.poster_path && (
                          <img
                            src={imageURL + movie.poster_path}
                            alt={movie.title}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-white group-hover:text-yellow-400 transition-colors line-clamp-2">
                          {movie.title}
                        </h3>
                        <p className="text-xs text-white/40 mt-1">
                          📅 {movie.release_date ? new Date(movie.release_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBA'}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>

                {/* Quick Nav */}
                <div className="mt-8 p-4 rounded-xl bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20">
                  <h3 className="text-sm font-semibold text-white mb-3">Quick Links</h3>
                  <div className="space-y-2">
                    <Link to="/upcoming" className="flex items-center gap-2 text-sm text-white/60 hover:text-yellow-400 transition-colors">
                      🎬 Coming Soon
                    </Link>
                    <Link to="/search" className="flex items-center gap-2 text-sm text-white/60 hover:text-yellow-400 transition-colors">
                      🔍 Search Movies
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
