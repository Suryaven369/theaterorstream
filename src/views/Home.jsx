import React, { useState, useEffect, lazy, Suspense } from "react";
import { useSelector, useDispatch } from "react-redux";
import { FaFilm, FaHome, FaMagic } from "react-icons/fa";
import { useNavigate, useSearchParams } from "react-router-dom";
import FollowingFeed from "../components/discover/FollowingFeed";
import FeedPostCard from "../components/social/FeedPostCard";
import FeedTrailerCard from "../components/social/FeedTrailerCard";
import FeedArticleCard from "../components/social/FeedArticleCard";
import FeedBlogCard from "../components/social/FeedBlogCard";
import FeedTweetCard from "../components/social/FeedTweetCard";
import FeedActivityCard from "../components/social/FeedActivityCard";
import FeedComposer from "../components/social/FeedComposer";
import FeedCommentModal from "../components/social/FeedCommentModal";
import FeedShareModal from "../components/social/FeedShareModal";
import HomeSocialSidebar from "../components/home/HomeSocialSidebar";
import { getSavedRegion, persistRegion } from "../constants/regions";
import { getRssTrailersFromEdge, getArticlesFromEdge } from "../lib/contentEdgeApi";
import { getAllUserRatings, getHomepageSections, getOfficialProfile } from "../lib/supabase";
import { getRecentPublicBlogs } from "../lib/blogs";
import { computeOverallFromRatingRow } from "../lib/ratingUtils";
import { setHomepageSections, setUserRatedMovies, invalidateHomepageSections } from "../store/movieSlice";
import { useAuth } from "../context/AuthContext";
import { savePost, unsavePost, getFeedPosts, updatePost, deletePost, votePoll } from "../lib/socialFeedApi";
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

const WatchPage = lazy(() => import("./WatchPage"));
const HomeBrowseTab = lazy(() => import("../components/home/HomeBrowseTab"));

const VALID_TABS = ['home', 'explore', 'watch'];

/** Legacy ?tab=my-feed → explore */
function normalizeHomeTab(tab) {
  if (tab === 'my-feed') return 'explore';
  return VALID_TABS.includes(tab) ? tab : 'home';
}

const SECTIONS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const SECTIONS_REV_KEY = 'homepage_sections_rev';

