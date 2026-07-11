import React from "react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="hidden lg:block border-t border-white/5">
      <div className="container mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center font-bold text-black text-sm">
              T
            </div>
            <span className="text-lg font-semibold">
              <span className="text-gradient">Theater</span>
              <span className="text-white/40 font-light"> or Stream</span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/40">
            <Link to="/about" className="hover:text-white transition-colors">About</Link>
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link to="/attributions" className="hover:text-white transition-colors">TMDB</Link>
          </nav>

          <p className="text-sm text-white/30 text-center md:text-right">
            © {new Date().getFullYear()} Theater or Stream
            <span className="block text-white/20 text-xs mt-1">
              This product uses the TMDB API but is not endorsed or certified by TMDB.
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
