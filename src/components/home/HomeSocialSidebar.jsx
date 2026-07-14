import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getTrendingHashtags } from '../../lib/hashtagApi';
import { getSuggestedUsersToFollow, toggleFollow } from '../../lib/db/social';
import { useAuth } from '../../context/AuthContext';
import { getAvatarUrl } from '../../lib/storagePublicUrl';
import NowInTheaters from './NowInTheaters';

function formatCount(num) {
  const n = Number(num) || 0;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/**
 * Right rail on the Home social feed tab.
 */
export default function HomeSocialSidebar() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [trending, setTrending] = useState([]);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [suggestedUsers, setSuggestedUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [followingIds, setFollowingIds] = useState(new Set());

  // Load trending hashtags
  useEffect(() => {
    let alive = true;
    getTrendingHashtags({ limit: 5 })
      .then((tags) => {
        if (alive) setTrending(tags || []);
      })
      .finally(() => {
        if (alive) setLoadingTrending(false);
      });
    return () => { alive = false; };
  }, []);

  // Load suggested users to follow
  const loadSuggestedUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const users = await getSuggestedUsersToFollow(user?.id, 3);
      setSuggestedUsers(users || []);
    } catch {
      setSuggestedUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadSuggestedUsers();
  }, [loadSuggestedUsers]);

  const handleFollow = async (userId) => {
    if (!isAuthenticated || !user?.id) {
      navigate('/auth', { state: { from: '/' } });
      return;
    }
    
    // Optimistic update - mark as following
    setFollowingIds((prev) => new Set([...prev, userId]));
    
    try {
      const result = await toggleFollow(user.id, userId);
      if (result.success && result.following) {
        // Remove from suggestions and load new ones after a brief delay
        setTimeout(() => {
          setSuggestedUsers((prev) => prev.filter((u) => u.id !== userId));
          // If we removed someone, fetch more suggestions
          getSuggestedUsersToFollow(user.id, 1).then((newUsers) => {
            if (newUsers?.length) {
              setSuggestedUsers((prev) => [...prev, ...newUsers].slice(0, 3));
            }
          });
        }, 500);
      }
    } catch {
      // Revert on error
      setFollowingIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  return (
    <aside className="lg:col-span-4 space-y-4 hidden lg:block">
      {/* Now in Theaters */}
      <NowInTheaters limit={5} />
      
      <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
        <h3 className="text-xs font-medium text-[var(--color-text)] mb-3">Trending Now</h3>
        <div className="space-y-2.5">
          {loadingTrending ? (
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-3 bg-[var(--color-surface-subtle)] rounded w-24 mb-1" />
                  <div className="h-2 bg-[var(--color-surface-subtle)] rounded w-16" />
                </div>
              ))}
            </div>
          ) : trending.length === 0 ? (
            <p className="text-[10px] text-[var(--color-text-muted)]">No trending hashtags yet</p>
          ) : (
            trending.map((t) => (
              <Link key={t.id || t.slug} to={`/tag/${t.slug}`} className="block group">
                <p className="text-xs text-[var(--color-text-secondary)] group-hover:text-[var(--color-text)] transition-colors">
                  #{t.display_name || t.slug}
                </p>
                <p className="text-[10px] text-[var(--color-text-muted)]">{formatCount(t.posts_count)} posts</p>
              </Link>
            ))
          )}
        </div>
      </div>

      {suggestedUsers.length > 0 && (
        <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
          <h3 className="text-xs font-medium text-[var(--color-text)] mb-3">Who to Follow</h3>
          <div className="space-y-2.5">
            {loadingUsers ? (
              <div className="space-y-2.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2.5 animate-pulse">
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-surface-subtle)]" />
                    <div className="flex-1">
                      <div className="h-3 bg-[var(--color-surface-subtle)] rounded w-20 mb-1" />
                      <div className="h-2 bg-[var(--color-surface-subtle)] rounded w-14" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              suggestedUsers.map((u) => {
                const isFollowingUser = followingIds.has(u.id);
                return (
                  <div key={u.id} className="flex items-center justify-between">
                    <Link to={`/${u.username}/profile`} className="flex items-center gap-2.5 group min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-[var(--color-surface-subtle)] flex items-center justify-center text-xs overflow-hidden shrink-0">
                        {u.avatar_url ? (
                          <img src={getAvatarUrl(u.avatar_url, 32)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          '👤'
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--color-text-secondary)] group-hover:text-[var(--color-text)] transition-colors truncate">
                          {u.display_name || u.username}
                        </p>
                        <p className="text-[10px] text-[var(--color-text-muted)] truncate">@{u.username}</p>
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleFollow(u.id)}
                      disabled={isFollowingUser}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors shrink-0 ml-2 ${
                        isFollowingUser
                          ? 'bg-[var(--color-theater)]/15 text-[var(--color-theater)]'
                          : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                      }`}
                    >
                      {isFollowingUser ? 'Following' : 'Follow'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
