import React, { useRef, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import VerifiedBadge from '../VerifiedBadge';
import { parseSummaryForDisplay, normalizeProseText } from '../../lib/articleSummary';
import RedditActionBar from './RedditActionBar';
import RedditMediaFrame from './RedditMediaFrame';
import { getAvatarUrl } from '../../lib/storagePublicUrl';

function formatWhen(publishedAt) {
  if (!publishedAt) return 'News';
  const diff = Date.now() - new Date(publishedAt).getTime();
  if (Number.isNaN(diff) || diff < 0) return new Date(publishedAt).toLocaleDateString();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(publishedAt).toLocaleDateString();
}

/**
 * News article feed card — carousel:
 * 1) article thumbnail
 * 2+) listicle entries (poster + title) when summary_items exist
 *    OR a single formatted summary slide for prose articles
 */
export default function FeedArticleCard({
  item,
  onOpenThread,
  onShare,
  onLike,
  onComment,
  variant = 'feed',
}) {
  const externalUrl = item.link || null;
  const official = item.user;
  const when = formatWhen(item.publishedAt);
  const parsed = parseSummaryForDisplay(item.summary);
  const isThread = variant === 'thread';
  const publisherName = official?.name || official?.username || item.sourceName || 'News';

  const openThread = (e) => {
    if (!onOpenThread) return;
    const tag = e.target?.closest?.('button, a, [data-no-thread]');
    if (tag) return;
    onOpenThread(item);
  };

  const handleComment = () => {
    if (onComment) onComment(item);
    else onOpenThread?.(item);
  };

  const listSlides = useMemo(() => {
    const fromMeta = Array.isArray(item.summaryItems)
      ? item.summaryItems.filter((x) => x?.title)
      : [];
    if (fromMeta.length >= 2) {
      return fromMeta.map((x, i) => ({
        title: x.title,
        imageUrl: x.imageUrl || null,
        index: i + 1,
        total: fromMeta.length,
      }));
    }
    if (parsed.kind === 'list' && parsed.items.length >= 2) {
      return parsed.items.map((title, i) => ({
        title,
        imageUrl: null,
        index: i + 1,
        total: parsed.items.length,
      }));
    }
    return [];
  }, [item.summaryItems, parsed]);

  const proseBlocks = useMemo(() => {
    const raw = (parsed.paragraphs.length ? parsed.paragraphs : [item.summary])
      .map((p) => normalizeProseText(p))
      .filter(Boolean);
    if (!raw.length) return [];
    const sentences = raw
      .join(' ')
      .match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g)
      ?.map((s) => normalizeProseText(s))
      .filter(Boolean) || raw;
    const blocks = [];
    for (let i = 0; i < sentences.length; i += 2) {
      blocks.push(normalizeProseText(sentences.slice(i, i + 2).join(' ')));
    }
    return blocks;
  }, [parsed.paragraphs, item.summary]);

  const hasProseSummary = parsed.kind === 'prose' && (parsed.paragraphs.length > 0 || item.summary);
  const slides = useMemo(() => {
    const out = [{ kind: 'hero' }];
    if (listSlides.length) {
      listSlides.forEach((entry) => out.push({ kind: 'list', entry }));
    } else if (hasProseSummary) {
      out.push({ kind: 'prose' });
    }
    return out;
  }, [listSlides, hasProseSummary]);

  const slideCount = slides.length;
  const scrollerRef = useRef(null);
  const [slide, setSlide] = useState(0);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
    setSlide(Math.min(Math.max(next, 0), slideCount - 1));
  }, [slideCount]);

  const goTo = (index) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
    setSlide(index);
  };

  const arrowBtn =
    'absolute top-1/2 z-10 -translate-y-1/2 flex h-[34px] w-[34px] min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] items-center justify-center rounded-lg bg-black/55 text-white/90 border border-white/10 hover:bg-black/70 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40';

  return (
    <article
      className={`${
        isThread
          ? 'bg-transparent rounded-none border-0'
          : 'bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-text-muted)]/30'
      } overflow-hidden transition-colors ${onOpenThread ? 'cursor-pointer' : ''}`}
      onClick={onOpenThread ? openThread : undefined}
      role={onOpenThread ? 'link' : undefined}
    >
      {/* Author row */}
      <div className={`flex items-center gap-2 sm:gap-2.5 ${isThread ? 'px-3 sm:px-4 pt-2.5 sm:pt-3 pb-2.5 sm:pb-3.5' : 'px-3 pt-3 pb-1.5'}`}>
        {official ? (
          <>
            <Link to={`/${official.username}/profile`} className="shrink-0" data-no-thread>
              {official.avatarUrl ? (
                <img
                  src={getAvatarUrl(official.avatarUrl, 28)}
                  alt=""
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg object-cover border border-[var(--color-border)]"
                />
              ) : (
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[var(--color-surface-subtle)] flex items-center justify-center text-[10px] sm:text-xs">
                  📰
                </div>
              )}
            </Link>
            <div className="min-w-0 flex items-center gap-1 sm:gap-1.5 flex-wrap">
              <Link
                to={`/${official.username}/profile`}
                data-no-thread
                className="text-[12px] sm:text-[13px] font-medium text-[var(--color-text)] hover:underline truncate inline-flex items-center gap-1"
              >
                {publisherName}
                {official.isVerified && <VerifiedBadge size={11} />}
              </Link>
              <span className="text-[var(--color-text-muted)] text-[10px] sm:text-[11px]" aria-hidden>·</span>
              <span className="text-[11px] sm:text-[12px] text-[var(--color-text-muted)] truncate max-w-[100px] sm:max-w-none">{when}</span>
            </div>
          </>
        ) : (
          <>
            <div
              className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center text-[10px] sm:text-xs overflow-hidden shrink-0 ${item.sourceLogo ? 'bg-white' : 'bg-[var(--color-surface-subtle)]'}`}
            >
              {item.sourceLogo ? (
                <img
                  src={item.sourceLogo}
                  alt={item.sourceName || ''}
                  className="w-full h-full object-cover scale-110"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement.classList.add('bg-amber-600');
                    e.currentTarget.parentElement.classList.remove('bg-white');
                    e.currentTarget.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <span className={item.sourceLogo ? 'hidden' : ''}>📰</span>
            </div>
            <div className="min-w-0 flex items-center gap-1 sm:gap-1.5">
              <span className="text-[12px] sm:text-[13px] font-medium text-[var(--color-text)] truncate">
                {publisherName}
              </span>
              <span className="text-[var(--color-text-muted)] text-[10px] sm:text-[11px]" aria-hidden>·</span>
              <span className="text-[11px] sm:text-[12px] text-[var(--color-text-muted)] truncate max-w-[100px] sm:max-w-none">{when}</span>
            </div>
          </>
        )}
      </div>

      {/* Title */}
      <div className={`${isThread ? 'px-3 sm:px-4 pb-2.5 sm:pb-3' : 'px-3 pb-2'}`}>
        {onOpenThread ? (
          <h3
            className={`${
              isThread
                ? 'text-[20px] sm:text-[26px] md:text-[28px] lg:text-[30px] font-semibold leading-[1.25] tracking-tight'
                : 'text-[14px] sm:text-[15px] md:text-base font-medium leading-snug'
            } text-[var(--color-text)] hover:text-[var(--color-theater)] transition-colors`}
          >
            {item.title}
          </h3>
        ) : externalUrl && !isThread ? (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[14px] sm:text-[15px] md:text-base font-medium text-[var(--color-text)] leading-snug hover:text-[var(--color-theater)] transition-colors"
          >
            {item.title}
          </a>
        ) : (
          <h3
            className={`${
              isThread
                ? 'text-[20px] sm:text-[26px] md:text-[28px] lg:text-[30px] font-semibold leading-[1.25] tracking-tight'
                : 'text-[14px] sm:text-[15px] md:text-base font-medium leading-snug'
            } text-[var(--color-text)]`}
          >
            {item.title}
          </h3>
        )}
      </div>

      {/* Media carousel */}
      <div className={`relative ${isThread ? 'px-2.5 sm:px-4' : ''}`} data-no-thread onClick={(e) => e.stopPropagation()}>
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className={`flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth ${isThread ? 'rounded-xl sm:rounded-2xl' : ''}`}
        >
          {slides.map((s, idx) => (
            <div key={idx} className="w-full shrink-0 snap-center snap-always">
              {s.kind === 'hero' && (
                item.imageUrl ? (
                  isThread ? (
                    <RedditMediaFrame src={item.imageUrl} alt={item.title} mode="adaptive" />
                  ) : (
                    <div className="relative aspect-video overflow-hidden bg-black">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.opacity = '0'; }}
                      />
                    </div>
                  )
                ) : (
                  <div className={`${isThread ? 'min-h-[200px] rounded-xl' : 'aspect-video'} bg-[var(--color-surface-subtle)] flex items-center justify-center px-6`}>
                    <p className="text-xl sm:text-2xl text-[var(--color-text-secondary)] text-center leading-snug line-clamp-3">
                      {item.title}
                    </p>
                  </div>
                )
              )}

              {s.kind === 'list' && (
                isThread && s.entry.imageUrl ? (
                  <div className="relative">
                    <RedditMediaFrame src={s.entry.imageUrl} alt={s.entry.title} mode="adaptive" />
                    <div className="absolute inset-x-0 bottom-0 z-10 p-4 rounded-b-xl bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none">
                      <p className="text-[11px] sm:text-xs font-medium tracking-[0.14em] uppercase text-[var(--color-theater)] mb-1.5">
                        {s.entry.index} / {s.entry.total}
                      </p>
                      <h4 className="text-[18px] sm:text-[22px] text-white leading-tight tracking-[-0.01em]">
                        {s.entry.title}
                      </h4>
                    </div>
                  </div>
                ) : (
                  <div className="relative aspect-video overflow-hidden bg-[var(--color-background)]">
                    {s.entry.imageUrl ? (
                      <img
                        src={s.entry.imageUrl}
                        alt={s.entry.title}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.opacity = '0.2'; }}
                      />
                    ) : (
                      <div className="absolute inset-0 bg-[var(--color-surface-subtle)]" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />
                    <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                      <p className="text-[11px] sm:text-xs font-medium tracking-[0.14em] uppercase text-[var(--color-theater)] mb-1.5">
                        {s.entry.index} / {s.entry.total}
                      </p>
                      <h4 className="text-[18px] sm:text-[22px] text-white leading-tight tracking-[-0.01em]">
                        {s.entry.title}
                      </h4>
                    </div>
                  </div>
                )
              )}

              {s.kind === 'prose' && (
                <div className={`${isThread ? 'min-h-[220px] max-h-[420px] rounded-xl' : 'aspect-video'} bg-[var(--color-surface-subtle)] px-11 sm:px-14 pt-5 sm:pt-6 pb-9 flex flex-col overflow-hidden`}>
                  <p className="text-[10px] sm:text-[11px] font-medium tracking-[0.16em] uppercase text-[var(--color-text-muted)] mb-2.5 shrink-0">
                    Summary
                  </p>
                  <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide pr-0.5">
                    {proseBlocks.map((p, i) => (
                      <p
                        key={i}
                        className={`text-[14px] sm:text-[15.5px] text-[var(--color-text-secondary)] leading-[1.65] tracking-[0.01em] ${i > 0 ? 'mt-3.5' : ''}`}
                      >
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {slideCount > 1 && (
          <>
            {slide > 0 && (
              <button
                type="button"
                aria-label="Previous slide"
                onClick={() => goTo(slide - 1)}
                className={`${arrowBtn} left-2`}
              >
                <FiChevronLeft className="h-5 w-5" strokeWidth={2} />
              </button>
            )}
            {slide < slideCount - 1 && (
              <button
                type="button"
                aria-label="Next slide"
                onClick={() => goTo(slide + 1)}
                className={`${arrowBtn} right-2`}
              >
                <FiChevronRight className="h-5 w-5" strokeWidth={2} />
              </button>
            )}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10 max-w-[90%] overflow-hidden pointer-events-none">
              {slideCount <= 12 ? (
                Array.from({ length: slideCount }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Go to slide ${i + 1}`}
                    onClick={() => goTo(i)}
                    className={`h-1.5 rounded-full transition-all shrink-0 pointer-events-auto ${
                      slide === i ? 'w-3.5 bg-white' : 'w-1.5 bg-[var(--color-text-muted)] hover:bg-[var(--color-text-secondary)]'
                    }`}
                  />
                ))
              ) : (
                <span className="rounded-lg bg-black/55 px-2.5 py-0.5 text-[10px] text-white/85 border border-white/10 pointer-events-auto">
                  {slide + 1} / {slideCount}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className={`${isThread ? 'px-3 sm:px-4 pt-3 sm:pt-3.5 pb-0' : 'px-3 py-2.5'}`} data-no-thread onClick={(e) => e.stopPropagation()}>
        <RedditActionBar
          score={item.likes || 0}
          comments={item.comments || 0}
          isUpvoted={!!item.isLiked}
          onUpvote={() => onLike?.(item)}
          onComment={handleComment}
          onShare={() => onShare?.(item)}
          showShare={!!onShare}
          item={item}
        />
      </div>

      {externalUrl && (
        <div className={`${isThread ? 'px-3 sm:px-4 pt-3 sm:pt-3.5 pb-1' : 'px-3 pb-2.5'}`} data-no-thread onClick={(e) => e.stopPropagation()}>
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] sm:text-[13px] text-[var(--color-theater)] font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-theater)]/40 rounded-sm min-h-[44px] sm:min-h-0 touch-manipulation"
          >
            Read on {item.sourceName || 'source'}
            <span aria-hidden>↗</span>
          </a>
        </div>
      )}
    </article>
  );
}
