import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getUserMovieLogs } from '../../lib/movieDiary';
import { generateSlugWithId } from '../../lib/slugUtils';

const PAGE_SIZE = 10;

export default function DiaryFeedTab() {
    const { user, isAuthenticated } = useAuth();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setPage(0);
            if (!user?.id) {
                setLogs([]);
                setHasMore(false);
                setLoading(false);
                return;
            }
            const data = await getUserMovieLogs(user.id, { limit: PAGE_SIZE, offset: 0 });
            if (cancelled) return;
            setLogs(data);
            setHasMore(data.length >= PAGE_SIZE);
            setLoading(false);
        };
        if (isAuthenticated) load();
        else {
            setLogs([]);
            setLoading(false);
        }
        return () => { cancelled = true; };
    }, [user?.id, isAuthenticated]);

    const loadMore = async () => {
        if (loadingMore || !hasMore || !user?.id) return;
        setLoadingMore(true);
        const nextPage = page + 1;
        const data = await getUserMovieLogs(user.id, { limit: PAGE_SIZE, offset: nextPage * PAGE_SIZE });
        setLogs((prev) => [...prev, ...data]);
        setHasMore(data.length >= PAGE_SIZE);
        setPage(nextPage);
        setLoadingMore(false);
    };

    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
                ))}
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="text-center py-16 rounded-2xl border border-dashed border-white/15">
                <p className="text-white/50">Sign in to see your diary here.</p>
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="text-center py-16 rounded-2xl border border-dashed border-white/15">
                <p className="text-white/50">No diary entries yet.</p>
                <p className="text-sm text-white/35 mt-2">Log a movie from any detail page.</p>
            </div>
        );
    }

    return (
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
                    </div>
                );
            })}
            {hasMore && (
                <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="mt-2 w-full py-3 rounded-xl border border-white/10 text-sm text-white/60 hover:text-white hover:border-white/20 transition-colors"
                >
                    {loadingMore ? 'Loading…' : 'Load more'}
                </button>
            )}
        </div>
    );
}
