import React, { useEffect, useRef } from 'react';
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

function formatEmbedDate(publishedAt) {
  if (!publishedAt) return '';
  const d = new Date(publishedAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Official X embed for Twitter/Nitter RSS posts.
 */
export default function FeedTweetCard({ item, onOpenThread, onShare, onLike }) {
  const mountRef = useRef(null);
  const handle = extractTwitterHandle(item.link, item.sourceName);
  const xUrl = toXStatusUrl(item.link) || item.link;
  const text = normalizeTweetText({
    title: item.title,
    summary: item.summary,
    handle,
  });
  const whenLabel = formatEmbedDate(item.publishedAt);
  const displayName = item.sourceName || handle;

  useEffect(() => {
    let cancelled = false;
    const el = mountRef.current;
    if (!el || !xUrl) return undefined;

    loadTwitterWidgets()
      .then((twttr) => {
        if (cancelled || !twttr?.widgets) return;
        // Re-scan this card only so infinite-scroll tweets hydrate.
        twttr.widgets.load(el);
      })
      .catch(() => {
        /* keep fallback blockquote / link visible */
      });

    return () => { cancelled = true; };
  }, [xUrl, item.id]);

  if (!xUrl) return null;

  return (
    <article className="overflow-hidden">
      <div ref={mountRef} className="flex justify-center [&_.twitter-tweet]:my-0">
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
