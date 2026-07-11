import React from 'react';
import { Link } from 'react-router-dom';
import { FaHeart, FaRegHeart, FaRegComment } from 'react-icons/fa';

/**
 * Compact activity row (watchlist add, rating, etc.).
 */
export default function FeedActivityCard({ item, onLike, onOpenComments }) {
  return (
    <article className="bg-[#1a1d1f] rounded-lg border border-white/5 hover:border-white/10 transition-colors overflow-hidden">
      <div className="flex items-center gap-2 p-2.5">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs shrink-0">
          {item.user.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/80">
            <Link
              to={`/${item.user.username}/profile`}
              className="font-medium text-white hover:text-[var(--accent-green)]"
            >
              {item.user.name}
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
      <div className="flex items-center gap-2 px-1.5 py-1 border-t border-white/5">
        <button
          onClick={() => onLike(item.id)}
          className={`flex items-center gap-1 text-xs px-1.5 py-1.5 rounded-full hover:bg-white/5 transition-colors ${item.isLiked ? 'text-red-500' : 'text-white/50 hover:text-white'}`}
        >
          {item.isLiked ? <FaHeart className="text-xs" /> : <FaRegHeart className="text-xs" />}
          <span>{item.likes}</span>
        </button>
        {item.comments > 0 && (
          <button
            onClick={() => onOpenComments(item)}
            className="flex items-center gap-1 text-xs px-1.5 py-1.5 rounded-full hover:bg-white/5 text-white/50 hover:text-white transition-colors"
          >
            <FaRegComment className="text-xs" />
            <span>{item.comments}</span>
          </button>
        )}
      </div>
    </article>
  );
}
