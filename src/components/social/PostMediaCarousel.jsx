import React, { useRef, useState, useCallback } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import RedditMediaFrame from './RedditMediaFrame';

/**
 * Reddit-style image carousel for user posts.
 * items: [{ url }]
 * caption: single global caption shown below the carousel
 */
export default function PostMediaCarousel({
  items = [],
  caption = '',
  variant = 'feed',
  onDoubleClick,
}) {
  const scrollerRef = useRef(null);
  const [slide, setSlide] = useState(0);
  const slideCount = items.length;
  const isThread = variant === 'thread';
  const globalCaption = (caption || '').trim();

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
    setSlide(Math.min(Math.max(next, 0), slideCount - 1));
  }, [slideCount]);

  const goTo = (index) => {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.min(Math.max(index, 0), slideCount - 1);
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' });
    setSlide(clamped);
  };

  if (!slideCount) return null;

  const arrowBtn =
    'absolute top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white border border-white/10 hover:bg-black/75 transition-colors';

  return (
    <div className={isThread ? 'px-3 pb-3' : ''}>
      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-hide"
          style={{ scrollbarWidth: 'none' }}
        >
          {items.map((item, i) => (
            <div key={`${item.url}-${i}`} className="w-full shrink-0 snap-center">
              {isThread ? (
                <RedditMediaFrame
                  src={item.url}
                  alt={globalCaption || 'Carousel image'}
                  onDoubleClick={onDoubleClick}
                  mode="stage"
                />
              ) : (
                <div
                  className="relative flex items-center justify-center w-full min-h-[200px] sm:min-h-[280px] max-h-[520px] overflow-hidden bg-black"
                  onDoubleClick={onDoubleClick}
                >
                  <img
                    src={item.url}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-55 pointer-events-none"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/35 pointer-events-none" />
                  <img
                    src={item.url}
                    alt={globalCaption || 'Carousel image'}
                    className="relative z-[1] block max-w-full max-h-[520px] w-auto h-auto object-contain mx-auto"
                    loading="lazy"
                  />
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
                onClick={(e) => { e.stopPropagation(); goTo(slide - 1); }}
                className={`${arrowBtn} left-2`}
                aria-label="Previous image"
                data-no-thread
              >
                <FiChevronLeft className="text-lg" />
              </button>
            )}
            {slide < slideCount - 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goTo(slide + 1); }}
                className={`${arrowBtn} right-2`}
                aria-label="Next image"
                data-no-thread
              >
                <FiChevronRight className="text-lg" />
              </button>
            )}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-1.5">
              {items.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === slide ? 'w-4 bg-white' : 'w-1.5 bg-white/40'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {globalCaption && (
        <p className={`mt-2 text-[13px] text-[var(--color-text-secondary)] leading-snug ${isThread ? '' : 'px-3'}`}>
          {globalCaption}
        </p>
      )}
    </div>
  );
}
