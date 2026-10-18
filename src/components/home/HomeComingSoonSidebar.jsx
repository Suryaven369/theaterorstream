import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { generateSlugWithId } from '../../lib/slugUtils';
import { getUpcomingFromEdge } from '../../lib/contentEdgeApi';

const FALLBACK_REGION_ORDER = ['IN', 'US', 'GB', 'CA', 'AU'];
const COMING_SOON_COUNT = 6;
// Upcoming library titles to rank by popularity: wide enough to reach the big
// releases, capped to a horizon so far-off titles don't crowd out near ones.
const LIBRARY_POOL_SIZE = 400;
const HORIZON_DAYS = 120;

function formatReleaseDate(dateStr) {
  if (!dateStr) return 'TBA';
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Released';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `In ${diffDays} days`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function pickComingSoonMovies(cmsSections, regionCode, limit = 8) {
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

/**
 * Showcase only the most popular upcoming titles: curated CMS picks and library
 * titles are ranked together by popularity, then shown by release date.
 */
function pickPopular(curated, libraryPool, limit) {
  const poolPopularity = new Map(
    libraryPool.map((m) => [String(m.tmdb_id), Number(m.popularity) || 0]),
  );
  const byId = new Map();
  [...curated, ...libraryPool].forEach((m) => {
    const id = String(m.tmdb_id);
    if (!m.poster_path || byId.has(id)) return;
    byId.set(id, { ...m, popularity: poolPopularity.get(id) ?? (Number(m.popularity) || 0) });
  });
  return [...byId.values()]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit)
    .sort((a, b) => new Date(a.release_date) - new Date(b.release_date));
}

function posterSrc(path) {
  return path.startsWith('http') ? path : `https://image.tmdb.org/t/p/w92${path}`;
}

function MovieRow({ movie }) {
  const year = movie.release_date?.split('-')[0] || '';
  const slug = generateSlugWithId(movie.title, movie.tmdb_id, year);
  const movieUrl = movie.media_type === 'tv' ? `/tv/${slug}` : `/movies/${slug}`;

  return (
    <Link
      to={movieUrl}
      className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface-subtle)]/60 transition-colors group"
    >
      <div className="flex-shrink-0 w-11 h-[4.125rem] rounded-md overflow-hidden bg-[var(--color-surface-subtle)]">
        {movie.poster_path ? (
          <img
            src={posterSrc(movie.poster_path)}
            alt={movie.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-base opacity-40">🎬</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[var(--color-text)] group-hover:text-[var(--color-theater)] transition-colors line-clamp-2 leading-snug">
          {movie.title}
        </p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
          {formatReleaseDate(movie.release_date)}
        </p>
      </div>
    </Link>
  );
}

function ComingSoonWidget({ movies, usedRegion, isFallback, selectedRegion, className = '' }) {
  if (!movies.length) {
    return (
      <div className={`rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden ${className}`}>
        <h2 className="px-4 pt-3.5 pb-2 text-[15px] font-bold text-[var(--color-text)]">Coming Soon</h2>
        <p className="px-4 pb-4 text-xs text-[var(--color-text-muted)]">
          No upcoming titles for {selectedRegion.name}.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden ${className}`}>
      <div className="px-4 pt-3.5 pb-1">
        <h2 className="text-[15px] font-bold text-[var(--color-text)]">Coming Soon</h2>
        {isFallback && (
          <p className="text-[10px] text-amber-400/80 mt-0.5">
            Showing {usedRegion} (none for {selectedRegion.code})
          </p>
        )}
      </div>

      <div className="divide-y divide-[var(--color-border)]">
        {movies.map((movie) => (
          <MovieRow key={movie.tmdb_id} movie={movie} />
        ))}
      </div>

      <Link
        to="/upcoming"
        className="block px-4 py-3 text-[13px] text-[var(--color-theater)] hover:bg-[var(--color-surface-subtle)]/60 transition-colors"
      >
        View all
      </Link>
    </div>
  );
}

/**
 * Explore Coming Soon — desktop rail + mobile/tablet unified list widget.
 * placement: "rail" | "strip"
 */
export default function HomeComingSoonSidebar({
  cmsSections,
  selectedRegion,
  placement = 'rail',
}) {
  const [libraryPool, setLibraryPool] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const today = new Date().toISOString().split('T')[0];
    getUpcomingFromEdge({ minReleaseDate: today, limit: LIBRARY_POOL_SIZE })
      .then(({ data }) => {
        if (cancelled) return;
        const horizon = new Date(Date.now() + HORIZON_DAYS * 86400000).toISOString().split('T')[0];
        setLibraryPool((data || []).filter((m) => m.release_date && m.release_date <= horizon));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const { movies: comingSoonMovies, usedRegion, isFallback } = useMemo(() => {
    const picked = pickComingSoonMovies(
      cmsSections,
      selectedRegion.code,
      libraryPool.length ? Infinity : COMING_SOON_COUNT,
    );
    if (!libraryPool.length) return picked;
    // With library top-ups available, prefer the selected region's own curated
    // picks over another region's list.
    const curated = picked.isFallback ? [] : picked.movies;
    return {
      movies: pickPopular(curated, libraryPool, COMING_SOON_COUNT),
      usedRegion: selectedRegion.code,
      isFallback: false,
    };
  }, [cmsSections, selectedRegion.code, libraryPool]);

  if (placement === 'strip') {
    if (!comingSoonMovies.length) return null;
    return (
      <div className="lg:hidden">
        <ComingSoonWidget
          movies={comingSoonMovies}
          usedRegion={usedRegion}
          isFallback={isFallback}
          selectedRegion={selectedRegion}
        />
      </div>
    );
  }

  return (
    <div className="hidden lg:block w-[16.5rem] xl:w-[18rem] shrink-0">
      <div className="sticky top-24 space-y-4">
        <ComingSoonWidget
          movies={comingSoonMovies}
          usedRegion={usedRegion}
          isFallback={isFallback}
          selectedRegion={selectedRegion}
        />

        <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
          <h3 className="px-4 pt-3.5 pb-2 text-[15px] font-bold text-[var(--color-text)]">Quick Links</h3>
          <div className="divide-y divide-[var(--color-border)]">
            <Link
              to="/upcoming"
              className="block px-4 py-3 text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]/60 hover:text-[var(--color-theater)] transition-colors"
            >
              Coming Soon
            </Link>
            <Link
              to="/tags"
              className="block px-4 py-3 text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]/60 hover:text-[var(--color-theater)] transition-colors"
            >
              Explore Hashtags
            </Link>
            <Link
              to="/search"
              className="block px-4 py-3 text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]/60 hover:text-[var(--color-theater)] transition-colors"
            >
              Search Movies
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
