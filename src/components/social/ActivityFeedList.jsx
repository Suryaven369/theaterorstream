import React from 'react';
import ActivityFeedRow from './ActivityFeedRow';

function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ActivityFeedList({ items = [], showUser = false }) {
    if (!items.length) {
        return (
            <div className="text-center py-12">
                <p className="text-white/40">No activity yet</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-start gap-1">
            {items.map((item) => (
                <ActivityFeedRow
                    key={item.id}
                    activity={item}
                    profileUsername={item.profile?.username}
                    authorUsername={showUser ? item.profile?.username : undefined}
                    showUser={showUser}
                    timeLabel={formatTime(item.created_at)}
                />
            ))}
        </div>
    );
}
