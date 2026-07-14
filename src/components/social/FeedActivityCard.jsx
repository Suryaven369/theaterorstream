import React from 'react';
import { Link } from 'react-router-dom';
import VerifiedBadge from '../VerifiedBadge';
import RedditActionBar from './RedditActionBar';
import { getAvatarUrl } from '../../lib/storagePublicUrl';

/**
 * Compact activity row (watchlist add, rating, etc.).
 */
export default function FeedActivityCard({ item, onLike, onOpenComments, onOpenThread, onShare }) {
  const openThread = (e) => {
    if (!onOpenThread) return;
    const tag = e.target?.closest?.('a, button, [data-no-thread]');
    if (tag) return;
    onOpenThread(item);
  };

  return (
    <article
      className={`bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-text-muted)]/30 transition-colors overflow-hidden ${onOpenThread ? 'cursor-pointer' : ''}`}
      onClick={onOpenThread ? openThread : undefined}
      role={onOpenThread ? 'link' : undefined}
    >
      <div className="flex items-center gap-2 p-2.5">
        <div className="w-7 h-7 rounded-lg bg-[var(--color-surface-subtle)] flex items-center justify-center text-xs shrink-0 overflow-hidden">
          {item.user.avatarUrl ? (
            <img src={getAvatarUrl(item.user.avatarUrl, 28)} alt="" className="w-full h-full object-cover" />
          ) : (
            item.user.avatar || '🎬'
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/80">
            <Link
              to={`/${item.user.username}/profile`}
              className="font-medium text-white hover:text-[var(--accent-green)] inline-flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {item.user.name}
              {item.user.isVerified && <VerifiedBadge size={12} />}
            </Link>
            {' '}
            <span className="text-white/50">{item.action}</span>{' '}
            <span className="font-medium text-white">{item.movie.title}</span>
            {item.rating && <span className="text-yellow-400 ml-1">★ {item.rating}</span>}
          </p>
          <p className="text-[10px] text-white/40">{item.time}</p>
        </div>
        <div className="w-8 h-12 rounded overflow-hidden bg-white/10 shrink-0">
          <img
            src={`https://image.tmdb.org/t/p/w92${item.movie.poster}`}
            alt={item.movie.title}
            className="w-full h-full object-cover"
          />
        </div>
      </div>
      <div className="px-2.5 pb-2.5" data-no-thread onClick={(e) => e.stopPropagation()}>
        <RedditActionBar
          score={item.likes || 0}
          comments={item.comments || 0}
          isUpvoted={!!item.isLiked}
          onUpvote={() => onLike?.(item)}
          onComment={() => (onOpenThread ? onOpenThread(item) : onOpenComments?.(item))}
          onShare={() => onShare?.(item)}
          showShare={!!onShare}
          item={item}
        />
      </div>
    </article>
  );
}
