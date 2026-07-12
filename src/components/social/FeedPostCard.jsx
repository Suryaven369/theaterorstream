import React from 'react';
import { Link } from 'react-router-dom';
import {
  FaBookmark,
  FaRegBookmark,
  FaEllipsisH,
  FaStar,
} from 'react-icons/fa';
import MovieMentionText from '../MovieMentionText';
import VerifiedBadge from '../VerifiedBadge';
import RedditActionBar from './RedditActionBar';
import RedditMediaFrame from './RedditMediaFrame';

const createSlug = (text) =>
  (text || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

/**
 * Full social post card (text / image / movie attach / log / list).
 */
export default function FeedPostCard({
  item,
  currentUserId,
  openMenuId,
  onToggleMenu,
  editingId,
  editText,
  onEditTextChange,
  savingEdit,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onLike,
  onSave,
  onShare,
  onOpenComments,
  onOpenThread,
  variant = 'feed',
}) {
  const isOwner = item.user?.id && currentUserId === item.user.id;
  const isEditing = editingId === item.id;
  const isThread = variant === 'thread';

  const openThread = (e) => {
    if (e) {
      // Ignore clicks on buttons/links inside the card
      const tag = e.target?.closest?.('button, a, textarea, input, [data-no-thread]');
      if (tag) return;
    }
    onOpenThread?.(item);
  };

  return (
    <article
      className={`bg-[#1a1d1f] ${isThread ? 'rounded-none sm:rounded-t-xl border-0' : 'rounded-lg border border-white/5'} overflow-hidden hover:border-white/10 transition-colors ${onOpenThread ? 'cursor-pointer' : ''}`}
      onClick={onOpenThread ? openThread : undefined}
      role={onOpenThread ? 'link' : undefined}
    >
      <div className="flex items-center justify-between p-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-sm overflow-hidden shrink-0">
            {item.user.avatarUrl ? (
              <img src={item.user.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              item.user.avatar || '🎬'
            )}
          </div>
          <div>
            <Link
              to={`/${item.user.username}/profile`}
              className="text-sm font-medium text-white hover:text-[var(--accent-green)] transition-colors inline-flex items-center gap-1"
            >
              {item.user.name}
              {item.user.isVerified && <VerifiedBadge size={14} />}
            </Link>
            <p className="text-[11px] text-white/40">
              @{item.user.username} · {item.time}
            </p>
          </div>
        </div>
        {isOwner && (
          <div className="relative">
            <button
              onClick={() => onToggleMenu(openMenuId === item.id ? null : item.id)}
              className="p-1.5 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-colors"
            >
              <FaEllipsisH className="text-xs" />
            </button>
            {openMenuId === item.id && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => onToggleMenu(null)}
                  aria-label="Close menu"
                />
                <div className="absolute right-0 top-8 z-20 w-36 bg-[#222] border border-white/10 rounded-lg shadow-xl overflow-hidden">
                  {item.postType !== 'log' && item.postType !== 'list' && (
                    <button
                      onClick={() => onStartEdit(item)}
                      className="w-full text-left px-3 py-2 text-xs text-white hover:bg-white/10"
                    >
                      ✏️ Edit
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(item)}
                    className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10"
                  >
                    🗑 Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {item.postType === 'log' && (
        <div className="px-3 pb-1">
          <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-green)]/15 text-[var(--accent-green)]">
            🎬 Logged a film
          </span>
        </div>
      )}
      {item.postType === 'list' && (
        <div className="px-3 pb-1">
          <Link
            to={`/collection/${createSlug(item.movieTitle || '')}`}
            className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 transition-colors"
          >
            📋 New list — view
          </Link>
        </div>
      )}

      {isEditing ? (
        <div className="px-3 pb-2">
          <textarea
            value={editText}
            onChange={(e) => onEditTextChange(e.target.value.slice(0, 500))}
            rows={3}
            maxLength={500}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-[var(--accent-green)] resize-none"
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <button onClick={onCancelEdit} className="px-3 py-1.5 text-xs text-white/60 hover:text-white">
              Cancel
            </button>
            <button
              onClick={() => onSaveEdit(item)}
              disabled={savingEdit || !editText.trim()}
              className="px-3 py-1.5 text-xs rounded-full bg-[var(--accent-green)] text-black font-semibold disabled:opacity-50"
            >
              {savingEdit ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        item.content && (
          <div className={`px-3 ${isThread ? 'pb-3' : 'pb-2'}`}>
            <MovieMentionText
              content={item.content}
              className={`${isThread ? 'text-[16px] sm:text-[17px]' : 'text-[13px]'} text-white leading-relaxed`}
            />
          </div>
        )
      )}

      {item.image && (
        isThread ? (
          <div className="px-3 pb-3">
            <RedditMediaFrame src={item.image} alt="" onDoubleClick={() => onLike(item)} />
          </div>
        ) : (
          <div className="relative">
            <img
              src={item.image}
              alt=""
              className="w-full max-h-[520px] object-cover"
              loading="lazy"
              onDoubleClick={() => onLike(item)}
            />
          </div>
        )
      )}

      {item.movie && item.hasImage && (
        <div className="relative">
          {item.movie.backdrop ? (
            isThread ? (
              <div className="px-3 pb-3">
                <RedditMediaFrame
                  src={`https://image.tmdb.org/t/p/w1280${item.movie.backdrop}`}
                  alt={item.movie.title}
                  onDoubleClick={() => onLike(item)}
                />
                <div className="mt-3 flex items-center gap-3">
                  <div className="w-14 h-[84px] rounded-lg overflow-hidden shadow-xl shrink-0 border border-white/15">
                    <img
                      src={`https://image.tmdb.org/t/p/w185${item.movie.poster}`}
                      alt={item.movie.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">{item.movie.title}</h3>
                    <p className="text-sm text-white/55">{item.movie.year}</p>
                    {item.rating && (
                      <div className="flex items-center gap-1 mt-1">
                        <FaStar className="text-yellow-400 text-sm" />
                        <span className="text-sm font-bold text-white">{item.rating}/10</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
            <div className="relative aspect-[16/10] overflow-hidden">
              <img
                src={`https://image.tmdb.org/t/p/w780${item.movie.backdrop}`}
                alt={item.movie.title}
                className="w-full h-full object-cover"
                onDoubleClick={() => onLike(item)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end gap-2">
                <div className="w-12 h-[72px] rounded overflow-hidden shadow-xl shrink-0 border border-white/20">
                  <img
                    src={`https://image.tmdb.org/t/p/w92${item.movie.poster}`}
                    alt={item.movie.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{item.movie.title}</h3>
                  <p className="text-xs text-white/60">{item.movie.year}</p>
                  {item.rating && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <FaStar className="text-yellow-400 text-xs" />
                      <span className="text-xs font-bold text-white">{item.rating}/10</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )
          ) : (
            <div className="px-3 pb-2">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                <div className="w-14 h-20 rounded overflow-hidden bg-white/10 shrink-0">
                  <img
                    src={`https://image.tmdb.org/t/p/w92${item.movie.poster}`}
                    alt={item.movie.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="text-sm text-white font-medium">{item.movie.title}</h3>
                  <p className="text-[11px] text-white/40">{item.movie.year}</p>
                  {item.rating && (
                    <div className="flex items-center gap-1 mt-1">
                      <FaStar className="text-yellow-400 text-xs" />
                      <span className="text-xs font-bold text-white">{item.rating}/10</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="px-3 py-2.5" data-no-thread onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <RedditActionBar
            score={item.likes || 0}
            comments={item.comments || 0}
            isUpvoted={!!item.isLiked}
            onUpvote={() => onLike(item)}
            onComment={() => (onOpenThread ? onOpenThread(item) : onOpenComments?.(item))}
            onShare={() => onShare(item)}
            item={item}
          />
          <button
            onClick={() => onSave(item.id)}
            className={`p-2 rounded-full hover:bg-white/5 transition-colors shrink-0 ${item.isSaved ? 'text-yellow-400' : 'text-white/45 hover:text-white'}`}
            aria-label="Save"
          >
            {item.isSaved ? <FaBookmark className="text-sm" /> : <FaRegBookmark className="text-sm" />}
          </button>
        </div>
      </div>
    </article>
  );
}
