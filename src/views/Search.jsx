import axios from "axios";
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import Card from "../components/Card";
import { IoSearchOutline } from "react-icons/io5";
import { FaUser, FaFilm, FaDatabase, FaGlobe } from "react-icons/fa";
import { searchProfiles } from "../lib/supabase";
import { searchContentFromEdge } from "../lib/contentEdgeApi";

// Avatar options for profile display
const AVATARS = {
  'avatar_1': { emoji: '🎬', bg: 'from-red-500 to-pink-500' },
  'avatar_2': { emoji: '🎭', bg: 'from-purple-500 to-indigo-500' },
  'avatar_3': { emoji: '🎪', bg: 'from-yellow-500 to-orange-500' },
  'avatar_4': { emoji: '🌟', bg: 'from-amber-400 to-yellow-500' },
  'avatar_5': { emoji: '🎯', bg: 'from-green-500 to-emerald-500' },
  'avatar_6': { emoji: '🦋', bg: 'from-pink-400 to-purple-500' },
  'avatar_7': { emoji: '🌈', bg: 'from-cyan-500 to-blue-500' },
  'avatar_8': { emoji: '🎸', bg: 'from-rose-500 to-red-600' },
  'avatar_9': { emoji: '🎮', bg: 'from-indigo-500 to-purple-600' },
  'avatar_10': { emoji: '📚', bg: 'from-teal-500 to-green-500' },
  'avatar_11': { emoji: '🚀', bg: 'from-blue-500 to-cyan-500' },
  'avatar_12': { emoji: '🎨', bg: 'from-fuchsia-500 to-pink-500' },
};

