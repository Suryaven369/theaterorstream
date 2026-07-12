import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BiUpvote } from 'react-icons/bi';
import { FaCode, FaLink, FaRegComment, FaRetweet, FaShare, FaUserCircle } from 'react-icons/fa';
import { threadPathForItem } from '../../lib/feedThread';

function formatCount(num) {
  const n = Number(num) || 0;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

const pillBase =
  'inline-flex items-center gap-1 sm:gap-1.5 h-11 sm:h-9 min-h-[44px] sm:min-h-[34px] px-3 sm:px-3.5 rounded-full bg-[#262C30] text-[#F2F4F5]/80 transition-colors hover:bg-[#333A3F] hover:text-[#F2F4F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[#181C1F] shrink-0 touch-manipulation';

/**
 * Reddit-style action pills: upvote · comment · share dropdown
 */
export default function RedditActionBar({
  score = 0,
  comments = 0,
  isUpvoted = false,
  onUpvote,
  onComment,
  onShare,
  showShare = true,
  item = null,
  className = '',
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!shareOpen) return undefined;
    const handleClickOutside = (e) => {
      if (buttonRef.current && buttonRef.current.contains(e.target)) return;
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

  const openMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 6,
        left: Math.max(8, rect.right - 192),
      });
    }
    setShareOpen((o) => !o);
  };

  const getShareUrl = () => {
    if (!item) return window.location.href;
    return `${window.location.origin}${threadPathForItem(item)}`;
  };

  const handleCopyLink = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(getShareUrl());
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setShareOpen(false);
      }, 1200);
    } catch {
      setShareOpen(false);
    }
  };

  const handleShareToProfile = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onShare?.(item);
    setShareOpen(false);
  };

  const handleRepost = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onShare?.(item);
    setShareOpen(false);
  };

  const handleEmbed = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const url = getShareUrl();
    const code = `<iframe src="${url}" width="100%" height="400" frameborder="0"></iframe>`;
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setShareOpen(false);
    }, 1200);
  };

  const menuContent = shareOpen
    ? createPortal(
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
            onClick={handleShareToProfile}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[13px] text-[#F2F4F5] hover:bg-[#262C30] transition-colors"
          >
            <FaUserCircle className="text-[#A8B3BD] text-[12px]" aria-hidden />
            Share to profile
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleRepost}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[13px] text-[#F2F4F5] hover:bg-[#262C30] transition-colors"
          >
            <FaRetweet className="text-[#A8B3BD] text-[13px]" aria-hidden />
            Repost
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
      )
    : null;

  return (
    <div
      className={`flex items-center gap-2 sm:gap-2.5 flex-nowrap overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1 sm:pb-0 ${className}`}
      data-no-thread
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={isUpvoted ? 'Remove upvote' : 'Upvote'}
        aria-pressed={isUpvoted}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onUpvote?.(e);
        }}
        className={`${pillBase} ${
          isUpvoted ? 'text-[#FFCC00] hover:text-[#FFCC00]' : ''
        }`}
      >
        <BiUpvote className="text-[16px] sm:text-[16px]" aria-hidden />
        <span className="text-[12px] sm:text-[13px] font-semibold tabular-nums">{formatCount(score)}</span>
      </button>

      <button
        type="button"
        aria-label={`Comments, ${formatCount(comments)}`}
        onClick={onComment}
        className={pillBase}
      >
        <FaRegComment className="text-[13px] sm:text-[14px]" aria-hidden />
        <span className="text-[12px] sm:text-[13px] font-semibold tabular-nums">{formatCount(comments)}</span>
      </button>

      {showShare && (
        <>
          <button
            ref={buttonRef}
            type="button"
            aria-label="Share"
            aria-expanded={shareOpen}
            aria-haspopup="menu"
            onClick={openMenu}
            className={`${pillBase} ${shareOpen ? 'bg-[#333A3F]' : ''}`}
          >
            <FaShare className="text-[12px] sm:text-[13px]" aria-hidden />
            <span className="text-[12px] sm:text-[13px] font-semibold">Share</span>
          </button>
          {menuContent}
        </>
      )}
    </div>
  );
}
