import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSelector } from 'react-redux';
import { getUserWatchedMovies, toggleWatchedMovie, getProfileByUsername } from '../lib/supabase';
import { FaEye, FaTrash, FaCheckCircle } from 'react-icons/fa';

const WatchedMoviesPage = () => {
    const navigate = useNavigate();
    const { username } = useParams();
    const { isAuthenticated, profile, user, loading: authLoading } = useAuth();
    const imageURL = useSelector((state) => state.movieData.imageURL);

    const [watchedMovies, setWatchedMovies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [removing, setRemoving] = useState(null);
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
                const data = await getUserWatchedMovies(targetUserId);
                setWatchedMovies(data);
            }
            setLoading(false);
        };

        if (!authLoading) {
            loadData();
        }
    }, [username, user?.id, isOwnProfile, authLoading, profile]);

    // Redirect if not authenticated and viewing own profile (though public profiles are viewable)
    useEffect(() => {
        if (!authLoading && !isAuthenticated && isOwnProfile) {
            navigate('/auth');
        }
    }, [isAuthenticated, authLoading, isOwnProfile, navigate]);

    const handleRemove = async (movie) => {
        if (!isOwnProfile) return;
        setRemoving(movie.movie_id);
        const result = await toggleWatchedMovie(user.id, movie.movie_id, movie.movie_title, movie.poster_path, movie.media_type);
        if (result.success && !result.added) {
            setWatchedMovies(prev => prev.filter(m => m.movie_id !== movie.movie_id));
        }
        setRemoving(null);
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full" />
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
            <div className="max-w-3xl mx-auto">
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
                            <div className="bg-green-500/20 p-2 rounded-lg">
                                <FaCheckCircle className="text-green-500 text-2xl" />
                            </div>
                            {isOwnProfile ? 'Watched Log' : `@${username}'s Watched Log`}
                        </h1>
                        <p className="text-white/50 mt-1 ml-12">{watchedMovies.length} entries</p>
                    </div>
                </div>

                {/* Log List */}
                {watchedMovies.length > 0 ? (
                    <div className="space-y-4">
                        {watchedMovies.map((movie) => {
                            const date = new Date(movie.watched_at || movie.created_at);
                            return (
                                <div
                                    key={movie.id}
                                    className="group flex items-center gap-4 sm:gap-6 p-4 rounded-xl bg-[#1a1a1a] border border-white/5 hover:border-green-500/30 transition-all"
                                >
                                    {/* Timestamp Column */}
                                    <div className="flex flex-col items-end min-w-[80px] sm:min-w-[100px] border-r border-white/10 pr-4 sm:pr-6 shrink-0">
                                        <span className="text-lg sm:text-xl font-bold text-green-400 font-mono">
                                            {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        <span className="text-[10px] sm:text-xs font-medium text-white/40 uppercase tracking-wider">
                                            {date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                    </div>

                                    {/* Content */}
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <Link to={`/${movie.media_type || 'movie'}/${movie.movie_id}`} className="shrink-0">
                                            {movie.poster_path ? (
                                                <img
                                                    src={movie.poster_path.startsWith('http') ? movie.poster_path : `${imageURL}${movie.poster_path}`}
                                                    alt={movie.movie_title}
                                                    className="w-10 h-16 sm:w-12 sm:h-20 object-cover rounded bg-white/10 hover:opacity-80 transition-opacity"
                                                />
                                            ) : (
                                                <div className="w-10 h-16 sm:w-12 sm:h-20 bg-white/10 rounded flex items-center justify-center text-lg">🎬</div>
                                            )}
                                        </Link>
                                        <div className="min-w-0 flex-1">
                                            <Link
                                                to={`/${movie.media_type || 'movie'}/${movie.movie_id}`}
                                                className="text-base sm:text-lg font-bold text-white hover:text-green-400 transition-colors block truncate"
                                            >
                                                {movie.movie_title}
                                            </Link>
                                            <p className="text-xs text-white/30 hidden sm:block mt-1">
                                                Marked as watched
                                            </p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    {isOwnProfile && (
                                        <button
                                            onClick={() => handleRemove(movie)}
                                            disabled={removing === movie.movie_id}
                                            className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                                            title="Remove from log"
                                        >
                                            {removing === movie.movie_id ? (
                                                <div className="w-4 h-4 border border-red-400 border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <FaTrash />
                                            )}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-20 rounded-2xl bg-[#1a1a1a] border border-white/5">
                        <span className="text-6xl mb-4 block">👀</span>
                        <h3 className="text-xl font-bold text-white mb-2">
                            {isOwnProfile ? 'No movies watched yet' : 'No movies watched'}
                        </h3>
                        <p className="text-white/50 mb-6">
                            {isOwnProfile ? 'Mark movies as watched to track your history!' : 'This user hasn\'t marked any movies as watched yet.'}
                        </p>
                        {isOwnProfile && (
                            <Link
                                to="/"
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium hover:from-green-600 hover:to-emerald-700 transition-all"
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

export default WatchedMoviesPage;
