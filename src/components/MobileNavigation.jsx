import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { IoHome, IoSearch, IoTv, IoCalendar, IoList } from "react-icons/io5";

const MobileNavigation = () => {
  const location = useLocation();
  const { isAuthenticated, profile } = useAuth();

  // Define mobile nav items - matching desktop navigation
  const navItems = [
    { href: "/", icon: IoHome, label: "Home" },
    { href: "/tv-series", icon: IoTv, label: "TV Shows" },
    { href: "/upcoming", icon: IoCalendar, label: "Soon" },
    { href: "/search", icon: IoSearch, label: "Search" },
  ];

  // Add profile/collections link if authenticated
  if (isAuthenticated && profile?.username) {
    navItems.push({
      href: `/${profile.username}/collections`,
      icon: IoList,
      label: "Lists"
    });
  }

  return (
    <section className="lg:hidden fixed bottom-0 left-0 right-0 z-40 safe-area-bottom">
      {/* Gradient fade effect at the top */}
      <div className="absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none" />

      <nav className="bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/10">
        <div className="flex items-center justify-around px-1 py-1">
          {navItems.map((nav) => {
            const Icon = nav.icon;
            const isActive = location.pathname === nav.href ||
              (nav.href !== "/" && location.pathname.startsWith(nav.href));

            return (
              <NavLink
                key={nav.label}
                to={nav.href}
                className={`flex flex-col items-center justify-center min-w-[56px] py-2 px-2 rounded-xl transition-all duration-200 ${isActive
                    ? "text-orange-400"
                    : "text-white/50 active:text-white active:scale-95"
                  }`}
              >
                <Icon className={`text-lg mb-0.5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                <span className={`text-[9px] font-medium ${isActive ? 'text-orange-400' : ''}`}>
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
