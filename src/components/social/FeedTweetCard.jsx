import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaRetweet, FaRegHeart, FaRegComment, FaExternalLinkAlt } from 'react-icons/fa';
import { BsTwitterX } from 'react-icons/bs';
import {
  extractTwitterHandle,
  normalizeTweetText,
  toXStatusUrl,
} from '../../lib/twitterRss';
import RedditActionBar from './RedditActionBar';

const WIDGETS_SRC = 'https://platform.x.com/widgets.js';

function loadTwitterWidgets() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.twttr?.widgets) return Promise.resolve(window.twttr);
  if (window.__tosTwitterWidgetsPromise) return window.__tosTwitterWidgetsPromise;

  window.__tosTwitterWidgetsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${WIDGETS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.twttr || null));
      existing.addEventListener('error', () => reject(new Error('X widgets failed to load')));
      if (window.twttr?.widgets) resolve(window.twttr);
      return;
    }
    const script = document.createElement('script');
    script.src = WIDGETS_SRC;
    script.async = true;
    script.charset = 'utf-8';
    script.onload = () => resolve(window.twttr || null);
    script.onerror = () => reject(new Error('X widgets failed to load'));
    document.body.appendChild(script);
  });

  return window.__tosTwitterWidgetsPromise;
}

function formatRelativeTime(publishedAt) {
  if (!publishedAt) return '';
  const d = new Date(publishedAt);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function TweetSkeleton() {
  return (
    <div className="w-full max-w-[500px] mx-auto rounded-xl border border-[#2F3336] bg-[#16181C] p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-[#2F3336] shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-4 w-24 bg-[#2F3336] rounded" />
            <div className="h-3 w-16 bg-[#2F3336] rounded" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full bg-[#2F3336] rounded" />
            <div className="h-3 w-5/6 bg-[#2F3336] rounded" />
            <div className="h-3 w-4/6 bg-[#2F3336] rounded" />
          </div>
          <div className="flex items-center gap-6 pt-2">
            <div className="h-4 w-10 bg-[#2F3336] rounded" />
            <div className="h-4 w-10 bg-[#2F3336] rounded" />
            <div className="h-4 w-10 bg-[#2F3336] rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TweetFallbackCard({ handle, displayName, text, xUrl, whenLabel, avatarUrl }) {
  return (
    <a
      href={xUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full max-w-[500px] mx-auto rounded-xl border border-[#2F3336] bg-[#16181C] p-4 hover:bg-[#1D1F23] transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 shrink-0 flex items-center justify-center text-white text-sm font-bold overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            handle?.charAt(0)?.toUpperCase() || 'X'
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-[15px] text-white truncate">{displayName}</span>
            <span className="text-[15px] text-[#71767B] truncate">@{handle}</span>
            <span className="text-[#71767B]">·</span>
            <span className="text-[15px] text-[#71767B]">{whenLabel}</span>
          </div>
          <p className="text-[15px] text-[#E7E9EA] leading-relaxed mt-1 whitespace-pre-wrap break-words">
            {text}
          </p>
          <div className="flex items-center gap-6 mt-3 text-[#71767B]">
            <span className="inline-flex items-center gap-1.5 text-[13px] hover:text-sky-400 transition-colors">
              <FaRegComment className="text-[14px]" />
            </span>
            <span className="inline-flex items-center gap-1.5 text-[13px] hover:text-green-400 transition-colors">
              <FaRetweet className="text-[15px]" />
            </span>
            <span className="inline-flex items-center gap-1.5 text-[13px] hover:text-pink-500 transition-colors">
              <FaRegHeart className="text-[14px]" />
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-[#71767B] group-hover:text-sky-400 transition-colors">
              <FaExternalLinkAlt className="text-[11px]" />
              View on X
            </span>
          </div>
        </div>
        <BsTwitterX className="text-white text-[18px] shrink-0 opacity-60" />
      </div>
    </a>
  );
}

/**
 * Official X embed for Twitter/Nitter RSS posts.
 * Shows a polished skeleton → fallback card → official embed (if loads).
 */
export default function FeedTweetCard({ item, onOpenThread, onShare, onLike }) {
  const mountRef = useRef(null);
  const [embedState, setEmbedState] = useState('loading'); // 'loading' | 'fallback' | 'embedded'
  const embedTimeoutRef = useRef(null);

  const handle = extractTwitterHandle(item.link, item.sourceName);
  const xUrl = toXStatusUrl(item.link) || item.link;
  const text = normalizeTweetText({
    title: item.title,
    summary: item.summary,
    handle,
  });
  const whenLabel = formatRelativeTime(item.publishedAt);
  const displayName = item.sourceName || handle;

  const checkForEmbed = useCallback(() => {
    const el = mountRef.current;
    if (!el) return false;
    const iframe = el.querySelector('iframe.twitter-tweet-rendered, iframe[id^="twitter-widget"]');
    if (iframe) {
      setEmbedState('embedded');
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const el = mountRef.current;
    if (!el || !xUrl) return undefined;

    setEmbedState('loading');

    const fallbackTimer = setTimeout(() => {
      if (!cancelled && embedState === 'loading') {
        setEmbedState('fallback');
      }
    }, 800);

    loadTwitterWidgets()
      .then((twttr) => {
        if (cancelled || !twttr?.widgets) {
          if (!cancelled) setEmbedState('fallback');
          return;
        }

        twttr.widgets.load(el);

        let checks = 0;
        const maxChecks = 20;
        const checkInterval = setInterval(() => {
          checks += 1;
          if (cancelled) {
            clearInterval(checkInterval);
            return;
          }
          if (checkForEmbed() || checks >= maxChecks) {
            clearInterval(checkInterval);
            if (checks >= maxChecks && embedState !== 'embedded') {
              setEmbedState('fallback');
            }
          }
        }, 250);

        embedTimeoutRef.current = checkInterval;
      })
      .catch(() => {
        if (!cancelled) setEmbedState('fallback');
      });

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      if (embedTimeoutRef.current) {
        clearInterval(embedTimeoutRef.current);
      }
    };
  }, [xUrl, item.id, checkForEmbed]);

  if (!xUrl) return null;

  return (
    <article className="overflow-hidden">
      {/* Skeleton shown while loading */}
      {embedState === 'loading' && (
        <div className="py-2">
          <TweetSkeleton />
        </div>
      )}

      {/* Styled fallback card - shown if embed takes too long or fails */}
      {embedState === 'fallback' && (
        <div className="py-2">
          <TweetFallbackCard
            handle={handle}
            displayName={displayName}
            text={text}
            xUrl={xUrl}
            whenLabel={whenLabel}
            avatarUrl={item.sourceLogo}
          />
        </div>
      )}

      {/* Official embed mount point - hidden initially, revealed when embedded */}
      <div
        ref={mountRef}
        className={`flex justify-center [&_.twitter-tweet]:my-0 transition-opacity duration-300 ${
          embedState === 'embedded' ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'
        }`}
      >
        <blockquote
          className="twitter-tweet"
          data-theme="dark"
          data-dnt="true"
          data-conversation="none"
        >
          <p lang="en" dir="ltr">{text || `Post from @${handle}`}</p>
          &mdash; {displayName} (@{handle}){' '}
          <a href={`${xUrl}${xUrl.includes('?') ? '&' : '?'}ref_src=twsrc%5Etfw`}>
            {whenLabel || 'View on X'}
          </a>
        </blockquote>
      </div>

      {(onOpenThread || onShare || onLike) && (
        <div className="px-3 py-2.5" data-no-thread onClick={(e) => e.stopPropagation()}>
          <RedditActionBar
            score={item.likes || 0}
            comments={item.comments || 0}
            isUpvoted={!!item.isLiked}
            onUpvote={() => onLike?.(item)}
            onComment={() => onOpenThread?.(item)}
            onShare={() => onShare?.(item)}
            showShare={!!onShare}
            item={item}
          />
        </div>
      )}
    </article>
  );
}
