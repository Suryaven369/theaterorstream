import React from 'react';
import { Link } from 'react-router-dom';

const TRENDING = [
  { q: 'oppenheimer', label: '#Oppenheimer', count: '2.4k posts' },
  { q: 'dune', label: '#DunePartTwo', count: '1.8k posts' },
  { q: 'oscar', label: '#Oscars2024', count: '956 posts' },
  { q: 'marvel', label: '#MarvelPhase5', count: '743 posts' },
];

const SUGGESTED = [
  { name: 'FilmCritic', username: 'filmcritic', avatar: '🎬' },
  { name: 'MovieNerd', username: 'movienerd', avatar: '🤓' },
  { name: 'CinemaScope', username: 'cinemascope', avatar: '🎥' },
];

/**
 * Right rail on the Home social feed tab.
 */
export default function HomeSocialSidebar() {
  return (
    <aside className="lg:col-span-4 space-y-4 hidden lg:block">
      <div className="p-3 rounded-lg bg-[#1a1d1f] border border-white/5">
        <h3 className="text-xs font-semibold text-white mb-3">Trending Now</h3>
        <div className="space-y-2">
          {TRENDING.map((t) => (
            <Link key={t.q} to={`/search?q=${t.q}`} className="block group">
              <p className="text-xs text-white group-hover:text-[var(--accent-green)] transition-colors">
                {t.label}
              </p>
              <p className="text-[10px] text-white/40">{t.count}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="p-3 rounded-lg bg-[#1a1d1f] border border-white/5">
        <h3 className="text-xs font-semibold text-white mb-3">Who to Follow</h3>
        <div className="space-y-2">
          {SUGGESTED.map((u) => (
            <div key={u.username} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs">
                  {u.avatar}
                </div>
                <div>
                  <p className="text-xs font-medium text-white">{u.name}</p>
                  <p className="text-[10px] text-white/40">@{u.username}</p>
                </div>
              </div>
              <button
                type="button"
                className="px-2.5 py-1 rounded-full bg-white/10 text-[10px] font-medium text-white hover:bg-white/20 transition-colors"
              >
                Follow
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 rounded-lg bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20">
        <h3 className="text-xs font-semibold text-white mb-2">Quick Links</h3>
        <div className="space-y-1.5">
          <Link
            to="/feed"
            className="flex items-center gap-2 text-xs text-white/60 hover:text-purple-400 transition-colors"
          >
            📰 Cinema Feed
          </Link>
          <Link
            to="/diary"
            className="flex items-center gap-2 text-xs text-white/60 hover:text-purple-400 transition-colors"
          >
            📖 Your Diary
          </Link>
          <Link
            to="/search"
            className="flex items-center gap-2 text-xs text-white/60 hover:text-purple-400 transition-colors"
          >
            🔍 Search Movies
          </Link>
        </div>
      </div>
    </aside>
  );
}
