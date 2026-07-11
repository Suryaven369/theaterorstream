import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchUserSuggestions } from '../../lib/socialFeedApi';
import { toggleFollow } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const AVATAR_EMOJI = ['🎬', '🎭', '🌟', '🎯', '🦋'];

export default function WhoToFollow() {
    const { user } = useAuth();
    const [users, setUsers] = useState([]);
    const [following, setFollowing] = useState(new Set());

    useEffect(() => {
        fetchUserSuggestions(6).then((res) => {
            if (res.ok) setUsers(res.users || []);
        });
    }, []);

    const handleFollow = async (targetId) => {
        if (!user?.id) return;
        const res = await toggleFollow(user.id, targetId);
        if (res.success) {
            setFollowing((prev) => {
                const next = new Set(prev);
                if (res.following) next.add(targetId);
                else next.delete(targetId);
                return next;
            });
        }
    };

    if (!users.length) return null;

    return (
        <div className="surface-card p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Who to follow</h3>
            <ul className="space-y-3">
                {users.map((u, i) => (
                    <li key={u.id} className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-lg">
                            {AVATAR_EMOJI[i % AVATAR_EMOJI.length]}
                        </span>
                        <div className="flex-1 min-w-0">
                            <Link to={`/${u.username}/profile`} className="text-sm font-medium text-white hover:text-[var(--primary)] truncate block">
                                @{u.username}
                            </Link>
                            {u.matchScore > 0 && (
                                <p className="text-[10px] text-[var(--accent-green)]">Similar taste</p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => handleFollow(u.id)}
                            className={`text-xs px-3 py-1.5 rounded-full font-medium ${following.has(u.id)
                                ? 'bg-white/10 text-white/60'
                                : 'bg-[var(--accent-green)] text-black'
                                }`}
                        >
                            {following.has(u.id) ? 'Following' : 'Follow'}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
