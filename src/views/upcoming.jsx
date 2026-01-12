import axios from "axios";
import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { FaCalendarAlt, FaChevronDown, FaFilm, FaStar } from "react-icons/fa";

// Available regions
const REGIONS = [
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
];

const MONTHS = [
  { id: 0, name: "January", short: "Jan" },
  { id: 1, name: "February", short: "Feb" },
  { id: 2, name: "March", short: "Mar" },
  { id: 3, name: "April", short: "Apr" },
  { id: 4, name: "May", short: "May" },
  { id: 5, name: "June", short: "Jun" },
  { id: 6, name: "July", short: "Jul" },
  { id: 7, name: "August", short: "Aug" },
  { id: 8, name: "September", short: "Sep" },
  { id: 9, name: "October", short: "Oct" },
  { id: 10, name: "November", short: "Nov" },
  { id: 11, name: "December", short: "Dec" },
];

// Years to show (2026-2030)
const YEARS = [2026, 2027, 2028, 2029, 2030];

// Compact Movie Card Component
const CompactCard = ({ movie }) => {
  const imageURL = useSelector((state) => state.movieData.imageURL);
  const posterPath = movie.poster_path
    ? `${imageURL}${movie.poster_path}`
    : null;

  const releaseDate = movie.release_date
    ? new Date(movie.release_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'TBA';

  return (
    <Link
      to={`/movie/${movie.id}`}
      className="group relative block bg-white/5 rounded-lg overflow-hidden hover:bg-white/10 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-green-500/10"
    >
      {/* Poster */}
      <div className="aspect-[2/3] relative overflow-hidden">
        {posterPath ? (
          <img
            src={posterPath}
            alt={movie.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center">
            <FaFilm className="text-white/20 text-2xl" />
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Rating Badge */}
        {movie.vote_average > 0 && (
          <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm">
            <FaStar className="text-yellow-400 text-[8px]" />
            <span className="text-white text-[10px] font-medium">{movie.vote_average.toFixed(1)}</span>
          </div>
        )}

        {/* Release Date Badge */}
        <div className="absolute bottom-1.5 left-1.5 right-1.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/90 backdrop-blur-sm text-[10px] text-white font-medium">
            📅 {releaseDate}
          </span>
        </div>
      </div>

      {/* Title */}
      <div className="p-2">
        <h4 className="text-xs font-medium text-white truncate group-hover:text-green-400 transition-colors">
          {movie.title}
        </h4>
        <p className="text-[10px] text-white/40 mt-0.5">
          {movie.release_date ? new Date(movie.release_date).getFullYear() : 'TBA'}
        </p>
      </div>
    </Link>
  );
};

const UpcomingPage = () => {
  const [selectedRegion, setSelectedRegion] = useState(REGIONS[0]);
  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [isYearOpen, setIsYearOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null); // null = show all months
  const [allMovies, setAllMovies] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch important/popular movies from 2026 to 2030
  const fetchAllUpcoming = async () => {
    setLoading(true);
    try {
      const movies = [];

      // Fetch for each year to ensure coverage
      for (const year of YEARS) {
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        // Fetch top movies by popularity for each year
        for (let page = 1; page <= 5; page++) {
          const response = await axios.get(
            `https://api.themoviedb.org/3/discover/movie`,
            {
              params: {
                api_key: import.meta.env.VITE_MOVIE_API_KEY,
                language: "en-US",
                page: page,
                sort_by: "popularity.desc", // Sort by popularity to get important movies
                "primary_release_date.gte": startDate,
                "primary_release_date.lte": endDate,
                with_release_type: "2|3", // Theatrical releases
                "vote_count.gte": 0, // Include movies with any votes
              },
            }
          );

          if (response.data.results.length === 0) break;
          movies.push(...response.data.results);

          // Stop if we've reached the last page or have enough movies
          if (page >= response.data.total_pages) break;
        }
      }

      // Remove duplicates based on movie ID
      const uniqueMovies = movies.filter((movie, index, self) =>
        index === self.findIndex((m) => m.id === movie.id)
      );

      setAllMovies(uniqueMovies);
    } catch (error) {
      console.log("Error fetching upcoming:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllUpcoming();
  }, [selectedRegion]);

  // Filter movies by selected year and optionally by month (max 15 per month)
  const filteredMovies = useMemo(() => {
    const startDate = new Date(2026, 0, 1);
    const MAX_PER_MONTH = 15;

    let filtered = allMovies.filter((movie) => {
      if (!movie.release_date) return false;

      const date = new Date(movie.release_date);
      if (date < startDate) return false;

      const movieYear = date.getFullYear();
      const movieMonth = date.getMonth();

      // Filter by year
      if (movieYear !== selectedYear) return false;

      // Filter by month if selected
      if (selectedMonth !== null && movieMonth !== selectedMonth) return false;

      return true;
    });

    // Sort by popularity (most popular first)
    filtered = filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

    // If filtering by single month, limit to MAX_PER_MONTH
    if (selectedMonth !== null) {
      filtered = filtered.slice(0, MAX_PER_MONTH);
    }

    return filtered;
  }, [allMovies, selectedYear, selectedMonth]);

  // Organize ALL movies for the year by month (max 15 per month, sorted by popularity)
  // This is independent of selectedMonth so month counts are always accurate
  const moviesByMonth = useMemo(() => {
    const organized = {};
    const MAX_PER_MONTH = 15;
    const startDate = new Date(2026, 0, 1);

    // Initialize all months with empty arrays
    MONTHS.forEach((month) => {
      organized[month.id] = [];
    });

    // Group movies by month (filter by year only, not by selectedMonth)
    const tempOrganized = {};
    MONTHS.forEach((month) => {
      tempOrganized[month.id] = [];
    });

    allMovies.forEach((movie) => {
      if (!movie.release_date) return;
      const date = new Date(movie.release_date);
      if (date < startDate) return;
      if (date.getFullYear() !== selectedYear) return;

      const month = date.getMonth();
      tempOrganized[month].push(movie);
    });

    // Sort each month by popularity and limit to MAX_PER_MONTH
    MONTHS.forEach((month) => {
      organized[month.id] = tempOrganized[month.id]
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .slice(0, MAX_PER_MONTH);
    });

    return organized;
  }, [allMovies, selectedYear]);

  // Get movie count per month for badges (capped at 15)
  const monthCounts = useMemo(() => {
    const counts = {};
    const MAX_PER_MONTH = 15;

    MONTHS.forEach((month) => {
      const monthMovies = moviesByMonth[month.id] || [];
      counts[month.id] = Math.min(monthMovies.length, MAX_PER_MONTH);
    });

    return counts;
  }, [moviesByMonth]);

  // Total movies for selected year
  const totalMoviesInYear = Object.values(monthCounts).reduce((sum, count) => sum + count, 0);

  const handleRegionSelect = (region) => {
    setSelectedRegion(region);
    setIsRegionOpen(false);
    setAllMovies([]);
  };

  const handleYearSelect = (year) => {
    setSelectedYear(year);
    setIsYearOpen(false);
    setSelectedMonth(null); // Reset month filter when year changes
  };

  const handleMonthSelect = (monthId) => {
    if (selectedMonth === monthId) {
      setSelectedMonth(null); // Toggle off - show all months
    } else {
      setSelectedMonth(monthId);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <section className="pt-20 pb-4 px-4 sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/5">
        <div className="container mx-auto">
          <div className="flex flex-col gap-4">
            {/* Title Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                  <FaCalendarAlt className="text-black text-lg" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-bold text-white">
                    Coming <span className="text-green-400">Soon</span>
                  </h1>
                  <p className="text-xs text-white/40">
                    {selectedMonth !== null
                      ? `${filteredMovies.length} movies in ${MONTHS[selectedMonth].name} ${selectedYear}`
                      : `${totalMoviesInYear} movies in ${selectedYear}`
                    }
                  </p>
                </div>
              </div>

              {/* Right side controls */}
              <div className="flex items-center gap-3">
                {/* Year Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => { setIsYearOpen(!isYearOpen); setIsRegionOpen(false); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 hover:border-green-400 transition-all text-sm"
                  >
                    <FaCalendarAlt className="text-green-400 text-xs" />
                    <span className="text-white font-bold">{selectedYear}</span>
                    <FaChevronDown className={`text-green-400 text-xs transition-transform ${isYearOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isYearOpen && (
                    <div className="absolute top-full right-0 mt-2 w-32 py-2 rounded-xl bg-[#1a1a1a] border border-white/10 shadow-2xl z-50">
                      {YEARS.map((year) => (
                        <button
                          key={year}
                          onClick={() => handleYearSelect(year)}
                          className={`w-full flex items-center justify-center gap-2 px-4 py-2 hover:bg-white/5 transition-colors text-sm ${selectedYear === year ? "bg-green-500/10 text-green-400" : "text-white"
                            }`}
                        >
                          <span className="font-bold">{year}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Region Selector */}
                <div className="relative">
                  <button
                    onClick={() => { setIsRegionOpen(!isRegionOpen); setIsYearOpen(false); }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-green-500/30 transition-all text-sm"
                  >
                    <span className="text-lg">{selectedRegion.flag}</span>
                    <span className="text-white font-medium hidden sm:inline">{selectedRegion.name}</span>
                    <FaChevronDown className={`text-white/50 text-xs transition-transform ${isRegionOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isRegionOpen && (
                    <div className="absolute top-full right-0 mt-2 w-48 py-2 rounded-xl bg-[#1a1a1a] border border-white/10 shadow-2xl z-50">
                      {REGIONS.map((region) => (
                        <button
                          key={region.code}
                          onClick={() => handleRegionSelect(region)}
                          className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors text-sm ${selectedRegion.code === region.code ? "bg-green-500/10 text-green-400" : "text-white"
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

            {/* Month Filter Pills - All 12 months */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {/* All Months Button */}
              <button
                onClick={() => setSelectedMonth(null)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selectedMonth === null
                  ? "bg-gradient-to-r from-green-500 to-emerald-500 text-black shadow-lg shadow-green-500/20"
                  : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
                  }`}
              >
                All
              </button>

              {/* Individual Month Buttons */}
              {MONTHS.map((month) => {
                const count = monthCounts[month.id];
                const hasMovies = count > 0;
                const isSelected = selectedMonth === month.id;

                return (
                  <button
                    key={month.id}
                    onClick={() => handleMonthSelect(month.id)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isSelected
                      ? "bg-gradient-to-r from-green-500 to-emerald-500 text-black shadow-lg shadow-green-500/20"
                      : hasMovies
                        ? "bg-white/5 text-white hover:bg-green-500/20 hover:text-green-400 border border-white/10 hover:border-green-500/30"
                        : "bg-white/[0.02] text-white/30 border border-white/5 cursor-default"
                      }`}
                    disabled={!hasMovies && !isSelected}
                  >
                    <span>{month.short}</span>
                    {hasMovies && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? "bg-black/20" : "bg-white/10"
                        }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Loading State */}
      {loading ? (
        <section className="px-4 py-8">
          <div className="container mx-auto">
            <div className="space-y-8">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-6 bg-white/5 rounded w-32 mb-4" />
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
                    {[...Array(10)].map((_, j) => (
                      <div key={j} className="aspect-[2/3] bg-white/5 rounded-lg" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        /* Content Section */
        <section className="px-4 py-6">
          <div className="container mx-auto">
            {/* Show all months or filtered month */}
            {selectedMonth === null ? (
              // Show all months for the year
              MONTHS.map((month) => {
                const movies = moviesByMonth[month.id];

                return (
                  <div key={month.id} className="mb-8">
                    {/* Month Header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${movies.length > 0
                        ? "bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30"
                        : "bg-white/5 border border-white/10"
                        }`}>
                        <span className={`font-bold text-sm ${movies.length > 0 ? "text-green-400" : "text-white/30"}`}>
                          {month.short}
                        </span>
                      </div>
                      <div className="flex-1">
                        <h3 className={`text-lg font-semibold ${movies.length > 0 ? "text-white" : "text-white/30"}`}>
                          {month.name}
                        </h3>
                        <p className="text-xs text-white/40">
                          {movies.length > 0 ? `${movies.length} movie${movies.length > 1 ? 's' : ''}` : 'No releases'}
                        </p>
                      </div>
                      {movies.length > 0 && (
                        <div className="h-px flex-1 bg-gradient-to-r from-green-500/20 to-transparent" />
                      )}
                    </div>

                    {/* Movies Grid */}
                    {movies.length > 0 ? (
                      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
                        {movies.map((movie) => (
                          <CompactCard key={movie.id} movie={movie} />
                        ))}
                      </div>
                    ) : (
                      <div className="py-6 px-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                        <p className="text-white/20 text-sm">No movies scheduled for {month.name} {selectedYear}</p>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              // Show only selected month
              <div>
                {/* Month Header */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 flex items-center justify-center">
                    <span className="text-green-400 font-bold text-lg">
                      {MONTHS[selectedMonth].short}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">{MONTHS[selectedMonth].name} {selectedYear}</h2>
                    <p className="text-sm text-white/40">{filteredMovies.length} movie{filteredMovies.length !== 1 ? 's' : ''} releasing</p>
                  </div>
                </div>

                {/* Movies Grid */}
                {filteredMovies.length > 0 ? (
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
                    {filteredMovies.map((movie) => (
                      <CompactCard key={movie.id} movie={movie} />
                    ))}
                  </div>
                ) : (
                  <div className="py-12 px-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                    <FaFilm className="mx-auto text-4xl text-white/10 mb-4" />
                    <p className="text-white/40">No movies scheduled for {MONTHS[selectedMonth].name} {selectedYear}</p>
                  </div>
                )}
              </div>
            )}

            {/* Empty State for entire year */}
            {totalMoviesInYear === 0 && !loading && (
              <div className="text-center py-20">
                <FaFilm className="mx-auto text-6xl text-white/10 mb-4" />
                <h3 className="text-xl font-semibold text-white/60 mb-2">No upcoming movies for {selectedYear}</h3>
                <p className="text-white/40">Try selecting a different region or year</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default UpcomingPage;