const FeedSkeleton = ({ count = 5 }) => (
  <div className="divide-y divide-[var(--color-border)]" aria-hidden="true">
    {Array.from({ length: count }, (_, i) => {
      const thumb = i % 2 === 0;
      const lines = thumb ? 2 : 3;
      return (
        <div key={i} className="px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="flex items-center gap-2 pb-2">
            <div className="w-8 h-8 rounded-full bg-white/[0.07] animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-white/[0.07] animate-pulse rounded w-28" />
              <div className="h-2.5 bg-white/[0.04] animate-pulse rounded w-20" />
            </div>
          </div>
          {thumb && <div className="aspect-video bg-white/[0.05] animate-pulse rounded-lg mb-2" />}
          <div className="space-y-2 py-1">
            {Array.from({ length: lines }, (_, j) => (
              <div key={j} className={`h-3 bg-white/[0.06] animate-pulse rounded ${j === lines - 1 ? 'w-3/5' : 'w-full'}`} />
            ))}
          </div>
          <div className="pt-2 flex gap-3">
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
  const { user, profile, isAuthenticated, sessionReady } = useAuth();
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
      // Mood/OTT filters belong to Watch only — drop them when leaving the tab.
      if (nextTab !== 'watch') {
        next.delete('mood');
        next.delete('ott');
      }
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
  const [pollVotingId, setPollVotingId] = useState(null);

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

  // Load ratings when Explore/Watch need them — not on every Home feed mount
  useEffect(() => {
    if (activeTab !== 'explore' && activeTab !== 'watch') return undefined;

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
    return undefined;
  }, [user?.id, dispatch, activeTab]);

  // Fetch My Feed sections from Supabase (skip edge CDN so admin publishes show immediately)
  useEffect(() => {
    const now = Date.now();
    // 5 min TTL — admin publish still invalidates via realtime + focus rev key
    const isCacheValid = cachedSections && cachedTimestamp && (now - cachedTimestamp < SECTIONS_CACHE_TTL);

    if (isCacheValid) {
      setCmsSections(cachedSections);
      setLoadingSections(false);
      return;
    }

    let cancelled = false;
    const fetchCmsSections = async () => {
      // Keep showing cached posters while refreshing — don't blank to skeletons
      if (!cachedSections?.length) setLoadingSections(true);
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
    // Prefer feed/approval time (createdAt) so freshly approved RSS items rise to the top.
    const raw = item.createdAt || item.feedAt || item.publishedAt;
    return raw ? new Date(raw).getTime() : 0;
  };

  const sortByRecency = (items) =>
    [...items].sort((a, b) => getItemSortTime(b) - getItemSortTime(a));

  /** Keep own posts that landed optimistically while a slower feed fetch was in flight. */
  const mergePreservingOwnRecent = (fetched, previous, userId) => {
    if (!previous?.length) return fetched;
    const fetchedIds = new Set(fetched.map((i) => i.id));
    const keep = previous.filter((p) => {
      if (!p?.id || fetchedIds.has(p.id)) return false;
      if (String(p.id).startsWith('local-')) return true;
      if (!userId || p.user?.id !== userId) return false;
      const ts = getItemSortTime(p);
      return ts > 0 && Date.now() - ts < 120_000;
    });
    if (!keep.length) return fetched;
    return sortByRecency([...keep, ...fetched]);
  };

  const writeFeedCache = (items, { offset, hasMore } = {}) => {
    const cached = getCachedFeed(feedScope, true);
    setCachedFeed(feedScope, {
      items,
      offset: offset ?? cached?.offset ?? items.length,
      hasMore: hasMore ?? cached?.hasMore ?? true,
    });
  };

  const mapTrailer = (m, officialUser = null) => {
    const feedAt =
      m.featured_trailer?.feed_at ||
      m.updated_at ||
      m.featured_trailer?.published_at ||
      null;
    return {
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
      createdAt: feedAt,
      feedAt,
      sourceName: m.source_name || null,
      sourceLogo: m.source_logo || null,
      user: officialUser,
      likes: 0,
      isLiked: false,
      comments: 0,
    };
  };

  const mapArticle = (a, officialUser = null) => {
    const link = a.link || '';
    const twitter = /nitter\.|\/\/(?:www\.)?(?:twitter|x)\.com\b/i.test(link);
    const feedAt = a.updated_at || a.published_at || null;
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
      createdAt: feedAt,
      feedAt,
      link,
      // Tweets stay attributed to the X account (e.g. DiscussingFilm), not TheaterOrStream.
      user: twitter ? null : officialUser,
      likes: 0,
      isLiked: false,
      comments: 0,
    };
  };

  const mapBlogRow = (b) => {
    const profile = b.user_profiles || {};
    const excerpt = String(b.content || b.title || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280);
    return {
      id: `blog-${b.id}`,
      type: 'blog',
      blogId: b.id,
      title: b.title || 'Blog',
      excerpt,
      content: excerpt,
      imageUrl: b.cover_image || null,
      image: b.cover_image || null,
      publishedAt: b.updated_at || b.created_at,
      createdAt: b.created_at,
      likes: 0,
      isLiked: false,
      comments: 0,
      user: {
        id: b.user_id,
        name: profile.display_name || profile.username || 'Writer',
        username: profile.username || 'user',
        avatarUrl: profile.avatar_url || null,
        isVerified: !!profile.is_verified,
      },
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

    // Wait only for session (not full profile) so public feed isn't blocked
    if (!sessionReady) {
      return () => { cancelled = true; };
    }

    // Skip network fetch if cache is fresh — unless a list card is missing its cover
    // (older list posts were saved without image_url; need a refresh to hydrate posters).
    const listMissingCover = (cached?.items || []).some(
      (i) => i?.postType === 'list' && !i.image && !i.imageUrl,
    );
    if (cached?.items?.length && !isFeedStale(feedScope) && !listMissingCover) {
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
              // Use CDN cache (no fresh bust). Library /trailers scan is admin-only —
              // Home trailers come from trailer_posts via rss-trailers.
              getRssTrailersFromEdge({ daysBack: 21, limit: 15 }),
              getArticlesFromEdge({ limit: 20 }),
              getOfficialProfile(),
              getRecentPublicBlogs(12),
            ])
          : Promise.resolve([null, [], null, []]);

        const [postsRes, [rss, articlesRaw, officialProfile, blogsRaw]] = await Promise.all([postsPromise, extrasPromise]);
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
        }
        const trailers = [...byId.values()];
        // One card per tweet status URL (RSS can return the same post more than once).
        const seenTweetIds = new Set();
        const articles = [];
        for (const a of articlesRaw || []) {
          const mapped = mapArticle(a, officialUser);
          if (mapped.type === 'tweet') {
            const statusId = String(mapped.link || '').match(/\/status\/(\d+)/i)?.[1];
            if (statusId) {
              if (seenTweetIds.has(statusId)) continue;
              seenTweetIds.add(statusId);
            }
          }
          articles.push(mapped);
        }

        // Public blogs: prefer feed_posts cards; fill gaps from blog_posts table
        const blogIdsInPosts = new Set(
          posts.filter((p) => p.type === 'blog' && p.blogId).map((p) => String(p.blogId)),
        );
        const blogsFromTable = (blogsRaw || [])
          .filter((b) => b?.id && !blogIdsInPosts.has(String(b.id)))
          .map(mapBlogRow);

        const merged = sortByRecency([...posts, ...trailers, ...articles, ...blogsFromTable]);
        // Paint feed ASAP; likes/comments hydrate in parallel then patch
        setFeedItems((prev) => {
          const next = mergePreservingOwnRecent(merged, prev, user?.id);
          setCachedFeed(feedScope, {
            items: next,
            offset: posts.length,
            hasMore: posts.length >= FEED_PAGE_SIZE,
          });
          return next;
        });
        setFeedOffset(posts.length);
        setHasMoreFeed(posts.length >= FEED_PAGE_SIZE);
        setFeedInitialLoading(false);

        const [withLikes, withComments] = await Promise.all([
          attachFeedItemLikes(merged, user?.id),
          attachFeedItemCommentCounts(merged),
        ]);
        if (cancelled) return;
        // Merge like + comment fields onto the painted rows
        const likesById = new Map(withLikes.map((p) => [p.id, p]));
        const commentsById = new Map(withComments.map((p) => [p.id, p]));
        const hydrated = merged.map((p) => {
          const liked = likesById.get(p.id);
          const commented = commentsById.get(p.id);
          return {
            ...p,
            ...(liked ? { isLiked: liked.isLiked, likes: liked.likes } : {}),
            ...(commented ? { comments: commented.comments } : {}),
          };
        });
        setFeedItems((prev) => {
          const next = mergePreservingOwnRecent(hydrated, prev, user?.id);
          setCachedFeed(feedScope, {
            items: next,
            offset: posts.length,
            hasMore: posts.length >= FEED_PAGE_SIZE,
          });
          return next;
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
  }, [sessionReady, user?.id, feedScope]);

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
    if (item.canEdit === false || (item.editCount ?? 0) >= 1) {
      toast.error('You can only edit a post once.');
      return;
    }
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
      setFeedItems((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? {
                ...p,
                content: editText.trim(),
                editCount: Math.max(p.editCount ?? 0, 1),
                canEdit: false,
              }
            : p,
        ),
      );
      cancelEditPost();
    } else {
      toast.error(res.error || 'Could not save edit.');
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

  const handlePollVote = async (item, optionIndex) => {
    if (!isAuthenticated) {
      requireSignIn('Sign in to vote on polls.');
      return;
    }
    if (item.userPollVote !== null && item.userPollVote !== undefined) return;
    if (pollVotingId) return;

    setPollVotingId(item.id);
    const res = await votePoll(item.id, user.id, optionIndex);
    if (res.ok) {
      setFeedItems((prev) =>
        prev.map((p) => {
          if (p.id !== item.id || !p.pollData?.options) return p;
          const options = p.pollData.options.map((opt, i) => ({
            ...opt,
            votes: (opt.votes || 0) + (i === optionIndex ? 1 : 0),
          }));
          return { ...p, pollData: { options }, userPollVote: optionIndex };
        }),
      );
      patchCachedFeedItem(item.id, {
        pollData: {
          options: item.pollData.options.map((opt, i) => ({
            ...opt,
            votes: (opt.votes || 0) + (i === optionIndex ? 1 : 0),
          })),
        },
        userPollVote: optionIndex,
      });
    } else {
      toast.error(res.error || 'Could not record vote.');
    }
    setPollVotingId(null);
  };

  const openComments = (post) => {
    setCommentModalPost(post);
  };

  const handleComposerPostCreated = (newItem) => {
    setFeedItems((prev) => {
      const next = [newItem, ...prev.filter((p) => p.id !== newItem.id)];
      writeFeedCache(next);
      return next;
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
    if (item.type === 'blog') {
      return <FeedBlogCard key={item.id} item={item} />;
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
        onVotePoll={handlePollVote}
        pollVotingId={pollVotingId}
      />
    );
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Clears fixed site header; tab bar sticks directly under it while scrolling */}
      <div
        className="hidden lg:block h-24 shrink-0"
        aria-hidden
      />
      <section
        className="hidden lg:block sticky z-40 bg-[var(--bg-primary)]/95 backdrop-blur-md border-b border-white/10 px-3 sm:px-8 md:px-8 lg:pl-16 top-[calc(env(safe-area-inset-top,0px)+3.5rem)]"
      >
        <div className="container mx-auto">
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
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
        <div className="pt-[calc(3.5rem+env(safe-area-inset-top,0px))] lg:pt-0">
          <Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-[var(--accent-green)] border-t-transparent rounded-full" /></div>}>
            <WatchPage embedded />
          </Suspense>
        </div>
      ) : activeTab === 'home' ? (
        <section className="pt-[calc(4rem+env(safe-area-inset-top,0px))] lg:pt-0 px-0 sm:px-8 py-2 sm:py-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Spacer */}
              <div className="hidden lg:block lg:col-span-2" />
              
              {/* Main Feed — flat column with line dividers (X / Reddit style) */}
              <div className="lg:col-span-6 max-w-xl mx-auto lg:max-w-none w-full lg:border-x lg:border-[var(--color-border)]">
                {/* Scope toggle: Everyone vs the people you follow */}
                {user?.id && (
                  <div className="flex items-center gap-1.5 px-3 sm:px-4 py-2 border-b border-[var(--color-border)]">
                    {[['all', 'Everyone'], ['following', 'Following']].map(([s, label]) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFeedScope(s)}
                        className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${feedScope === s ? 'bg-[var(--accent-green)] text-[#14181c]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]/40'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <FeedComposer
                  isAuthenticated={isAuthenticated}
                  user={user}
                  profile={profile}
                  onRequireSignIn={requireSignIn}
                  onPostCreated={handleComposerPostCreated}
                />

                {/* Topics you follow (directors / genres / franchises) — new releases */}
                {feedScope === 'following' && (
                  <div className="border-b border-[var(--color-border)] px-3 sm:px-4 py-3">
                    <FollowingFeed />
                  </div>
                )}

                {/* Feed Items — skeleton only when no cached data and still loading */}
                {feedInitialLoading && feedItems.length === 0 ? (
                  <FeedSkeleton count={6} />
                ) : (
                  <>
                    {feedScope === 'following' && feedItems.length === 0 && !loadingMoreFeed && (
                      <div className="text-center py-12 px-4 border-b border-[var(--color-border)]">
                        <p className="text-sm text-[var(--color-text-secondary)]">Nothing from people or tags you follow yet.</p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">
                          Follow users or{' '}
                          <a href="/tags" className="text-[var(--color-theater)] hover:underline">hashtags</a>
                          {' '}to see matching posts here.
                        </p>
                      </div>
                    )}
                    <div className="divide-y divide-[var(--color-border)]">
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
                    </div>
                  </>
                )}

                {/* Infinite scroll sentinel — loads the next page of posts as it scrolls into view */}
                {!feedInitialLoading && hasMoreFeed && feedItems.length > 0 ? (
                  <div ref={loadMoreSentinelRef} className="py-2 border-t border-[var(--color-border)]">
                    {loadingMoreFeed && <FeedSkeleton count={2} />}
                  </div>
                ) : !feedInitialLoading && !hasMoreFeed && feedItems.length > 0 ? (
                  <p className="text-center text-xs text-[var(--color-text-muted)] py-6 border-t border-[var(--color-border)]">You're all caught up</p>
                ) : null}
              </div>

              <HomeSocialSidebar />
            </div>
          </div>
        </section>
      ) : (
        <section className="pt-[calc(4rem+env(safe-area-inset-top,0px))] lg:pt-0 px-3 sm:px-8 py-4 sm:py-6">
          <Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-[var(--accent-green)] border-t-transparent rounded-full" /></div>}>
            <HomeBrowseTab
              selectedRegion={selectedRegion}
              onRegionSelect={handleRegionSelect}
              cmsSections={cmsSections}
              loadingSections={loadingSections}
            />
          </Suspense>
        </section>
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
