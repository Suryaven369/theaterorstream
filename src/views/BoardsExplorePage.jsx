import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaPlus, FaHeart, FaEye, FaUsers, FaComment } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { exploreBoards, boardPath, itemImageUrl } from '../lib/supabase';
import SeoHead from '../components/SeoHead';

const TABS = [
    { id: 'trending', label: 'Trending' },
    { id: 'newest', label: 'Newest' },
    { id: 'updated', label: 'Updated' },
    { id: 'followed', label: 'Most Followed' },
];

function BoardCard({ board, imageURL }) {
    const username = board.user_profiles?.username;
    const href = boardPath(board, username);
    const posters = (board.board_items || []).filter((i) => i.image_path).slice(0, 4);

    return (
        <Link
            to={href}
            className="group relative block overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0e0e0e] hover:border-amber-500/30 transition-all duration-300"
        >
            <div className="relative aspect-[16/10] overflow-hidden">
                {board.cover_image || board.banner_image ? (
                    <img src={board.cover_image || board.banner_image} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                ) : posters.length ? (
                    <div className="absolute inset-0 grid grid-cols-2 gap-px bg-black">
                        {posters.map((item, i) => (
                            <img key={i} src={itemImageUrl(imageURL, item)} alt="" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                        ))}
                        {Array.from({ length: Math.max(0, 4 - posters.length) }).map((_, i) => (
                            <div key={`e-${i}`} className="bg-zinc-900" />
                        ))}
                    </div>
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-[#1a1410] to-black" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-amber-400/80 mb-1">Board</p>
                    <h2 className="text-xl font-semibold text-white tracking-tight line-clamp-2 group-hover:text-amber-100 transition-colors">
                        {board.title}
                    </h2>
                </div>
            </div>
            <div className="px-4 py-3 flex items-center justify-between gap-2 text-xs text-white/40">
                <span className="truncate">{username ? `@${username}` : 'Board'} · {board.items_count || 0} titles</span>
                <span className="flex items-center gap-3 shrink-0">
                    {(board.likes_count || 0) > 0 && <span className="inline-flex items-center gap-1"><FaHeart className="text-[9px] text-amber-500/70" />{board.likes_count}</span>}
                    {(board.followers_count || 0) > 0 && <span className="inline-flex items-center gap-1"><FaUsers className="text-[9px]" />{board.followers_count}</span>}
                    {(board.comments_count || 0) > 0 && <span className="inline-flex items-center gap-1"><FaComment className="text-[9px]" />{board.comments_count}</span>}
                </span>
            </div>
        </Link>
    );
}

const BoardsExplorePage = () => {
    const { profile } = useAuth();
    const imageURL = useSelector((s) => s.movieData.imageURL);
    const [tab, setTab] = useState('trending');
    const [boards, setBoards] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        exploreBoards({ sort: tab, limit: 36 }).then((rows) => {
            if (alive) {
                setBoards(rows || []);
                setLoading(false);
            }
        });
        return () => { alive = false; };
    }, [tab]);

    return (
        <div className="min-h-screen bg-[#080808] pt-[calc(4.5rem+env(safe-area-inset-top,0px))] sm:pt-24 pb-4 px-3 sm:px-6">
            <SeoHead
                title="Movie Boards · TheaterOrStream"
                description="Curated cinematic boards — movies, TV, directors, and actors."
            />
            <div className="max-w-6xl mx-auto">
                <div className="relative mb-8 sm:mb-10 overflow-hidden rounded-2xl sm:rounded-3xl border border-white/[0.06]">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#2a1f14] via-[#0c0c0c] to-[#0a1218]" />
                    <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(245,158,11,0.25), transparent 45%), radial-gradient(circle at 80% 60%, rgba(180,83,9,0.15), transparent 40%)' }} />
                    <div className="relative px-5 sm:px-10 py-8 sm:py-14 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                        <div>
                            <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.3em] text-amber-400/90 mb-2 sm:mb-3">TheaterOrStream</p>
                            <h1 className="text-3xl sm:text-5xl font-semibold text-white tracking-tight">Movie Boards</h1>
                            <p className="mt-2 sm:mt-3 text-white/55 max-w-lg text-sm sm:text-base leading-relaxed">
                                Curated expressions of taste — films, series, directors, and actors in one cinematic canvas.
                            </p>
                        </div>
                        {profile?.username && (
                            <Link
                                to={`/${profile.username}/boards`}
                                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-amber-500 text-black font-semibold text-sm hover:bg-amber-400 transition tap-target w-full sm:w-auto"
                            >
                                <FaPlus className="text-xs" /> My Boards
                            </Link>
                        )}
                    </div>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 mb-8 scrollbar-hide">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                                tab === t.id ? 'bg-amber-500 text-black' : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex justify-center py-24">
                        <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
                    </div>
                ) : boards.length === 0 ? (
                    <div className="text-center py-24 rounded-2xl border border-white/5 bg-white/[0.02]">
                        <p className="text-white/50 mb-4">No public boards yet — start the first one.</p>
                        {profile?.username && (
                            <Link to={`/${profile.username}/boards`} className="text-amber-400 hover:underline text-sm">Create a board</Link>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                        {boards.map((board) => (
                            <BoardCard key={board.id} board={board} imageURL={imageURL} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BoardsExplorePage;
