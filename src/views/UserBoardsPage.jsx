import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FaPlus, FaLock, FaGlobe, FaArrowLeft, FaChevronRight } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import {
    getProfileByUsername,
    getUserBoards,
    createBoard,
    boardPath,
    BOARD_TITLE_MAX,
    BOARD_DESCRIPTION_MAX,
    itemImageUrl,
} from '../lib/supabase';
import { useSelector } from 'react-redux';
import SeoHead from '../components/SeoHead';

const UserBoardsPage = () => {
    const { username } = useParams();
    const navigate = useNavigate();
    const { user, profile: currentUserProfile, loading: authLoading } = useAuth();
    const imageURL = useSelector((s) => s.movieData.imageURL);

    const [viewedProfile, setViewedProfile] = useState(null);
    const [boards, setBoards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [creating, setCreating] = useState(false);

    const isOwn = !username || currentUserProfile?.username === username;

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true);
            const profile = isOwn ? currentUserProfile : await getProfileByUsername(username);
            if (!alive) return;
            setViewedProfile(profile || null);
            if (profile?.id) {
                const rows = await getUserBoards(profile.id, { publicOnly: !isOwn });
                if (alive) setBoards(rows);
            }
            setLoading(false);
        })();
        return () => { alive = false; };
    }, [username, currentUserProfile, isOwn]);

    const handleCreate = async () => {
        if (!user?.id || !title.trim()) return;
        setCreating(true);
        const result = await createBoard(user.id, { title, description, isPublic });
        setCreating(false);
        if (result.success) {
            navigate(boardPath(result.data, currentUserProfile?.username));
        }
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-[#080808] flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!viewedProfile) {
        return (
            <div className="min-h-screen bg-[#080808] flex items-center justify-center text-center">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-2">User not found</h2>
                    <Link to="/boards" className="text-amber-400 hover:underline">Explore boards</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#080808] pt-[calc(4.5rem+env(safe-area-inset-top,0px))] sm:pt-24 pb-4 px-3 sm:px-4">
            <SeoHead title={`${isOwn ? 'My Boards' : `@${viewedProfile.username}'s Boards`} · TheaterOrStream`} />
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8 overflow-x-auto scrollbar-hide">
                    <Link to={`/${viewedProfile.username}/profile`} className="inline-flex items-center gap-2 text-white/45 hover:text-white text-sm shrink-0 min-h-[44px]">
                        <FaArrowLeft /> Profile
                    </Link>
                    <Link to="/boards" className="text-white/35 hover:text-amber-400 text-sm shrink-0 min-h-[44px] inline-flex items-center">Explore</Link>
                    <Link to={`/${viewedProfile.username}/collections`} className="text-white/35 hover:text-white text-sm ml-auto shrink-0 min-h-[44px] inline-flex items-center">Lists</Link>
                </div>

                <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight mb-1">Boards</h1>
                <p className="text-white/45 text-sm mb-8">
                    {isOwn ? 'Your cinematic curated boards' : `Boards by @${viewedProfile.username}`}
                </p>

                {isOwn && (
                    <div className="mb-8">
                        {showCreate ? (
                            <div className="p-5 rounded-2xl bg-[#121212] border border-white/10 space-y-3">
                                <h3 className="text-white font-semibold">New Board</h3>
                                <input
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value.slice(0, BOARD_TITLE_MAX))}
                                    placeholder="e.g. Mind-Bending Masterpieces"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-amber-500/40"
                                    autoFocus
                                />
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value.slice(0, BOARD_DESCRIPTION_MAX))}
                                    placeholder="Short description..."
                                    rows={2}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-amber-500/40 resize-none"
                                />
                                <div className="flex items-center justify-between flex-wrap gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsPublic(!isPublic)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${isPublic ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-white/50'}`}
                                    >
                                        {isPublic ? <FaGlobe /> : <FaLock />}
                                        {isPublic ? 'Public' : 'Private'}
                                    </button>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-sm text-white/50">Cancel</button>
                                        <button
                                            type="button"
                                            onClick={handleCreate}
                                            disabled={!title.trim() || creating}
                                            className="px-5 py-1.5 text-sm rounded-lg bg-amber-500 text-black font-semibold disabled:opacity-50"
                                        >
                                            {creating ? 'Creating…' : 'Create'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowCreate(true)}
                                className="w-full flex items-center justify-center gap-3 p-8 rounded-2xl border border-dashed border-amber-500/30 bg-amber-500/[0.03] hover:bg-amber-500/[0.07] transition group"
                            >
                                <div className="w-11 h-11 rounded-full bg-amber-500/15 flex items-center justify-center">
                                    <FaPlus className="text-amber-400" />
                                </div>
                                <div className="text-left">
                                    <p className="font-medium text-white group-hover:text-amber-200">Create Board</p>
                                    <p className="text-sm text-white/40">Movies, TV, directors, actors</p>
                                </div>
                            </button>
                        )}
                    </div>
                )}

                {boards.length === 0 ? (
                    <div className="text-center py-16 text-white/45">No boards yet.</div>
                ) : (
                    <div className="grid sm:grid-cols-2 gap-4">
                        {boards.map((board) => {
                            const posters = (board.board_items || []).filter((i) => i.image_path).slice(0, 4);
                            return (
                                <Link
                                    key={board.id}
                                    to={boardPath(board, viewedProfile.username)}
                                    state={viewedProfile?.username ? {
                                        from: {
                                            path: `/${viewedProfile.username}/boards`,
                                            label: 'Boards',
                                            crumbs: [
                                                { path: `/${viewedProfile.username}/profile`, label: `@${viewedProfile.username}` },
                                                { path: `/${viewedProfile.username}/boards`, label: 'Boards' },
                                            ],
                                        },
                                    } : undefined}
                                    className="group flex items-center gap-4 p-4 rounded-2xl bg-[#121212] border border-white/5 hover:border-amber-500/25 transition"
                                >
                                    <div className="w-16 h-16 rounded-xl overflow-hidden grid grid-cols-2 gap-px bg-black shrink-0">
                                        {posters.length ? posters.map((item, i) => (
                                            <img key={i} src={itemImageUrl(imageURL, item)} alt="" className="w-full h-full object-cover" />
                                        )) : (
                                            <div className="col-span-2 row-span-2 bg-gradient-to-br from-amber-900/40 to-zinc-900" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-white font-semibold truncate group-hover:text-amber-200">{board.title}</h3>
                                        <div className="flex items-center gap-2 text-xs text-white/40 mt-1">
                                            <span>{board.items_count || 0} items</span>
                                            {board.is_public ? (
                                                <span className="text-green-400/70 flex items-center gap-1"><FaGlobe className="text-[9px]" /> Public</span>
                                            ) : (
                                                <span className="flex items-center gap-1"><FaLock className="text-[9px]" /> Private</span>
                                            )}
                                        </div>
                                    </div>
                                    <FaChevronRight className="text-white/25 group-hover:text-amber-400" />
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default UserBoardsPage;
