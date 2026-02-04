import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getUserWatchedMovies, getAllUserRatings, getProfileByUsername } from '../lib/supabase';
import { FaEye, FaStar, FaHistory } from 'react-icons/fa';

const ActivityFeedPage = () => {
    const navigate = useNavigate();
    const { username } = useParams();
    const { isAuthenticated, profile, user, loading: authLoading } = useAuth();

    const [feed, setFeed] = useState([]);
    const [loading, setLoading] = useState(true);
    const [targetProfile, setTargetProfile] = useState(null);

    // Check if viewing own profile
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
                const [watchedMovies, allRatings] = await Promise.all([
                    getUserWatchedMovies(targetUserId),
                    getAllUserRatings(targetUserId)
                ]);

                const mergedFeed = [
                    ...watchedMovies.map(m => ({
                        ...m,
                        type: 'watched',
                        date: m.watched_at || m.created_at
                    })),
                    ...allRatings.map(r => ({
                        ...r,
                        type: 'rated',
                        date: r.created_at
                    }))
                ].sort((a, b) => new Date(b.date) - new Date(a.date));

                setFeed(mergedFeed);
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
                {/* Header */}
                <div className="mb-8">
                    <Link
                        to={`/${username}/profile`}
                        className="text-white/50 hover:text-white text-sm mb-4 inline-flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Profile
                    </Link>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <div className="bg-orange-500/20 p-2 rounded-lg">
                            <FaHistory className="text-orange-500 text-2xl" />
                        </div>
                        {isOwnProfile ? 'Your Activity' : `@${username}'s Activity`}
                    </h1>
                </div>

                {/* Feed */}
                <div className="space-y-4">
                    {feed.length === 0 ? (
                        <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/5">
                            <p className="text-white/30">No recent activity found</p>
                        </div>
                    ) : (
                        feed.map((item, i) => (
                            <div key={i} className="flex gap-4 p-5 rounded-xl bg-[#1a1a1a] border border-white/5 items-start hover:border-orange-500/30 transition-all">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${item.type === 'watched' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'}`}>
                                    {item.type === 'watched' ? <FaEye className="text-lg" /> : <FaStar className="text-lg" />}
                                </div>
                                <div className="flex-1 min-w-0 pt-1">
                                    <p className="text-white text-base">
                                        <span className="text-white/50 font-medium text-sm block mb-1 uppercase tracking-wider">{item.type === 'watched' ? 'Watched' : 'Rated'}</span>{' '}
                                        <Link to={item.movie_id ? (item.media_type === 'tv' ? `/tv/${item.movie_id}` : `/movie/${item.movie_id}`) : '#'} className="font-bold text-lg hover:text-orange-400 transition-colors">
                                            {item.movie_title || 'Unknown Title'}
                                        </Link>
                                    </p>
                                    {item.type === 'rated' && (
                                        <div className="mt-2 flex gap-1 bg-white/5 inline-flex p-1.5 rounded-lg">
                                            {[...Array(5)].map((_, i) => (
                                                <FaStar key={i} className={`text-sm ${i < Math.round((item.acting + item.screenplay + item.sound + item.direction + item.entertainment + item.pacing + item.cinematography) / 7) ? 'text-orange-400' : 'text-white/10'}`} />
                                            ))}
                                        </div>
                                    )}
                                    <p className="text-xs text-white/30 mt-3 font-mono">
                                        {new Date(item.date).toLocaleString(undefined, {
                                            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                                            hour: '2-digit', minute: '2-digit'
                                        })}
                                    </p>
                                </div>
                                {item.poster_path && (
                                    <Link to={item.movie_id ? (item.media_type === 'tv' ? `/tv/${item.movie_id}` : `/movie/${item.movie_id}`) : '#'}>
                                        <img
                                            src={item.poster_path.startsWith('http') ? item.poster_path : `https://image.tmdb.org/t/p/w92${item.poster_path}`}
                                            alt=""
                                            className="w-12 h-18 object-cover rounded bg-white/5 border border-white/10 hover:opacity-80 transition-opacity"
                                        />
                                    </Link>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default ActivityFeedPage;