// Profile Card Component
const ProfileCard = ({ profile }) => {
  const avatar = AVATARS[profile.avatar_id] || AVATARS['avatar_1'];

  return (
    <Link
      to={`/${profile.username}/profile`}
      className="flex items-center gap-4 p-4 rounded-xl bg-[#1a1a1a] border border-white/5 hover:border-purple-500/30 transition-all group"
    >
      <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${avatar.bg} flex items-center justify-center text-2xl flex-shrink-0`}>
        {avatar.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-white group-hover:text-purple-400 transition-colors truncate">
          {profile.display_name || profile.username}
        </h3>
        <p className="text-sm text-white/40">@{profile.username}</p>
      </div>
      <div className="text-white/20 group-hover:text-purple-400 transition-colors">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
};

const Search = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Tab state: 'movies' or 'people'
  const [activeTab, setActiveTab] = useState('movies');

  // Movies data
  const [movieData, setMovieData] = useState([]);
  const [moviePage, setMoviePage] = useState(1);
  const [moviesLoading, setMoviesLoading] = useState(false);
  const [totalDbResults, setTotalDbResults] = useState(0);
  const [hasMorePages, setHasMorePages] = useState(true);

  // People data
  const [profileData, setProfileData] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(false);

  const query = location?.search?.slice(3);
  const displayQuery = query?.split("%20")?.join(" ");

  // Fetch movies from Database (primary source)
  const fetchMoviesFromDb = async (page = 1) => {
    if (!displayQuery || displayQuery.length < 2) return;

    try {
      setMoviesLoading(true);
      const limit = 24;
      const offset = (page - 1) * limit;

      const result = await searchContentFromEdge(displayQuery, {
        limit,
        offset,
      });

      if (page === 1) {
        setMovieData(result.data || []);
      } else {
        setMovieData((prev) => [...prev, ...(result.data || [])]);
      }

      setTotalDbResults(result.total || 0);
      setHasMorePages((result.data?.length || 0) >= limit);

      console.log(`📀 Found ${result.data?.length || 0} results from library (total: ${result.total})`);
    } catch (error) {
      console.error("Error searching library:", error);
    } finally {
      setMoviesLoading(false);
    }
  };

  // Fetch movies (Only DB source now)
  const fetchMovies = async (page = 1) => {
    await fetchMoviesFromDb(page);
  };

  // Fetch profiles from Supabase
  const fetchProfiles = async () => {
    if (!displayQuery || displayQuery.length < 2) return;

    try {
      setProfilesLoading(true);
      const profiles = await searchProfiles(displayQuery, 20);
      setProfileData(profiles);
    } catch (error) {
      console.log("error", error);
    } finally {
      setProfilesLoading(false);
    }
  };

  // Fetch data when query changes
  useEffect(() => {
    if (query) {
      setMoviePage(1);
      setMovieData([]);
      setProfileData([]);
      fetchMovies(1);
      fetchProfiles();
    }
  }, [location?.search]);

  // Infinite scroll for movies
  const handleScroll = () => {
    if (activeTab === 'movies' && hasMorePages && window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
      if (!moviesLoading) {
        setMoviePage((prev) => prev + 1);
      }
    }
  };

  useEffect(() => {
    if (query && moviePage > 1) {
      fetchMovies(moviePage);
    }
  }, [moviePage]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [moviesLoading, activeTab, hasMorePages]);

  const isLoading = activeTab === 'movies' ? moviesLoading : profilesLoading;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-20 sm:pb-0">
      {/* Hero Section */}
      <section className="relative pt-24 sm:pt-32 pb-6 sm:pb-8 px-3 sm:px-6">
        <div className="container mx-auto">
          {/* Mobile Search */}
          <div className="lg:hidden mb-8">
            <div className="relative">
              <IoSearchOutline className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-xl" />
              <input
                type="text"
                placeholder="Search movies & people..."
                onChange={(e) => navigate(`/search?q=${e.target.value}`)}
                value={displayQuery}
                className="w-full bg-white/5 border border-white/10 pl-12 pr-4 py-3 rounded-2xl text-white placeholder:text-white/40 focus:outline-none focus:border-yellow-500/50 transition-smooth"
              />
            </div>
          </div>

          <div className="max-w-2xl animate-fadeInUp">
            <span className="inline-block px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs sm:text-sm font-medium mb-4 sm:mb-6">
              🔍 Search Results
            </span>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold leading-tight mb-3 sm:mb-4">
              {displayQuery ? (
                <>
                  <span className="text-white">Results for </span>
                  <span className="text-gradient">"{displayQuery}"</span>
                </>
              ) : (
                <span className="text-white">Search Movies & People</span>
              )}
            </h1>
            {activeTab === 'movies' && totalDbResults > 0 && (
              <p className="text-white/40 text-sm flex items-center gap-2">
                <FaDatabase className="text-green-400" />
                {totalDbResults} results in library
              </p>
            )}
          </div>
        </div>

        {/* Decorative gradient orb */}
        <div className="absolute top-20 right-0 w-96 h-96 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* Tabs */}
      <section className="px-6 pb-6">
        <div className="container mx-auto">
          <div className="flex flex-wrap items-center gap-4">
            {/* Tabs */}
            <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
              <button
                onClick={() => setActiveTab('movies')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === 'movies'
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}
              >
                <FaFilm className="text-xs" />
                Movies & TV
                {movieData.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                    {movieData.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('people')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === 'people'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}
              >
                <FaUser className="text-xs" />
                People
                {profileData.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                    {profileData.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="px-6 pb-24">
        <div className="container mx-auto">
          {activeTab === 'movies' ? (
            // Movies Grid
            movieData.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {movieData.map((item, index) => (
                  <Card
                    key={(item.tmdb_id || item.id) + "search" + index}
                    data={{
                      id: item.tmdb_id || item.id,
                      title: item.title || item.name,
                      poster_path: item.poster_path,
                      backdrop_path: item.backdrop_path,
                      media_type: item.media_type || 'movie',
                      vote_average: item.vote_average,
                      release_date: item.release_date || item.first_air_date,
                      overview: item.overview,
                    }}
                    media_type={item.media_type || 'movie'}
                    index={index}
                  />
                ))}
              </div>
            ) : !moviesLoading && query ? (
              <div className="text-center py-20">
                <span className="text-6xl mb-6 block opacity-50">📭</span>
                <p className="text-white/60 text-xl font-medium">
                  Title not found
                </p>
                <p className="text-white/30 text-sm mt-2 max-w-md mx-auto">
                  We are working on adding it to the library soon.
                </p>
              </div>
            ) : null
          ) : (
            // People Grid
            profileData.length > 0 ? (
              <div className="grid gap-3 max-w-2xl">
                {profileData.map((profile) => (
                  <ProfileCard key={profile.id} profile={profile} />
                ))}
              </div>
            ) : !profilesLoading && query ? (
              <div className="text-center py-20">
                <span className="text-5xl mb-4 block">👤</span>
                <p className="text-white/40 text-lg">No users found</p>
                <p className="text-white/20 text-sm mt-2">
                  Try searching for a different username
                </p>
              </div>
            ) : null
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-center mt-12">
              <div className="w-8 h-8 border-2 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin" />
            </div>
          )}

          {/* End of results indicator */}
          {activeTab === 'movies' && movieData.length > 0 && !hasMorePages && !moviesLoading && (
            <div className="text-center mt-12 py-4">
              <p className="text-white/30 text-sm">
                All library results shown
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Search;
