import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import SeoHead from '../components/SeoHead';
import FeedPostCard from '../components/social/FeedPostCard';
import FeedCommentModal from '../components/social/FeedCommentModal';
import FeedShareModal from '../components/social/FeedShareModal';
import MovieMentionText from '../components/MovieMentionText';
import { useAuth } from '../context/AuthContext';
import { getFeedPostById, likePost, unlikePost, savePost, unsavePost } from '../lib/socialFeedApi';

/**
 * Public share landing page for a single feed post (/post/:id).
 */
export default function PostDetails() {
  const { id } = useParams();
  const { user, profile, isAuthenticated } = useAuth();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [commentPost, setCommentPost] = useState(null);
  const [sharePost, setSharePost] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getFeedPostById(id, user?.id).then((res) => {
      if (!alive) return;
      setItem(res.ok ? res.item : null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [id, user?.id]);

  const requireSignIn = () => {
    window.location.href = `/auth?from=${encodeURIComponent(`/post/${id}`)}`;
  };

  const handleLike = async (postId) => {
    if (!isAuthenticated) {
      requireSignIn();
      return;
    }
    if (!item || item.id !== postId) return;
    const wasLiked = item.isLiked;
    setItem((p) => ({
      ...p,
      isLiked: !wasLiked,
      likes: wasLiked ? Math.max(0, p.likes - 1) : p.likes + 1,
    }));
    try {
      if (wasLiked) await unlikePost(postId, user.id);
      else await likePost(postId, user.id);
    } catch {
      setItem((p) => ({ ...p, isLiked: wasLiked, likes: item.likes }));
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center pt-20">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--accent-green)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center pt-20 px-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Post not found</h2>
          <p className="text-white/50 text-sm mb-4">This link may be private or no longer available.</p>
          <Link to="/" className="text-[var(--accent-green)] hover:underline">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}/post/${item.id}`;
  const ogImage =
    item.image ||
    (item.movie?.backdrop
      ? `https://image.tmdb.org/t/p/w1280${item.movie.backdrop}`
      : item.movie?.poster
        ? `https://image.tmdb.org/t/p/w780${item.movie.poster}`
        : null);
  const ogDesc =
    String(item.content || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160) || `Post by @${item.user.username} on TheaterOrStream`;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-20 sm:pt-24 pb-24 px-4">
      <SeoHead
        title={
          item.movieTitle
            ? `${item.movieTitle} — @${item.user.username}`
            : `Post by @${item.user.username}`
        }
        description={ogDesc}
        image={ogImage}
        url={shareUrl}
        type="article"
      />

      <div className="max-w-xl mx-auto space-y-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
        >
          <FaArrowLeft /> Back to feed
        </Link>

        <FeedPostCard
          item={item}
          currentUserId={user?.id}
          openMenuId={null}
          onToggleMenu={() => {}}
          editingId={null}
          editText=""
          onEditTextChange={() => {}}
          savingEdit={false}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={() => {}}
          onDelete={() => {}}
          onLike={handleLike}
          onSave={handleSave}
          onShare={setSharePost}
          onOpenComments={setCommentPost}
        />

        {item.content && (
          <div className="rounded-xl border border-white/5 bg-[#1a1d1f] p-4 sm:hidden">
            <MovieMentionText content={item.content} className="text-sm text-white/80" />
          </div>
        )}
      </div>

      {commentPost && (
        <FeedCommentModal
          post={commentPost}
          user={user}
          profile={profile}
          isAuthenticated={isAuthenticated}
          onRequireSignIn={requireSignIn}
          onClose={() => setCommentPost(null)}
          onCommentAdded={(postId) => {
            if (item.id === postId) {
              setItem((p) => ({ ...p, comments: p.comments + 1 }));
            }
          }}
        />
      )}

      {sharePost && <FeedShareModal post={sharePost} onClose={() => setSharePost(null)} />}
    </div>
  );
}
