import React, { useEffect, useRef, useState } from 'react';
import { toXStatusUrl } from '../../lib/twitterRss';
import RedditActionBar from './RedditActionBar';
import { feedArticleClass } from './feedItemShell';

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

function extractTweetId(url = '') {
  const m = String(url || '').match(/\/status\/(\d+)/i);
  return m?.[1] || null;
}

/** Keep a single official iframe; drop duplicate embeds / leftover blockquotes. */
function keepSingleEmbed(root) {
  if (!root) return false;
  const iframes = [...root.querySelectorAll('iframe')];
  iframes.slice(1).forEach((node) => node.remove());
  if (iframes.length > 0) {
    root.querySelectorAll('blockquote.twitter-tweet').forEach((node) => node.remove());
    // Extra wrappers widgets sometimes leaves beside the iframe
    [...root.children].forEach((child) => {
      if (child.tagName !== 'IFRAME' && !child.querySelector?.('iframe')) {
        child.remove();
      }
    });
  }
  return iframes.length > 0;
}

function TweetSkeleton() {
  return (
    <div className="w-full max-w-[550px] mx-auto rounded-xl border border-[#2F3336] bg-[#16181C] p-4 animate-pulse">
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
        </div>
      </div>
    </div>
  );
}

/**
 * Official X embed only — one iframe per tweet (no custom card, no duplicates).
 */
export default function FeedTweetCard({ item, onOpenThread, onShare, onLike, variant = 'feed' }) {
  const mountRef = useRef(null);
  const requestIdRef = useRef(0);
  const [ready, setReady] = useState(false);

  const xUrl = toXStatusUrl(item.link) || item.link;
  const tweetId = extractTweetId(xUrl);

  useEffect(() => {
    const el = mountRef.current;
    if (!el || !tweetId) return undefined;

    const requestId = ++requestIdRef.current;
    let cancelled = false;

    setReady(false);
    el.replaceChildren();

    (async () => {
      try {
        const twttr = await loadTwitterWidgets();
        if (cancelled || requestId !== requestIdRef.current || !mountRef.current) return;
        if (!twttr?.widgets?.createTweet) return;

        // Clear again in case a raced Strict Mode render wrote here.
        mountRef.current.replaceChildren();

        await twttr.widgets.createTweet(tweetId, mountRef.current, {
          theme: 'dark',
          dnt: true,
          conversation: 'none',
          align: 'center',
        });

        if (cancelled || requestId !== requestIdRef.current || !mountRef.current) {
          mountRef.current?.replaceChildren();
          return;
        }

        const ok = keepSingleEmbed(mountRef.current);
        setReady(ok);
      } catch {
        /* stay on skeleton — never swap in a custom tweet card */
      }
    })();

    return () => {
      cancelled = true;
      el.replaceChildren();
    };
  }, [tweetId, item.id]);

  if (!xUrl) return null;

  return (
    <article className={feedArticleClass(variant === 'thread')}>
      <div className="relative py-2 min-h-[120px]">
        {!ready && (
          <div className="absolute inset-x-0 top-2 z-10 pointer-events-none">
            <TweetSkeleton />
          </div>
        )}
        <div
          ref={mountRef}
          className={`flex justify-center transition-opacity duration-300 [&_iframe]:max-w-full [&_iframe~iframe]:hidden ${
            ready ? 'opacity-100' : 'opacity-0'
          }`}
        />
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
