import React, { useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FaImage, FaPollH } from 'react-icons/fa';
import { FiChevronLeft, FiChevronRight, FiPlus } from 'react-icons/fi';
import MentionEditor from '../MentionEditor';
import { getPlainTextLength } from '../../lib/movieMentions';
import {
  createPost,
  getFeedPosts,
  uploadPostImage,
  parseMediaCarouselForFeed,
  POST_IMAGE_MAX_BYTES,
  POST_IMAGE_MAX_COUNT,
} from '../../lib/socialFeedApi';

function makeImageId() {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const ICON_GREY = '#9299a6';
const ICON_GREY_DISABLED = '#5c6370';

function hasComposerText(content) {
  if (!content?.trim()) return false;
  if (getPlainTextLength(content) > 0) return true;
  return /\[\[(movie|user|person)\|/.test(content);
}

/**
 * Home feed composer — Twitter-style post box with images, carousel, and 2-option polls.
 */
export default function FeedComposer({
  isAuthenticated,
  user,
  profile,
  feedScope = 'all',
  onRequireSignIn,
  onPostCreated,
  onFeedReload,
}) {
  const [postText, setPostText] = useState('');
  const [postImages, setPostImages] = useState([]);
  const [carouselCaption, setCarouselCaption] = useState('');
  const [pollMode, setPollMode] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [posting, setPosting] = useState(false);
  const [composerError, setComposerError] = useState('');
  const fileInputRef = useRef(null);
  const carouselRef = useRef(null);

  const isCarousel = postImages.length >= 2;
  const currentImage = postImages[carouselIndex] || null;

  const revokePreview = (preview) => {
    if (preview) URL.revokeObjectURL(preview);
  };

  const clearAllImages = useCallback(() => {
    postImages.forEach((img) => revokePreview(img.preview));
    setPostImages([]);
    setCarouselCaption('');
    setCarouselIndex(0);
  }, [postImages]);

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    setComposerError('');
    if (pollMode) setPollMode(false);

    const remaining = POST_IMAGE_MAX_COUNT - postImages.length;
    if (remaining <= 0) {
      setComposerError(`Maximum ${POST_IMAGE_MAX_COUNT} images.`);
      return;
    }

    const next = [];
    for (const file of files.slice(0, remaining)) {
      if (!file.type.startsWith('image/')) {
        setComposerError('Please choose image files only.');
        return;
      }
      if (file.size > POST_IMAGE_MAX_BYTES) {
        setComposerError('Each image must be under 5MB.');
        return;
      }
      next.push({
        id: makeImageId(),
        file,
        preview: URL.createObjectURL(file),
      });
    }

    setPostImages((prev) => [...prev, ...next]);
  };

  const handleRemoveCurrentImage = () => {
    if (!currentImage) return;
    revokePreview(currentImage.preview);
    setPostImages((prev) => {
      const next = prev.filter((img) => img.id !== currentImage.id);
      setCarouselIndex((idx) => Math.min(idx, Math.max(0, next.length - 1)));
      return next;
    });
  };

  const goCarousel = (dir) => {
    const next = Math.min(Math.max(carouselIndex + dir, 0), postImages.length - 1);
    setCarouselIndex(next);
    const el = carouselRef.current;
    if (el) el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
  };

  const enablePollMode = () => {
    clearAllImages();
    setPollMode(true);
    setComposerError('');
  };

  const disablePollMode = () => {
    setPollMode(false);
    setPollOptions(['', '']);
  };

  const canPost = (() => {
    if (getPlainTextLength(postText) > 500) return false;
    if (pollMode) {
      return (
        hasComposerText(postText)
        && pollOptions[0].trim().length > 0
        && pollOptions[1].trim().length > 0
      );
    }
    if (isCarousel) return postImages.length >= 2;
    return hasComposerText(postText) || postImages.length === 1;
  })();

  const resetComposer = () => {
    setPostText('');
    clearAllImages();
    disablePollMode();
    setComposerError('');
  };

  const handleCreatePost = async () => {
    if (posting || !canPost) return;
    if (!user?.id) {
      onRequireSignIn?.('Sign in to post on the feed.');
      return;
    }

    setPosting(true);
    setComposerError('');

    try {
      let imageUrl = null;
      let mediaItems = null;

      if (!pollMode && postImages.length > 0) {
        const uploaded = [];
        for (const img of postImages) {
          const up = await uploadPostImage(img.file, user.id);
          if (!up.ok) {
            setComposerError(up.error || 'Image upload failed.');
            setPosting(false);
            return;
          }
          uploaded.push({ url: up.url });
        }

        if (uploaded.length >= 2) {
          mediaItems = {
            slides: uploaded,
            caption: carouselCaption.trim(),
          };
          imageUrl = uploaded[0].url;
        } else if (uploaded.length === 1) {
          imageUrl = uploaded[0].url;
        }
      }

      const pollData = pollMode
        ? {
            options: [
              { text: pollOptions[0].trim(), votes: 0 },
              { text: pollOptions[1].trim(), votes: 0 },
            ],
          }
        : null;

      const res = await createPost({
        userId: user.id,
        content: postText,
        imageUrl,
        mediaItems,
        pollData,
      });

      if (!res.ok) {
        setComposerError(res.error || 'Could not post.');
        setPosting(false);
        return;
      }

      const saved = res.post || {};
      const { items: mappedMedia, caption: savedCaption } = parseMediaCarouselForFeed(saved.media_items);

      const newItem = {
        id: saved.id || `local-${Date.now()}`,
        type: 'post',
        postType: saved.post_type || (pollMode ? 'poll' : 'post'),
        content: saved.content ?? postText.trim(),
        image: saved.image_url ?? imageUrl ?? null,
        mediaItems: mappedMedia,
        carouselCaption: savedCaption || carouselCaption.trim(),
        isCarousel: mappedMedia.length >= 2,
        pollData: saved.poll_data || pollData,
        userPollVote: null,
        likes: 0,
        comments: 0,
        shares: 0,
        time: 'Just now',
        createdAt: saved.created_at || new Date().toISOString(),
        publishedAt: saved.created_at || new Date().toISOString(),
        hasImage: !!(saved.image_url ?? imageUrl ?? mappedMedia.length),
        isLiked: false,
        isSaved: false,
        user: {
          id: user.id,
          name: profile?.display_name || profile?.username || 'You',
          username: profile?.username || 'you',
          avatar: '🎬',
          avatarUrl: profile?.avatar_url || null,
          isVerified: !!profile?.is_verified,
        },
        movie: null,
        rating: null,
        editCount: 0,
        canEdit: true,
      };

      onPostCreated?.(newItem);
      resetComposer();

      getFeedPosts({ limit: 30, userId: user.id, mode: feedScope }).then((reload) => {
        if (reload.ok && reload.items.length) {
          onFeedReload?.(reload.items);
        }
      });
    } catch (err) {
      setComposerError(err?.message || 'Something went wrong.');
    } finally {
      setPosting(false);
    }
  };

  const placeholder = pollMode
    ? 'Ask a question… / movie · @ people · # hashtags'
    : isCarousel
      ? 'Body text (optional)… / movie · @ people · # hashtags'
      : "What's happening? / movie · @ people · # hashtags";

  // overflow-visible so @ / # / movie pickers aren't clipped on mobile/iPad
  return (
    <div className="relative z-30 border-b border-[var(--color-border)] bg-transparent overflow-visible">
      {!isAuthenticated ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            Browse the feed freely. Sign in to post, like, and unlock AI recommendations.
          </p>
          <Link
            to="/auth"
            state={{ from: '/' }}
            className="shrink-0 px-4 py-2 rounded-full bg-[var(--color-theater)] text-[#0f1419] text-sm font-semibold hover:bg-[var(--primary-hover)]"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <div className="px-4 pt-3 pb-2 overflow-visible">
          <div className="flex gap-3 overflow-visible">
            <div className="w-10 h-10 rounded-full bg-[var(--color-surface-subtle)] flex items-center justify-center text-base shrink-0 overflow-hidden mt-0.5">
              {profile?.avatar_url || user?.user_metadata?.avatar_url ? (
                <img
                  src={profile?.avatar_url || user.user_metadata.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                '🎬'
              )}
            </div>

            <div className="flex-1 min-w-0 overflow-visible relative z-40">
              <MentionEditor
                value={postText}
                onChange={(val) => {
                  setPostText(val);
                  if (composerError) setComposerError('');
                }}
                placeholder={placeholder}
                className="w-full bg-transparent text-[19px] text-[var(--color-text)] py-1 leading-snug"
                minHeightClass={
                  pollMode || isCarousel || postImages.length === 1
                    ? 'min-h-[48px]'
                    : 'min-h-[56px]'
                }
              />

              {pollMode && (
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    value={pollOptions[0]}
                    onChange={(e) => setPollOptions([e.target.value, pollOptions[1]])}
                    placeholder="Choice 1"
                    maxLength={80}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2.5 text-[15px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-theater)]"
                  />
                  <input
                    type="text"
                    value={pollOptions[1]}
                    onChange={(e) => setPollOptions([pollOptions[0], e.target.value])}
                    placeholder="Choice 2"
                    maxLength={80}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2.5 text-[15px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-theater)]"
                  />
                  <button
                    type="button"
                    onClick={disablePollMode}
                    className="text-xs text-[var(--color-theater)] hover:underline"
                  >
                    Remove poll
                  </button>
                </div>
              )}

              {!pollMode && postImages.length === 1 && (
                <div className="relative mt-3 rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-background)]">
                  <div className="relative flex items-center justify-center min-h-[160px] max-h-[360px] w-full">
                    <img
                      src={postImages[0].preview}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50 pointer-events-none"
                    />
                    <div className="absolute inset-0 bg-black/35 pointer-events-none" />
                    <img
                      src={postImages[0].preview}
                      alt="preview"
                      className="relative z-[1] block max-w-full max-h-[360px] w-auto h-auto object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      revokePreview(postImages[0].preview);
                      setPostImages([]);
                    }}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-[#0f1419]/75 text-[#e7e9ea] flex items-center justify-center hover:bg-[#0f1419]"
                    aria-label="Remove image"
                  >
                    ✕
                  </button>
                </div>
              )}

              {!pollMode && isCarousel && (
                <div className="mt-3 rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-background)]">
                  <div className="relative">
                    <div
                      ref={carouselRef}
                      className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth"
                      style={{ scrollbarWidth: 'none' }}
                      onScroll={() => {
                        const el = carouselRef.current;
                        if (!el) return;
                        const idx = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
                        setCarouselIndex(Math.min(Math.max(idx, 0), postImages.length - 1));
                      }}
                    >
                      {postImages.map((img) => (
                        <div key={img.id} className="w-full shrink-0 snap-center">
                          <div className="relative flex items-center justify-center min-h-[160px] max-h-[360px] w-full">
                            <img
                              src={img.preview}
                              alt=""
                              aria-hidden
                              className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50 pointer-events-none"
                            />
                            <div className="absolute inset-0 bg-black/40 pointer-events-none" />
                            <img
                              src={img.preview}
                              alt=""
                              className="relative z-[1] block max-w-full max-h-[360px] w-auto h-auto object-contain"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {postImages.length > 1 && carouselIndex > 0 && (
                      <button
                        type="button"
                        onClick={() => goCarousel(-1)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/75"
                        aria-label="Previous"
                      >
                        <FiChevronLeft />
                      </button>
                    )}
                    {postImages.length > 1 && carouselIndex < postImages.length - 1 && (
                      <button
                        type="button"
                        onClick={() => goCarousel(1)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/75"
                        aria-label="Next"
                      >
                        <FiChevronRight />
                      </button>
                    )}

                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                      {postImages.map((img, i) => (
                        <span
                          key={img.id}
                          className={`h-1.5 rounded-full transition-all ${
                            i === carouselIndex ? 'w-3 bg-white' : 'w-1.5 bg-white/40'
                          }`}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleRemoveCurrentImage}
                      className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-[#0f1419]/75 text-[#e7e9ea] flex items-center justify-center hover:bg-[#0f1419]"
                      aria-label="Remove image"
                    >
                      ✕
                    </button>

                    {postImages.length < POST_IMAGE_MAX_COUNT && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0f1419]/75 text-[#e7e9ea] text-xs hover:bg-[#0f1419]"
                      >
                        <FiPlus className="text-sm" />
                        Add
                      </button>
                    )}
                  </div>

                  <div className="px-3 py-2.5 border-t border-[var(--color-border)]">
                    <input
                      type="text"
                      value={carouselCaption}
                      onChange={(e) => setCarouselCaption(e.target.value)}
                      placeholder="Add a caption (optional)"
                      maxLength={220}
                      className="w-full bg-transparent text-[14px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none focus:placeholder:text-[var(--color-text-secondary)]"
                    />
                  </div>
                </div>
              )}

              {composerError && (
                <p className="text-xs text-[var(--color-danger)] mt-2">{composerError}</p>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handleImageChange}
                className="hidden"
              />

              <div className="flex items-center justify-between pt-2 mt-1">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={pollMode || postImages.length >= POST_IMAGE_MAX_COUNT}
                    title="Add images"
                    className="p-2 rounded-full hover:bg-[var(--color-surface-subtle)] transition-colors disabled:cursor-not-allowed"
                  >
                    <FaImage
                      size={18}
                      color={pollMode || postImages.length >= POST_IMAGE_MAX_COUNT ? ICON_GREY_DISABLED : ICON_GREY}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={pollMode ? disablePollMode : enablePollMode}
                    disabled={postImages.length > 0}
                    title="Create poll (2 choices)"
                    className={`p-2 rounded-full transition-colors disabled:cursor-not-allowed hover:bg-[var(--color-surface-subtle)] ${
                      pollMode ? 'bg-[var(--color-surface-subtle)]' : ''
                    }`}
                  >
                    <FaPollH
                      size={18}
                      color={postImages.length > 0 ? ICON_GREY_DISABLED : ICON_GREY}
                    />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {(postText.length > 0 || getPlainTextLength(postText) > 0) && (
                    <span
                      className={`text-[12px] ${
                        getPlainTextLength(postText) > 500 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]'
                      }`}
                    >
                      {getPlainTextLength(postText)}/500
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleCreatePost}
                    disabled={posting || !canPost}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold min-w-[72px] transition-colors ${
                      canPost && !posting
                        ? 'bg-[var(--color-theater)] text-[#0f1419] hover:bg-[var(--primary-hover)]'
                        : 'bg-[var(--color-theater)]/35 text-[#0f1419]/50 cursor-not-allowed'
                    }`}
                  >
                    {posting ? 'Posting…' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
