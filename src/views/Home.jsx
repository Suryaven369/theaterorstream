import React, { useState, useEffect } from "react";
import Card from "../components/Card";
import { FaGlobe, FaChevronDown, FaCalendarAlt } from "react-icons/fa";
import { Link } from "react-router-dom";
import { getHomepageSections } from "../lib/supabase";
import { generateSlugWithId } from "../lib/slugUtils";

// Available regions for content filtering
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

const Home = () => {
  // Load saved region from localStorage or default to India
  const [selectedRegion, setSelectedRegion] = useState(() => {
    const saved = localStorage.getItem('selectedRegion');
    if (saved) {
      const found = REGIONS.find(r => r.code === saved);
      return found || REGIONS[0];
    }
    return REGIONS[0];
  });
  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const [cmsSections, setCmsSections] = useState([]);
  const [loadingSections, setLoadingSections] = useState(true);

  // ============================================
  // FETCH ALL SECTIONS FROM DATABASE ONCE
  // Movies are stored per region in movies_by_region
  // Frontend filters by selectedRegion.code
  // ============================================
  useEffect(() => {
    const fetchCmsSections = async () => {
      setLoadingSections(true);
      console.log("📦 Fetching all sections from database...");

      // Fetch all active sections (movies_by_region contains regional data)
      const sections = await getHomepageSections(true);

      // Count total movies across all regions
      const totalMovies = sections?.reduce((acc, s) => {
        const regionMovies = Object.values(s.movies_by_region || {}).flat();
        return acc + regionMovies.length;
      }, 0) || 0;

      console.log(`✅ Loaded ${sections?.length || 0} sections with ${totalMovies} movies across all regions`);
      setCmsSections(sections || []);
      setLoadingSections(false);
    };
    fetchCmsSections();
  }, []); // Only fetch once on mount

  const handleRegionSelect = (region) => {
    setSelectedRegion(region);
    localStorage.setItem('selectedRegion', region.code); // Save preference
    setIsRegionOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-20 lg:pb-0">
      {/* Header Section with Region */}
      <section className="pt-20 sm:pt-24 pb-6 sm:pb-8 px-4 sm:px-8 md:pl-12 lg:pl-16">
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
      <section className="px-4 sm:px-8 md:pl-12 lg:pl-16 pb-8">
        <div className="container mx-auto">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 sm:gap-8">
            {/* Left Content - 3 columns */}
            <div className="xl:col-span-3 space-y-8 sm:space-y-12">

              {/* Loading Skeleton */}
              {loadingSections && (
                <div className="space-y-8">
                  {[1, 2, 3].map((i) => (
                    <div key={i}>
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-lg bg-white/5 animate-pulse" />
                        <div className="w-32 h-6 rounded bg-white/5 animate-pulse" />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {[1, 2, 3, 4, 5].map((j) => (
                          <div key={j} className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* CMS Managed Sections - Filter to show only sections with movies for selected region */}
              {/* Exclude 'coming-soon' from main grid - it shows in sidebar only */}
              {!loadingSections && cmsSections
                .filter(section => {
                  // Exclude coming-soon section (shown in sidebar)
                  if (section.slug === 'coming-soon') return false;
                  // Only show sections that have movies for the selected region
                  const regionMovies = section.movies_by_region?.[selectedRegion.code] || [];
                  return regionMovies.length > 0;
                })
                .map((section) => (
                  <div key={section.id}>
                    <div className="flex items-center gap-3 mb-6 group">
                      {/* Icon with shiny background */}
                      <div className="relative p-2 rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <span className="relative text-xl sm:text-2xl drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">{section.icon}</span>
                      </div>

                      {/* Section Title with Gradient and Animation */}
                      <div className="flex flex-col">
                        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-yellow-200 group-hover:via-yellow-400 group-hover:to-orange-500 transition-all duration-300">
                          {section.name}
                        </h2>
                        {section.description && (
                          <span className="text-xs sm:text-sm text-white/40 font-medium tracking-wide">
                            {section.description}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Get movies for the selected region */}
                    {(() => {
                      const regionMovies = section.movies_by_region?.[selectedRegion.code] || [];

                      if (regionMovies.length > 0) {
                        return (
                          /* Grid Layout - 5 Columns for Desktop (Standard Size), 2 Rows (if limit is 10) */
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6 px-1">
                            {regionMovies.slice(0, section.max_movies || 10).map((movie, index) => (
                              <div key={movie.tmdb_id} className="transform hover:scale-105 transition-transform duration-300">
                                <Card
                                  data={{
                                    id: movie.tmdb_id,
                                    title: movie.title,
                                    poster_path: movie.poster_path,
                                    backdrop_path: movie.backdrop_path,
                                    media_type: movie.media_type,
                                    vote_average: movie.vote_average,
                                    release_date: movie.release_date,
                                    overview: movie.overview,
                                    genres: movie.genres,
                                    runtime: movie.runtime
                                  }}
                                  media_type={movie.media_type || "movie"}
                                  index={index}
                                // Removed mini={true} to restore standard poster sizing
                                />
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )).filter(Boolean)}

              {/* No sections message - check if ANY section has content for this region (excluding coming-soon) */}
              {!loadingSections && !cmsSections.some(s => s.slug !== 'coming-soon' && (s.movies_by_region?.[selectedRegion.code] || []).length > 0) && (
                <div className="text-center py-16 px-6">
                  <div className="text-5xl mb-4">{selectedRegion.flag}</div>
                  <h3 className="text-xl font-semibold text-white mb-2">No content for {selectedRegion.name}</h3>
                  <p className="text-white/50 text-sm max-w-md mx-auto">
                    There are no movie sections available for this region yet.
                    Try selecting a different region or check back later.
                  </p>
                </div>
              )}
            </div>

            {/* Right Sidebar - Coming Soon (Hidden on mobile) */}
            <div className="xl:col-span-1 hidden xl:block">
              <div className="sticky top-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <FaCalendarAlt className="text-green-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">Coming Soon</h2>
                </div>

                {/* Coming Soon from Database - uses movies_by_region */}
                {(() => {
                  const comingSoonSection = cmsSections.find(s => s.slug === 'coming-soon');
                  // Get movies for selected region from movies_by_region
                  const comingSoonMovies = comingSoonSection?.movies_by_region?.[selectedRegion.code]?.slice(0, 5) || [];

                  // Helper to format release date
                  const formatReleaseDate = (dateStr) => {
                    if (!dateStr) return 'TBA';
                    const date = new Date(dateStr);
                    const now = new Date();
                    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));

                    if (diffDays < 0) return 'Released';
                    if (diffDays === 0) return 'Today!';
                    if (diffDays === 1) return 'Tomorrow';
                    if (diffDays <= 7) return `In ${diffDays} days`;

                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  };

                  return comingSoonMovies.length > 0 ? (
                    <div className="space-y-3">
                      {comingSoonMovies.map((movie, index) => {
                        // Generate SEO-friendly URL
                        const year = movie.release_date?.split('-')[0] || '';
                        const slug = generateSlugWithId(movie.title, movie.tmdb_id, year);
                        const movieUrl = movie.media_type === 'tv' ? `/tv/${slug}` : `/movies/${slug}`;

                        return (
                          <Link
                            key={movie.tmdb_id}
                            to={movieUrl}
                            className="flex items-start gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all group"
                          >
                            {/* Poster */}
                            <div className="flex-shrink-0 w-12 h-16 rounded-lg overflow-hidden">
                              {movie.poster_path ? (
                                <img
                                  src={`https://image.tmdb.org/t/p/w154${movie.poster_path}`}
                                  alt={movie.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-white/10 flex items-center justify-center text-xl">🎬</div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-medium text-white group-hover:text-yellow-400 transition-colors line-clamp-2">
                                {movie.title}
                              </h3>
                              {/* Release Date */}
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <FaCalendarAlt className="text-green-400 text-[10px]" />
                                <span className="text-xs text-green-400 font-medium">
                                  {formatReleaseDate(movie.release_date)}
                                </span>
                              </div>
                            </div>
                          </Link>
                        );
                      })}

                      {/* View All Link */}
                      <Link
                        to="/upcoming"
                        className="block text-center py-2 text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
                      >
                        View All Coming Soon →
                      </Link>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-white/30 text-sm">
                      <p>No coming soon movies for {selectedRegion.name}.</p>
                      <p className="text-xs mt-2">Add from Admin → Sections.</p>
                    </div>
                  );
                })()}

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
