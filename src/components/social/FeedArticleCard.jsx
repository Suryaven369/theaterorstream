import React from 'react';
import { Link } from 'react-router-dom';
import VerifiedBadge from '../VerifiedBadge';

/**
 * News article feed card — small author row, large title (Reddit-style hierarchy).
 */
export default function FeedArticleCard({ item }) {
  const externalUrl = item.link || null;
  const official = item.user;
  const when = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : 'News';

  const media = item.imageUrl ? (
    <div className="relative aspect-video overflow-hidden bg-black">
      <img
        src={item.imageUrl}
        alt={item.title}
        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
        loading="lazy"
        onError={(e) => {
          e.currentTarget.closest('.aspect-video').style.display = 'none';
        }}
      />
    </div>
  ) : null;

  const body = (
    <>
      {media}
      {item.summary && (
        <div className="px-3 py-2">
          <p className="text-xs text-white/50 line-clamp-2">{item.summary}</p>
        </div>
      )}
    </>
  );

  return (
    <article className="bg-[#1a1d1f] rounded-lg border border-white/5 overflow-hidden hover:border-white/10 transition-colors">
      {/* Author row — small */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
        {official ? (
          <>
            <Link to={`/${official.username}/profile`} className="shrink-0">
              {official.avatarUrl ? (
                <img
                  src={official.avatarUrl}
                  alt=""
                  className="w-7 h-7 rounded-full object-cover border border-white/10"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-xs">
                  📰
                </div>
              )}
            </Link>
            <div className="min-w-0 flex items-center gap-1.5">
              <Link
                to={`/${official.username}/profile`}
                className="text-[12px] font-medium text-white/80 hover:text-white truncate inline-flex items-center gap-1"
              >
                {official.username || official.name}
                {official.isVerified && <VerifiedBadge size={12} />}
              </Link>
              <span className="text-white/25 text-[10px]">·</span>
              <span className="text-[11px] text-white/40 truncate">
                {when}
                {item.sourceName ? ` · ${item.sourceName}` : ''}
              </span>
            </div>
          </>
        ) : (
          <>
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs overflow-hidden shrink-0 ${item.sourceLogo ? 'bg-white' : 'bg-gradient-to-br from-orange-500 to-amber-500'}`}
            >
              {item.sourceLogo ? (
                <img
                  src={item.sourceLogo}
                  alt={item.sourceName}
                  className="w-full h-full object-cover scale-110"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement.classList.add(
                      'bg-gradient-to-br',
                      'from-orange-500',
                      'to-amber-500',
                    );
                    e.currentTarget.parentElement.classList.remove('bg-white');
                    e.currentTarget.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <span className={item.sourceLogo ? 'hidden' : ''}>📰</span>
            </div>
            <div className="min-w-0 flex items-center gap-1.5 text-[11px] text-white/45">
              <span className="text-[12px] font-medium text-white/80 truncate">
                {item.sourceName || 'News'}
              </span>
              <span className="text-white/25">·</span>
              <span className="truncate">{when}</span>
            </div>
          </>
        )}
      </div>

      {/* Title — large primary */}
      <div className="px-3 pb-2">
        {externalUrl ? (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[15px] sm:text-base font-semibold text-white leading-snug hover:text-[var(--accent-green)] transition-colors"
          >
            {item.title}
          </a>
        ) : (
          <h3 className="text-[15px] sm:text-base font-semibold text-white leading-snug">{item.title}</h3>
        )}
      </div>

      {externalUrl ? (
        <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="block group">
          {body}
        </a>
      ) : (
        <div className="block group">{body}</div>
      )}

      {externalUrl && (
        <div className="px-3 py-2 border-t border-white/5">
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--accent-green)] font-medium hover:underline"
          >
            Read on {item.sourceName || 'source'} ↗
          </a>
        </div>
      )}
    </article>
  );
}
