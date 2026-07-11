import React from 'react';
import { Link } from 'react-router-dom';
import { FaPlay } from 'react-icons/fa';
import { generateSlugWithId } from '../../lib/slugUtils';
import VerifiedBadge from '../VerifiedBadge';

function formatAgo(publishedAt) {
  if (!publishedAt) return 'Just released';
  const days = Math.floor((Date.now() - new Date(publishedAt).getTime()) / 86400000);
  if (days <= 0) return 'Released today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  return `${Math.floor(days / 7)} weeks ago`;
}

/**
 * Trailer feed card — small author row, large title, then media (Reddit-style hierarchy).
 */
export default function FeedTrailerCard({ item }) {
  const year = item.releaseDate?.split('-')[0] || '';
  const slug = generateSlugWithId(item.title, item.tmdb_id, year);
  const movieUrl = item.mediaType === 'tv' ? `/tv/${slug}` : `/movies/${slug}`;
  const ago = formatAgo(item.publishedAt);
  const isTeaser = item.trailerName?.toLowerCase().includes('teaser');
  const official = item.user;
  const displayTitle = `${item.title}${year ? ` (${year})` : ''} · Official ${isTeaser ? 'Teaser' : 'Trailer'}`;

  return (
    <article className="bg-[#1a1d1f] rounded-lg border border-white/5 overflow-hidden hover:border-white/10 transition-colors">
      {/* Author row — small */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
        {official ? (
          <>
            <Link to={`/${official.username}/profile`} className="shrink-0">
              {official.avatarUrl ? (
                <img
                  src={official.avatarUrl}
                  alt=""
                  className="w-7 h-7 rounded-full object-cover bg-black border border-white/10"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-xs">
                  🎬
                </div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <Link
                  to={`/${official.username}/profile`}
                  className="text-[12px] font-medium text-white/80 hover:text-white truncate inline-flex items-center gap-1"
                >
                  {official.username || official.name}
                  {official.isVerified && <VerifiedBadge size={12} />}
                </Link>
                <span className="text-white/25 text-[10px]">·</span>
                <span className="text-[11px] text-white/40 truncate">{ago}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            {item.sourceLogo ? (
              <img
                src={item.sourceLogo}
                alt={item.sourceName || 'channel'}
                className="w-7 h-7 rounded-full object-cover shrink-0 bg-black border border-white/10"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div
              className={`w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-xs shrink-0 ${item.sourceLogo ? 'hidden' : ''}`}
            >
              🎬
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-white/45 truncate">
                {ago}
                {item.sourceName ? ` · via ${item.sourceName}` : ''}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Title — movie + Official Trailer only */}
      <div className="px-3 pb-2">
        <Link
          to={movieUrl}
          className="block text-[15px] sm:text-base font-semibold text-white leading-snug hover:text-[var(--accent-green)] transition-colors"
        >
          {displayTitle}
        </Link>
      </div>

      <Link to={movieUrl} className="relative block group">
        <div className="relative aspect-video overflow-hidden bg-black">
          <img
            src={item.thumbnail}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              if (item.thumbnailFallback && e.currentTarget.src !== item.thumbnailFallback) {
                e.currentTarget.src = item.thumbnailFallback;
              }
            }}
          />
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-black/50 border border-white/30 flex items-center justify-center group-hover:bg-[var(--accent-green)]/80 group-hover:border-transparent transition-colors">
              <FaPlay className="text-white text-lg ml-0.5" />
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
