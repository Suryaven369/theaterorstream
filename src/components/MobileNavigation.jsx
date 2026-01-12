import React from "react";
import { mobileNavigation } from "../constants/navigation";
import { NavLink } from "react-router-dom";

const MobileNavigation = () => {
  return (
    <section className="lg:hidden fixed bottom-0 w-full z-40 p-4">
      <nav className="glass rounded-2xl p-2 mx-auto max-w-xs">
        <div className="flex items-center justify-around">
          {mobileNavigation.map((nav) => (
            <NavLink
              key={nav.label + "mobilenavigation"}
              to={nav.href}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center p-3 rounded-xl transition-smooth ${isActive
                  ? "bg-yellow-500/10 text-yellow-400"
                  : "text-white/50 hover:text-white"
                }`
              }
            >
              <div className="text-xl mb-1">{nav.icon}</div>
              <p className="text-[10px] font-medium">{nav.label}</p>
            </NavLink>
          ))}
        </div>
      </nav>
    </section>
  );
};

export default MobileNavigation;
