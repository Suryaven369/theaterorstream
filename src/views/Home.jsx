import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { FaFilm, FaHome, FaMagic } from "react-icons/fa";
import { useNavigate, useSearchParams } from "react-router-dom";
import WatchPage from "./WatchPage";
import FollowingFeed from "../components/discover/FollowingFeed";
import FeedPostCard from "../components/social/FeedPostCard";
import FeedTrailerCard from "../components/social/FeedTrailerCard";
import FeedArticleCard from "../components/social/FeedArticleCard";
import FeedTweetCard from "../components/social/FeedTweetCard";
import FeedActivityCard from "../components/social/FeedActivityCard";
import FeedComposer from "../components/social/FeedComposer";
import FeedCommentModal from "../components/social/FeedCommentModal";
import FeedShareModal from "../components/social/FeedShareModal";
import HomeSocialSidebar from "../components/home/HomeSocialSidebar";
import HomeBrowseTab from "../components/home/HomeBrowseTab";
import { getSavedRegion, persistRegion } from "../constants/regions";
import { getTrailersFromEdge, getRssTrailersFromEdge, getArticlesFromEdge } from "../lib/contentEdgeApi";
import { getAllUserRatings, getHomepageSections, getOfficialProfile } from "../lib/supabase";
import { computeOverallFromRatingRow } from "../lib/ratingUtils";
import { setHomepageSections, setUserRatedMovies, invalidateHomepageSections } from "../store/movieSlice";
import { useAuth } from "../context/AuthContext";
import { savePost, unsavePost, getFeedPosts, updatePost, deletePost } from "../lib/socialFeedApi";
import { attachFeedItemLikes, syncLocalFeedLikesToServer, toggleFeedUpvote } from "../lib/feedLikes";
import { attachFeedItemCommentCounts, threadPathForItem } from "../lib/feedThread";
import {
  getCachedFeed,
  setCachedFeed,
  patchCachedFeedItem,
  setCachedThreadItem,
  shouldSyncLocalLikes,
  isFeedStale,
} from "../lib/feedSessionCache";
import ConfirmationModal from "../components/ConfirmationModal";
import { useToast } from "../components/Toast";

const VALID_TABS = ['home', 'explore', 'watch'];

/** Legacy ?tab=my-feed → explore */
function normalizeHomeTab(tab) {
  if (tab === 'my-feed') return 'explore';
  return VALID_TABS.includes(tab) ? tab : 'home';
}

const SECTIONS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const SECTIONS_REV_KEY = 'homepage_sections_rev';

const FeedSkeleton = ({ count = 5 }) => (
  <div className="space-y-3" aria-hidden="true">
    {Array.from({ length: count }, (_, i) => {
      const thumb = i % 2 === 0;
      const lines = thumb ? 2 : 3;
      return (
        <div
          key={i}
          className="bg-[#1a1d1f] rounded-lg border border-white/5 overflow-hidden"
        >
          <div className="flex items-center gap-2 p-3 pb-2">
            <div className="w-8 h-8 rounded-full bg-white/[0.07] animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-white/[0.07] animate-pulse rounded w-28" />
              <div className="h-2.5 bg-white/[0.04] animate-pulse rounded w-20" />
            </div>
          </div>
          {thumb && <div className="aspect-video bg-white/[0.05] animate-pulse" />}
          <div className="px-3 py-2.5 space-y-2">
            {Array.from({ length: lines }, (_, j) => (
              <div key={j} className={`h-3 bg-white/[0.06] animate-pulse rounded ${j === lines - 1 ? 'w-3/5' : 'w-full'}`} />
            ))}
          </div>
          <div className="px-3 pb-2.5 flex gap-3">
            <div className="h-4 w-12 bg-white/[0.05] animate-pulse rounded-full" />
            <div className="h-4 w-12 bg-white/[0.05] animate-pulse rounded-full" />
          </div>
        </div>
      );
    })}
  </div>
);

