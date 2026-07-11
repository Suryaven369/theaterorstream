import React from 'react';
import { FaPaperPlane } from 'react-icons/fa';

/**
 * Share sheet for a feed post (copy link, X, WhatsApp).
 */
export default function FeedShareModal({ post, onClose }) {
  if (!post) return null;

  const postUrl = `${window.location.origin}/post/${post.id}`;

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(postUrl);
      onClose?.();
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={onClose}>
      <div
        className="bg-[#1a1d1f] rounded-2xl w-full max-w-sm overflow-hidden border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/10">
          <h3 className="text-lg font-semibold text-white text-center">Share Post</h3>
        </div>
        <div className="p-4 space-y-3">
          <button
            onClick={copyShareLink}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <FaPaperPlane className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Copy Link</p>
              <p className="text-xs text-white/40">Copy link to clipboard</p>
            </div>
          </button>
          <a
            href={`https://twitter.com/intent/tweet?text=Check out this post!&url=${encodeURIComponent(postUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-sky-500/20 flex items-center justify-center">
              <span className="text-sky-400 font-bold">𝕏</span>
            </div>
            <div>
              <p className="text-sm font-medium text-white">Share on X</p>
              <p className="text-xs text-white/40">Share to your followers</p>
            </div>
          </a>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Check out this post: ${postUrl}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <span className="text-green-400 text-lg">💬</span>
            </div>
            <div>
              <p className="text-sm font-medium text-white">WhatsApp</p>
              <p className="text-xs text-white/40">Share via WhatsApp</p>
            </div>
          </a>
        </div>
        <div className="p-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
