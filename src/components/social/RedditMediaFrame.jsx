import React from 'react';

/**
 * Reddit-style media frame.
 * - stage: blurred side fill + fixed min height (feed cards)
 * - adaptive: image-driven height, max 520px (thread detail)
 */
export default function RedditMediaFrame({
  src,
  alt = '',
  className = '',
  onDoubleClick,
  mode = 'stage',
  minHeightClass = 'min-h-[420px] sm:min-h-[520px]',
  maxHeightClass = 'max-h-[72vh]',
}) {
  if (!src) return null;

  if (mode === 'adaptive') {
    return (
      <div
        className={`relative w-full overflow-hidden rounded-xl sm:rounded-2xl bg-[#111416] ${className}`}
        onDoubleClick={onDoubleClick}
      >
        <img
          src={src}
          alt={alt}
          className="block w-full h-auto max-h-[65vh] sm:max-h-[520px] object-cover object-center mx-auto"
          loading="lazy"
          onError={(e) => { e.currentTarget.style.opacity = '0'; }}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl bg-black ${minHeightClass} ${maxHeightClass} ${className}`}
      onDoubleClick={onDoubleClick}
    >
      <img
        src={src}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-55"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-black/35" />
      <img
        src={src}
        alt={alt}
        className="relative z-[1] w-full h-full object-contain"
        loading="lazy"
      />
    </div>
  );
}