const Home = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, profile, isAuthenticated, loading: authLoading } = useAuth();
  const cachedSections = useSelector((state) => state.movieData.homepageSections);
  const cachedTimestamp = useSelector((state) => state.movieData.homepageSectionsTimestamp);

  const requireSignIn = () => {
    navigate('/auth', { state: { from: '/' } });
  };

  // Main tab state — synced to the URL (?tab=) so browser back returns to the
  // tab the user was on (e.g. opening a movie from Watch and hitting Back).
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const activeTab = normalizeHomeTab(urlTab);

  const setActiveTab = (tab) => {
    const nextTab = normalizeHomeTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextTab === 'home') next.delete('tab');
      else next.set('tab', nextTab);
      return next;
    }, { replace: true });
  };

  // Feed state for social interactions
  // Initialize from cache immediately to avoid flash of skeleton on page reload
  const [feedItems, setFeedItems] = useState(() => {
    const cached = getCachedFeed('all', true);
    return cached?.items?.length ? cached.items : [];
  });
  const [feedInitialLoading, setFeedInitialLoading] = useState(() => {
    const cached = getCachedFeed('all', true);
    return !cached?.items?.length;
  });
  // Track which item IDs have already entered the DOM so we only animate truly new items.
  const appearedIds = React.useRef(new Set());
  const [commentModalPost, setCommentModalPost] = useState(null);
  const [shareModalPost, setShareModalPost] = useState(null);

  // Per-post "..." menu + inline edit state
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [postToDelete, setPostToDelete] = useState(null);
  const [deletingPost, setDeletingPost] = useState(false);

  const [selectedRegion, setSelectedRegion] = useState(getSavedRegion);
  const [cmsSections, setCmsSections] = useState(cachedSections || []);
  const [loadingSections, setLoadingSections] = useState(!cachedSections);

  // Infinite scroll / scope (must stay with other hooks — never after a conditional return)
  const FEED_PAGE_SIZE = 30;
  const [feedOffset, setFeedOffset] = useState(0);
  const [hasMoreFeed, setHasMoreFeed] = useState(true);
  const [loadingMoreFeed, setLoadingMoreFeed] = useState(false);
  const loadMoreSentinelRef = React.useRef(null);
  // 'all' = everyone; 'following' = only people you follow
  const [feedScope, setFeedScope] = useState('all');

  // Keep local sections in sync when Redux cache is patched
  useEffect(() => {
    if (cachedSections) {
      setCmsSections(cachedSections);
    }
  }, [cachedSections]);

  // Load movies the signed-in user has rated
  useEffect(() => {
    const loadUserRatings = async () => {
      if (!user?.id) {
        dispatch(setUserRatedMovies({}));
        return;
      }

      const ratings = await getAllUserRatings(user.id);
      const ratedMap = {};

      ratings.forEach((rating) => {
        const score = computeOverallFromRatingRow(rating);
        if (score != null) {
          ratedMap[String(rating.movie_id)] = { score };
        }
      });

      dispatch(setUserRatedMovies(ratedMap));
    };

    loadUserRatings();

    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") loadUserRatings();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [user?.id, dispatch]);

  // Fetch My Feed sections from Supabase (skip edge CDN so admin publishes show immediately)
  useEffect(() => {
    const now = Date.now();
    // My Feed: treat cache as stale after 15s so Save & Publish shows up without a full reload.
    // Other tabs: keep the longer TTL.
    const ttl = activeTab === 'explore' ? 15_000 : SECTIONS_CACHE_TTL;
    const isCacheValid = cachedSections && cachedTimestamp && (now - cachedTimestamp < ttl);

    if (isCacheValid) {
      setCmsSections(cachedSections);
      setLoadingSections(false);
      return;
    }

    let cancelled = false;
    const fetchCmsSections = async () => {
      setLoadingSections(true);
      try {
        const sections = await getHomepageSections(true);
        if (cancelled) return;
        setCmsSections(sections || []);
        dispatch(setHomepageSections(sections || []));
      } catch (err) {
        console.error('Failed to load homepage sections', err);
        if (!cancelled) setCmsSections(cachedSections || []);
      } finally {
        if (!cancelled) setLoadingSections(false);
      }
    };
    fetchCmsSections();
    return () => { cancelled = true; };
  }, [cachedSections, cachedTimestamp, dispatch, activeTab]);

  // After admin Save/Fetch in another tab, refresh when this window is focused
  useEffect(() => {
    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const rev = localStorage.getItem(SECTIONS_REV_KEY);
        if (rev && rev !== window.__tosSectionsRev) {
          window.__tosSectionsRev = rev;
          dispatch(invalidateHomepageSections());
        }
      } catch { /* ignore */ }
    };
    refreshIfStale();
    window.addEventListener('focus', refreshIfStale);
    document.addEventListener('visibilitychange', refreshIfStale);
    window.addEventListener('storage', refreshIfStale);
    return () => {
      window.removeEventListener('focus', refreshIfStale);
      document.removeEventListener('visibilitychange', refreshIfStale);
      window.removeEventListener('storage', refreshIfStale);
    };
  }, [dispatch]);

  const getItemSortTime = (item) => {
    const raw = item.createdAt || item.publishedAt;
    return raw ? new Date(raw).getTime() : 0;
  };

  const sortByRecency = (items) =>
    [...items].sort((a, b) => getItemSortTime(b) - getItemSortTime(a));

  const mapTrailer = (m, officialUser = null) => ({
    id: `trailer-${m.tmdb_id ?? m.id}`,
    type: 'trailer',
    tmdb_id: m.tmdb_id ?? m.id,
    title: m.title || m.name,
    mediaType: m.media_type,
    releaseDate: m.release_date || m.first_air_date,
    thumbnail: m.featured_trailer.thumbnail,
    thumbnailFallback: m.featured_trailer.thumbnailFallback,
    trailerUrl: m.featured_trailer.url,
    trailerName: m.featured_trailer.name,
    publishedAt: m.featured_trailer.published_at,
    sourceName: m.source_name || null,
    sourceLogo: m.source_logo || null,
    user: officialUser,
    likes: 0,
    isLiked: false,
    comments: 0,
  });

  const mapArticle = (a, officialUser = null) => {
    const link = a.link || '';
    const twitter = /nitter\.|\/\/(?:www\.)?(?:twitter|x)\.com\b/i.test(link);
    return {
      id: `article-${a.id}`,
      type: twitter ? 'tweet' : 'article',
      title: a.title,
      sourceName: a.source_name,
      sourceLogo: a.source_logo_url,
      imageUrl: a.image_url,
      summary: a.summary,
      summaryItems: Array.isArray(a.summary_items) ? a.summary_items : null,
      publishedAt: a.published_at,
      link,
      // Tweets stay attributed to the X account (e.g. DiscussingFilm), not TheaterOrStream.
      user: twitter ? null : officialUser,
      likes: 0,
      isLiked: false,
      comments: 0,
    };
  };

  // Load real public posts and show them above the seed feed
  // When the user updates their avatar (or username), patch their cards in-place
  // so home feed / composer stay in sync without a full reload.
  useEffect(() => {
    if (!user?.id || !profile) return;
    setFeedItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.user?.id !== user.id) return item;
        const nextUser = {
          ...item.user,
          avatarUrl: profile.avatar_url || item.user.avatarUrl || null,
          name: profile.display_name || profile.username || item.user.name,
          username: profile.username || item.user.username,
          isVerified: !!profile.is_verified,
        };
        if (
          nextUser.avatarUrl === item.user.avatarUrl
          && nextUser.name === item.user.name
          && nextUser.username === item.user.username
        ) {
          return item;
        }
        changed = true;
        return { ...item, user: nextUser };
      });
      return changed ? next : prev;
    });
  }, [user?.id, profile?.avatar_url, profile?.username, profile?.display_name, profile?.is_verified]);

  // Stale-while-revalidate: show cached data instantly, refresh in background.
  // Don't block on auth for initial render - use cached/public data first.
  useEffect(() => {
    let cancelled = false;

    // Try to restore from cache immediately (including localStorage on reload)
    const cached = getCachedFeed(feedScope, true); // allowStale=true
    if (cached?.items?.length) {
      setFeedItems(cached.items);
      setFeedOffset(cached.offset);
      setHasMoreFeed(cached.hasMore);
      setFeedInitialLoading(false);
    } else {
      setFeedInitialLoading(true);
      setFeedOffset(0);
      setHasMoreFeed(true);
      appearedIds.current.clear();
    }

    // If auth is still loading, we already showed cached data above.
    // Schedule refresh once auth settles.
    if (authLoading) {
      return () => { cancelled = true; };
    }

    // Skip network fetch if cache is fresh (not stale)
    if (cached?.items?.length && !isFeedStale(feedScope)) {
      return () => { cancelled = true; };
    }

    const loadFeed = async () => {
      try {
        const postsPromise = getFeedPosts({
          limit: FEED_PAGE_SIZE,
          userId: user?.id,
          mode: feedScope,
        });

        const extrasPromise = feedScope === 'all'
          ? Promise.all([
              getRssTrailersFromEdge({ daysBack: 21, limit: 15 }),
              getTrailersFromEdge({ sortBy: 'recent', daysBack: 14, type: 'launch', limit: 15 }),
              getArticlesFromEdge({ limit: 20 }),
              getOfficialProfile(),
            ])
          : Promise.resolve([null, null, [], null]);

        const [postsRes, [rss, lib, articlesRaw, officialProfile]] = await Promise.all([postsPromise, extrasPromise]);
        if (cancelled) return;

        const officialUser = officialProfile
          ? {
              id: officialProfile.id,
              name: officialProfile.display_name || officialProfile.username || 'TheaterOrStream',
              username: officialProfile.username,
              avatarUrl: officialProfile.avatar_url || null,
              isVerified: !!officialProfile.is_verified,
            }
          : null;

        const posts = (postsRes.ok ? postsRes.items : [])
          .filter((p) => p && p.id != null && p.user);

        const byId = new Map();
        if (feedScope === 'all') {
          for (const m of (rss?.data || [])) {
            if (m.featured_trailer?.key) byId.set(String(m.tmdb_id ?? m.id), mapTrailer(m, officialUser));
          }
          for (const m of (lib?.data || [])) {
            const key = String(m.tmdb_id ?? m.id);
            if (m.featured_trailer?.key && !byId.has(key)) byId.set(key, mapTrailer(m, officialUser));
          }
        }
        const trailers = [...byId.values()];
        const articles = (articlesRaw || []).map((a) => mapArticle(a, officialUser));

        const merged = sortByRecency([...posts, ...trailers, ...articles]);
        const withLikes = await attachFeedItemLikes(merged, user?.id);
        const withComments = await attachFeedItemCommentCounts(withLikes);
        if (cancelled) return;
        setFeedItems(withComments);
        setFeedOffset(posts.length);
        setHasMoreFeed(posts.length >= FEED_PAGE_SIZE);
        setCachedFeed(feedScope, {
          items: withComments,
          offset: posts.length,
          hasMore: posts.length >= FEED_PAGE_SIZE,
        });
        if (shouldSyncLocalLikes(user?.id)) {
          syncLocalFeedLikesToServer(user.id).catch(() => {});
        }
      } catch (err) {
        console.error('[Home] loadFeed failed:', err);
        if (!cancelled && !getCachedFeed(feedScope, true)?.items?.length) setFeedItems([]);
      } finally {
        if (!cancelled) setFeedInitialLoading(false);
      }
    };

    loadFeed();
    return () => { cancelled = true; };
  }, [authLoading, user?.id, feedScope]);

  // Instagram-style infinite scroll: fetch the next page of real posts as the
  // sentinel below the feed scrolls into view, rather than a "Load More" button.
  const loadMorePosts = React.useCallback(async () => {
    if (feedInitialLoading || loadingMoreFeed || !hasMoreFeed) return;
    setLoadingMoreFeed(true);
    try {
      const res = await getFeedPosts({ limit: FEED_PAGE_SIZE, offset: feedOffset, userId: user?.id, mode: feedScope });
      if (!res.ok) {
        setHasMoreFeed(false);
        return;
      }
      setFeedOffset((prev) => prev + res.items.length);
      if (res.items.length < FEED_PAGE_SIZE) setHasMoreFeed(false);

      const safeItems = res.items.filter((p) => p && p.id != null && p.user);
      if (safeItems.length) {
        setFeedItems((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const fresh = safeItems.filter((p) => !existingIds.has(p.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      }
    } catch (err) {
      console.error('[Home] loadMorePosts failed:', err);
      setHasMoreFeed(false);
    }
    setLoadingMoreFeed(false);
  }, [feedInitialLoading, loadingMoreFeed, hasMoreFeed, feedOffset, user?.id, feedScope]);

  useEffect(() => {
    const el = loadMoreSentinelRef.current;
    if (!el || feedInitialLoading) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMorePosts();
      },
      { rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMorePosts, feedInitialLoading]);

  const handleRegionSelect = (region) => {
    setSelectedRegion(region);
    persistRegion(region);
  };

  // ---- Edit / delete own posts ----
  const startEditPost = (item) => {
    setOpenMenuId(null);
    setEditingId(item.id);
    setEditText(item.content || '');
  };

  const cancelEditPost = () => {
    setEditingId(null);
    setEditText('');
  };

  const saveEditPost = async (item) => {
    if (savingEdit) return;
    if (!editText.trim()) return;
    setSavingEdit(true);
    const res = await updatePost(item.id, user?.id, { content: editText });
    if (res.ok) {
      setFeedItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, content: editText.trim() } : p)));
      cancelEditPost();
    }
    setSavingEdit(false);
  };

  const requestDeletePost = (item) => {
    setOpenMenuId(null);
    setPostToDelete(item);
  };

  const confirmDeletePost = async () => {
    if (!postToDelete || deletingPost) return;
    const item = postToDelete;
    setDeletingPost(true);
    const snapshot = feedItems;
    setFeedItems((prev) => prev.filter((p) => p.id !== item.id));
    setPostToDelete(null);
    const res = await deletePost(item.id, user?.id);
    if (!res.ok) {
      setFeedItems(snapshot);
    }
    setDeletingPost(false);
  };

  // Handle upvote / like for every feed item type (post, article, tweet, trailer)
  const handleLike = async (itemOrId) => {
    if (!isAuthenticated) {
      requireSignIn();
      return;
    }
    const postId = typeof itemOrId === 'object' && itemOrId != null
      ? itemOrId.id
      : itemOrId;
    if (postId == null) return;

    const baseline = feedItems.find((p) => p.id === postId);
    if (!baseline) return;

    const wasLiked = !!baseline.isLiked;
    const prevLikes = baseline.likes || 0;

    setFeedItems((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, isLiked: !wasLiked, likes: wasLiked ? Math.max(0, prevLikes - 1) : prevLikes + 1 }
          : p,
      ),
    );
    patchCachedFeedItem(postId, {
      isLiked: !wasLiked,
      likes: wasLiked ? Math.max(0, prevLikes - 1) : prevLikes + 1,
    });

    try {
      const result = await toggleFeedUpvote(baseline, user.id);
      // Keep UI aligned with what was actually persisted (local and/or server)
      if (result && typeof result.liked === 'boolean') {
        setFeedItems((prev) =>
          prev.map((p) => {
            if (p.id !== postId) return p;
            const liked = result.liked;
            // Avoid double-counting if optimistic already applied
            if (!!p.isLiked === liked) return p;
            const next = {
              ...p,
              isLiked: liked,
              likes: liked ? (p.likes || 0) + 1 : Math.max(0, (p.likes || 0) - 1),
            };
            patchCachedFeedItem(postId, { isLiked: next.isLiked, likes: next.likes });
            return next;
          }),
        );
      }
    } catch (error) {
      console.error('[Home] upvote failed:', error);
      setFeedItems((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isLiked: wasLiked, likes: prevLikes } : p,
        ),
      );
      patchCachedFeedItem(postId, { isLiked: wasLiked, likes: prevLikes });
      toast.error(error?.message || 'Could not save upvote. Try signing out and back in.');
    }
  };

  // Handle save/unsave
  const handleSave = async (postId) => {
    if (!isAuthenticated) {
      requireSignIn('Sign in to save posts.');
      return;
    }
    const post = feedItems.find(p => p.id === postId);
    if (!post) return;

    // Optimistic update
    setFeedItems(prev => prev.map(p => 
      p.id === postId ? { ...p, isSaved: !p.isSaved } : p
    ));

    try {
      if (post.isSaved) {
        await unsavePost(postId, user?.id);
      } else {
        await savePost(postId, user?.id);
      }
    } catch (error) {
      setFeedItems(prev => prev.map(p => 
        p.id === postId ? { ...p, isSaved: post.isSaved } : p
      ));
    }
  };

  const handleShare = (post) => {
    setShareModalPost(post);
  };

  const openComments = (post) => {
    setCommentModalPost(post);
  };

  const handleComposerPostCreated = (newItem) => {
    setFeedItems((prev) => [newItem, ...prev]);
  };

  const handleComposerFeedReload = (reloadItems) => {
    setFeedItems((prev) => {
      const reloadIds = new Set(reloadItems.map((p) => p.id));
      // Keep items not in the reload batch (trailers, articles, older posts)
      const rest = prev.filter((p) => !reloadIds.has(p.id) && !String(p.id).startsWith('local-'));
      // Merge and re-sort by time to maintain proper chronological order
      return sortByRecency([...reloadItems, ...rest]);
    });
  };

  const handleCommentAdded = (postId, total) => {
    setFeedItems((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        if (total != null) return { ...p, comments: total };
        return { ...p, comments: (p.comments || 0) + 1 };
      }),
    );
  };

  const openThread = (item) => {
    if (!item?.id) return;
    // Prefer the live feed row so an upvote just tapped is carried into the thread.
    const latest = feedItems.find((p) => p.id === item.id) || item;
    setCachedThreadItem(latest);
    navigate(threadPathForItem(latest), {
      state: {
        feedItem: latest,
        feedLike: {
          id: latest.id,
          isLiked: !!latest.isLiked,
          likes: latest.likes || 0,
        },
      },
    });
  };

  const renderFeedItem = (item) => {
    if (item.type === 'trailer') {
      return (
        <FeedTrailerCard
          key={item.id}
          item={item}
          onOpenThread={openThread}
          onShare={handleShare}
          onLike={handleLike}
        />
      );
    }
    if (item.type === 'tweet') {
      return (
        <FeedTweetCard
          key={item.id}
          item={item}
          onOpenThread={openThread}
          onShare={handleShare}
          onLike={handleLike}
        />
      );
    }
    if (item.type === 'article') {
      return (
        <FeedArticleCard
          key={item.id}
          item={item}
          onOpenThread={openThread}
          onShare={handleShare}
          onLike={handleLike}
        />
      );
    }
    if (item.type === 'activity') {
      return (
        <FeedActivityCard
          key={item.id}
          item={item}
          onLike={handleLike}
          onOpenComments={openComments}
          onOpenThread={openThread}
          onShare={handleShare}
        />
      );
    }
    return (
      <FeedPostCard
        key={item.id}
        item={item}
        currentUserId={user?.id}
        openMenuId={openMenuId}
        onToggleMenu={setOpenMenuId}
        editingId={editingId}
        editText={editText}
        onEditTextChange={setEditText}
        savingEdit={savingEdit}
        onStartEdit={startEditPost}
        onCancelEdit={cancelEditPost}
        onSaveEdit={saveEditPost}
        onDelete={requestDeletePost}
        onLike={handleLike}
        onSave={handleSave}
        onShare={handleShare}
        onOpenComments={openComments}
        onOpenThread={openThread}
      />
    );
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Main Tabs - At the top */}
      <section className="pt-[calc(4.5rem+env(safe-area-inset-top,0px))] sm:pt-24 px-3 sm:px-8 md:px-8 lg:pl-16">
        <div className="container mx-auto">
          <div className="flex items-center gap-1 sm:gap-2 border-b border-white/10 overflow-x-auto scrollbar-hide -mx-1 px-1">
            <button
              onClick={() => setActiveTab('home')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2.5 sm:py-3 text-sm font-medium border-b-2 transition-colors shrink-0 ${
                activeTab === 'home'
                  ? 'border-[var(--accent-green)] text-white'
                  : 'border-transparent text-white/50 hover:text-white'
              }`}
            >
              <FaHome className="text-sm" />
              Home
            </button>
            <button
              onClick={() => setActiveTab('explore')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2.5 sm:py-3 text-sm font-medium border-b-2 transition-colors shrink-0 ${
                activeTab === 'explore'
                  ? 'border-[var(--accent-green)] text-white'
                  : 'border-transparent text-white/50 hover:text-white'
              }`}
            >
              <FaFilm className="text-sm" />
              Explore
            </button>
            <button
              onClick={() => setActiveTab('watch')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2.5 sm:py-3 text-sm font-medium border-b-2 transition-colors shrink-0 ${
                activeTab === 'watch'
                  ? 'border-[var(--accent-green)] text-white'
                  : 'border-transparent text-white/50 hover:text-white'
              }`}
            >
              <FaMagic className="text-sm" />
              Watch
            </button>
          </div>
        </div>
      </section>

      {/* Tab Content */}
      {activeTab === 'watch' ? (
        /* ============================================ */
        /* WATCH - Personalized recommendation engine  */
        /* ============================================ */
        <WatchPage embedded />
      ) : activeTab === 'home' ? (
        /* ============================================ */
        /* HOME - Social Feed (Reddit/Instagram Style) */
        /* ============================================ */
        <section className="px-3 sm:px-8 py-4 sm:py-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Spacer */}
              <div className="hidden lg:block lg:col-span-2" />
              
              {/* Main Feed — phone/iPad centered column feels more app-like */}
              <div className="lg:col-span-6 space-y-3 max-w-xl mx-auto lg:max-w-none w-full">
                <FeedComposer
                  isAuthenticated={isAuthenticated}
                  user={user}
                  profile={profile}
                  feedScope={feedScope}
                  onRequireSignIn={requireSignIn}
                  onPostCreated={handleComposerPostCreated}
                  onFeedReload={handleComposerFeedReload}
                />

                {/* Scope toggle: Everyone vs the people you follow */}
                {user?.id && (
                  <div className="flex items-center gap-1.5 bg-[#1a1d1f] rounded-full border border-white/5 p-1 w-fit">
                    {[['all', 'Everyone'], ['following', 'Following']].map(([s, label]) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFeedScope(s)}
                        className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${feedScope === s ? 'bg-[var(--accent-green)] text-[#14181c]' : 'text-white/60 hover:text-white'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Topics you follow (directors / genres / franchises) — new releases */}
                {feedScope === 'following' && <FollowingFeed />}

                {/* Feed Items — skeleton only when no cached data and still loading */}
                {feedInitialLoading && feedItems.length === 0 ? (
                  <FeedSkeleton count={6} />
                ) : (
                  <>
                    {feedScope === 'following' && feedItems.length === 0 && !loadingMoreFeed && (
                      <div className="text-center py-12 rounded-xl border border-dashed border-white/10 bg-[#1a1d1f]">
                        <p className="text-sm text-white/60">Nothing from people or tags you follow yet.</p>
                        <p className="text-xs text-white/40 mt-1">
                          Follow users or{' '}
                          <a href="/tags" className="text-orange-400 hover:underline">hashtags</a>
                          {' '}to see matching posts here.
                        </p>
                      </div>
                    )}
                    {feedItems.map((item, index) => {
                      const isNew = !appearedIds.current.has(item.id);
                      if (isNew) appearedIds.current.add(item.id);
                      return (
                        <div
                          key={item.id}
                          style={isNew ? {
                            animation: 'feed-in 0.38s ease both',
                            animationDelay: `${Math.min(index, 8) * 65}ms`,
                          } : undefined}
                        >
                          {renderFeedItem(item)}
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Infinite scroll sentinel — loads the next page of posts as it scrolls into view */}
                {!feedInitialLoading && hasMoreFeed && feedItems.length > 0 ? (
                  <div ref={loadMoreSentinelRef} className="py-2">
                    {loadingMoreFeed && <FeedSkeleton count={2} />}
                  </div>
                ) : !feedInitialLoading && !hasMoreFeed && feedItems.length > 0 ? (
                  <p className="text-center text-xs text-white/30 py-6">You're all caught up</p>
                ) : null}
              </div>

              <HomeSocialSidebar />
            </div>
          </div>
        </section>
      ) : (
        <HomeBrowseTab
          selectedRegion={selectedRegion}
          onRegionSelect={handleRegionSelect}
          cmsSections={cmsSections}
          loadingSections={loadingSections}
        />
      )}

      {commentModalPost && (
        <FeedCommentModal
          post={commentModalPost}
          user={user}
          profile={profile}
          isAuthenticated={isAuthenticated}
          onRequireSignIn={requireSignIn}
          onClose={() => setCommentModalPost(null)}
          onCommentAdded={handleCommentAdded}
        />
      )}

      {shareModalPost && (
        <FeedShareModal post={shareModalPost} onClose={() => setShareModalPost(null)} />
      )}

      <ConfirmationModal
        isOpen={!!postToDelete}
        onClose={() => !deletingPost && setPostToDelete(null)}
        onConfirm={confirmDeletePost}
        title="Delete post"
        message="Are you sure you want to delete this post? This cannot be undone."
        confirmText={deletingPost ? 'Deleting…' : 'Delete'}
      />
    </div>
  );
};

export default Home;
