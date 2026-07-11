import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaUserFriends, FaUserPlus } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import {
    getUserFollowers,
    getUserFollowing,
    toggleFollow,
} from '../../lib/supabase';

const AVATARS = {
    avatar_1: { emoji: '🎬', bg: 'from-red-500 to-pink-500' },
    avatar_2: { emoji: '🎭', bg: 'from-purple-500 to-indigo-500' },
    avatar_3: { emoji: '🎪', bg: 'from-yellow-500 to-orange-500' },
    avatar_4: { emoji: '🌟', bg: 'from-amber-400 to-yellow-500' },
    avatar_5: { emoji: '🎯', bg: 'from-green-500 to-emerald-500' },
    avatar_6: { emoji: '🦋', bg: 'from-pink-400 to-purple-500' },
    avatar_7: { emoji: '🌈', bg: 'from-cyan-500 to-blue-500' },
    avatar_8: { emoji: '🎸', bg: 'from-rose-500 to-red-600' },
};

function avatarFor(id) {
    return AVATARS[id] || AVATARS.avatar_1;
}

/**
 * Cinema Feed → Following tab: your Followers and Following people lists
 * (not activity from people you follow).
 */
export default function FollowersFollowingPanel() {
    const { user, isAuthenticated, loading: authLoading } = useAuth();
    const [mode, setMode] = useState('following'); // 'followers' | 'following'
    const [loading, setLoading] = useState(true);
    const [followers, setFollowers] = useState([]);
    const [following, setFollowing] = useState([]);
    const [myFollowingIds, setMyFollowingIds] = useState(new Set());
    const [busyId, setBusyId] = useState(null);

    useEffect(() => {
        if (authLoading) return undefined;
        if (!user?.id) {
            setLoading(false);
            setFollowers([]);
            setFollowing([]);
            return undefined;
        }

        let cancelled = false;
        (async () => {
            setLoading(true);
            const [followersList, followingList] = await Promise.all([
                getUserFollowers(user.id),
                getUserFollowing(user.id),
            ]);
            if (cancelled) return;
            setFollowers(followersList || []);
            setFollowing(followingList || []);
            setMyFollowingIds(new Set((followingList || []).map((p) => p.id)));
            setLoading(false);
        })();

        return () => { cancelled = true; };
    }, [user?.id, authLoading]);

    const handleToggle = async (targetId) => {
        if (!user?.id || busyId) return;
        setBusyId(targetId);
        const res = await toggleFollow(user.id, targetId);
        if (res.success) {
            setMyFollowingIds((prev) => {
                const next = new Set(prev);
                if (res.following) next.add(targetId);
                else next.delete(targetId);
                return next;
            });
            // Keep the Following list in sync when unfollowing from that tab
            if (mode === 'following' && !res.following) {
                setFollowing((prev) => prev.filter((p) => p.id !== targetId));
            }
            if (res.following) {
                // If we follow someone from Followers tab, refresh following count via set
                const already = following.some((p) => p.id === targetId);
                if (!already) {
                    const person = followers.find((p) => p.id === targetId);
                    if (person) setFollowing((prev) => [person, ...prev]);
                }
            }
        }
        setBusyId(null);
    };

    if (authLoading || loading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
                ))}
            </div>
        );
    }

    if (!isAuthenticated || !user?.id) {
        return (
            <div className="rounded-xl border border-dashed border-white/10 bg-[#1a1d1f] p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-[var(--accent-green)]/15 text-[var(--accent-green)] flex items-center justify-center mx-auto mb-3">
                    <FaUserFriends className="text-xl" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1">See who you follow</h3>
                <p className="text-sm text-white/50 mb-5">Sign in to view your followers and following.</p>
                <Link
                    to="/auth"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent-green)] text-black text-sm font-semibold"
                >
                    Sign In
                </Link>
            </div>
        );
    }

    const people = mode === 'followers' ? followers : following;

    return (
        <div>
            <div className="flex items-center gap-2 mb-4">
                {[
                    { id: 'following', label: 'Following', count: following.length },
                    { id: 'followers', label: 'Followers', count: followers.length },
                ].map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setMode(t.id)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                            mode === t.id
                                ? 'bg-white text-black'
                                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                        {t.label}
                        <span className={`ml-1.5 tabular-nums ${mode === t.id ? 'text-black/50' : 'text-white/35'}`}>
                            {t.count}
                        </span>
                    </button>
                ))}
            </div>

            {people.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-[#1a1d1f] p-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-white/5 text-white/40 flex items-center justify-center mx-auto mb-3">
                        <FaUserPlus className="text-xl" />
                    </div>
                    <h3 className="text-base font-semibold text-white mb-1">
                        {mode === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                    </h3>
                    <p className="text-sm text-white/50 mb-5">
                        {mode === 'followers'
                            ? 'When people follow you, they’ll show up here.'
                            : 'Find people in search or from Who to follow.'}
                    </p>
                    {mode === 'following' && (
                        <Link
                            to="/search"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/15"
                        >
                            Find people
                        </Link>
                    )}
                </div>
            ) : (
                <ul className="space-y-1">
                    {people.map((p) => {
                        const avatar = avatarFor(p.avatar_id);
                        const isSelf = user.id === p.id;
                        const isFollowing = myFollowingIds.has(p.id);
                        return (
                            <li
                                key={p.id}
                                className="flex items-center gap-3 px-3 py-3 rounded-xl bg-[#1a1d1f] border border-white/5 hover:border-white/10 transition-colors"
                            >
                                <Link
                                    to={`/${p.username}/profile`}
                                    className="flex items-center gap-3 flex-1 min-w-0"
                                >
                                    {p.avatar_url ? (
                                        <img
                                            src={p.avatar_url}
                                            alt=""
                                            className="w-11 h-11 rounded-full object-cover shrink-0 bg-white/5"
                                        />
                                    ) : (
                                        <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${avatar.bg} flex items-center justify-center text-xl shrink-0`}>
                                            {avatar.emoji}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-white truncate">
                                            {p.display_name || p.username}
                                        </p>
                                        <p className="text-xs text-white/40 truncate">@{p.username}</p>
                                    </div>
                                </Link>
                                {!isSelf && (
                                    <button
                                        type="button"
                                        onClick={() => handleToggle(p.id)}
                                        disabled={busyId === p.id}
                                        className={`text-xs px-3.5 py-1.5 rounded-full font-semibold shrink-0 disabled:opacity-50 transition-colors ${
                                            isFollowing
                                                ? 'bg-white/10 text-white/70 hover:bg-white/15'
                                                : 'bg-[var(--accent-green)] text-black hover:brightness-110'
                                        }`}
                                    >
                                        {busyId === p.id ? '…' : isFollowing ? 'Following' : 'Follow'}
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
