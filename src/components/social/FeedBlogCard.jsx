import React from 'react';
import { Link } from 'react-router-dom';
import VerifiedBadge from '../VerifiedBadge';
import { feedArticleClass } from './feedItemShell';
import { getAvatarUrl } from '../../lib/storagePublicUrl';

function formatWhen(publishedAt) {
  if (!publishedAt) return '';
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
 * Public blog post in the home feed — opens the full blog page for everyone.
 */
export default function FeedBlogCard({ item }) {
  const blogPath = item.blogId ? `/blog/${item.blogId}` : null;
  const author = item.user;
  const when = formatWhen(item.publishedAt || item.createdAt);
  const cover = item.imageUrl || item.image || null;
  const excerpt = (item.excerpt || item.content || '').replace(/\s+/g, ' ').trim();

  const inner = (
    <>
      <div className="flex items-center gap-2.5 px-3 sm:px-4 pt-3 pb-2">
        <div className="w-9 h-9 rounded-full overflow-hidden bg-[var(--color-surface-subtle)] shrink-0">
          {author?.avatarUrl ? (
            <img src={getAvatarUrl(author.avatarUrl, 36)} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm">✍️</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold text-[var(--color-text)] truncate">
              {author?.name || author?.username || 'Writer'}
            </span>
            {author?.isVerified && <VerifiedBadge className="shrink-0" />}
            <span className="text-[11px] text-[var(--color-text-muted)] shrink-0">· Blog</span>
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)] truncate">
            {author?.username ? `@${author.username}` : ''}
            {when ? ` · ${when}` : ''}
          </p>
        </div>
      </div>

      {cover && (
        <div className="px-3 sm:px-4 pb-2">
          <div className="rounded-xl overflow-hidden border border-[var(--color-border)] aspect-[16/9] bg-[var(--color-surface-subtle)]">
            <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />
          </div>
        </div>
      )}

      <div className="px-3 sm:px-4 pb-3">
        <h3 className="text-[15px] sm:text-base font-bold text-[var(--color-text)] leading-snug mb-1">
          {item.title || 'Untitled blog'}
        </h3>
        {excerpt && (
          <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed line-clamp-3">
            {excerpt}
          </p>
        )}
        <p className="text-[12px] text-[var(--color-theater)] mt-2 font-medium">
          Read blog →
        </p>
      </div>
    </>
  );

  if (!blogPath) {
    return <article className={feedArticleClass(false)}>{inner}</article>;
  }

  return (
    <Link to={blogPath} className={`${feedArticleClass(false)} block`}>
      {inner}
    </Link>
  );
}
