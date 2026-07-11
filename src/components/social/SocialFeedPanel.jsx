import React, { useCallback, useEffect, useState } from 'react';
import { fetchGlobalFeed, fetchForYouFeed } from '../../lib/socialFeedApi';
import { fetchStreak } from '../../lib/socialReviews';
import SocialFeedList from './SocialFeedList';
import WhoToFollow from './WhoToFollow';
import DiaryFeedTab from './DiaryFeedTab';
import FollowersFollowingPanel from './FollowersFollowingPanel';

const TABS = [
    { id: 'diary', label: 'Diary' },
    { id: 'recent', label: 'Recent' },
    { id: 'following', label: 'Following' },
    { id: 'for-you', label: 'For You' },
];

export default function SocialFeedPanel() {
    const [tab, setTab] = useState('recent');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [streak, setStreak] = useState(null);

    const loadFeed = useCallback(async () => {
        if (tab === 'diary' || tab === 'following') {
            setLoading(false);
            setItems([]);
            return;
        }
        setLoading(true);
        const res = tab === 'for-you'
            ? await fetchForYouFeed({ limit: 30 })
            : await fetchGlobalFeed({ mode: tab, limit: 30 });
        setItems(res.items || []);
        setLoading(false);
    }, [tab]);

    useEffect(() => {
        loadFeed();
    }, [loadFeed]);

    useEffect(() => {
        fetchStreak().then(setStreak);
    }, []);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div className="flex gap-1 border-b border-[var(--border-color)] overflow-x-auto scrollbar-none flex-1">
                        {TABS.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setTab(t.id)}
                                className={`feed-tab whitespace-nowrap ${tab === t.id ? 'feed-tab-active' : ''}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    {streak?.current_streak > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg surface-card shrink-0">
                            <span className="streak-flame text-base">🔥</span>
                            <span className="text-xs font-semibold text-white">{streak.current_streak}d streak</span>
                        </div>
                    )}
                </div>

                {tab === 'following' ? (
                    <FollowersFollowingPanel />
                ) : tab === 'diary' ? (
                    <DiaryFeedTab />
                ) : loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-32 rounded-xl bg-white/5 animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <SocialFeedList items={items} />
                )}
            </div>
            <aside className="space-y-4 hidden lg:block">
                <WhoToFollow />
            </aside>
        </div>
    );
}
