import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaImage } from 'react-icons/fa';
import MentionEditor from '../MentionEditor';
import { getPlainTextLength } from '../../lib/movieMentions';
import { createPost, getFeedPosts, uploadPostImage } from '../../lib/socialFeedApi';

/**
 * Home feed composer — guest CTA or signed-in post box with optional image.
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
  const [postImageFile, setPostImageFile] = useState(null);
  const [postImagePreview, setPostImagePreview] = useState(null);
  const [posting, setPosting] = useState(false);
  const [composerError, setComposerError] = useState('');
  const fileInputRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setComposerError('');
    if (!file.type.startsWith('image/')) {
      setComposerError('Please choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setComposerError('Image too large (max 5MB).');
      return;
    }
    setPostImageFile(file);
    setPostImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    if (postImagePreview) URL.revokeObjectURL(postImagePreview);
    setPostImageFile(null);
    setPostImagePreview(null);
  };

  const handleCreatePost = async () => {
    if (posting) return;
    if (!postText.trim() && !postImageFile) {
      setComposerError('Write something or add an image.');
      return;
    }
    if (!user?.id) {
      onRequireSignIn?.('Sign in to post on the feed.');
      return;
    }

    setPosting(true);
    setComposerError('');

    try {
      let imageUrl = null;
      if (postImageFile) {
        const up = await uploadPostImage(postImageFile, user.id);
        if (!up.ok) {
          setComposerError(up.error || 'Image upload failed.');
          setPosting(false);
          return;
        }
        imageUrl = up.url;
      }

      const res = await createPost({ userId: user.id, content: postText, imageUrl });
      if (!res.ok) {
        setComposerError(res.error || 'Could not post.');
        setPosting(false);
        return;
      }

      const saved = res.post || {};
      const newItem = {
        id: saved.id || `local-${Date.now()}`,
        type: 'post',
        content: saved.content ?? postText.trim(),
        image: saved.image_url ?? imageUrl ?? null,
        likes: 0,
        comments: 0,
        shares: 0,
        time: 'Just now',
        hasImage: !!(saved.image_url ?? imageUrl),
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
      };
      onPostCreated?.(newItem);

      setPostText('');
      handleRemoveImage();

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

  return (
    <div className="bg-[#1a1d1f] rounded-xl border border-white/5 p-3">
      {!isAuthenticated ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1 py-2">
          <p className="text-sm text-white/60">
            Browse the feed freely. Sign in to post, like, and unlock AI recommendations.
          </p>
          <Link
            to="/auth"
            state={{ from: '/' }}
            className="shrink-0 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-medium hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <div className="flex gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--accent-green)] to-emerald-600 flex items-center justify-center text-base shrink-0 overflow-hidden">
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
          <div className="flex-1">
            <MentionEditor
              value={postText}
              onChange={(val) => {
                setPostText(val);
                if (composerError) setComposerError('');
              }}
              placeholder="What have you watched? / movie · @ people · # hashtags"
              className="w-full bg-transparent text-base text-white py-1.5"
              minHeightClass={postImagePreview ? 'min-h-[52px]' : 'min-h-[28px]'}
            />

            {postImagePreview && (
              <div className="relative mt-2 rounded-xl overflow-hidden border border-white/10">
                <img src={postImagePreview} alt="preview" className="w-full max-h-80 object-cover" />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90"
                  aria-label="Remove image"
                >
                  ✕
                </button>
              </div>
            )}

            {composerError && <p className="text-xs text-red-400 mt-2">{composerError}</p>}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleImageChange}
              className="hidden"
            />

            <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Add image"
                  className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-[var(--accent-green)] transition-colors"
                >
                  <FaImage className="text-sm" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {postText.length > 0 && (
                  <span
                    className={`text-[11px] ${getPlainTextLength(postText) > 500 ? 'text-red-400' : 'text-white/30'}`}
                  >
                    {getPlainTextLength(postText)}/500
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleCreatePost}
                  disabled={
                    posting ||
                    (!postText.trim() && !postImageFile) ||
                    getPlainTextLength(postText) > 500
                  }
                  className="px-4 py-1.5 rounded-full bg-[var(--accent-green)] text-white text-sm font-semibold hover:bg-[var(--accent-green)]/90 transition-colors disabled:opacity-50"
                >
                  {posting ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
