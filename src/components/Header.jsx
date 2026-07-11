import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { IoSearchOutline } from "react-icons/io5";
import { navigation } from "../constants/navigation";
import { useAuth } from "../context/AuthContext";
import ProfileMenu from "./ProfileMenu";
import NotificationBell from "./NotificationBell";

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
  const [isScrolled, setIsScrolled] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const navigate = useNavigate();

  const { user, profile, isAuthenticated, isOnboarded, signOut } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSignOut = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDropdown(false);

    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }

    navigate('/auth', { replace: true });
  };

  const getUserAvatar = () => {
    if (profile?.avatar_id && AVATARS[profile.avatar_id]) {
      return AVATARS[profile.avatar_id];
    }
    return { emoji: '👤', bg: 'from-gray-500 to-gray-600' };
  };

  return (
    <header
      className={`fixed top-0 w-full z-50 safe-area-top transition-all duration-500 ${isScrolled
        ? "glass py-2.5 sm:py-3"
        : "bg-transparent py-3 sm:py-5"
        }`}
    >
      <div className="container mx-auto px-4 sm:px-6 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group min-h-[44px]">
          <img
            src="https://res.cloudinary.com/ddhhlkyut/image/upload/v1768226006/a78a29523128c4555fdd178b6c612ac6_dbtyqp.jpg"
            alt="TheaterOrStream Logo"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-cover transition-smooth group-hover:scale-110"
          />
          <span className="text-lg sm:text-xl font-semibold tracking-tight hidden sm:block">
            <span className="text-gradient">Theater</span>
            <span className="text-white/60 font-light"> or Stream</span>
          </span>
        </Link>

        {/* Navigation — catalog is on My Feed; Coming Soon lives in that tab's sidebar */}
        {navigation.length > 0 && (
          <nav className="hidden lg:flex items-center gap-1">
            {navigation.map((nav, index) => (
              <NavLink
                key={nav.label + index}
                to={nav.href}
                end={nav.href === "/"}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-full text-sm font-medium transition-smooth ${isActive
                    ? "bg-[var(--primary)]/15 text-[var(--primary)]"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                  }`
                }
              >
                {nav.label}
              </NavLink>
            ))}
          </nav>
        )}
        {!navigation.length && <div className="hidden lg:block flex-1" />}

        {/* Search & Auth */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/search')}
            aria-label="Search movies and people"
            className="header-search-trigger group hidden md:flex items-center h-10 w-10 rounded-full bg-white/5 border border-white/10 text-white/50 hover:text-white/80 hover:border-white/20 hover:bg-white/[0.07] overflow-hidden transition-[width,padding,background-color,border-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] justify-center hover:justify-start hover:w-[13.5rem] hover:pl-3.5 hover:pr-4 focus-visible:justify-start focus-visible:w-[13.5rem] focus-visible:pl-3.5 focus-visible:pr-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/40"
          >
            <IoSearchOutline className="text-xl shrink-0 transition-transform duration-300 group-hover:scale-105" />
            <span className="header-search-label text-sm text-white/40 whitespace-nowrap pointer-events-none">
              Search movies, people…
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/search')}
            className="md:hidden text-xl text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-smooth"
            aria-label="Search"
          >
            <IoSearchOutline />
          </button>

          {/* Auth Section */}
          {isAuthenticated ? (
            <>
              <NotificationBell />
              <div className="relative">
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className={`w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-lg hover:scale-105 transition-all duration-200 shadow-lg ${profile?.avatar_url ? 'bg-[#14181c]' : `bg-gradient-to-br ${getUserAvatar().bg}`}`}
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    getUserAvatar().emoji
                  )}
                </button>

                {showDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowDropdown(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 z-50">
                      <ProfileMenu
                        profile={profile}
                        userId={user?.id}
                        isOnboarded={isOnboarded}
                        onClose={() => setShowDropdown(false)}
                        onSignOut={handleSignOut}
                      />
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <Link
              to="/auth"
              className="px-5 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-medium hover:opacity-90 transition-all shadow-lg hover:shadow-orange-500/25"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
