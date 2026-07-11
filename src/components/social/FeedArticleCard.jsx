import React from 'react';
import { Link } from 'react-router-dom';
import VerifiedBadge from '../VerifiedBadge';

/**
 * News article feed card — opens publisher URL in a new tab (no in-app article page).
 * When `item.user` is set (official account), header shows that profile + verified badge.
 */
export default function FeedArticleCard({ item }) {
  const externalUrl = item.link || null;
  const official = item.user;

  const cardBody = (
    <>
      {item.imageUrl && (
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
      )}
      <div className="px-3 py-2">
        <h3 className="text-sm font-bold text-white">{item.title}</h3>
        {item.summary && (
          <p className="text-xs text-white/50 mt-1 line-clamp-2">{item.summary}</p>
        )}
      </div>
    </>
  );

  return (
    <article className="bg-[#1a1d1f] rounded-lg border border-white/5 overflow-hidden hover:border-white/10 transition-colors">
      <div className="flex items-center gap-2 p-3 pb-2">
        {official ? (
          <>
            {official.avatarUrl ? (
              <img
                src={official.avatarUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/10"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-sm shrink-0">
                📰
              </div>
            )}
            <div>
              <Link
                to={`/${official.username}/profile`}
                className="inline-flex items-center gap-1 text-sm font-medium text-white hover:text-[var(--accent-green)]"
              >
                {official.name}
                {official.isVerified && <VerifiedBadge size={14} />}
              </Link>
              <p className="text-[11px] text-white/40">
                {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : 'News'}
                {item.sourceName ? ` · ${item.sourceName}` : ''}
              </p>
            </div>
          </>
        ) : (
          <>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm overflow-hidden shrink-0 ${item.sourceLogo ? 'bg-white' : 'bg-gradient-to-br from-orange-500 to-amber-500'}`}
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
            <div>
              <p className="text-sm font-medium text-white">{item.sourceName}</p>
              <p className="text-[11px] text-white/40">
                {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : 'News'}
              </p>
            </div>
          </>
        )}
      </div>

      {externalUrl ? (
        <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="block group">
          {cardBody}
        </a>
      ) : (
        <div className="block group">{cardBody}</div>
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
