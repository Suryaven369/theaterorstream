import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SeoHead from '../components/SeoHead';
import FollowHashtagButton from '../components/FollowHashtagButton';
import MovieMentionText from '../components/MovieMentionText';
import Loader from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import {
  getHashtagBySlug,
  getHashtagPosts,
  isFollowingHashtag,
  suggestRelatedHashtags,
} from '../lib/hashtagApi';

function formatCount(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function categoryLabel(category) {
  if (!category || category === 'general') return 'Hashtag';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export default function HashtagPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [tag, setTag] = useState(null);
  const [posts, setPosts] = useState([]);
  const [related, setRelated] = useState([]);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      const found = await getHashtagBySlug(slug);
      if (cancelled) return;
      if (!found) {
        setNotFound(true);
        setTag(null);
        setPosts([]);
        setRelated([]);
        setLoading(false);
        return;
      }
      setTag(found);
      const [postRows, relatedRows, isFollowing] = await Promise.all([
        getHashtagPosts(found.id, { limit: 40 }),
        suggestRelatedHashtags(found.slug, { limit: 10 }),
        user?.id ? isFollowingHashtag(user.id, found.id) : Promise.resolve(false),
      ]);
      if (cancelled) return;
      setPosts(postRows);
      setRelated(relatedRows);
      setFollowing(isFollowing);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug, user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (notFound || !tag) {
    return (
      <div className="min-h-screen pt-24 container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Tag not found</h1>
        <p className="text-white/50 mb-6">#{slug} doesn’t exist yet. Use it in a post to create it.</p>
        <Link to="/tags" className="text-orange-400 hover:underline">Browse hashtags</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-20 sm:pt-24 pb-24">
      <SeoHead
        title={`#${tag.display_name} | TheaterOrStream`}
        description={tag.description || `Posts and conversation about #${tag.display_name}`}
      />

      {/* Compact hero — clears fixed header, no floating GENRE eyebrow */}
      <section className="border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5 mb-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight truncate">
                  #{tag.display_name}
                </h1>
                <span className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-medium uppercase tracking-wide bg-white/5 border border-white/10 text-white/50">
                  {categoryLabel(tag.category)}
                </span>
              </div>
              {tag.description && (
                <p className="text-sm text-white/55 max-w-lg leading-snug">{tag.description}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/45">
                <span>
                  <strong className="text-white/90 font-semibold">{formatCount(tag.posts_count)}</strong>
                  {' '}{tag.posts_count === 1 ? 'post' : 'posts'}
                </span>
                <span className="text-white/20">·</span>
                <span>
                  <strong className="text-white/90 font-semibold">{formatCount(tag.followers_count)}</strong>
                  {' '}{tag.followers_count === 1 ? 'follower' : 'followers'}
                </span>
                {tag.weekly_growth > 0 && (
                  <>
                    <span className="text-white/20">·</span>
                    <span className="text-emerald-400/90">+{tag.weekly_growth} this week</span>
                  </>
                )}
              </div>
            </div>
            <FollowHashtagButton
              hashtagId={tag.id}
              initialFollowing={following}
              onChange={setFollowing}
              className="shrink-0"
            />
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-6 lg:gap-8 items-start">
          {/* Feed — constrained width so cards don’t stretch empty */}
          <div className="min-w-0 max-w-2xl">
            <h2 className="text-sm font-semibold text-white/80 mb-3 tracking-wide">
              Latest posts
            </h2>
            {!posts.length && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-10 text-center text-white/45 text-sm">
                No posts with #{tag.display_name} yet. Be the first — add it to a review or status update.
              </div>
            )}
            <div className="space-y-3">
              {posts.map((post) => {
                const profile = post.user_profiles;
                return (
                  <article
                    key={post.id}
                    className="rounded-xl border border-white/[0.08] bg-[#121212] p-3.5 sm:p-4"
                  >
                    <div className="flex items-center gap-2 mb-2.5">
                      <Link
                        to={profile?.username ? `/${profile.username}/profile` : '#'}
                        className="text-sm font-medium text-white hover:text-orange-300 truncate"
                      >
                        {profile?.display_name || profile?.username || 'User'}
                      </Link>
                      <span className="text-[11px] text-white/30 shrink-0">
                        {post.created_at
                          ? new Date(post.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })
                          : ''}
                      </span>
                    </div>
                    <Link
                      to={`/thread/${post.id}`}
                      className="block text-white/90 text-sm leading-relaxed"
                    >
                      <MovieMentionText content={post.content} />
                    </Link>
                    <div className="mt-2.5 flex gap-3 text-[11px] text-white/35">
                      <span>{post.likes_count || 0} likes</span>
                      <span>{post.comments_count || 0} comments</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 space-y-4">
            <div className="rounded-xl border border-white/[0.08] bg-[#121212] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
                Related
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    to={`/tag/${r.slug}`}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/[0.04] border border-white/10 text-orange-300/90 hover:border-orange-500/40 hover:bg-white/[0.07] transition-colors"
                  >
                    #{r.display_name}
                  </Link>
                ))}
                {!related.length && (
                  <p className="text-xs text-white/40">More tags will show up as this one grows.</p>
                )}
              </div>
              <Link
                to="/tags"
                className="mt-4 inline-block text-xs text-orange-400 hover:text-orange-300"
              >
                Explore all hashtags →
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
