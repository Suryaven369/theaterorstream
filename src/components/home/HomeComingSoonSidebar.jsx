import React from 'react';
import { Link } from 'react-router-dom';
import { FaCalendarAlt } from 'react-icons/fa';
import { generateSlugWithId } from '../../lib/slugUtils';

function formatReleaseDate(dateStr) {
  if (!dateStr) return 'TBA';
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Released';
  if (diffDays === 0) return 'Today!';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `In ${diffDays} days`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * My Feed right rail — coming soon list for the selected region.
 */
export default function HomeComingSoonSidebar({ cmsSections, selectedRegion }) {
  const comingSoonSection = cmsSections.find((s) => s.slug === 'coming-soon');
  const todayStr = new Date().toISOString().split('T')[0];
  const allComingSoon = (comingSoonSection?.movies_by_region?.[selectedRegion.code] || [])
    .filter((m) => m.release_date)
    .sort((a, b) => new Date(a.release_date) - new Date(b.release_date));
  const future = allComingSoon.filter((m) => m.release_date >= todayStr);
  const comingSoonMovies = (future.length ? future : allComingSoon).slice(0, 5);

  return (
    <div className="xl:col-span-1 hidden xl:block">
      <div className="sticky top-24">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-green-500/10">
            <FaCalendarAlt className="text-green-400" />
          </div>
          <Link to="/upcoming" className="text-lg font-semibold text-white hover:text-yellow-400 transition-colors">
            Coming Soon
          </Link>
        </div>

        {comingSoonMovies.length > 0 ? (
          <div className="space-y-3">
            {comingSoonMovies.map((movie) => {
              const year = movie.release_date?.split('-')[0] || '';
              const slug = generateSlugWithId(movie.title, movie.tmdb_id, year);
              const movieUrl = movie.media_type === 'tv' ? `/tv/${slug}` : `/movies/${slug}`;

              return (
                <Link
                  key={movie.tmdb_id}
                  to={movieUrl}
                  className="flex items-start gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all group"
                >
                  <div className="flex-shrink-0 w-12 h-16 rounded-lg overflow-hidden">
                    {movie.poster_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w154${movie.poster_path}`}
                        alt={movie.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-white/10 flex items-center justify-center text-xl">
                        🎬
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-white group-hover:text-yellow-400 transition-colors line-clamp-2">
                      {movie.title}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <FaCalendarAlt className="text-green-400 text-[10px]" />
                      <span className="text-xs text-green-400 font-medium">
                        {formatReleaseDate(movie.release_date)}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
            <Link
              to="/upcoming"
              className="block text-center py-2 text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
            >
              View All Coming Soon →
            </Link>
          </div>
        ) : (
          <div className="text-center py-8 text-white/30 text-sm">
            <p>No coming soon movies for {selectedRegion.name}.</p>
          </div>
        )}

        <div className="mt-8 p-4 rounded-xl bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20">
          <h3 className="text-sm font-semibold text-white mb-3">Quick Links</h3>
          <div className="space-y-2">
            <Link
              to="/upcoming"
              className="flex items-center gap-2 text-sm text-white/60 hover:text-yellow-400 transition-colors"
            >
              🎬 Coming Soon
            </Link>
            <Link
              to="/tags"
              className="flex items-center gap-2 text-sm text-white/60 hover:text-yellow-400 transition-colors"
            >
              # Explore Hashtags
            </Link>
            <Link
              to="/search"
              className="flex items-center gap-2 text-sm text-white/60 hover:text-yellow-400 transition-colors"
            >
              🔍 Search Movies
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
