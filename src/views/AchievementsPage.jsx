import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FaArrowLeft, FaAngleLeft, FaAngleRight, FaLock } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { getAchievements } from '../lib/movieDiary';
import { getProfileByUsername } from '../lib/supabase';

const TIER = {
    bronze: 'from-amber-700 to-amber-400',
    silver: 'from-slate-400 to-slate-200',
    gold: 'from-yellow-500 to-amber-300',
    platinum: 'from-cyan-400 to-sky-300',
    diamond: 'from-fuchsia-400 to-purple-300',
};
const ringFor = (tier, earned) => (earned ? (TIER[tier] || TIER.gold) : 'from-white/15 to-white/5');

const BadgeMedal = ({ badge }) => (
    <div className="flex w-[104px] shrink-0 flex-col items-center text-center" title={badge.earned ? badge.unlock_message || badge.description : `Locked — ${badge.description}`}>
        <div className={`relative h-20 w-20 rounded-full bg-gradient-to-br p-[3px] ${ringFor(badge.tier, badge.earned)} ${badge.earned ? 'shadow-lg' : ''}`}>
            <div className={`flex h-full w-full items-center justify-center rounded-full bg-[#15171a] text-3xl ${badge.earned ? '' : 'grayscale opacity-40'}`}>
                {badge.image_url ? <img src={badge.image_url} alt={badge.name} className="h-full w-full rounded-full object-cover" /> : badge.icon}
            </div>
            {!badge.earned && (
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#0a0a0a] text-[10px] text-white/50 ring-2 ring-[#15171a]">
                    <FaLock />
                </span>
            )}
        </div>
        <p className={`mt-2 line-clamp-2 text-xs font-semibold ${badge.earned ? 'text-white' : 'text-white/50'}`}>{badge.name}</p>
        <p className="text-[10px] text-white/40">
            {badge.earned ? new Date(badge.earned_at).toLocaleDateString() : 'Locked'}
        </p>
    </div>
);

const CategoryRow = ({ cat }) => {
    const [expanded, setExpanded] = useState(false);
    const scrollRef = useRef(null);
    const by = (d) => { if (scrollRef.current) scrollRef.current.scrollLeft += d; };

    return (
        <section className="mb-9">
            <div className="mb-3 flex items-end justify-between">
                <div>
                    <h2 className="text-lg font-bold text-white">{cat.label}</h2>
                    <p className="text-xs text-white/45">{cat.unlocked} of {cat.total} unlocked</p>
                </div>
                {cat.badges.length > 5 && (
                    <button onClick={() => setExpanded((e) => !e)} className="text-sm font-medium text-[var(--primary)] hover:underline">
                        {expanded ? 'Show less' : 'View all'}
                    </button>
                )}
            </div>

            {expanded ? (
                <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-8">
                    {cat.badges.map((b) => <BadgeMedal key={b.id} badge={b} />)}
                </div>
            ) : (
                <div className="group/row relative">
                    <div ref={scrollRef} className="flex gap-4 overflow-x-auto scroll-smooth pb-2 scrollbar-hide">
                        {cat.badges.map((b) => <BadgeMedal key={b.id} badge={b} />)}
                    </div>
                    {cat.badges.length > 5 && (
                        <>
                            <button onClick={() => by(-440)} aria-label="Scroll left" className="absolute left-0 top-[34px] hidden -translate-y-1/2 rounded-full bg-black/70 p-2 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/90 group-hover/row:opacity-100 lg:flex">
                                <FaAngleLeft />
                            </button>
                            <button onClick={() => by(440)} aria-label="Scroll right" className="absolute right-0 top-[34px] hidden -translate-y-1/2 rounded-full bg-black/70 p-2 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/90 group-hover/row:opacity-100 lg:flex">
                                <FaAngleRight />
                            </button>
                        </>
                    )}
                </div>
            )}
        </section>
    );
};

const AchievementsPage = () => {
    const { username } = useParams();
    const { user, profile, loading: authLoading } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [ownerName, setOwnerName] = useState(null);

    useEffect(() => {
        if (authLoading) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            let uid = user?.id;
            let uname = profile?.username;
            if (username && (!profile?.username || username.toLowerCase() !== profile.username.toLowerCase())) {
                const p = await getProfileByUsername(username);
                uid = p?.id;
                uname = p?.username;
            }
            const d = await getAchievements(uid);
            if (cancelled) return;
            setOwnerName(uname);
            setData(d);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [username, user?.id, profile?.username, authLoading]);

    const backTo = ownerName ? `/${ownerName}/profile` : '/profile';
    const pct = data?.total ? Math.round((data.totalUnlocked / data.total) * 100) : 0;

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pt-24 pb-20 px-4 sm:px-8">
            <div className="mx-auto max-w-5xl">
                <Link to={backTo} className="mb-6 inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors">
                    <FaArrowLeft /> Back to profile
                </Link>

                <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white">Achievements</h1>
                        {data && <p className="text-sm text-white/50">{data.totalUnlocked} of {data.total} badges unlocked · {pct}%</p>}
                    </div>
                    {data && (
                        <div className="w-full sm:w-64">
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-amber-400 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="space-y-9">
                        {[1, 2, 3].map((i) => (
                            <div key={i}>
                                <div className="mb-3 h-5 w-40 animate-pulse rounded skeleton" />
                                <div className="flex gap-4">
                                    {Array.from({ length: 6 }).map((_, j) => <div key={j} className="h-20 w-20 shrink-0 animate-pulse rounded-full skeleton" />)}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : !data?.categories?.length ? (
                    <p className="py-16 text-center text-white/40">No achievements available yet.</p>
                ) : (
                    data.categories.map((cat) => <CategoryRow key={cat.key} cat={cat} />)
                )}
            </div>
        </div>
    );
};

export default AchievementsPage;
