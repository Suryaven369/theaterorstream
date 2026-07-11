import React from 'react';

/**
 * Blue verification tick for the official TheaterOrStream account.
 */
export default function VerifiedBadge({
  size = 16,
  className = '',
  title = 'Official TheaterOrStream account',
}) {
  const px = typeof size === 'number' ? size : 16;
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 align-middle ${className}`}
      title={title}
      aria-label={title}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="block"
      >
        <circle cx="12" cy="12" r="11" fill="#1D9BF0" />
        <path
          d="M7.2 12.3l2.8 2.8 6.8-6.8"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
