import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { IoHome, IoSearch, IoPerson, IoFilm, IoGrid } from "react-icons/io5";

const MobileNavigation = () => {
  const location = useLocation();
  const { isAuthenticated, profile } = useAuth();

  const navItems = [
    { href: "/", icon: IoHome, label: "Home", match: "home" },
    { href: "/?tab=explore", icon: IoFilm, label: "Explore", match: "explore" },
    { href: "/boards", icon: IoGrid, label: "Boards", match: "boards" },
    { href: "/search", icon: IoSearch, label: "Search", match: "search" },
  ];

  if (isAuthenticated && profile?.username) {
    navItems.push({
      href: `/${profile.username}/profile`,
      icon: IoPerson,
      label: "You",
      match: "profile",
    });
  } else {
    navItems.push({
      href: "/auth",
      icon: IoPerson,
      label: "Sign in",
      match: "auth",
    });
  }

  return (
    <section className="lg:hidden fixed bottom-0 left-0 right-0 z-40 safe-area-bottom">
      <div className="absolute inset-x-0 -top-5 h-5 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none" />

      <nav className="bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/10">
        <div className="flex items-center justify-around px-0.5 py-0.5">
          {navItems.map((nav) => {
            const Icon = nav.icon;
            let isActive = false;
            if (nav.match === "explore") {
              isActive = location.search.includes("tab=explore")
                || location.search.includes("tab=my-feed");
            } else if (nav.match === "home") {
              isActive = location.pathname === "/" && !location.search.includes("tab=");
            } else if (nav.match === "boards") {
              isActive = location.pathname.startsWith("/boards")
                || /\/[^/]+\/boards/.test(location.pathname);
            } else if (nav.match === "profile") {
              isActive = location.pathname.includes("/profile");
            } else if (nav.match === "search") {
              isActive = location.pathname.startsWith("/search");
            } else if (nav.match === "auth") {
              isActive = location.pathname.startsWith("/auth");
            }

            return (
              <NavLink
                key={nav.label}
                to={nav.href}
                className={`flex flex-col items-center justify-center flex-1 max-w-[72px] min-h-[48px] py-1.5 px-1 rounded-xl transition-all duration-200 tap-target ${
                  isActive
                    ? "text-[var(--primary)]"
                    : "text-white/50 active:text-white active:scale-95"
                }`}
              >
                <Icon className={`text-[1.15rem] mb-0.5 transition-transform ${isActive ? "scale-110" : ""}`} />
                <span className={`text-[10px] font-medium leading-tight ${isActive ? "text-[var(--primary)]" : ""}`}>
                  {nav.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </section>
  );
};

export default MobileNavigation;
