import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaMapMarkerAlt, FaTicketAlt } from 'react-icons/fa';
import { getMoviesInTheaters, getUserLocation } from '../../lib/theatersApi';

/**
 * "Now in Theaters" section showing movies currently playing.
 * Uses MovieGlu API with optional geolocation.
 */
export default function NowInTheaters({ limit = 6, className = '' }) {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [location, setLocation] = useState(null);

  useEffect(() => {
    let alive = true;
    
    async function load() {
      setLoading(true);
      setError(null);
      
      // Try to get user location
      const loc = await getUserLocation();
      if (alive && loc) setLocation(loc);
      
      // Fetch movies
      const result = await getMoviesInTheaters({
        lat: loc?.lat,
        lng: loc?.lng,
        n: limit,
      });
      
      if (!alive) return;
      
      if (result.ok) {
        setMovies(result.movies || []);
      } else {
        setError(result.error);
      }
      setLoading(false);
    }
    
    load();
    return () => { alive = false; };
  }, [limit]);

  if (loading) {
    return (
      <div className={`p-4 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <FaTicketAlt className="text-[var(--color-theater)]" />
          <h3 className="text-sm font-medium text-[var(--color-text)]">Now in Theaters</h3>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-12 h-[72px] rounded bg-[var(--color-surface-subtle)]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-[var(--color-surface-subtle)] rounded w-3/4" />
                <div className="h-2 bg-[var(--color-surface-subtle)] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || movies.length === 0) {
    return null; // Hide section if no data
  }

  return (
    <div className={`p-4 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FaTicketAlt className="text-[var(--color-theater)]" />
          <h3 className="text-sm font-medium text-[var(--color-text)]">Now in Theaters</h3>
        </div>
        {location && (
          <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
            <FaMapMarkerAlt className="text-[8px]" />
            Near you
          </span>
        )}
      </div>
      
      <div className="space-y-3">
        {movies.slice(0, limit).map((movie) => (
          <Link
            key={movie.id}
            to={movie.tmdbId ? `/movie/${movie.tmdbId}` : '#'}
            className="flex gap-3 group"
          >
            {movie.poster ? (
              <img
                src={movie.poster}
                alt={movie.title}
                className="w-12 h-[72px] rounded object-cover bg-[var(--color-surface-subtle)] shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="w-12 h-[72px] rounded bg-[var(--color-surface-subtle)] flex items-center justify-center text-lg shrink-0">
                🎬
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[var(--color-text-secondary)] group-hover:text-[var(--color-text)] transition-colors line-clamp-2">
                {movie.title}
              </p>
              {movie.genres?.length > 0 && (
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">
                  {movie.genres.slice(0, 2).join(' • ')}
                </p>
              )}
              {movie.duration && (
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  {movie.duration} min
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
      
      <Link
        to="/theaters"
        className="block mt-3 pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-theater)] hover:underline text-center"
      >
        View all showtimes →
      </Link>
    </div>
  );
}
