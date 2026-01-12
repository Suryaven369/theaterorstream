import React from "react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="border-t border-white/5">
      <div className="container mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center font-bold text-black text-sm">
              T
            </div>
            <span className="text-lg font-semibold">
              <span className="text-gradient">Theater</span>
              <span className="text-white/40 font-light"> or Stream</span>
            </span>
          </Link>

          {/* Links */}
          <nav className="flex items-center gap-6 text-sm text-white/40">
            <a href="#" className="hover:text-white transition-colors">About</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
          </nav>

          {/* Copyright */}
          <p className="text-sm text-white/30">
            © {new Date().getFullYear()} Theater or Stream
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
