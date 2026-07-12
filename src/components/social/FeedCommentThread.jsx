import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { BiUpvote } from 'react-icons/bi';
import { FaCode, FaLink, FaRegComment, FaRetweet, FaShare, FaUserCircle } from 'react-icons/fa';
import MovieMentionText from '../MovieMentionText';
import VerifiedBadge from '../VerifiedBadge';
import { useToast } from '../Toast';
import { addThreadComment, getThreadComments, nestComments } from '../../lib/feedThread';
import { attachCommentLikes, toggleCommentUpvote } from '../../lib/feedLikes';
import { getCachedComments, setCachedComments } from '../../lib/feedSessionCache';
import { toPublicStorageUrl } from '../../lib/storagePublicUrl';

const MAX_REPLY_DEPTH = 8;

function buildLocalComment({ saved, content, parentId, user, profile }) {
  const authorName = profile?.display_name || profile?.username || user?.user_metadata?.full_name || 'You';
  return {
    id: saved?.id || `local-${Date.now()}`,
    content: String(content || '').trim(),
    time: 'Just now',
    createdAt: saved?.created_at || new Date().toISOString(),
    parentId: parentId || saved?.parent_id || null,
    likesCount: saved?.likes_count || 0,
    isLiked: false,
    user: {
      id: user.id,
      name: authorName,
      username: profile?.username || 'you',
      avatar: '👤',
      avatarUrl: toPublicStorageUrl(profile?.avatar_url) || null,
      isVerified: !!profile?.is_verified,
    },
  };
}

function ReplyComposer({
  placeholder,
  busy,
  onCancel,
  onSubmit,
}) {
  const [text, setText] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim() || busy) return;
        onSubmit(text.trim());
        setText('');
      }}
      className="mt-1.5 sm:mt-2 mb-1"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        rows={2}
        autoFocus
        placeholder={placeholder}
        className="w-full bg-black/35 border border-white/10 rounded-lg sm:rounded-xl px-3 py-2 text-[13px] sm:text-sm text-white placeholder:text-white/35 outline-none focus:border-sky-500/40 resize-none"
      />
      <div className="flex justify-end gap-1.5 sm:gap-2 mt-1.5">
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-[11px] sm:text-xs text-white/50 px-2 py-1.5 hover:text-white min-h-[40px] sm:min-h-0 touch-manipulation">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="text-[11px] sm:text-xs font-semibold px-3 py-1.5 rounded-full bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-40 min-h-[40px] sm:min-h-0 touch-manipulation"
        >
          {busy ? 'Posting…' : 'Reply'}
        </button>
      </div>
    </form>
  );
}

