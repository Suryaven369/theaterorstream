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
            <section className="mb-3 sm:mb-8">
                <div className="h-4 w-40 rounded skeleton animate-pulse mb-2" />
                <div className="flex gap-2 overflow-hidden sm:gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="w-[108px] shrink-0 sm:w-[140px]">
                            <div className="aspect-[2/3] rounded-lg skeleton animate-pulse sm:rounded-xl" />
                        </div>
                    ))}
                </div>
            </section>
        );
    }

    // Followed nothing yet → gentle nudge (only when truly empty).
    if (followCount === 0) {
        return (
            <section className="mb-3 flex w-full max-w-xl items-start gap-2.5 rounded-xl border border-dashed border-white/10 bg-[#1a1d1f] p-3 sm:mb-8 sm:items-center sm:gap-4 sm:p-5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-green)]/15 text-[var(--accent-green)] text-sm sm:h-10 sm:w-10">
                    <FaUserPlus />
                </div>
                <div className="min-w-0">
                    <h3 className="text-[13px] font-semibold text-white sm:text-sm">Follow directors, genres & boards</h3>
                    <p className="text-[11px] text-white/45 sm:text-xs">Their new titles show up here.</p>
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
        <section className="mb-3 space-y-4 sm:mb-8 sm:space-y-8">
            {boardUpdates.length > 0 && (
                <div>
                    <div className="mb-1.5 flex items-center gap-1.5 sm:mb-3 sm:gap-2.5">
                        <span className="text-sm sm:text-lg">🎬</span>
                        <div className="min-w-0">
                            <h2 className="text-[15px] font-bold tracking-tight text-white sm:text-xl">Board Updates</h2>
                            <p className="text-[10px] text-white/40 sm:text-xs">From boards you follow</p>
                        </div>
                    </div>
                    <div
                        className="flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 scrollbar-hide snap-x snap-mandatory sm:gap-3 sm:pb-2"
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
                    <div className="mb-1.5 flex items-center gap-1.5 sm:mb-3 sm:gap-2.5">
                        <span className="text-sm sm:text-lg">🎟️</span>
                        <div className="min-w-0">
                            <h2 className="text-[15px] font-bold tracking-tight text-white sm:text-xl">New From Your Follows</h2>
                            <p className="hidden text-[11px] text-white/45 sm:block sm:text-xs">Fresh & upcoming from people and genres you follow</p>
                        </div>
                    </div>

                    <div
                        className="flex gap-2 overflow-x-auto overscroll-x-contain scroll-smooth pb-0.5 scrollbar-hide snap-x snap-mandatory sm:gap-3 sm:pb-2"
                        style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                        {items.map((m) => {
                            const slug = generateSlugWithId(m.title, m.tmdb_id, (m.release_date || '').slice(0, 4));
                            const to = `${m.media_type === 'tv' ? '/tv' : '/movies'}/${slug}`;
                            const reason = m.reasons?.[0]?.text;
                            return (
                                <div key={`${m.media_type}-${m.tmdb_id}`} className="group w-[108px] shrink-0 snap-start sm:w-[150px]">
                                    <Link
                                        to={to}
                                        className="relative block aspect-[2/3] overflow-hidden rounded-md bg-white/5 ring-1 ring-white/10 transition-transform active:scale-[0.97] sm:rounded-xl group-hover:ring-[var(--accent-green)]/50"
                                    >
                                        <img
                                            src={`https://image.tmdb.org/t/p/w342${m.poster_path}`}
                                            alt={m.title}
                                            loading="lazy"
                                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        />
                                        <span className={`absolute top-1 left-1 z-10 rounded px-1 py-0.5 text-[8px] font-bold sm:top-2 sm:left-2 sm:rounded-md sm:px-1.5 sm:text-[10px] ${m.upcoming ? 'bg-[var(--accent-green)] text-black' : 'bg-black/70 text-white'}`}>
                                            {m.upcoming ? 'SOON' : 'NEW'}
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
                                    <Link to={to} className="mt-1 block">
                                        <p className="text-[11px] font-medium text-white/90 line-clamp-2 leading-snug sm:text-sm sm:line-clamp-1 group-hover:text-[var(--accent-green)]">{m.title}</p>
                                        <p className="text-[9px] text-white/40 sm:text-[11px]">{relDate(m.release_date, m.upcoming)}</p>
                                        {reason && <p className="hidden text-[11px] text-white/40 line-clamp-1 sm:block">{reason}</p>}
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
