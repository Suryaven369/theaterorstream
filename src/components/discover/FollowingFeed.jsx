import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaUserPlus } from 'react-icons/fa';
import { getFollowingFeed } from '../../lib/recommendationApi';
import { generateSlugWithId } from '../../lib/slugUtils';

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
            <section className="mb-8">
                <div className="h-5 w-48 rounded skeleton animate-pulse mb-3" />
                <div className="flex gap-3 overflow-hidden">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="w-[140px] shrink-0">
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
            <section className="mb-8 rounded-xl border border-dashed border-white/10 bg-[#1a1d1f] p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[var(--accent-green)]/15 flex items-center justify-center text-[var(--accent-green)] shrink-0">
                    <FaUserPlus />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-white">Follow directors, genres, franchises & boards</h3>
                    <p className="text-xs text-white/50">Follow people behind films — or boards you love — and their updates show up here.</p>
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
        <section className="mb-8 space-y-8">
            {boardUpdates.length > 0 && (
                <div>
                    <div className="mb-3 flex items-center gap-2.5">
                        <span className="text-lg">🎬</span>
                        <div>
                            <h2 className="text-lg font-bold text-white sm:text-xl">Board Updates</h2>
                            <p className="text-xs text-white/45">Activity from boards you follow</p>
                        </div>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                        {boardUpdates.slice(0, 12).map((u) => (
                            <Link
                                key={u.id}
                                to={u.board?.path || '/boards'}
                                className="shrink-0 w-[220px] rounded-xl border border-white/10 bg-[#141414] p-3 hover:border-amber-500/30 transition"
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
                    <div className="mb-3 flex items-center gap-2.5">
                        <span className="text-lg">🎟️</span>
                        <div>
                            <h2 className="text-lg font-bold text-white sm:text-xl">New From Your Follows</h2>
                            <p className="text-xs text-white/45">Fresh & upcoming from the directors, genres and franchises you follow</p>
                        </div>
                    </div>

                    <div className="flex gap-3 overflow-x-auto scroll-smooth pb-2 scrollbar-hide">
                        {items.map((m) => {
                            const slug = generateSlugWithId(m.title, m.tmdb_id, (m.release_date || '').slice(0, 4));
                            const to = `${m.media_type === 'tv' ? '/tv' : '/movies'}/${slug}`;
                            const reason = m.reasons?.[0]?.text;
                            return (
                                <Link key={`${m.media_type}-${m.tmdb_id}`} to={to} className="group w-[140px] shrink-0 sm:w-[150px]">
                                    <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5 ring-1 ring-white/10 group-hover:ring-[var(--accent-green)]/50 transition-all">
                                        <img
                                            src={`https://image.tmdb.org/t/p/w342${m.poster_path}`}
                                            alt={m.title}
                                            loading="lazy"
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        />
                                        <span className={`absolute top-2 left-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${m.upcoming ? 'bg-[var(--accent-green)] text-black' : 'bg-black/70 text-white'}`}>
                                            {m.upcoming ? 'UPCOMING' : 'NEW'}
                                        </span>
                                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2 pt-6">
                                            <p className="text-[11px] text-white/80">{relDate(m.release_date, m.upcoming)}</p>
                                        </div>
                                    </div>
                                    <p className="mt-1.5 text-sm font-medium text-white/90 line-clamp-1 group-hover:text-[var(--accent-green)]">{m.title}</p>
                                    {reason && <p className="text-[11px] text-white/40 line-clamp-1">{reason}</p>}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}
        </section>
    );
}
