import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { IoSearchOutline } from "react-icons/io5";
import { navigation } from "../constants/navigation";

const Header = () => {
  const location = useLocation();
  const removeSpace = location?.search?.slice(3)?.split("%20")?.join(" ");
  const [searchInput, setSearchInput] = useState(removeSpace || "");
  const [isScrolled, setIsScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (searchInput) {
      navigate(`/search?q=${searchInput}`);
    }
  }, [searchInput]);

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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center font-bold text-black text-lg transition-smooth group-hover:scale-110">
            T
          </div>
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

        {/* Search & Actions */}
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
              onChange={(e) => setSearchInput(e.target.value)}
              value={searchInput}
            />
          </form>

          <button className="md:hidden text-xl text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-smooth">
            <IoSearchOutline />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
