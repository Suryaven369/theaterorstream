import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaUserPlus } from 'react-icons/fa';
import { getFollowingFeed } from '../../lib/recommendationApi';
import { generateSlugWithId } from '../../lib/slugUtils';
import PosterQuickActions from '../PosterQuickActions';

function relDate(dateStr, upcoming) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const days = Math.round((d - Date.now()) / 86_400_000);
    if (upcoming) {
        if (days <= 0) return 'Out now';
        if (days === 1) return 'Tomorrow';
        if (days < 30) return `In ${days}d`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    if (days >= -1) return 'Just released';
    if (days > -30) return `${Math.abs(days)}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * "From who & what you follow" — new + upcoming titles from followed directors,
 * genres and franchises. Renders nothing until loaded; shows a follow-prompt
 * when the user follows nothing yet.
 */
export default function FollowingFeed() {
    const [items, setItems] = useState([]);
    const [boardUpdates, setBoardUpdates] = useState([]);
    const [followCount, setFollowCount] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        getFollowingFeed(30).then((r) => {
            if (!alive) return;
            setItems(r.items || []);
            setBoardUpdates(r.boardUpdates || []);
            setFollowCount(r.followCount ?? 0);
            setLoading(false);
        });
        return () => { alive = false; };
    }, []);

    if (loading) {
        return (
            <section className="mb-5 sm:mb-8">
                <div className="h-5 w-48 rounded skeleton animate-pulse mb-3" />
                <div className="flex gap-2.5 overflow-hidden sm:gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="w-[120px] shrink-0 sm:w-[140px]">
                            <div className="aspect-[2/3] rounded-xl skeleton animate-pulse" />
                        </div>
                    ))}
                </div>
            </section>
        );
    }

    // Followed nothing yet → gentle nudge (only when truly empty).
    if (followCount === 0) {
        return (
            <section className="mb-5 flex items-start gap-3 rounded-xl border border-dashed border-white/10 bg-[#1a1d1f] p-3.5 sm:mb-8 sm:items-center sm:gap-4 sm:p-5">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[var(--accent-green)]/15 flex items-center justify-center text-[var(--accent-green)] shrink-0">
                    <FaUserPlus />
                </div>
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white">Follow directors, genres, franchises & boards</h3>
                    <p className="text-[11px] text-white/50 sm:text-xs">Follow people behind films — or boards you love — and their updates show up here.</p>
                </div>
            </section>
        );
    }

    if (!items.length && !boardUpdates.length) return null;

    const eventLabel = (type, payload) => {
        if (type === 'item_added') return `Added ${payload?.title || 'a title'}`;
        if (type === 'items_reordered') return 'Reordered titles';
        if (type === 'created') return 'Created this board';
        if (type === 'commented') return 'New comment';
        if (type === 'description_updated') return 'Updated description';
        return 'Board update';
    };

    return (
        <section className="mb-5 space-y-6 sm:mb-8 sm:space-y-8">
            {boardUpdates.length > 0 && (
                <div>
                    <div className="mb-2.5 flex items-center gap-2 sm:mb-3 sm:gap-2.5">
                        <span className="text-base sm:text-lg">🎬</span>
                        <div className="min-w-0">
                            <h2 className="text-base font-bold text-white sm:text-xl">Board Updates</h2>
                            <p className="text-[11px] text-white/45 sm:text-xs">Activity from boards you follow</p>
                        </div>
                    </div>
                    <div
                        className="flex gap-2.5 overflow-x-auto overscroll-x-contain pb-1 scrollbar-hide snap-x snap-mandatory sm:gap-3 sm:pb-2"
                        style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                        {boardUpdates.slice(0, 12).map((u) => (
                            <Link
                                key={u.id}
                                to={u.board?.path || '/boards'}
                                className="shrink-0 w-[200px] snap-start rounded-xl border border-white/10 bg-[#141414] p-3 hover:border-amber-500/30 transition sm:w-[220px]"
                            >
                                <p className="text-[10px] uppercase tracking-wider text-amber-400/80 mb-1">Board</p>
                                <p className="text-sm font-semibold text-white line-clamp-1">{u.board?.title}</p>
                                <p className="text-xs text-white/45 mt-1 line-clamp-2">{eventLabel(u.event_type, u.payload)}</p>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {items.length > 0 && (
                <div>
                    <div className="mb-2.5 flex items-center gap-2 sm:mb-3 sm:gap-2.5">
                        <span className="text-base sm:text-lg">🎟️</span>
                        <div className="min-w-0">
                            <h2 className="text-base font-bold text-white sm:text-xl">New From Your Follows</h2>
                            <p className="text-[11px] text-white/45 sm:text-xs">Fresh & upcoming from directors, genres and franchises you follow</p>
                        </div>
                    </div>

                    <div
                        className="flex gap-2.5 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 scrollbar-hide snap-x snap-mandatory sm:gap-3 sm:pb-2"
                        style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                        {items.map((m) => {
                            const slug = generateSlugWithId(m.title, m.tmdb_id, (m.release_date || '').slice(0, 4));
                            const to = `${m.media_type === 'tv' ? '/tv' : '/movies'}/${slug}`;
                            const reason = m.reasons?.[0]?.text;
                            return (
                                <div key={`${m.media_type}-${m.tmdb_id}`} className="group w-[120px] shrink-0 snap-start sm:w-[150px]">
                                    <Link
                                        to={to}
                                        className="relative block aspect-[2/3] overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10 transition-all group-hover:ring-[var(--accent-green)]/50"
                                    >
                                        <img
                                            src={`https://image.tmdb.org/t/p/w342${m.poster_path}`}
                                            alt={m.title}
                                            loading="lazy"
                                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        />
                                        <span className={`absolute top-2 left-2 z-10 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${m.upcoming ? 'bg-[var(--accent-green)] text-black' : 'bg-black/70 text-white'}`}>
                                            {m.upcoming ? 'UPCOMING' : 'NEW'}
                                        </span>
                                        <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                                            <PosterQuickActions
                                                movieId={m.tmdb_id}
                                                movieTitle={m.title}
                                                posterPath={m.poster_path}
                                                mediaType={m.media_type || 'movie'}
                                            />
                                        </div>
                                    </Link>
                                    <Link to={to} className="mt-1.5 block">
                                        <p className="text-sm font-medium text-white/90 line-clamp-1 group-hover:text-[var(--accent-green)]">{m.title}</p>
                                        <p className="text-[11px] text-white/40">{relDate(m.release_date, m.upcoming)}</p>
                                        {reason && <p className="text-[11px] text-white/40 line-clamp-1">{reason}</p>}
                                    </Link>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </section>
    );
}
