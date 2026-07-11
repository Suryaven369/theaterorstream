import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { FaCalendarAlt, FaChevronDown, FaFilm, FaStar } from "react-icons/fa";
import { getUpcomingFromEdge } from "../lib/contentEdgeApi";
import { generateSlugWithId } from "../lib/slugUtils";
import { REGIONS, getSavedRegion, persistRegion } from "../constants/regions";

const ALL_MONTHS = [
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

const currentDate = new Date();
const CURRENT_YEAR = currentDate.getFullYear();
const CURRENT_MONTH = currentDate.getMonth();

const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR + i);
const CALENDAR_START_YEAR = YEARS[0];
const CALENDAR_END_YEAR = YEARS[YEARS.length - 1];

const getVisibleMonths = (selectedYear) => {
  if (selectedYear > CURRENT_YEAR) {
    return ALL_MONTHS;
  }
  if (selectedYear === CURRENT_YEAR) {
    return ALL_MONTHS.filter(month => month.id >= CURRENT_MONTH);
  }
  return [];
};
const MAX_PER_MONTH = 50;

// Select which titles make the cut by anticipation (so notable late-in-month
// releases aren't dropped), then DISPLAY them chronologically by date.
const byAnticipation = (a, b) => {
  const pop = (Number(b.popularity) || 0) - (Number(a.popularity) || 0);
  if (pop !== 0) return pop;
  return new Date(a.release_date) - new Date(b.release_date);
};

const byReleaseDate = (a, b) => new Date(a.release_date) - new Date(b.release_date);

