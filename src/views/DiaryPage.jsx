import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FaBook, FaTrash, FaArrowLeft } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { getProfileByUsername } from '../lib/supabase';
import { getUserMovieLogs, deleteMovieLog } from '../lib/movieDiary';
import { generateSlugWithId } from '../lib/slugUtils';

export default function DiaryPage() {
    const { username } = useParams();
    const { user, profile, isAuthenticated } = useAuth();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [targetProfile, setTargetProfile] = useState(null);

    const isOwnProfile = !username || profile?.username === username;

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            let targetUserId = user?.id;

            if (!isOwnProfile && username) {
                const p = await getProfileByUsername(username);
                setTargetProfile(p);
                targetUserId = p?.id;
            } else {
                setTargetProfile(profile);
            }

            if (targetUserId) {
                const data = await getUserMovieLogs(targetUserId, { limit: 100 });
                setLogs(data);
            }
            setLoading(false);
        };

        if (isAuthenticated) load();
    }, [username, user?.id, isOwnProfile, profile, isAuthenticated]);

    const handleDelete = async (logId) => {
        if (!isOwnProfile || !user?.id) return;
        if (!window.confirm('Remove this diary entry?')) return;
        const result = await deleteMovieLog(user.id, logId);
        if (result.success) {
            setLogs((prev) => prev.filter((l) => l.id !== logId));
        }
    };

    const displayUser = targetProfile?.username || profile?.username;

    return (
        <div className="min-h-screen bg-[#0a0a0a] pt-24 pb-16 px-4">
            <div className="max-w-2xl mx-auto">
                <Link to={displayUser ? `/${displayUser}/profile` : '/profile'} className="text-sm text-white/50 hover:text-white inline-flex items-center gap-2 mb-4">
                    <FaArrowLeft /> Profile
                </Link>
                <h1 className="text-3xl font-bold text-white flex items-center gap-3 mb-2">
                    <FaBook className="text-orange-400" />
                    {isOwnProfile ? 'Your Diary' : `@${username}'s Diary`}
                </h1>
                <p className="text-white/45 text-sm mb-8">Letterboxd-style watch log with dates and ratings.</p>

                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
                        ))}
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-16 rounded-2xl border border-dashed border-white/15">
                        <p className="text-white/50">No diary entries yet.</p>
                        {isOwnProfile && (
                            <p className="text-sm text-white/35 mt-2">Log a movie from any detail page.</p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {logs.map((log) => {
                            const slug = generateSlugWithId(log.movie_title, log.tmdb_id, '');
                            const url = log.media_type === 'tv' ? `/tv/${slug}` : `/movies/${slug}`;
                            return (
                                <div key={log.id} className="flex gap-4 p-4 rounded-xl bg-[#1a1a1a] border border-white/10">
                                    {log.poster_path && (
                                        <Link to={url}>
                                            <img
                                                src={log.poster_path.startsWith('http') ? log.poster_path : `https://image.tmdb.org/t/p/w92${log.poster_path}`}
                                                alt=""
                                                className="w-14 h-20 object-cover rounded-lg"
                                            />
                                        </Link>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <Link to={url} className="font-semibold text-white hover:text-orange-400">
                                            {log.movie_title}
                                        </Link>
                                        <p className="text-xs text-white/40 mt-1">
                                            Watched {log.watched_on}
                                            {log.rating != null && ` · ${log.rating}/10`}
                                        </p>
                                        {log.watched_with?.length > 0 && (
                                            <p className="text-xs text-white/35 mt-1">
                                                With {log.watched_with.join(', ')}
                                            </p>
                                        )}
                                        {log.review_text && (
                                            <p className="text-sm text-white/55 mt-2 line-clamp-2">{log.review_text}</p>
                                        )}
                                    </div>
                                    {isOwnProfile && (
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(log.id)}
                                            className="text-white/30 hover:text-red-400 p-2"
                                            aria-label="Delete log"
                                        >
                                            <FaTrash />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
