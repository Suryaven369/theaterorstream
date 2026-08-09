import React from 'react';
import ReviewCard from './ReviewCard';
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

export default function SocialFeedList({ items = [] }) {
    if (!items.length) {
        return (
            <div className="text-center py-16">
                <p className="text-[var(--text-secondary)]">No activity yet. Be the first to log or review!</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-start gap-1">
            {items.map((item) => {
                if (item.kind === 'review' || item.event_type === 'review' || item.title) {
                    return (
                        <ReviewCard
                            key={`review-${item.id}`}
                            review={item}
                            profile={item.profile}
                            compact
                        />
                    );
                }
                return (
                    <ActivityFeedRow
                        key={`activity-${item.id}`}
                        activity={item}
                        profileUsername={item.profile?.username}
                        authorUsername={item.profile?.username}
                        showUser
                        timeLabel={formatTime(item.created_at)}
                    />
                );
            })}
        </div>
    );
}
