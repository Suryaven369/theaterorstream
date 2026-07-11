import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus, FaCheck } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { toggleEntityFollow, isFollowingEntity } from '../lib/profileSystem';

/**
 * Follow/unfollow a non-user entity (director, genre, franchise, collection,
 * actor, creator). Persists to entity_follows so the user's "Following" feed can
 * surface that entity's new content.
 */
const FollowEntityButton = ({ targetType, targetId, targetLabel, targetImage, size = 'sm', className = '' }) => {
    const navigate = useNavigate();
    const { user, isAuthenticated } = useAuth();
    const [following, setFollowing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let alive = true;
        if (user?.id && targetId) {
            isFollowingEntity(user.id, targetType, targetId).then((f) => { if (alive) { setFollowing(f); setReady(true); } });
        } else {
            setReady(true);
        }
        return () => { alive = false; };
    }, [user?.id, targetType, targetId]);

    const onClick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isAuthenticated) {
            sessionStorage.setItem('authMessage', 'Please sign up or login to follow');
            return navigate('/auth');
        }
        setBusy(true);
        const next = !following;
        setFollowing(next); // optimistic
        const r = await toggleEntityFollow(user.id, { targetType, targetId, targetLabel, targetImage });
        if (!r.success) setFollowing(!next);
        else setFollowing(r.following);
        setBusy(false);
    };

    const pad = size === 'xs' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';

    return (
        <button
            onClick={onClick}
            disabled={busy || !ready}
            className={`inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors ${pad} ${following
                ? 'bg-white/10 text-white hover:bg-red-500/20 hover:text-red-400'
                : 'bg-[var(--accent-green)] text-[#14181c] hover:bg-[#00e054]'} ${className}`}
        >
            {following ? <><FaCheck className="text-[10px]" /> Following</> : <><FaPlus className="text-[10px]" /> Follow</>}
        </button>
    );
};

export default FollowEntityButton;
