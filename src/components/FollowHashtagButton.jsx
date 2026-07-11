import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { followHashtag, unfollowHashtag } from '../lib/hashtagApi';

export default function FollowHashtagButton({
  hashtagId,
  initialFollowing = false,
  onChange,
  className = '',
}) {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [following, setFollowing] = useState(!!initialFollowing);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!isAuthenticated || !user?.id) {
      navigate('/auth', { state: { from: window.location.pathname } });
      return;
    }
    if (!hashtagId || busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    const result = next
      ? await followHashtag(user.id, hashtagId)
      : await unfollowHashtag(user.id, hashtagId);
    if (!result.ok) setFollowing(!next);
    else onChange?.(next);
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 ${
        following
          ? 'bg-white/10 text-white border border-white/15 hover:bg-white/15'
          : 'bg-orange-500 text-white hover:bg-orange-400'
      } ${className}`}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}