function CommentNode({
  comment,
  depth,
  opUserId,
  item,
  user,
  profile,
  isAuthenticated,
  onRequireSignIn,
  onReplyPosted,
  onCommentLiked,
  collapsedIds,
  toggleCollapsed,
}) {
  const toast = useToast();
  const [replyOpen, setReplyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voteBusy, setVoteBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const shareButtonRef = useRef(null);
  const score = comment.likesCount || 0;
  const voted = comment.isLiked ? 'up' : null;
  const collapsed = collapsedIds.has(comment.id);
  const replies = comment.replies || [];
  const hasReplies = replies.length > 0;
  const isOp = opUserId && comment.user?.id === opUserId;
  const canNestDeeper = depth < MAX_REPLY_DEPTH;

  useEffect(() => {
    if (!shareOpen) return undefined;
    const handleClickOutside = (e) => {
      if (shareButtonRef.current && shareButtonRef.current.contains(e.target)) return;
      setShareOpen(false);
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') setShareOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [shareOpen]);

  const openShareMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (shareButtonRef.current) {
      const rect = shareButtonRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 6,
        left: Math.max(8, rect.right - 192),
      });
    }
    setShareOpen((o) => !o);
  };

  const handleCopyLink = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setShareOpen(false);
      }, 1200);
    } catch {
      setShareOpen(false);
    }
  };

  const handleEmbed = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const code = `<iframe src="${window.location.href}" width="100%" height="400" frameborder="0"></iframe>`;
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setShareOpen(false);
    }, 1200);
  };

  const submitReply = async (replyText) => {
    if (!isAuthenticated) {
      onRequireSignIn?.();
      return;
    }
    setBusy(true);
    try {
      const saved = await addThreadComment(item, user.id, replyText, comment.id);
      onReplyPosted?.(buildLocalComment({
        saved,
        content: replyText,
        parentId: comment.id,
        user,
        profile,
      }));
      setReplyOpen(false);
      if (collapsed) toggleCollapsed(comment.id);
    } catch (err) {
      console.error('Reply failed', err);
      toast.error(err?.message || 'Could not save reply. Try signing out and back in.');
    } finally {
      setBusy(false);
    }
  };

  const submitUpvote = async () => {
    if (!isAuthenticated) {
      onRequireSignIn?.();
      return;
    }
    if (voteBusy) return;
    const wasLiked = !!comment.isLiked;
    const prevScore = comment.likesCount || 0;
    onCommentLiked?.(comment.id, {
      isLiked: !wasLiked,
      likesCount: wasLiked ? Math.max(0, prevScore - 1) : prevScore + 1,
    });
    setVoteBusy(true);
    try {
      const result = await toggleCommentUpvote(comment, user.id, wasLiked);
      if (result && typeof result.liked === 'boolean') {
        onCommentLiked?.(comment.id, {
          isLiked: result.liked,
          likesCount: result.liked
            ? Math.max(prevScore, wasLiked ? prevScore : prevScore + 1)
            : Math.max(0, wasLiked ? prevScore - 1 : prevScore),
        });
      }
    } catch (err) {
      console.error('Comment upvote failed', err);
      onCommentLiked?.(comment.id, { isLiked: wasLiked, likesCount: prevScore });
      toast.error(err?.message || 'Could not save upvote.');
    } finally {
      setVoteBusy(false);
    }
  };

  return (
    <div className={`relative ${depth > 0 ? 'ml-1.5 sm:ml-3 pl-2.5 sm:pl-3 border-l border-white/10' : ''}`}>
      {hasReplies && (
        <button
          type="button"
          aria-label={collapsed ? 'Expand thread' : 'Collapse thread'}
          onClick={() => toggleCollapsed(comment.id)}
          className="absolute -left-[11px] sm:-left-[9px] top-2 sm:top-3 w-5 h-5 sm:w-4 sm:h-4 rounded-full bg-[#0f1113] border border-white/25 text-[11px] sm:text-[10px] text-white/60 leading-none flex items-center justify-center hover:border-sky-400/60 hover:text-white z-10 touch-manipulation"
          style={depth === 0 ? { left: '-2px' } : undefined}
        >
          {collapsed ? '+' : '−'}
        </button>
      )}

      <div className="flex gap-2 sm:gap-2.5 py-1.5 sm:py-2">
        <Link
          to={comment.user?.username ? `/${comment.user.username}/profile` : '#'}
          className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/10 overflow-hidden shrink-0 flex items-center justify-center text-[10px] sm:text-xs mt-0.5"
        >
          {comment.user?.avatarUrl ? (
            <img src={comment.user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            comment.user?.avatar || '👤'
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap text-[11px] sm:text-[12px]">
            <Link
              to={comment.user?.username ? `/${comment.user.username}/profile` : '#'}
              className="font-semibold text-white hover:underline inline-flex items-center gap-1"
            >
              {comment.user?.name || 'User'}
              {comment.user?.isVerified && <VerifiedBadge size={10} />}
            </Link>
            {isOp && (
              <span className="text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">OP</span>
            )}
            <span className="text-white/30">·</span>
            <span className="text-white/40 truncate max-w-[80px] sm:max-w-none">{comment.time}</span>
          </div>

          {!collapsed && (
            <>
              <MovieMentionText content={comment.content} className="text-[13px] sm:text-[14px] text-white/85 leading-relaxed mt-0.5 sm:mt-1" />

              <div className="flex items-center gap-0.5 sm:gap-1 mt-1 sm:mt-1.5 -ml-1.5 flex-wrap">
                <button
                  type="button"
                  aria-label={voted === 'up' ? 'Remove upvote' : 'Upvote'}
                  disabled={voteBusy}
                  onClick={submitUpvote}
                  className={`inline-flex items-center gap-0.5 sm:gap-1 px-2 py-1.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-semibold hover:bg-[#262C30] disabled:opacity-60 min-h-[40px] sm:min-h-0 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]/40 ${
                    voted === 'up' ? 'text-[#FFCC00]' : 'text-[#7C8892] hover:text-[#F2F4F5]'
                  }`}
                >
                  <BiUpvote className="text-[14px] sm:text-[15px]" />
                  <span className="tabular-nums">{score}</span>
                </button>

                {canNestDeeper && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isAuthenticated) onRequireSignIn?.();
                      else setReplyOpen((o) => !o);
                    }}
                    className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-semibold transition-colors min-h-[40px] sm:min-h-0 touch-manipulation ${
                      replyOpen
                        ? 'bg-sky-500/20 text-sky-300'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <FaRegComment className="text-[10px]" />
                    <span className="hidden min-[400px]:inline">Reply</span>
                  </button>
                )}

                {hasReplies && (
                  <span className="text-[10px] sm:text-[11px] text-white/35 px-0.5 sm:px-1 hidden sm:inline">
                    {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                  </span>
                )}

                <button
                  ref={shareButtonRef}
                  type="button"
                  aria-expanded={shareOpen}
                  aria-haspopup="menu"
                  className={`inline-flex items-center gap-0.5 sm:gap-1 px-2 py-1.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-semibold transition-colors min-h-[40px] sm:min-h-0 touch-manipulation ${
                    shareOpen ? 'bg-[#262C30] text-[#F2F4F5]' : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                  }`}
                  onClick={openShareMenu}
                >
                  <FaShare className="text-[10px]" />
                  <span className="hidden min-[400px]:inline">Share</span>
                </button>
                {shareOpen && createPortal(
                  <div
                    role="menu"
                    className="fixed w-48 bg-[#1E2225] border border-[#30363B] rounded-xl shadow-2xl py-1.5 z-[9999]"
                    style={{ top: menuPos.top, left: menuPos.left }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleCopyLink}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[13px] text-[#F2F4F5] hover:bg-[#262C30] transition-colors"
                    >
                      <FaLink className="text-[#A8B3BD] text-[12px]" aria-hidden />
                      {copied ? 'Copied!' : 'Copy link'}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleEmbed}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[13px] text-[#F2F4F5] hover:bg-[#262C30] transition-colors"
                    >
                      <FaCode className="text-[#A8B3BD] text-[12px]" aria-hidden />
                      Embed
                    </button>
                  </div>,
                  document.body,
                )}
              </div>

              {replyOpen && (
                <ReplyComposer
                  placeholder={`Reply to ${comment.user?.name || 'comment'}…`}
                  busy={busy}
                  onCancel={() => setReplyOpen(false)}
                  onSubmit={submitReply}
                />
              )}

              {replies.map((child) => (
                <CommentNode
                  key={child.id}
                  comment={child}
                  depth={depth + 1}
                  opUserId={opUserId}
                  item={item}
                  user={user}
                  profile={profile}
                  isAuthenticated={isAuthenticated}
                  onRequireSignIn={onRequireSignIn}
                  onReplyPosted={onReplyPosted}
                  onCommentLiked={onCommentLiked}
                  collapsedIds={collapsedIds}
                  toggleCollapsed={toggleCollapsed}
                />
              ))}
            </>
          )}

          {collapsed && hasReplies && (
            <button
              type="button"
              onClick={() => toggleCollapsed(comment.id)}
              className="mt-1 text-[12px] font-semibold text-sky-400 hover:underline"
            >
              Show {replies.length} more {replies.length === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Reddit-style nested comment thread for any Home feed item.
 */
export default function FeedCommentThread({
  item,
  user,
  profile,
  isAuthenticated,
  onRequireSignIn,
  onCommentAdded,
}) {
  const toast = useToast();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const composerRef = useRef(null);

  const commentsCacheKey = item?.id ? `comments:${item.type || 'post'}:${item.id}` : null;

  const loadComments = async ({ bypassCache = false } = {}) => {
    if (!bypassCache && commentsCacheKey) {
      const cached = getCachedComments(commentsCacheKey);
      if (cached) return cached;
    }
    const list = await getThreadComments(item);
    const hydrated = await attachCommentLikes(list || [], user?.id || null);
    if (commentsCacheKey) setCachedComments(commentsCacheKey, hydrated);
    return hydrated;
  };

  const reloadComments = async () => {
    if (!item?.id) return;
    const list = await loadComments({ bypassCache: true });
    setComments(list || []);
    onCommentAdded?.(item.id, list?.length ?? 0);
  };

  useEffect(() => {
    if (!item?.id) return undefined;
    let cancelled = false;
    const cached = commentsCacheKey ? getCachedComments(commentsCacheKey) : null;
    if (cached?.length) {
      setComments(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    loadComments()
      .then((list) => {
        if (!cancelled) setComments(list || []);
      })
      .catch(() => {
        if (!cancelled && !cached?.length) setComments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.type, user?.id]);

  const tree = useMemo(() => {
    const nested = nestComments(comments);
    const score = (n) => (n.likesCount || 0) + (n.replies || []).reduce((s, r) => s + score(r), 0);
    return [...nested].sort((a, b) => score(b) - score(a));
  }, [comments]);

  const toggleCollapsed = (id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openComposer = () => {
    if (!isAuthenticated) {
      onRequireSignIn?.();
      return;
    }
    setComposerOpen(true);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!text.trim() || busy) return;
    if (!isAuthenticated) {
      onRequireSignIn?.();
      return;
    }
    setBusy(true);
    const pending = text.trim();
    try {
      const saved = await addThreadComment(item, user.id, pending);
      setComments((prev) => [
        ...prev,
        buildLocalComment({ saved, content: pending, parentId: null, user, profile }),
      ]);
      setText('');
      setComposerOpen(false);
      onCommentAdded?.(item.id, (comments.length || 0) + 1);
      reloadComments().catch(() => {});
    } catch (err) {
      console.error('Comment failed', err);
      toast.error(err?.message || 'Could not save comment. Try signing out and back in.');
    } finally {
      setBusy(false);
    }
  };

  const onReplyPosted = (newComment) => {
    setComments((prev) => [...prev, newComment]);
    onCommentAdded?.(item.id, (comments.length || 0) + 1);
    reloadComments().catch(() => {});
  };

  const onCommentLiked = (commentId, patch) => {
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, ...patch } : c)),
    );
  };

  const opUserId = item?.user?.id || null;

  return (
    <section id="comments" className="mt-2 sm:mt-3">
      <div className="px-3 sm:px-4 pt-4 sm:pt-5 pb-2">
        {!composerOpen ? (
          <button
            type="button"
            onClick={openComposer}
            className="w-full text-left rounded-xl sm:rounded-2xl border border-[#30363B] bg-[#0B0C0D]/45 px-3 sm:px-4 py-3 sm:py-3.5 text-[13px] sm:text-[14px] text-[#7C8892] hover:border-[#3a4248] hover:bg-[#0B0C0D]/65 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]/40 min-h-[48px] touch-manipulation"
          >
            {isAuthenticated ? 'Join the conversation' : 'Sign in to join the conversation'}
          </button>
        ) : (
          <form onSubmit={submit}>
            <textarea
              ref={composerRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 2000))}
              rows={3}
              placeholder="Join the conversation"
              disabled={!isAuthenticated || busy}
              className="w-full bg-[#0B0C0D]/45 border border-[#30363B] rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-[13px] sm:text-sm text-[#F2F4F5] placeholder:text-[#7C8892] outline-none focus:border-[#3a4248] resize-none disabled:opacity-60"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setComposerOpen(false);
                  setText('');
                }}
                className="px-3 py-1.5 rounded-full text-xs font-semibold text-[#A8B3BD] hover:bg-[#262C30] hover:text-[#F2F4F5] min-h-[44px] sm:min-h-[36px] touch-manipulation"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !text.trim() || !isAuthenticated}
                className="px-4 sm:px-3.5 py-1.5 rounded-full bg-sky-600 text-white text-xs font-semibold hover:bg-sky-500 disabled:opacity-40 min-h-[44px] sm:min-h-[36px] touch-manipulation"
              >
                {busy ? 'Posting…' : 'Comment'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="px-3 sm:px-4 pb-6 sm:pb-8">
        {loading ? (
          <p className="text-sm text-[#7C8892] py-6 text-center">Loading comments…</p>
        ) : tree.length === 0 ? (
          <p className="text-sm text-[#7C8892] py-6 text-center">No comments yet. Start the thread.</p>
        ) : (
          tree.map((c) => (
            <CommentNode
              key={c.id}
              comment={c}
              depth={0}
              opUserId={opUserId}
              item={item}
              user={user}
              profile={profile}
              isAuthenticated={isAuthenticated}
              onRequireSignIn={onRequireSignIn}
              onReplyPosted={onReplyPosted}
              onCommentLiked={onCommentLiked}
              collapsedIds={collapsedIds}
              toggleCollapsed={toggleCollapsed}
            />
          ))
        )}
      </div>
    </section>
  );
}
