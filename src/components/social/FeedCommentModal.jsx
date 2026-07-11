import React, { useEffect, useState } from 'react';
import MovieMentionText from '../MovieMentionText';
import { addComment, getPostComments } from '../../lib/socialFeedApi';

/**
 * Comments modal for a feed post — loads and submits comments internally.
 */
export default function FeedCommentModal({
  post,
  user,
  isAuthenticated,
  onRequireSignIn,
  onClose,
  onCommentAdded,
}) {
  const [commentText, setCommentText] = useState('');
  const [postComments, setPostComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);

  useEffect(() => {
    if (!post?.id) return;
    let cancelled = false;
    setCommentText('');
    setLoadingComments(true);
    getPostComments(post.id)
      .then((comments) => {
        if (!cancelled) setPostComments(comments || []);
      })
      .catch(() => {
        if (!cancelled) setPostComments([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingComments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [post?.id]);

  if (!post) return null;

  const submitComment = async () => {
    if (!commentText.trim()) return;
    if (!isAuthenticated) {
      onRequireSignIn?.('Sign in to comment.');
      return;
    }

    try {
      await addComment(post.id, user?.id, commentText);
      setPostComments((prev) => [
        ...prev,
        {
          id: Date.now(),
          user: { name: user?.user_metadata?.full_name || 'You', avatar: '👤' },
          content: commentText,
          time: 'Just now',
        },
      ]);
      setCommentText('');
      onCommentAdded?.(post.id);
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={onClose}>
      <div
        className="bg-[#1a1d1f] rounded-2xl w-full max-w-lg max-h-[85vh] border border-white/10 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
          <h3 className="text-lg font-semibold text-white">Comments</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 border-b border-white/10 bg-white/5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-sm">
                {post.user.avatar}
              </div>
              <span className="text-sm font-medium text-white">{post.user.name}</span>
            </div>
            <MovieMentionText content={post.content} className="text-sm text-white/70" />
          </div>

          <div className="p-4 space-y-4">
            {loadingComments ? (
              <div className="text-center py-8 text-white/40">Loading comments...</div>
            ) : postComments.length > 0 ? (
              postComments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-sm shrink-0">
                    {comment.user?.avatar || '👤'}
                  </div>
                  <div>
                    <p className="text-sm">
                      <span className="font-semibold text-white">{comment.user?.name || 'User'}</span>
                      <span className="text-white/70 ml-2">{comment.content}</span>
                    </p>
                    <p className="text-xs text-white/40 mt-1">{comment.time || 'Just now'}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-white/40">
                <p>No comments yet.</p>
                <p className="text-sm mt-1">Be the first to comment!</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent-green)] to-emerald-600 flex items-center justify-center text-sm shrink-0">
              {user?.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt=""
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                '👤'
              )}
            </div>
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-[var(--accent-green)]"
              onKeyDown={(e) => e.key === 'Enter' && submitComment()}
            />
            <button
              onClick={submitComment}
              disabled={!commentText.trim()}
              className="shrink-0 px-4 py-2 rounded-full bg-[var(--accent-green)] text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--accent-green)]/90 transition-colors"
            >
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
