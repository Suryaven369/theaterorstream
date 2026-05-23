import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProfileByUsername } from '../lib/supabase';
import { getUserActivityFeed } from '../lib/movieDiary';
import ActivityFeedList from '../components/social/ActivityFeedList';
import { FaHistory, FaArrowLeft } from 'react-icons/fa';

const ActivityFeedPage = () => {
    const { username } = useParams();
    const { profile, user, loading: authLoading } = useAuth();

    const [feed, setFeed] = useState([]);
    const [loading, setLoading] = useState(true);
    const [targetProfile, setTargetProfile] = useState(null);

    const isOwnProfile = profile?.username === username;

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            let targetUserId = null;

            if (isOwnProfile) {
                targetUserId = user?.id;
                setTargetProfile(profile);
            } else {
                const p = await getProfileByUsername(username);
                if (p) {
                    targetUserId = p.id;
                    setTargetProfile(p);
                }
            }

            if (targetUserId) {
                const activity = await getUserActivityFeed(targetUserId, 50);
                setFeed(activity);
            }
            setLoading(false);
        };

        if (!authLoading) {
            loadData();
        }
    }, [username, user?.id, isOwnProfile, authLoading, profile]);

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!targetProfile && !loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">User not found</h2>
                    <Link to="/" className="text-orange-400">Go Home</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] pt-24 pb-12 px-4">
            <div className="max-w-2xl mx-auto">
                <Link
                    to={`/${username}/profile`}
                    className="text-white/50 hover:text-white text-sm mb-4 inline-flex items-center gap-2"
                >
                    <FaArrowLeft />
                    Back to Profile
                </Link>
                <div className="flex items-center justify-between gap-4 mb-8">
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <FaHistory className="text-orange-500" />
                        {isOwnProfile ? 'Your Activity' : `@${username}'s Activity`}
                    </h1>
                    {isOwnProfile && (
                        <Link to="/feed" className="text-sm text-yellow-400 hover:text-yellow-300">
                            Following feed →
                        </Link>
                    )}
                </div>

                <ActivityFeedList items={feed} />
            </div>
        </div>
    );
};

export default ActivityFeedPage;
