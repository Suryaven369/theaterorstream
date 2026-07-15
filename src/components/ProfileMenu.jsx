import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    FiRss,
    FiEdit3,
    FiBookmark,
    FiFolder,
    FiCompass,
    FiAward,
    FiLogOut,
    FiChevronRight,
} from 'react-icons/fi';
import { getUserBadges } from '../lib/movieDiary';

const AVATARS = {
    avatar_1: { emoji: '🎬', bg: 'from-red-500 to-pink-500' },
    avatar_2: { emoji: '🎭', bg: 'from-purple-500 to-indigo-500' },
    avatar_3: { emoji: '🎪', bg: 'from-yellow-500 to-orange-500' },
    avatar_4: { emoji: '🌟', bg: 'from-amber-400 to-yellow-500' },
    avatar_5: { emoji: '🎯', bg: 'from-green-500 to-emerald-500' },
    avatar_6: { emoji: '🦋', bg: 'from-pink-400 to-purple-500' },
    avatar_7: { emoji: '🌈', bg: 'from-cyan-500 to-blue-500' },
    avatar_8: { emoji: '🎸', bg: 'from-rose-500 to-red-600' },
    avatar_9: { emoji: '🎮', bg: 'from-indigo-500 to-purple-600' },
    avatar_10: { emoji: '📚', bg: 'from-teal-500 to-green-500' },
    avatar_11: { emoji: '🚀', bg: 'from-blue-500 to-cyan-500' },
    avatar_12: { emoji: '🎨', bg: 'from-fuchsia-500 to-pink-500' },
};

function MenuRow({ to, icon: Icon, label, sublabel, onClick }) {
    const className =
        'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left text-sm text-white/90 hover:bg-white/[0.06] transition-colors group';

    const inner = (
        <>
            <span className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0 text-white/55 group-hover:text-white/80">
                <Icon className="text-lg" />
            </span>
            <span className="flex-1 min-w-0">
                <span className="block font-medium truncate">{label}</span>
                {sublabel && <span className="block text-xs text-white/40 truncate">{sublabel}</span>}
            </span>
            <FiChevronRight className="text-white/20 group-hover:text-white/40 shrink-0" />
        </>
    );

    if (to) {
        return (
            <Link to={to} onClick={onClick} className={className}>
                {inner}
            </Link>
        );
    }

    return (
        <button type="button" onClick={onClick} className={className}>
            {inner}
        </button>
    );
}

export default function ProfileMenu({ profile, userId, isOnboarded, onClose, onSignOut }) {
    const [badgeCount, setBadgeCount] = useState(null);
    const avatar = AVATARS[profile?.avatar_id] || { emoji: '👤', bg: 'from-gray-500 to-gray-600' };
    const username = profile?.username;

    useEffect(() => {
        if (!userId || !onClose) return;
        let cancelled = false;
        getUserBadges(userId).then((badges) => {
            if (!cancelled) setBadgeCount(badges.length);
        });
        return () => { cancelled = true; };
    }, [userId]);

    const close = onClose || (() => {});

    return (
        <div className="profile-menu w-[280px] sm:w-[300px] bg-[#1c1c1c] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden animate-fadeIn">
            <Link
                to={username ? `/${username}/profile` : '/profile'}
                onClick={close}
                className="flex items-center gap-3 p-3 mx-2 mt-2 rounded-xl hover:bg-white/[0.06] transition-colors"
            >
                <div className={`w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-lg shrink-0 ${profile?.avatar_url ? 'bg-[#14181c]' : `bg-gradient-to-br ${avatar.bg}`}`}>
                    {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                        avatar.emoji
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">View Profile</p>
                    {username && <p className="text-xs text-white/45 truncate">@{username}</p>}
                </div>
                <FiChevronRight className="text-white/30 shrink-0" />
            </Link>

            <div className="h-px bg-white/[0.06] mx-3 my-2" />

            <nav className="px-2 py-1 space-y-0.5">
                {isOnboarded && username ? (
                    <>
                        <MenuRow to="/feed" icon={FiRss} label="Cinema Feed" sublabel="Popular, following & for you" onClick={close} />
                        <MenuRow to={`/${username}/blogs`} icon={FiEdit3} label="Blogs" sublabel="Write & manage posts" onClick={close} />
                        <MenuRow to={`/${username}/watchlist`} icon={FiBookmark} label="Watchlist" onClick={close} />
                        <MenuRow to={`/${username}/collections`} icon={FiFolder} label="Lists" onClick={close} />
                        <MenuRow to={`/${username}/boards`} icon={FiCompass} label="Boards" onClick={close} />
                        <MenuRow to="/boards" icon={FiCompass} label="Explore Boards" onClick={close} />
                        <MenuRow
                            to={`/${username}/achievements`}
                            icon={FiAward}
                            label="Achievements"
                            sublabel={badgeCount != null ? `${badgeCount} unlocked` : undefined}
                            onClick={close}
                        />
                    </>
                ) : null}
            </nav>

            <div className="h-px bg-white/[0.06] mx-3 my-2" />

            <div className="px-2 pb-2">
                <button
                    type="button"
                    onClick={onSignOut}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-white/70 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                    <span className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center">
                        <FiLogOut className="text-lg" />
                    </span>
                    <span className="font-medium">Log Out</span>
                </button>
            </div>
        </div>
    );
}
