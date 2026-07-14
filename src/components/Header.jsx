import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { IoSearchOutline } from "react-icons/io5";
import { navigation } from "../constants/navigation";
import { useAuth } from "../context/AuthContext";
import ProfileMenu from "./ProfileMenu";
import NotificationBell from "./NotificationBell";
import { getAvatarUrl } from "../lib/storagePublicUrl";

// Avatar lookup - solid colors per design rules
const AVATARS = {
  'avatar_1': { emoji: '🎬', bg: 'bg-purple-600' },
  'avatar_2': { emoji: '🎭', bg: 'bg-blue-600' },
  'avatar_3': { emoji: '🎪', bg: 'bg-emerald-600' },
  'avatar_4': { emoji: '🌟', bg: 'bg-amber-600' },
  'avatar_5': { emoji: '🎯', bg: 'bg-red-600' },
  'avatar_6': { emoji: '🦋', bg: 'bg-indigo-600' },
  'avatar_7': { emoji: '🌈', bg: 'bg-pink-600' },
  'avatar_8': { emoji: '🎸', bg: 'bg-teal-600' },
  'avatar_9': { emoji: '🎮', bg: 'bg-violet-600' },
  'avatar_10': { emoji: '📚', bg: 'bg-orange-600' },
  'avatar_11': { emoji: '🚀', bg: 'bg-sky-600' },
  'avatar_12': { emoji: '🎨', bg: 'bg-rose-600' },
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
    return { emoji: '👤', bg: 'bg-gray-600' };
  };

  return (
    <header
      className={`fixed top-0 w-full z-50 safe-area-top transition-colors duration-200 ${isScrolled
        ? "bg-[var(--color-surface)] border-b border-[var(--color-border)] py-2.5 sm:py-3"
        : "bg-transparent py-3 sm:py-5"
        }`}
    >
      <div className="container mx-auto px-4 sm:px-6 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 min-h-[44px]">
          <img
            src="https://res.cloudinary.com/ddhhlkyut/image/upload/v1768226006/a78a29523128c4555fdd178b6c612ac6_dbtyqp.jpg"
            alt="TheaterOrStream Logo"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg object-cover"
          />
          <span className="text-base sm:text-lg font-semibold tracking-tight hidden sm:block">
            <span className="text-[var(--color-theater)]">Theater</span>
            <span className="text-[var(--color-text-muted)]"> or Stream</span>
          </span>
        </Link>

        {/* Navigation */}
        {navigation.length > 0 && (
          <nav className="hidden lg:flex items-center gap-1">
            {navigation.map((nav, index) => (
              <NavLink
                key={nav.label + index}
                to={nav.href}
                end={nav.href === "/"}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                    ? "bg-[var(--color-surface-subtle)] text-[var(--color-text)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)]"
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
            className="hidden md:flex items-center gap-2.5 h-10 px-4 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:border-[var(--color-text-muted)]/30 transition-colors"
          >
            <IoSearchOutline className="text-lg shrink-0" />
            <span className="text-sm">Search movies, people…</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/search')}
            className="md:hidden text-xl text-[var(--color-text-secondary)] hover:text-[var(--color-text)] p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] transition-colors"
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
                  className={`w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center text-lg transition-colors ${profile?.avatar_url ? 'bg-[var(--color-surface)]' : getUserAvatar().bg}`}
                >
                  {profile?.avatar_url ? (
                    <img src={getAvatarUrl(profile.avatar_url, 40)} alt="avatar" className="w-full h-full object-cover" />
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
              className="px-4 py-2 rounded-lg bg-[var(--color-theater)] text-[var(--color-background)] text-sm font-medium hover:bg-[var(--color-theater)]/90 transition-colors"
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