const CompactCard = ({ movie }) => {
  const imageURL = useSelector((state) => state.movieData.imageURL);
  const posterPath = movie.poster_path
    ? movie.poster_path.startsWith("http")
      ? movie.poster_path
      : `${imageURL}${movie.poster_path}`
    : null;

  const releaseDate = movie.release_date
    ? new Date(movie.release_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "TBA";

  const year = movie.release_date?.split("-")[0];
  const mediaType = movie.media_type === "tv" ? "tv" : "movie";
  const slug = generateSlugWithId(movie.title, movie.id, year);
  const detailPath = mediaType === "tv" ? `/tv/${slug}` : `/movies/${slug}`;

  return (
    <Link
      to={detailPath}
      className="group relative block bg-white/5 rounded-lg overflow-hidden hover:bg-white/10 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-green-500/10"
    >
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

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {movie.vote_average > 0 && (
          <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm">
            <FaStar className="text-yellow-400 text-[8px]" />
            <span className="text-white text-[10px] font-medium">{Number(movie.vote_average).toFixed(1)}</span>
          </div>
        )}

        <div className="absolute bottom-1.5 left-1.5 right-1.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/90 backdrop-blur-sm text-[10px] text-white font-medium">
            📅 {releaseDate}
          </span>
        </div>
      </div>

      <div className="p-2">
        <h4 className="text-xs font-medium text-white truncate group-hover:text-green-400 transition-colors">
          {movie.title}
        </h4>
        <p className="text-[10px] text-white/40 mt-0.5">
          {movie.release_date ? new Date(movie.release_date).getFullYear() : "TBA"}
        </p>
      </div>
    </Link>
  );
};

const UpcomingPage = () => {
  const [selectedRegion, setSelectedRegion] = useState(getSavedRegion);
  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(CALENDAR_START_YEAR);
  const [isYearOpen, setIsYearOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [allMovies, setAllMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const visibleMonths = useMemo(() => getVisibleMonths(selectedYear), [selectedYear]);

  useEffect(() => {
    let cancelled = false;

    const fetchAllUpcoming = async () => {
      setLoading(true);
      setFetchError(null);

      try {
        const { data, error } = await getUpcomingFromEdge({
          yearFrom: CALENDAR_START_YEAR,
          yearTo: CALENDAR_END_YEAR,
          minReleaseDate: `${CALENDAR_START_YEAR}-01-01`,
          fetchAll: true,
        });

        if (cancelled) return;

        if (error) {
          setFetchError("Could not load upcoming titles from the library.");
          setAllMovies([]);
        } else {
          setAllMovies(data || []);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error fetching upcoming from DB:", error);
          setFetchError("Could not load upcoming titles from the library.");
          setAllMovies([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAllUpcoming();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredMovies = useMemo(() => {
    const startDate = new Date(CALENDAR_START_YEAR, 0, 1);

    let filtered = allMovies.filter((movie) => {
      if (!movie.release_date) return false;

      const date = new Date(movie.release_date);
      if (date < startDate) return false;

      const movieYear = date.getFullYear();
      const movieMonth = date.getMonth();

      if (movieYear !== selectedYear) return false;
      if (selectedMonth !== null && movieMonth !== selectedMonth) return false;

      return true;
    });

    // Pick the most-anticipated for the month, then show them date-wise.
    filtered = filtered.sort(byAnticipation);
    if (selectedMonth !== null) {
      filtered = filtered.slice(0, MAX_PER_MONTH);
    }
    filtered = filtered.sort(byReleaseDate);

    return filtered;
  }, [allMovies, selectedYear, selectedMonth]);

  const moviesByMonth = useMemo(() => {
    const organized = {};
    const startDate = new Date(CALENDAR_START_YEAR, 0, 1);

    ALL_MONTHS.forEach((month) => {
      organized[month.id] = [];
    });

    const tempOrganized = {};
    ALL_MONTHS.forEach((month) => {
      tempOrganized[month.id] = [];
    });

    allMovies.forEach((movie) => {
      if (!movie.release_date) return;
      const date = new Date(movie.release_date);
      if (date < startDate) return;
      if (date.getFullYear() !== selectedYear) return;

      tempOrganized[date.getMonth()].push(movie);
    });

    ALL_MONTHS.forEach((month) => {
      organized[month.id] = tempOrganized[month.id]
        .sort(byAnticipation)
        .slice(0, MAX_PER_MONTH)
        .sort(byReleaseDate);
    });

    return organized;
  }, [allMovies, selectedYear]);

  const monthCounts = useMemo(() => {
    const counts = {};
    visibleMonths.forEach((month) => {
      counts[month.id] = Math.min((moviesByMonth[month.id] || []).length, MAX_PER_MONTH);
    });
    return counts;
  }, [moviesByMonth, visibleMonths]);

  const totalMoviesInYear = Object.values(monthCounts).reduce((sum, count) => sum + count, 0);

  const handleRegionSelect = (region) => {
    setSelectedRegion(region);
    persistRegion(region);
    setIsRegionOpen(false);
  };

  const handleYearSelect = (year) => {
    setSelectedYear(year);
    setIsYearOpen(false);
    const newVisibleMonths = getVisibleMonths(year);
    if (selectedMonth !== null && !newVisibleMonths.some(m => m.id === selectedMonth)) {
      setSelectedMonth(null);
    }
  };

  const handleMonthSelect = (monthId) => {
    setSelectedMonth((current) => (current === monthId ? null : monthId));
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-20 lg:pb-0">
      <section className="pt-16 sm:pt-20 pb-3 sm:pb-4 px-3 sm:px-4 sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/5">
        <div className="container mx-auto">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                  <FaCalendarAlt className="text-black text-sm sm:text-lg" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-white">
                    Coming <span className="text-green-400">Soon</span>
                  </h1>
                  <p className="text-xs text-white/40">
                    {selectedMonth !== null
                      ? `${filteredMovies.length} movies in ${ALL_MONTHS[selectedMonth].name} ${selectedYear}`
                      : `${totalMoviesInYear} movies in ${selectedYear}`}
                    {" · "}
                    <span className="text-green-400/80">From library</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
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
                          className={`w-full flex items-center justify-center gap-2 px-4 py-2 hover:bg-white/5 transition-colors text-sm ${selectedYear === year ? "bg-green-500/10 text-green-400" : "text-white"}`}
                        >
                          <span className="font-bold">{year}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

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
                          className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors text-sm ${selectedRegion.code === region.code ? "bg-green-500/10 text-green-400" : "text-white"}`}
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

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setSelectedMonth(null)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selectedMonth === null
                  ? "bg-gradient-to-r from-green-500 to-emerald-500 text-black shadow-lg shadow-green-500/20"
                  : "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
                  }`}
              >
                All
              </button>

              {visibleMonths.map((month) => {
                const count = monthCounts[month.id] || 0;
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
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? "bg-black/20" : "bg-white/10"}`}>
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

      {loading ? (
        <section className="px-4 py-8">
          <div className="container mx-auto">
            <div className="space-y-8">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-6 bg-white/5 rounded w-32 mb-4" />
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2 sm:gap-3">
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
        <section className="px-4 py-6">
          <div className="container mx-auto">
            {fetchError && (
              <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                {fetchError}
              </div>
            )}

            {!fetchError && allMovies.length === 0 && (
              <div className="text-center py-20 px-4">
                <FaFilm className="mx-auto text-6xl text-white/10 mb-4" />
                <h3 className="text-xl font-semibold text-white/60 mb-2">No upcoming titles in the library yet</h3>
                <p className="text-white/40 max-w-md mx-auto">
                  Use Admin Panel → Sync Upcoming to import release calendars into your database. This page loads instantly once titles are saved.
                </p>
              </div>
            )}

            {allMovies.length > 0 && selectedMonth === null ? (
              visibleMonths.map((month) => {
                const movies = moviesByMonth[month.id];

                return (
                  <div key={month.id} className="mb-8">
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
                          {movies.length > 0 ? `${movies.length} movie${movies.length > 1 ? "s" : ""}` : "No releases"}
                        </p>
                      </div>
                      {movies.length > 0 && (
                        <div className="h-px flex-1 bg-gradient-to-r from-green-500/20 to-transparent" />
                      )}
                    </div>

                    {movies.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-3">
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
            ) : allMovies.length > 0 ? (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 flex items-center justify-center">
                    <span className="text-green-400 font-bold text-lg">
                      {ALL_MONTHS[selectedMonth].short}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">{ALL_MONTHS[selectedMonth].name} {selectedYear}</h2>
                    <p className="text-sm text-white/40">{filteredMovies.length} movie{filteredMovies.length !== 1 ? "s" : ""} releasing</p>
                  </div>
                </div>

                {filteredMovies.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-3">
                    {filteredMovies.map((movie) => (
                      <CompactCard key={movie.id} movie={movie} />
                    ))}
                  </div>
                ) : (
                  <div className="py-12 px-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                    <FaFilm className="mx-auto text-4xl text-white/10 mb-4" />
                    <p className="text-white/40">No movies scheduled for {ALL_MONTHS[selectedMonth].name} {selectedYear}</p>
                  </div>
                )}
              </div>
            ) : null}

            {totalMoviesInYear === 0 && allMovies.length > 0 && !loading && (
              <div className="text-center py-20">
                <FaFilm className="mx-auto text-6xl text-white/10 mb-4" />
                <h3 className="text-xl font-semibold text-white/60 mb-2">No upcoming movies for {selectedYear}</h3>
                <p className="text-white/40">Try selecting a different year</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default UpcomingPage;
