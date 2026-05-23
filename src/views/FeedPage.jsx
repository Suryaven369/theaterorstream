import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaRss, FaArrowLeft } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { getFollowingActivityFeed } from '../lib/movieDiary';
import ActivityFeedList from '../components/social/ActivityFeedList';

export default function FeedPage() {
    const { user } = useAuth();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.id) return;
        getFollowingActivityFeed(user.id, 50).then((data) => {
            setItems(data);
            setLoading(false);
        });
    }, [user?.id]);

    return (
        <div className="min-h-screen bg-[#0a0a0a] pt-24 pb-16 px-4">
            <div className="max-w-2xl mx-auto">
                <Link to="/" className="text-sm text-white/50 hover:text-white inline-flex items-center gap-2 mb-4">
                    <FaArrowLeft /> Home
                </Link>
                <h1 className="text-3xl font-bold text-white flex items-center gap-3 mb-2">
                    <FaRss className="text-orange-400" />
                    Following Feed
                </h1>
                <p className="text-white/45 text-sm mb-8">
                    Activity from people you follow and your own public logs.
                </p>

                {loading ? (
                    <div className="h-40 rounded-xl bg-white/5 animate-pulse" />
                ) : (
                    <ActivityFeedList items={items} showUser />
                )}
            </div>
        </div>
    );
}
