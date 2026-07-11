import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FaCalendarAlt } from 'react-icons/fa';
import { generateSlugWithId } from '../../lib/slugUtils';

const FALLBACK_REGION_ORDER = ['IN', 'US', 'GB', 'CA', 'AU'];

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

function pickComingSoonMovies(cmsSections, regionCode, limit = 6) {
  const comingSoonSection = cmsSections.find((s) => s.slug === 'coming-soon');
  if (!comingSoonSection) return { movies: [], usedRegion: regionCode, isFallback: false };

  const byRegion = comingSoonSection.movies_by_region || {};
  const todayStr = new Date().toISOString().split('T')[0];

  const normalize = (list) => {
    const all = (list || [])
      .filter((m) => m.release_date)
      .sort((a, b) => new Date(a.release_date) - new Date(b.release_date));
    const future = all.filter((m) => m.release_date >= todayStr);
    return (future.length ? future : all).slice(0, limit);
  };

  const selected = normalize(byRegion[regionCode]);
  if (selected.length > 0) {
    return { movies: selected, usedRegion: regionCode, isFallback: false };
  }

  for (const code of FALLBACK_REGION_ORDER) {
    if (code === regionCode) continue;
    const list = normalize(byRegion[code]);
    if (list.length > 0) {
      return { movies: list, usedRegion: code, isFallback: true };
    }
  }

  for (const [code, list] of Object.entries(byRegion)) {
    const movies = normalize(list);
    if (movies.length > 0) {
      return { movies, usedRegion: code, isFallback: true };
    }
  }

  return { movies: [], usedRegion: regionCode, isFallback: false };
}

function MovieRow({ movie }) {
  const year = movie.release_date?.split('-')[0] || '';
  const slug = generateSlugWithId(movie.title, movie.tmdb_id, year);
  const movieUrl = movie.media_type === 'tv' ? `/tv/${slug}` : `/movies/${slug}`;

  return (
    <Link
      to={movieUrl}
      className="flex items-start gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all group"
    >
      <div className="flex-shrink-0 w-12 h-16 rounded-lg overflow-hidden">
        {movie.poster_path ? (
          <img
            src={`https://image.tmdb.org/t/p/w154${movie.poster_path}`}
            alt={movie.title}
            className="w-full h-full object-cover"
            loading="lazy"
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
}

/**
 * Explore Coming Soon — desktop rail + mobile/tablet horizontal strip.
 * placement: "rail" | "strip"
 */
export default function HomeComingSoonSidebar({
  cmsSections,
  selectedRegion,
  placement = 'rail',
}) {
  const { movies: comingSoonMovies, usedRegion, isFallback } = useMemo(
    () => pickComingSoonMovies(cmsSections, selectedRegion.code, 6),
    [cmsSections, selectedRegion.code],
  );

  if (placement === 'strip') {
    if (!comingSoonMovies.length) return null;

    return (
      <div className="lg:hidden">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-green-500/10 shrink-0">
              <FaCalendarAlt className="text-green-400 text-sm" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white">Coming Soon</h2>
              {isFallback && (
                <p className="text-[10px] text-amber-400/80">
                  Showing {usedRegion} (none for {selectedRegion.code})
                </p>
              )}
            </div>
          </div>
          <Link
            to="/upcoming"
            className="text-xs text-yellow-400 hover:text-yellow-300 shrink-0"
          >
            View all →
          </Link>
        </div>

        <div className="-mx-1 overflow-x-auto scrollbar-hide">
          <div className="flex gap-3 px-1 pb-1 min-w-0">
            {comingSoonMovies.map((movie) => {
              const year = movie.release_date?.split('-')[0] || '';
              const slug = generateSlugWithId(movie.title, movie.tmdb_id, year);
              const movieUrl = movie.media_type === 'tv' ? `/tv/${slug}` : `/movies/${slug}`;
              return (
                <Link
                  key={movie.tmdb_id}
                  to={movieUrl}
                  className="shrink-0 w-[7.25rem] group"
                >
                  <div className="aspect-[2/3] rounded-xl overflow-hidden bg-white/5 border border-white/[0.06] mb-2">
                    {movie.poster_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w185${movie.poster_path}`}
                        alt={movie.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>
                    )}
                  </div>
                  <p className="text-xs font-medium text-white line-clamp-2 group-active:text-yellow-400">
                    {movie.title}
                  </p>
                  <p className="text-[10px] text-green-400 mt-0.5">
                    {formatReleaseDate(movie.release_date)}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hidden lg:block w-[14.5rem] xl:w-[16rem] shrink-0">
      <div className="sticky top-24">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-green-500/10">
            <FaCalendarAlt className="text-green-400" />
          </div>
          <div className="min-w-0">
            <Link to="/upcoming" className="text-lg font-semibold text-white hover:text-yellow-400 transition-colors">
              Coming Soon
            </Link>
            {isFallback && (
              <p className="text-[10px] text-amber-400/80 mt-0.5">
                Showing {usedRegion} (none for {selectedRegion.code})
              </p>
            )}
          </div>
        </div>

        {comingSoonMovies.length > 0 ? (
          <div className="space-y-2.5">
            {comingSoonMovies.map((movie) => (
              <MovieRow key={movie.tmdb_id} movie={movie} />
            ))}
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

        <div className="mt-6 xl:mt-8 p-3.5 xl:p-4 rounded-xl bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20">
          <h3 className="text-sm font-semibold text-white mb-2.5">Quick Links</h3>
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
