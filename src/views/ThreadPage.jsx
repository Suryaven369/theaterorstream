import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import SeoHead from '../components/SeoHead';
import FeedPostCard from '../components/social/FeedPostCard';
import FeedActivityCard from '../components/social/FeedActivityCard';
import FeedArticleCard from '../components/social/FeedArticleCard';
import FeedTweetCard from '../components/social/FeedTweetCard';
import FeedTrailerCard from '../components/social/FeedTrailerCard';
import FeedCommentThread from '../components/social/FeedCommentThread';
import FeedShareModal from '../components/social/FeedShareModal';
import { useAuth } from '../context/AuthContext';
import {
  getThreadItem,
  threadPathForItem,
  attachFeedItemCommentCounts,
  parseFeedThreadId,
} from '../lib/feedThread';
import { attachFeedItemLikes, mergeFeedLikeState, syncLocalFeedLikesToServer, toggleFeedUpvote } from '../lib/feedLikes';
import {
  findCachedThreadByFeedId,
  setCachedThreadItem,
  patchCachedFeedItem,
  shouldSyncLocalLikes,
} from '../lib/feedSessionCache';
import { savePost, unsavePost } from '../lib/socialFeedApi';
import { useToast } from '../components/Toast';

function seedFromNavigation(feedId, locationState) {
  const likeSeed = locationState?.feedLike || null;
  const fromState = locationState?.feedItem;
  if (fromState?.id) {
    return mergeFeedLikeState(fromState, likeSeed);
  }
  const fromCache = findCachedThreadByFeedId(feedId, parseFeedThreadId);
  if (fromCache) {
    return mergeFeedLikeState(fromCache, likeSeed);
  }
  return null;
}

/**
 * Reddit-style thread page: original feed item + inline comments.
 * Route: /thread/:feedId  (also used via /post/:id redirect)
 */
