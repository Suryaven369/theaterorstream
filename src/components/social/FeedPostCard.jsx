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
import PostMediaCarousel from './PostMediaCarousel';
import FeedPoll from './FeedPoll';
import { feedArticleClass } from './feedItemShell';
import { getAvatarUrl } from '../../lib/storagePublicUrl';

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
  onVotePoll,
  pollVotingId = null,
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
      className={feedArticleClass(isThread, onOpenThread ? 'cursor-pointer' : '')}
      onClick={onOpenThread ? openThread : undefined}
      role={onOpenThread ? 'link' : undefined}
    >
      <div className={`flex items-center justify-between ${isThread ? 'p-3 pb-2' : 'px-3 sm:px-4 pt-2.5 sm:pt-3 pb-1.5'}`}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[var(--color-surface-subtle)] flex items-center justify-center text-sm overflow-hidden shrink-0">
            {item.user.avatarUrl ? (
              <img src={getAvatarUrl(item.user.avatarUrl, 36)} alt="" className="w-full h-full object-cover" />
            ) : (
              item.user.avatar || '🎬'
            )}
          </div>
          <div>
            <Link
              to={`/${item.user.username}/profile`}
              className="text-sm font-medium text-[var(--color-text)] hover:text-[var(--color-theater)] transition-colors inline-flex items-center gap-1"
            >
              {item.user.name}
              {item.user.isVerified && <VerifiedBadge size={14} />}
            </Link>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              @{item.user.username} · {item.time}
              {item.editCount > 0 && (
                <span className="text-[var(--color-text-muted)]"> · Edited</span>
              )}
            </p>
          </div>
        </div>
        {isOwner && (
          <div className="relative">
            <button
              onClick={() => onToggleMenu(openMenuId === item.id ? null : item.id)}
              className="p-1.5 rounded-lg hover:bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
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
                <div className="absolute right-0 top-8 z-20 w-36 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl overflow-hidden">
                  {item.postType !== 'log' && item.postType !== 'list' && item.canEdit !== false && (
                    <button
                      onClick={() => onStartEdit(item)}
                      className="w-full text-left px-3 py-2.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)]"
                    >
                      ✏️ Edit
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(item)}
                    className="w-full text-left px-3 py-2.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
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
          <span className="inline-block text-[10px] px-2 py-0.5 rounded-md bg-[var(--color-theater)]/15 text-[var(--color-theater)]">
            🎬 Logged a film
          </span>
        </div>
      )}

      {item.postType === 'list' ? (
        <Link
          to={`/collection/${createSlug(item.listTitle || item.movieTitle || '')}`}
          className="block px-3 sm:px-4 pb-2"
          data-no-thread
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] overflow-hidden hover:border-white/20 transition-colors">
            {(item.image || item.imageUrl) ? (
              <div className="relative w-full aspect-[16/9] sm:aspect-[2/1] bg-black overflow-hidden">
                {/* Soft fill so portrait posters aren’t stretched */}
                <img
                  src={item.image || item.imageUrl}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-55 pointer-events-none"
                />
                <div className="absolute inset-0 bg-black/35" />
                <div className="relative z-[1] h-full flex items-center justify-center px-4 py-3">
                  <img
                    src={item.image || item.imageUrl}
                    alt=""
                    className="max-h-full w-auto max-w-[42%] sm:max-w-[38%] aspect-[2/3] object-cover rounded-lg shadow-2xl border border-white/15"
                    loading="lazy"
                  />
                </div>
              </div>
            ) : null}
            <div className="px-3.5 py-3">
              <span className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/10 text-white/65 mb-1.5">
                List
              </span>
              <h3 className="text-[15px] sm:text-base font-bold text-white leading-snug">
                {item.listTitle || item.movieTitle || 'Collection'}
              </h3>
              {item.content && item.content !== (item.listTitle || item.movieTitle) && (
                <p className="text-[12px] sm:text-[13px] text-white/50 mt-1 line-clamp-2 leading-relaxed">
                  {item.content}
                </p>
              )}
              <p className="text-[12px] text-[var(--color-theater)] mt-2 font-medium">
                View list →
              </p>
            </div>
          </div>
        </Link>
      ) : (
        <>
          {isEditing ? (
            <div className="px-3 pb-2">
              <textarea
                value={editText}
                onChange={(e) => onEditTextChange(e.target.value.slice(0, 500))}
                rows={3}
                maxLength={500}
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-theater)] resize-none"
              />
              <div className="flex items-center justify-end gap-2 mt-2">
                <button onClick={onCancelEdit} className="px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                  Cancel
                </button>
                <button
                  onClick={() => onSaveEdit(item)}
                  disabled={savingEdit || !editText.trim()}
                  className="px-3 py-1.5 text-xs rounded-lg bg-[var(--color-theater)] text-[var(--color-background)] font-medium disabled:opacity-50"
                >
                  {savingEdit ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            item.content && (
              <div className={`px-3 sm:px-4 ${isThread ? 'pb-3' : 'pb-1.5'}`}>
                <MovieMentionText
                  content={item.content}
                  className={`${isThread ? 'text-[16px] sm:text-[17px]' : 'text-[13px]'} text-white leading-relaxed`}
                />
              </div>
            )
          )}

          {item.isCarousel && item.mediaItems?.length >= 2 ? (
            <PostMediaCarousel
              items={item.mediaItems}
              caption={item.carouselCaption}
              variant={isThread ? 'thread' : 'feed'}
              onDoubleClick={() => onLike(item)}
            />
          ) : item.image && (
            isThread ? (
              <div className="px-3 pb-3">
                <RedditMediaFrame src={item.image} alt="" onDoubleClick={() => onLike(item)} />
              </div>
            ) : (
              <div className="relative bg-black flex items-center justify-center max-h-[520px]">
                <img
                  src={item.image}
                  alt=""
                  className="block max-w-full max-h-[520px] w-auto h-auto object-contain mx-auto"
                  loading="lazy"
                  onDoubleClick={() => onLike(item)}
                />
              </div>
            )
          )}
        </>
      )}

      {item.postType === 'poll' && item.pollData && (
        <FeedPoll
          pollData={item.pollData}
          userVote={item.userPollVote}
          voting={pollVotingId === item.id}
          disabled={!currentUserId}
          onVote={(optionIndex) => onVotePoll?.(item, optionIndex)}
        />
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

      <div className="px-3 sm:px-4 py-2 sm:py-2.5" data-no-thread onClick={(e) => e.stopPropagation()}>
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
            className={`p-2 rounded-lg hover:bg-[var(--color-surface-subtle)] transition-colors shrink-0 ${item.isSaved ? 'text-[var(--color-theater)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}`}
            aria-label="Save"
          >
            {item.isSaved ? <FaBookmark className="text-sm" /> : <FaRegBookmark className="text-sm" />}
          </button>
        </div>
      </div>
    </article>
  );
}
