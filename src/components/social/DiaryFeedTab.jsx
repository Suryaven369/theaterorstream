import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getUserMovieLogs } from '../../lib/movieDiary';
import { generateSlugWithId } from '../../lib/slugUtils';

const PAGE_SIZE = 10;
const rowClass = 'inline-flex items-start gap-2.5 py-1.5 rounded-md max-w-full hover:bg-white/[0.04] transition-colors';

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
            <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 w-64 rounded-md bg-white/5 animate-pulse" />
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
        <div className="flex flex-col items-start gap-1">
            {logs.map((log) => {
                const slug = generateSlugWithId(log.movie_title, log.tmdb_id, '');
                const url = log.media_type === 'tv' ? `/tv/${slug}` : `/movies/${slug}`;
                const posterSrc = log.poster_path
                    ? (log.poster_path.startsWith('http') ? log.poster_path : `https://image.tmdb.org/t/p/w92${log.poster_path}`)
                    : null;
                return (
                    <Link key={log.id} to={url} className={rowClass}>
                        {posterSrc ? (
                            <img src={posterSrc} alt="" className="w-9 h-[52px] rounded object-cover shrink-0 border border-white/10" />
                        ) : (
                            <div className="w-9 h-[52px] rounded bg-white/5 flex items-center justify-center text-white/20 shrink-0 border border-white/5 text-sm">
                                🎬
                            </div>
                        )}
                        <div className="min-w-0 pr-1 max-w-xl">
                            <p className="text-sm font-medium text-white leading-snug">
                                {log.movie_title}
                                {log.rating != null && (
                                    <span className="text-yellow-400 text-xs ml-2 font-normal">★ {log.rating}/10</span>
                                )}
                            </p>
                            <p className="text-[11px] text-white/35 mt-0.5">
                                Watched {log.watched_on}
                            </p>
                            {log.review_text && (
                                <p className="text-xs text-white/55 mt-1 line-clamp-2">{log.review_text}</p>
                            )}
                        </div>
                    </Link>
                );
            })}
            {hasMore && (
                <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="mt-3 text-sm text-white/50 hover:text-white transition-colors"
                >
                    {loadingMore ? 'Loading…' : 'Load more'}
                </button>
            )}
        </div>
    );
}
