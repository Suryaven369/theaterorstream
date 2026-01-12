import React, { useState, useEffect } from "react";
import axios from "axios";
import Card from "../components/Card";
import { FaGlobe, FaChevronDown, FaFire, FaCalendarAlt, FaPlay } from "react-icons/fa";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";

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

  // Fetch Upcoming movies for sidebar
  const fetchUpcoming = async () => {
    try {
      const response = await axios.get("/movie/upcoming", {
        params: { page: 1, region: selectedRegion.code },
      });
      setUpcomingData(response.data.results.slice(0, 5));
    } catch (error) {
      console.log("Error fetching upcoming:", error);
    }
  };

  // Fetch trending on streaming platforms
  const fetchStreamingTrending = async () => {
    try {
      const results = {};
      for (const provider of STREAMING_PROVIDERS) {
        const response = await axios.get("/discover/movie", {
          params: {
            with_watch_providers: provider.id,
            watch_region: selectedRegion.code,
            sort_by: "popularity.desc",
            page: 1,
          },
        });
        results[provider.id] = response.data.results.slice(0, 6);
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

  const handleRegionSelect = (region) => {
    setSelectedRegion(region);
    setIsRegionOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header Section with Region */}
      <section className="pt-24 pb-8 px-6">
        <div className="container mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                Discover <span className="text-gradient">What to Watch</span>
              </h1>
              <p className="text-white/50">Movies in theaters & trending on streaming platforms</p>
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
      <section className="px-6 pb-8">
        <div className="container mx-auto">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
            {/* Left Content - 3 columns */}
            <div className="xl:col-span-3 space-y-12">

              {/* Hot Right Now - Trending */}
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <FaFire className="text-orange-400" />
                  </div>
                  <h2 className="text-xl font-semibold text-white">Hot Right Now</h2>
                </div>

                {loadingTrending ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="aspect-[2/3] bg-white/5 rounded-xl" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {trendingData?.slice(0, 10).map((item, index) => (
                      <Card
                        key={item.id}
                        data={item}
                        media_type={item.media_type || "movie"}
                        index={index}
                        trending={true}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* In Theaters */}
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-yellow-500/10">
                    <FaPlay className="text-yellow-400 text-sm" />
                  </div>
                  <h2 className="text-xl font-semibold text-white">
                    In Theaters <span className="text-white/40 font-normal">• {selectedRegion.name}</span>
                  </h2>
                </div>

                {loadingNowPlaying ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="aspect-[2/3] bg-white/5 rounded-xl" />
                      </div>
                    ))}
                  </div>
                ) : nowPlayingData?.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {nowPlayingData.slice(0, 10).map((movie, index) => (
                      <Card key={movie.id} data={movie} media_type="movie" index={index} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-white/5 rounded-xl">
                    <p className="text-white/40">No movies currently in theaters for {selectedRegion.name}</p>
                  </div>
                )}
              </div>

              {/* Streaming Platform Sections */}
              {STREAMING_PROVIDERS.map((provider) => {
                const ProviderIcon = provider.icon;
                const movies = streamingData[provider.id] || [];

                return (
                  <div key={provider.id}>
                    <div className="flex items-center gap-3 mb-6">
                      <div
                        className={`w-8 h-8 rounded-lg ${provider.bgColor} border ${provider.borderColor} flex items-center justify-center`}
                        style={{ color: provider.color }}
                      >
                        <ProviderIcon />
                      </div>
                      <h2 className="text-xl font-semibold text-white">
                        Trending on <span style={{ color: provider.color }}>{provider.name}</span>
                      </h2>
                    </div>

                    {movies.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {movies.map((movie, index) => (
                          <Card key={movie.id} data={movie} media_type="movie" index={index} />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="animate-pulse">
                            <div className="aspect-[2/3] bg-white/5 rounded-xl" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right Sidebar - Upcoming */}
            <div className="xl:col-span-1">
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
