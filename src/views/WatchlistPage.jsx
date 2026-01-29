import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSelector } from 'react-redux';
import { getUserWatchlist, toggleWatchlist } from '../lib/supabase';
import { FaBookmark, FaTrash } from 'react-icons/fa';

const WatchlistPage = () => {
    const navigate = useNavigate();
    const { username } = useParams();
    const { isAuthenticated, profile, user, loading: authLoading } = useAuth();
    const imageURL = useSelector((state) => state.movieData.imageURL);

    const [watchlist, setWatchlist] = useState([]);
    const [loading, setLoading] = useState(true);
    const [removing, setRemoving] = useState(null);

    // Check if viewing own profile
    const isOwnProfile = profile?.username === username;

    useEffect(() => {
        const loadWatchlist = async () => {
            if (user?.id) {
                setLoading(true);
                const data = await getUserWatchlist(user.id);
                setWatchlist(data);
                setLoading(false);
            } else {
                setLoading(false);
            }
        };
        loadWatchlist();
    }, [user?.id]);

    // Redirect if not authenticated and viewing own profile
    useEffect(() => {
        if (!authLoading && !isAuthenticated && isOwnProfile) {
            navigate('/auth');
        }
    }, [isAuthenticated, authLoading, isOwnProfile, navigate]);

    const handleRemove = async (movie) => {
        setRemoving(movie.movie_id);
        const result = await toggleWatchlist(user.id, movie.movie_id, movie.movie_title, movie.poster_path, movie.media_type);
        if (result.success) {
            setWatchlist(prev => prev.filter(m => m.movie_id !== movie.movie_id));
        }
        setRemoving(null);
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] pt-24 pb-12 px-4">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <Link
                            to={`/${username}/profile`}
                            className="text-white/50 hover:text-white text-sm mb-2 inline-flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Back to Profile
                        </Link>
                        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                            <FaBookmark className="text-yellow-400" />
                            {isOwnProfile ? 'My Watchlist' : `@${username}'s Watchlist`}
                        </h1>
                        <p className="text-white/50 mt-1">{watchlist.length} movies to watch</p>
                    </div>
                </div>

                {/* Watchlist Grid */}
                {watchlist.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {watchlist.map((movie) => (
                            <div
                                key={movie.id}
                                className="group relative rounded-xl overflow-hidden bg-[#1a1a1a] border border-white/5 hover:border-yellow-500/30 transition-all"
                            >
                                <Link to={`/${movie.media_type || 'movie'}/${movie.movie_id}`}>
                                    <div className="aspect-[2/3] relative">
                                        {movie.poster_path ? (
                                            <img
                                                src={`${imageURL}${movie.poster_path}`}
                                                alt={movie.movie_title}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                                                <span className="text-4xl">🎬</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </Link>
                                <div className="p-3 flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-medium text-white truncate">{movie.movie_title}</h3>
                                        <p className="text-xs text-white/40">
                                            Added {new Date(movie.added_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    {isOwnProfile && (
                                        <button
                                            onClick={() => handleRemove(movie)}
                                            disabled={removing === movie.movie_id}
                                            className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
                                            title="Remove from watchlist"
                                        >
                                            {removing === movie.movie_id ? (
                                                <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <FaTrash className="text-xs" />
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 rounded-2xl bg-[#1a1a1a] border border-white/5">
                        <span className="text-6xl mb-4 block">📋</span>
                        <h3 className="text-xl font-bold text-white mb-2">
                            {isOwnProfile ? 'Your watchlist is empty' : 'No movies in watchlist'}
                        </h3>
                        <p className="text-white/50 mb-6">
                            {isOwnProfile ? 'Click the bookmark icon on any movie to add it here!' : 'This user hasn\'t added any movies yet.'}
                        </p>
                        {isOwnProfile && (
                            <Link
                                to="/"
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium hover:from-orange-600 hover:to-red-600 transition-all"
                            >
                                Explore Movies
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default WatchlistPage;