export default function ThreadPage() {
  const { feedId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user, profile, isAuthenticated, loading: authLoading } = useAuth();
  const likeSeed = location.state?.feedLike || null;

  const [item, setItem] = useState(() => seedFromNavigation(feedId, location.state));
  const [loading, setLoading] = useState(() => !seedFromNavigation(feedId, location.state));
  const [sharePost, setSharePost] = useState(null);
  const loadedKeyRef = useRef(null);

  // Reset seed when navigating to a different thread
  useEffect(() => {
    const seeded = seedFromNavigation(feedId, location.state);
    loadedKeyRef.current = null;
    if (seeded) {
      setItem(seeded);
      setLoading(false);
    } else {
      setItem(null);
      setLoading(true);
    }
    // location.state intentionally read once per feedId change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedId]);

  useEffect(() => {
    if (authLoading) return undefined;

    let alive = true;
    const parsed = parseFeedThreadId(feedId);
    const loadKey = parsed?.shortId || parsed?.id || feedId;

    // Skip duplicate fetch when canonicalize only changes the slug shape
    if (loadedKeyRef.current === loadKey && item) {
      const canonical = threadPathForItem(item);
      const current = `/thread/${feedId}`;
      if (canonical && canonical !== current) {
        navigate(canonical, {
          replace: true,
          state: {
            ...(location.state || {}),
            feedItem: item,
            feedLike: {
              id: item.id,
              isLiked: !!item.isLiked,
              likes: item.likes || 0,
            },
          },
        });
      }
      return undefined;
    }

    const hasSeed = !!seedFromNavigation(feedId, location.state) || !!item;
    if (!hasSeed) setLoading(true);

    getThreadItem(feedId, user?.id)
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok || !res.item) {
          if (!hasSeed) {
            setItem(null);
            setLoading(false);
          }
          return;
        }

        const [hydrated] = await attachFeedItemLikes([res.item], user?.id);
        const [withComments] = await attachFeedItemCommentCounts([hydrated || res.item]);
        if (!alive) return;

        const next = mergeFeedLikeState(withComments || hydrated || res.item, likeSeed);
        loadedKeyRef.current = loadKey;
        setItem(next);
        setCachedThreadItem(next);
        setLoading(false);

        if (shouldSyncLocalLikes(user?.id)) {
          syncLocalFeedLikesToServer(user.id).catch(() => {});
        }

        const canonical = threadPathForItem(next);
        const current = `/thread/${feedId}`;
        if (canonical && canonical !== current) {
          navigate(canonical, {
            replace: true,
            state: {
              ...(location.state || {}),
              feedItem: next,
              feedLike: {
                id: next.id,
                isLiked: !!next.isLiked,
                likes: next.likes || 0,
              },
            },
          });
        }
      })
      .catch(() => {
        if (!alive) return;
        if (!hasSeed) {
          setItem(null);
          setLoading(false);
        }
      });

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedId, user?.id, authLoading]);

  const requireSignIn = () => {
    const path = item ? threadPathForItem(item) : `/thread/${feedId}`;
    window.location.href = `/auth?from=${encodeURIComponent(path)}`;
  };

  const handleLike = async (itemOrId) => {
    if (!isAuthenticated) {
      requireSignIn();
      return;
    }
    const target = typeof itemOrId === 'object' && itemOrId?.id ? itemOrId : item;
    if (!target?.id) return;
    const wasLiked = !!target.isLiked;
    const prevLikes = target.likes || 0;
    const nextLiked = !wasLiked;
    const nextLikes = wasLiked ? Math.max(0, prevLikes - 1) : prevLikes + 1;
    setItem((p) => {
      if (!p || p.id !== target.id) return p;
      return { ...p, isLiked: nextLiked, likes: nextLikes };
    });
    patchCachedFeedItem(target.id, { isLiked: nextLiked, likes: nextLikes });
    try {
      await toggleFeedUpvote(target, user.id);
    } catch (err) {
      console.error('[Thread] upvote failed:', err);
      setItem((p) => (p && p.id === target.id ? { ...p, isLiked: wasLiked, likes: prevLikes } : p));
      patchCachedFeedItem(target.id, { isLiked: wasLiked, likes: prevLikes });
      toast.error(err?.message || 'Could not save upvote. Try signing out and back in.');
    }
  };

  const handleSave = async (postId) => {
    if (!isAuthenticated) {
      requireSignIn();
      return;
    }
    if (!item || item.id !== postId) return;
    const wasSaved = item.isSaved;
    setItem((p) => ({ ...p, isSaved: !wasSaved }));
    try {
      if (wasSaved) await unsavePost(postId, user.id);
      else await savePost(postId, user.id);
    } catch {
      setItem((p) => ({ ...p, isSaved: wasSaved }));
    }
  };

  const handleCommentAdded = (postId, total) => {
    setItem((p) => {
      if (!p) return p;
      const next = total != null
        ? { ...p, comments: total }
        : { ...p, comments: (p.comments || 0) + 1 };
      setCachedThreadItem(next);
      patchCachedFeedItem(p.id, { comments: next.comments });
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center pt-20">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--color-theater)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center pt-20 px-4">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-[var(--color-text)] mb-2">Thread not found</h2>
          <p className="text-[var(--color-text-muted)] text-sm mb-4">This post may be private or no longer available.</p>
          <Link to="/" className="text-[var(--color-theater)] hover:underline">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const path = threadPathForItem(item);
  const scrollToComments = () => {
    document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderCard = () => {
    if (item.type === 'trailer') {
      return <FeedTrailerCard item={item} variant="thread" onShare={(p) => setSharePost(p)} onLike={handleLike} />;
    }
    if (item.type === 'tweet') {
      return <FeedTweetCard item={item} variant="thread" onShare={(p) => setSharePost(p)} onLike={handleLike} />;
    }
    if (item.type === 'article') {
      return (
        <FeedArticleCard
          item={item}
          variant="thread"
          onShare={(p) => setSharePost(p)}
          onLike={handleLike}
          onComment={scrollToComments}
        />
      );
    }
    if (item.type === 'activity') {
      return (
        <FeedActivityCard
          item={item}
          onOpenThread={() => {}}
          onLike={handleLike}
          onComment={scrollToComments}
          onShare={(p) => setSharePost(p)}
        />
      );
    }
    return (
      <FeedPostCard
        item={item}
        variant="thread"
        onOpenThread={() => {}}
        onLike={handleLike}
        onComment={scrollToComments}
        onShare={(p) => setSharePost(p)}
        onSave={handleSave}
      />
    );
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] pt-16 sm:pt-20 pb-12 sm:pb-16">
      <SeoHead
        title={item.title || item.content?.slice(0, 60) || 'Thread'}
        description={item.summary || item.content || 'Discussion on TheaterOrStream'}
        path={path}
      />

      <div className="max-w-[740px] mx-auto px-0 sm:px-3 md:px-5 min-h-[calc(100vh-4rem)]">
        <div className="md:rounded-xl overflow-hidden">
          {/* Header - fixed 44px touch target on mobile */}
          <div className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2 sm:py-2.5">
            <Link
              to="/"
              className="w-11 h-11 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-theater)]/40 shrink-0"
              aria-label="Back to feed"
            >
              <FaArrowLeft className="text-[14px]" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="text-[14px] sm:text-[16px] font-semibold text-[var(--color-text)] leading-tight truncate">
                TheaterOrStream
              </h1>
              <p className="text-[10px] sm:text-[11px] text-[var(--color-text-muted)] leading-tight mt-0.5">
                {item.comments || 0} {(item.comments || 0) === 1 ? 'comment' : 'comments'}
              </p>
            </div>
          </div>

          <div className="pb-1 sm:pb-2">
            {renderCard()}
          </div>

          <FeedCommentThread
            item={item}
            user={user}
            profile={profile}
            isAuthenticated={isAuthenticated}
            onRequireSignIn={requireSignIn}
            onCommentAdded={handleCommentAdded}
          />
        </div>
      </div>

      {sharePost && (
        <FeedShareModal post={sharePost} onClose={() => setSharePost(null)} />
      )}
    </div>
  );
}
