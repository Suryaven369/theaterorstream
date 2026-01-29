import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { IoSearchOutline } from "react-icons/io5";
import { navigation } from "../constants/navigation";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

// Avatar lookup
const AVATARS = {
  'avatar_1': { emoji: '🎬', bg: 'from-purple-500 to-pink-500' },
  'avatar_2': { emoji: '🎭', bg: 'from-blue-500 to-cyan-500' },
  'avatar_3': { emoji: '🎪', bg: 'from-green-500 to-emerald-500' },
  'avatar_4': { emoji: '🌟', bg: 'from-yellow-500 to-orange-500' },
  'avatar_5': { emoji: '🎯', bg: 'from-red-500 to-pink-500' },
  'avatar_6': { emoji: '🦋', bg: 'from-indigo-500 to-purple-500' },
  'avatar_7': { emoji: '🌈', bg: 'from-pink-500 to-rose-500' },
  'avatar_8': { emoji: '🎸', bg: 'from-teal-500 to-cyan-500' },
  'avatar_9': { emoji: '🎮', bg: 'from-violet-500 to-purple-500' },
  'avatar_10': { emoji: '📚', bg: 'from-amber-500 to-orange-500' },
  'avatar_11': { emoji: '🚀', bg: 'from-sky-500 to-blue-500' },
  'avatar_12': { emoji: '🎨', bg: 'from-rose-500 to-pink-500' },
};

const Header = () => {
  const location = useLocation();
  // Only get search query from the 'q' parameter on /search page
  const searchParams = new URLSearchParams(location.search);
  const initialQuery = location.pathname === '/search' ? (searchParams.get('q') || '') : '';
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasTyped, setHasTyped] = useState(false);
  const navigate = useNavigate();

  const { user, profile, isAuthenticated, isOnboarded } = useAuth();

  // Only navigate when user types something, not on initial load
  useEffect(() => {
    if (hasTyped && searchInput) {
      navigate(`/search?q=${searchInput}`);
    }
  }, [searchInput, hasTyped]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
  };

  const handleSignOut = async () => {
    try {
      // Call Supabase signOut - this clears the session
      await supabase.auth.signOut();

      // Clear specific auth key and any other sb- keys
      localStorage.removeItem('theaterorstream-auth');

      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));

    } catch (error) {
      console.error('Sign out error:', error);
    }

    // Reload to home
    window.location.href = '/';
  };

  const getUserAvatar = () => {
    if (profile?.avatar_id && AVATARS[profile.avatar_id]) {
      return AVATARS[profile.avatar_id];
    }
    return { emoji: '👤', bg: 'from-gray-500 to-gray-600' };
  };

  return (
    <header
      className={`fixed top-0 w-full z-50 transition-all duration-500 ${isScrolled
        ? "glass py-3"
        : "bg-transparent py-5"
        }`}
    >
      <div className="container mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <img
            src="https://res.cloudinary.com/ddhhlkyut/image/upload/v1768226006/a78a29523128c4555fdd178b6c612ac6_dbtyqp.jpg"
            alt="TheaterOrStream Logo"
            className="w-10 h-10 rounded-xl object-cover transition-smooth group-hover:scale-110"
          />
          <span className="text-xl font-semibold tracking-tight hidden sm:block">
            <span className="text-gradient">Theater</span>
            <span className="text-white/60 font-light"> or Stream</span>
          </span>
        </Link>

        {/* Navigation */}
        <nav className="hidden lg:flex items-center gap-1">
          {navigation.map((nav, index) => (
            <NavLink
              key={nav.label + index}
              to={nav.href}
              className={({ isActive }) =>
                `px-4 py-2 rounded-full text-sm font-medium transition-smooth ${isActive
                  ? "bg-white/10 text-yellow-400"
                  : "text-white/70 hover:text-white hover:bg-white/5"
                }`
              }
            >
              {nav.label}
            </NavLink>
          ))}
        </nav>

        {/* Search & Auth */}
        <div className="flex items-center gap-3">
          <form
            className="relative hidden md:block"
            onSubmit={handleSubmit}
          >
            <IoSearchOutline className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-lg" />
            <input
              type="text"
              placeholder="Search movies..."
              className="bg-white/5 border border-white/10 pl-11 pr-4 py-2.5 rounded-full text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-yellow-500/50 focus:bg-white/10 transition-smooth w-56 focus:w-72"
              onChange={(e) => {
                setHasTyped(true);
                setSearchInput(e.target.value);
              }}
              value={searchInput}
            />
          </form>

          <Link
            to="/search"
            className="md:hidden text-xl text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-smooth"
          >
            <IoSearchOutline />
          </Link>

          {/* Auth Section */}
          {isAuthenticated ? (
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className={`w-10 h-10 rounded-full bg-gradient-to-br ${getUserAvatar().bg} flex items-center justify-center text-lg hover:scale-105 transition-all duration-200 shadow-lg`}
              >
                {getUserAvatar().emoji}
              </button>

              {showDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowDropdown(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-52 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden z-50 shadow-xl animate-fadeIn">
                    {/* User info header */}
                    <div className="p-4 border-b border-white/10 bg-gradient-to-br from-white/5 to-transparent">
                      <p className="text-sm font-medium text-white truncate">
                        {profile?.display_name || profile?.username || 'User'}
                      </p>
                      {profile?.username && (
                        <p className="text-xs text-white/50">@{profile.username}</p>
                      )}
                    </div>

                    <div className="py-1">
                      {/* Show different options based on onboarding status */}
                      {isOnboarded ? (
                        <>
                          <Link
                            to={`/${profile?.username}/profile`}
                            onClick={() => setShowDropdown(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/5 hover:text-white transition-colors"
                          >
                            <span className="text-base">👤</span>
                            My Profile
                          </Link>
                          <Link
                            to={`/${profile?.username}/watchlist`}
                            onClick={() => setShowDropdown(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/5 hover:text-white transition-colors"
                          >
                            <span className="text-base">📋</span>
                            My Watchlist
                          </Link>
                          <Link
                            to={`/${profile?.username}/collections`}
                            onClick={() => setShowDropdown(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/5 hover:text-white transition-colors"
                          >
                            <span className="text-base">📁</span>
                            My Collections
                          </Link>
                        </>
                      ) : (
                        <Link
                          to="/onboarding"
                          onClick={() => setShowDropdown(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-orange-400 hover:bg-orange-500/10 transition-colors"
                        >
                          <span className="text-base">✨</span>
                          Complete Profile
                        </Link>
                      )}

                      <div className="border-t border-white/5 my-1" />

                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/60 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      >
                        <span className="text-base">🚪</span>
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link
              to="/auth"
              className="px-5 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-medium hover:opacity-90 transition-all shadow-lg hover:shadow-orange-500/25"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
