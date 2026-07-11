import React from 'react';
import ReviewCard from './ReviewCard';
import ActivityFeedList from './ActivityFeedList';

export default function SocialFeedList({ items = [] }) {
    if (!items.length) {
        return (
            <div className="text-center py-16 surface-card">
                <p className="text-[var(--text-secondary)]">No activity yet. Be the first to log or review!</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {items.map((item) => {
                if (item.kind === 'review' || item.event_type === 'review' || item.title) {
                    return (
                        <ReviewCard
                            key={`review-${item.id}`}
                            review={item}
                            profile={item.profile}
                        />
                    );
                }
                return (
                    <div key={`activity-${item.id}`} className="surface-card p-0 overflow-hidden">
                        <ActivityFeedList items={[item]} showUser />
                    </div>
                );
            })}
        </div>
    );
}
