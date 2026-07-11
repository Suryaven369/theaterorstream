import React from 'react';
import { Link } from 'react-router-dom';
import {
  FaHeart,
  FaRegHeart,
  FaRegComment,
  FaBookmark,
  FaRegBookmark,
  FaEllipsisH,
  FaStar,
  FaPaperPlane,
} from 'react-icons/fa';
import MovieMentionText from '../MovieMentionText';

const createSlug = (text) =>
  (text || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

function formatCount(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num;
}

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
}) {
  const isOwner = item.user?.id && currentUserId === item.user.id;
  const isEditing = editingId === item.id;

  return (
    <article className="bg-[#1a1d1f] rounded-lg border border-white/5 overflow-hidden hover:border-white/10 transition-colors">
      <div className="flex items-center justify-between p-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-sm">
            {item.user.avatar}
          </div>
          <div>
            <Link
              to={`/${item.user.username}/profile`}
              className="text-sm font-medium text-white hover:text-[var(--accent-green)] transition-colors"
            >
              {item.user.name}
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
          <div className="px-3 pb-2">
            <MovieMentionText content={item.content} className="text-[13px] text-white leading-relaxed" />
          </div>
        )
      )}

      {item.image && (
        <div className="relative">
          <img
            src={item.image}
            alt=""
            className="w-full max-h-[520px] object-cover"
            loading="lazy"
            onDoubleClick={() => onLike(item.id)}
          />
        </div>
      )}

      {item.movie && item.hasImage && (
        <div className="relative">
          {item.movie.backdrop ? (
            <div className="relative aspect-[16/10] overflow-hidden">
              <img
                src={`https://image.tmdb.org/t/p/w780${item.movie.backdrop}`}
                alt={item.movie.title}
                className="w-full h-full object-cover"
                onDoubleClick={() => onLike(item.id)}
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

      <div className="px-3 py-2 border-t border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 -ml-1.5">
            <button
              onClick={() => onLike(item.id)}
              className={`p-1.5 -m-0 rounded-full hover:bg-white/5 transition-colors ${item.isLiked ? 'text-red-500' : 'text-white/60 hover:text-white'}`}
            >
              {item.isLiked ? <FaHeart className="text-lg" /> : <FaRegHeart className="text-lg" />}
            </button>
            <button
              onClick={() => onOpenComments(item)}
              className="p-1.5 rounded-full hover:bg-white/5 text-white/60 hover:text-white transition-colors"
            >
              <FaRegComment className="text-lg" />
            </button>
            <button
              onClick={() => onShare(item)}
              className="p-1.5 rounded-full hover:bg-white/5 text-white/60 hover:text-white transition-colors"
            >
              <FaPaperPlane className="text-[15px]" />
            </button>
          </div>
          <button
            onClick={() => onSave(item.id)}
            className={`p-1.5 -mr-1.5 rounded-full hover:bg-white/5 transition-colors ${item.isSaved ? 'text-yellow-400' : 'text-white/60 hover:text-white'}`}
          >
            {item.isSaved ? <FaBookmark className="text-lg" /> : <FaRegBookmark className="text-lg" />}
          </button>
        </div>
        <p className="text-xs font-semibold text-white mt-1.5">{formatCount(item.likes)} likes</p>
        {item.comments > 0 && (
          <button
            onClick={() => onOpenComments(item)}
            className="text-xs text-white/50 hover:text-white/70 mt-0.5 transition-colors"
          >
            View all {formatCount(item.comments)} comments
          </button>
        )}
      </div>
    </article>
  );
}
