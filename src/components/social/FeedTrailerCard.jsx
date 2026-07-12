import React from 'react';
import { Link } from 'react-router-dom';
import { FaPlay } from 'react-icons/fa';
import { generateSlugWithId } from '../../lib/slugUtils';
import VerifiedBadge from '../VerifiedBadge';
import RedditActionBar from './RedditActionBar';
import RedditMediaFrame from './RedditMediaFrame';

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
export default function FeedTrailerCard({ item, onOpenThread, onShare, onLike, variant = 'feed' }) {
  const year = item.releaseDate?.split('-')[0] || '';
  const slug = generateSlugWithId(item.title, item.tmdb_id, year);
  const movieUrl = item.mediaType === 'tv' ? `/tv/${slug}` : `/movies/${slug}`;
  const ago = formatAgo(item.publishedAt);
  const isTeaser = item.trailerName?.toLowerCase().includes('teaser');
  const official = item.user;
  const displayTitle = `${item.title}${year ? ` (${year})` : ''} · Official ${isTeaser ? 'Teaser' : 'Trailer'}`;
  const isThread = variant === 'thread';
  const mediaSrc = item.thumbnail || item.thumbnailFallback;

  const openThread = (e) => {
    if (!onOpenThread) return;
    const tag = e.target?.closest?.('a, button, [data-no-thread]');
    if (tag) return;
    onOpenThread(item);
  };

  return (
    <article
      className={`bg-[#1a1d1f] ${isThread ? 'rounded-none sm:rounded-t-xl border-0' : 'rounded-lg border border-white/5'} overflow-hidden hover:border-white/10 transition-colors ${onOpenThread ? 'cursor-pointer' : ''}`}
      onClick={onOpenThread ? openThread : undefined}
      role={onOpenThread ? 'link' : undefined}
    >
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

      {/* Title — opens thread when available; otherwise movie page */}
      <div className="px-3 pb-2">
        {onOpenThread ? (
          <h3 className={`${isThread ? 'text-[22px] sm:text-[28px] font-bold tracking-tight' : 'text-[15px] sm:text-base font-semibold'} text-white leading-snug hover:text-[var(--accent-green)] transition-colors`}>
            {displayTitle}
          </h3>
        ) : (
          <Link
            to={movieUrl}
            className={`block ${isThread ? 'text-[22px] sm:text-[28px] font-bold tracking-tight' : 'text-[15px] sm:text-base font-semibold'} text-white leading-snug hover:text-[var(--accent-green)] transition-colors`}
          >
            {displayTitle}
          </Link>
        )}
      </div>

      <div className="px-3 pb-3" data-no-thread onClick={(e) => e.stopPropagation()}>
        {isThread && mediaSrc ? (
          <Link to={movieUrl} className="relative block group">
            <RedditMediaFrame src={mediaSrc} alt={item.title} />
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-black/55 border border-white/30 flex items-center justify-center group-hover:bg-[var(--accent-green)]/80 group-hover:border-transparent transition-colors">
                <FaPlay className="text-white text-xl ml-0.5" />
              </div>
            </div>
          </Link>
        ) : (
          <Link to={movieUrl} className="relative block group">
            <div className="relative aspect-video overflow-hidden bg-black rounded-xl">
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
        )}
      </div>

      <div className="px-3 py-2.5" data-no-thread onClick={(e) => e.stopPropagation()}>
        <RedditActionBar
          score={item.likes || 0}
          comments={item.comments || 0}
          isUpvoted={!!item.isLiked}
          onUpvote={() => onLike?.(item)}
          onComment={() => onOpenThread?.(item)}
          onShare={() => onShare?.(item)}
          showShare={!!onShare}
          item={item}
        />
      </div>
    </article>
  );
}
