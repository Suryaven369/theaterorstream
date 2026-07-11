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
 * Trailer feed card — thumbnail + title; playback stays on YouTube / details page.
 * When `item.user` is set (official account), the header shows that profile + verified badge.
 */
export default function FeedTrailerCard({ item }) {
  const year = item.releaseDate?.split('-')[0] || '';
  const slug = generateSlugWithId(item.title, item.tmdb_id, year);
  const movieUrl = item.mediaType === 'tv' ? `/tv/${slug}` : `/movies/${slug}`;
  const ago = formatAgo(item.publishedAt);
  const kind = item.trailerName?.toLowerCase().includes('teaser') ? 'Teaser' : 'Trailer';
  const official = item.user;

  return (
    <article className="bg-[#1a1d1f] rounded-lg border border-white/5 overflow-hidden hover:border-white/10 transition-colors">
      <div className="flex items-center gap-2 p-3 pb-2">
        {official ? (
          <>
            {official.avatarUrl ? (
              <img
                src={official.avatarUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover shrink-0 bg-black border border-white/10"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-sm shrink-0">
                🎬
              </div>
            )}
            <div className="min-w-0">
              <Link
                to={`/${official.username}/profile`}
                className="inline-flex items-center gap-1 text-sm font-semibold text-white hover:text-[var(--accent-green)]"
              >
                {official.name}
                {official.isVerified && <VerifiedBadge size={14} />}
              </Link>
              <p className="text-[11px] text-white/40">
                New {kind} · {ago}
                {item.sourceName ? ` · via ${item.sourceName}` : ''}
              </p>
            </div>
          </>
        ) : (
          <>
            {item.sourceLogo ? (
              <img
                src={item.sourceLogo}
                alt={item.sourceName || 'channel'}
                title={item.sourceName || ''}
                className="w-8 h-8 rounded-full object-cover shrink-0 bg-black border border-white/10"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div
              className={`w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-sm shrink-0 ${item.sourceLogo ? 'hidden' : ''}`}
            >
              🎬
            </div>
            <div className="min-w-0">
              <Link
                to={movieUrl}
                className="block text-sm font-semibold text-white truncate hover:text-[var(--accent-green)]"
              >
                {item.title}
                {year ? ` (${year})` : ''}
              </Link>
              <p className="text-[11px] text-white/40">
                New {kind} · {ago}
                {item.sourceName ? ` · via ${item.sourceName}` : ''}
              </p>
            </div>
          </>
        )}
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-black/50 border border-white/30 flex items-center justify-center group-hover:bg-[var(--accent-green)]/80 group-hover:border-transparent transition-colors">
              <FaPlay className="text-white text-lg ml-0.5" />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <p className="text-sm font-semibold text-white line-clamp-1">
              {item.title}
              {year ? ` (${year})` : ''}
            </p>
            {item.trailerName && (
              <p className="text-[11px] text-white/60 line-clamp-1">{item.trailerName}</p>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}
