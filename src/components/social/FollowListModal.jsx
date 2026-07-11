import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaTimes } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { getUserFollowers, getUserFollowing, toggleFollow, getUserFollowing as fetchMyFollowing } from '../../lib/supabase';

const AVATARS = {
    avatar_1: { emoji: '🎬', bg: 'from-red-500 to-pink-500' },
    avatar_2: { emoji: '🎭', bg: 'from-purple-500 to-indigo-500' },
    avatar_3: { emoji: '🎪', bg: 'from-yellow-500 to-orange-500' },
    avatar_4: { emoji: '🌟', bg: 'from-amber-400 to-yellow-500' },
    avatar_5: { emoji: '🎯', bg: 'from-green-500 to-emerald-500' },
    avatar_6: { emoji: '🦋', bg: 'from-pink-400 to-purple-500' },
};

function avatarFor(id) {
    return AVATARS[id] || AVATARS.avatar_1;
}

/**
 * Followers / following list. `mode` is 'followers' | 'following', `userId` is the
 * profile being viewed. Shows a follow/unfollow button for everyone except yourself.
 */
export default function FollowListModal({ userId, mode, title, onClose }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [people, setPeople] = useState([]);
    const [myFollowing, setMyFollowing] = useState(new Set());
    const [busyId, setBusyId] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            const [list, mine] = await Promise.all([
                mode === 'followers' ? getUserFollowers(userId) : getUserFollowing(userId),
                user?.id ? fetchMyFollowing(user.id) : Promise.resolve([]),
            ]);
            if (cancelled) return;
            setPeople(list || []);
            setMyFollowing(new Set((mine || []).map((p) => p.id)));
            setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [userId, mode, user?.id]);

    const handleToggle = async (targetId) => {
        if (!user?.id || busyId) return;
        setBusyId(targetId);
        const res = await toggleFollow(user.id, targetId);
        if (res.success) {
            setMyFollowing((prev) => {
                const next = new Set(prev);
                if (res.following) next.add(targetId);
                else next.delete(targetId);
                return next;
            });
        }
        setBusyId(null);
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <button type="button" aria-label="Close" className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className="text-base font-bold text-white">{title || (mode === 'followers' ? 'Followers' : 'Following')}</h2>
                    <button onClick={onClose} className="text-white/50 hover:text-white"><FaTimes /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {loading ? (
                        <div className="py-12 flex items-center justify-center">
                            <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : people.length === 0 ? (
                        <p className="text-center text-white/40 text-sm py-12">
                            {mode === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
                        </p>
                    ) : (
                        people.map((p) => {
                            const avatar = avatarFor(p.avatar_id);
                            const isSelf = user?.id === p.id;
                            const isFollowing = myFollowing.has(p.id);
                            return (
                                <div key={p.id} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-white/[0.04]">
                                    <Link to={`/${p.username}/profile`} onClick={onClose} className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatar.bg} flex items-center justify-center text-lg shrink-0`}>
                                            {avatar.emoji}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-white truncate">{p.display_name || p.username}</p>
                                            <p className="text-xs text-white/40 truncate">@{p.username}</p>
                                        </div>
                                    </Link>
                                    {!isSelf && user?.id && (
                                        <button
                                            type="button"
                                            onClick={() => handleToggle(p.id)}
                                            disabled={busyId === p.id}
                                            className={`text-xs px-3 py-1.5 rounded-full font-medium shrink-0 disabled:opacity-50 ${isFollowing
                                                ? 'bg-white/10 text-white/70 hover:bg-white/15'
                                                : 'bg-[var(--accent-green,#22c55e)] text-black'
                                                }`}
                                        >
                                            {isFollowing ? 'Following' : 'Follow'}
                                        </button>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
