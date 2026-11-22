import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaStar, FaArrowRight, FaPlus } from 'react-icons/fa';
import SeoHead from '../components/SeoHead';
import { openCookieSettings } from '../lib/cookieConsent';
import AuthForm, { AUTH_MODE_TITLES } from '../components/auth/AuthForm';
import { getLandingData, getTosVerdict, getVerdictTotals, castVerdictVote } from '../lib/recommendationApi';
import { generateSlugWithId } from '../lib/slugUtils';
import { supabase } from '../lib/supabase';

const IMG = 'https://image.tmdb.org/t/p';
const GOLD = '#f5c518'; // app brand yellow (--color-theater)
const LOGO = 'https://res.cloudinary.com/ddhhlkyut/image/upload/v1768226006/a78a29523128c4555fdd178b6c612ac6_dbtyqp.jpg';

const CHOICES = [
    { id: 'theater', label: 'Theater', hint: 'Worth the big screen' },
    { id: 'ott', label: 'Wait for OTT', hint: 'Fine at home' },
    { id: 'skip', label: 'Skip', hint: 'Not worth your time' },
];

const FEATURES = [
    { title: 'Picks in your language', body: 'Hindi and Telugu? Tamil and Korean? Pick what you watch and every recommendation stays in those languages.' },
    { title: 'Where to stream, sorted', body: 'Every poster shows which of your OTT apps has it in your country. No more opening five apps to find one film.' },
    { title: 'A verdict on every release', body: 'Theater, wait for OTT, or skip. A clear call before you spend on tickets, tuned to your taste once you sign in.' },
    { title: 'Taste that learns', body: 'The films and stars you love, the moods you’re in. Your picks get sharper every week.' },
    { title: 'Parent guide at a glance', body: 'Violence, language and scary scenes rated plainly, so family movie night never goes sideways.' },
];

const FAQS = [
    { q: 'Is it free?', a: 'Yes. Creating an account and getting recommendations is free. No credit card, ever.' },
    { q: 'Which languages are supported?', a: 'Hindi, Telugu, Tamil, Malayalam, Kannada, Bengali, Marathi, English, Korean, Japanese, Spanish and French. Pick as many as you like.' },
    { q: 'Do I need a streaming subscription?', a: 'No. Add your services to see what you can watch right away, or skip that and use TheaterOrStream to decide what’s worth the theater.' },
    { q: 'How do the live votes work?', a: 'Anyone can vote Theater, Wait for OTT or Skip on this week’s releases. One vote per person per movie, and you can change your mind.' },
];

/** Responsive srcSet for a TMDB backdrop (phones get w780, desktops w1280/original). */
const stillSrcSet = (path) => `${IMG}/w780${path} 780w, ${IMG}/w1280${path} 1280w, ${IMG}/original${path} 1920w`;

const moviePath = (m) => `/movies/${generateSlugWithId(m.title, m.tmdbId, m.year)}`;

// ── Anonymous voter id + your own votes, kept in this browser ─────────────
function readStore(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}
function voterId() {
    let id = readStore('tos_voter_id', null);
    if (!id) {
        id = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
        writeStore('tos_voter_id', id);
    }
    return id;
}

const sum = (t) => (t ? t.theater + t.ott + t.skip : 0);
const pct = (t, key) => (sum(t) ? Math.round((t[key] / sum(t)) * 100) : 0);
const leader = (t) => (sum(t) ? CHOICES.reduce((a, b) => (t[b.id] > t[a.id] ? b : a)) : null);

/**
 * Live poll: pick a hot movie, vote, and watch the split update as other
 * visitors vote (Supabase Realtime on verdict_vote_totals, plus a light poll).
 */
function VerdictPoll({ movies, onSignup }) {
    const [index, setIndex] = useState(0);
    const [totals, setTotals] = useState({});
    const [available, setAvailable] = useState(true);
    const [mine, setMine] = useState(() => readStore('tos_votes', {}));
    const [ourCall, setOurCall] = useState({});
    const [busy, setBusy] = useState(false);
    const ids = useMemo(() => movies.map((m) => m.tmdbId), [movies]);
    const movie = movies[index] || null;

    const refresh = useCallback(async () => {
        if (!ids.length) return;
        const res = await getVerdictTotals(ids);
        setAvailable(res.available);
        setTotals((prev) => ({ ...prev, ...res.totals }));
    }, [ids]);

    // Live: Realtime pushes every change; a 20s poll covers dropped sockets.
    useEffect(() => {
        if (!ids.length) return undefined;
        refresh();
        const idSet = new Set(ids);
        const channel = supabase
            .channel('landing-verdict-totals')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'verdict_vote_totals' }, (payload) => {
                const row = payload.new;
                if (!row?.tmdb_id || !idSet.has(String(row.tmdb_id))) return;
                setTotals((prev) => ({ ...prev, [row.tmdb_id]: { theater: row.theater, ott: row.ott, skip: row.skip } }));
            })
            .subscribe();
        const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 20000);
        return () => { clearInterval(timer); supabase.removeChannel(channel); };
    }, [ids, refresh]);

    // Our computed verdict for the selected movie.
    useEffect(() => {
        if (!movie || ourCall[movie.tmdbId] !== undefined) return undefined;
        let alive = true;
        getTosVerdict(movie.tmdbId, 'movie').then((v) => {
            if (alive) setOurCall((prev) => ({ ...prev, [movie.tmdbId]: v || null }));
        });
        return () => { alive = false; };
    }, [movie, ourCall]);

    const vote = async (choice) => {
        if (!movie || busy) return;
        const id = movie.tmdbId;
        const prevChoice = mine[id];
        if (prevChoice === choice) return;
        // Optimistic: move this visitor's vote right away.
        setTotals((prev) => {
            const t = { theater: 0, ott: 0, skip: 0, ...(prev[id] || {}) };
            if (prevChoice) t[prevChoice] = Math.max(0, t[prevChoice] - 1);
            t[choice] += 1;
            return { ...prev, [id]: t };
        });
        const nextMine = { ...mine, [id]: choice };
        setMine(nextMine);
        writeStore('tos_votes', nextMine);
        setBusy(true);
        const res = await castVerdictVote({ tmdbId: id, choice, voterId: voterId() });
        setBusy(false);
        if (res.ok) {
            setAvailable(res.available !== false);
            if (res.totals?.[id]) setTotals((prev) => ({ ...prev, [id]: res.totals[id] }));
        }
    };

    if (!movie) {
        return <div className="aspect-[16/11] w-full animate-pulse rounded-3xl bg-white/[0.05]" />;
    }

    const t = totals[movie.tmdbId];
    const myChoice = mine[movie.tmdbId];
    const showResults = !!myChoice && available;
    const call = ourCall[movie.tmdbId];
    const total = sum(t);

    return (
        <div>
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#100e0b]">
                <div className="relative">
                    {movie.backdrop && (
                        <img src={`${IMG}/w780${movie.backdrop}`} srcSet={`${IMG}/w780${movie.backdrop} 780w, ${IMG}/w1280${movie.backdrop} 1280w`} sizes="(min-width: 1024px) 640px, 100vw" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-40" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#100e0b] via-[#100e0b]/70 to-[#100e0b]/20" />
                    <div className="relative flex gap-4 p-4 pt-10 sm:gap-5 sm:p-6 sm:pt-24">
                        <img src={`${IMG}/w342${movie.poster}`} alt="" className="h-[120px] w-20 shrink-0 rounded-lg object-cover shadow-2xl sm:h-44 sm:w-[118px]" />
                        <div className="flex min-w-0 flex-col justify-end">
                            <p className="text-[13px] text-white/50">
                                {movie.year}
                                {movie.rating ? <> · <FaStar className="mb-0.5 inline text-[10px]" style={{ color: GOLD }} /> {movie.rating}</> : null}
                            </p>
                            <Link to={moviePath(movie)} className="mt-1 text-xl font-semibold leading-tight tracking-tight text-white hover:underline sm:text-3xl">{movie.title}</Link>
                            {call?.verdict && (
                                <p className="mt-2 text-[13px] text-white/55">
                                    Our call: <span className="font-semibold" style={{ color: GOLD }}>{call.verdict}</span>
                                    {call.reason ? <span className="text-white/40"> · {call.reason}</span> : null}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 pt-1 sm:p-6 sm:pt-3">
                    <p className="mb-3 text-[14px] text-white/70">{myChoice ? 'Your vote is in. Change it anytime.' : 'What’s your call?'}</p>
                    <div className="grid grid-cols-3 gap-2">
                        {CHOICES.map((c) => {
                            const selected = myChoice === c.id;
                            const share = pct(t, c.id);
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => vote(c.id)}
                                    aria-pressed={selected}
                                    className={`relative flex min-h-[72px] flex-col items-center justify-center overflow-hidden rounded-xl border px-2 py-2.5 text-center transition ${selected ? 'border-[#f5c518]/70 bg-[#f5c518]/[0.08]' : 'border-white/10 bg-white/[0.02] hover:border-white/25'}`}
                                >
                                    <span className={`text-[14px] font-semibold leading-tight ${selected ? 'text-[#f5c518]' : 'text-white'}`}>{c.label}</span>
                                    {showResults
                                        ? <span className="mt-1 text-[13px] font-semibold tabular-nums text-white/80">{share}%</span>
                                        : <span className="mt-1 hidden text-[11px] leading-tight text-white/40 sm:block">{c.hint}</span>}
                                    {showResults && (
                                        <span className="absolute inset-x-0 bottom-0 h-1 bg-white/[0.06]" aria-hidden>
                                            <span
                                                className="block h-full transition-[width] duration-700 ease-out"
                                                style={{ width: `${share}%`, background: selected ? GOLD : 'rgba(255,255,255,0.35)' }}
                                            />
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-white/40">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                            </span>
                            {available
                                ? (total ? `${total.toLocaleString()} vote${total === 1 ? '' : 's'} · updating live` : 'Be the first to vote')
                                : 'Live results open soon'}
                        </span>
                        {myChoice && (
                            <button type="button" onClick={onSignup} className="font-medium hover:underline" style={{ color: GOLD }}>
                                Get verdicts for your taste →
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Switch between this week's releases */}
            <div className="mt-3 grid grid-cols-3 gap-2">
                {movies.map((m, i) => {
                    const lead = leader(totals[m.tmdbId]);
                    const active = i === index;
                    return (
                        <button
                            key={m.tmdbId}
                            type="button"
                            onClick={() => setIndex(i)}
                            aria-label={`Vote on ${m.title}`}
                            aria-pressed={active}
                            className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition sm:flex-row sm:gap-3 sm:text-left ${active ? 'border-[#f5c518]/70 bg-[#f5c518]/[0.06]' : 'border-white/10 hover:border-white/25'}`}
                        >
                            <img src={`${IMG}/w92${m.poster}`} alt="" className="h-14 w-10 shrink-0 rounded-md object-cover" />
                            <span className="min-w-0 w-full">
                                <span className={`line-clamp-1 text-[12px] font-semibold sm:text-[13px] ${active ? 'text-white' : 'text-white/75'}`}>{m.title}</span>
                                <span className="mt-0.5 hidden text-[11px] text-white/45 sm:block">
                                    {mine[m.tmdbId] ? 'You voted' : 'Not voted yet'}
                                    {lead ? ` · ${lead.label} leads` : ''}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Landing page for signed-out visitors.
 */
export default function LandingPage() {
    const [data, setData] = useState({ hero: null, hot: [], wall: [], poll: [], loading: true });
    const [mode, setMode] = useState('signup');
    const formRef = useRef(null);
    const [showStickyCta, setShowStickyCta] = useState(false);

    // Phones: once the hero signup card scrolls away, keep a signup button in reach.
    useEffect(() => {
        const el = formRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') return undefined;
        const io = new IntersectionObserver(([entry]) => {
            setShowStickyCta(!entry.isIntersecting && entry.boundingClientRect.top < 0);
        }, { threshold: 0 });
        io.observe(el);
        return () => io.disconnect();
    }, []);

    useEffect(() => {
        let alive = true;
        getLandingData().then((res) => { if (alive) setData({ ...res, loading: false }); });
        return () => { alive = false; };
    }, []);

    const goToForm = (nextMode = 'signup') => {
        setMode(nextMode);
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => formRef.current?.querySelector('input[type="email"]')?.focus({ preventScroll: true }), 450);
    };

    const { hero, hot, wall, poll } = data;
    const still = hero?.still || null;
    const statementStill = hot[1]?.backdrop || hot[0]?.backdrop || hero?.still;
    const marquee = wall.length ? [...wall, ...wall] : [];

    return (
        <div className="min-h-screen bg-[#0a0907] text-[#f3eee6] antialiased selection:bg-[#f5c518] selection:text-black">
            <SeoHead
                title="TheaterOrStream · Theater or stream? Know before you watch"
                description="Movie picks that match your taste, in the languages you watch, with where to stream and an honest Theater / Wait for OTT / Skip verdict. Free."
            />

            {/* ─── Hero ─────────────────────────────────────────────── */}
            <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden lg:min-h-[94vh]">
                <div className="absolute inset-0 -z-10">
                    {still
                        ? <img src={`${IMG}/w1280${still}`} srcSet={stillSrcSet(still)} sizes="100vw" alt="" className="h-full w-full object-cover object-[60%_center]" fetchpriority="high" />
                        : <div className="h-full w-full bg-[#15110b]" />}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0a0907]/85 via-[#0a0907]/35 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0907] via-[#0a0907]/10 to-[#0a0907]/40" />
                </div>

                <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-8 sm:pt-[calc(1.1rem+env(safe-area-inset-top,0px))]">
                    <Link to="/" className="flex items-center gap-2.5">
                        <img src={LOGO} alt="TheaterOrStream" className="h-8 w-8 rounded-full object-cover sm:h-9 sm:w-9" />
                        <span className="text-[17px] font-semibold tracking-tight sm:text-lg">
                            <span style={{ color: GOLD }}>Theater</span>
                            <span className="text-[#9299a6]"> or Stream</span>
                        </span>
                        <span className="group relative inline-flex" aria-label="Beta">
                            <span
                                aria-hidden="true"
                                className="flex h-5 w-5 items-center justify-center rounded-full border text-[12px] font-bold leading-none"
                                style={{ color: GOLD, borderColor: `${GOLD}66`, backgroundColor: `${GOLD}1a` }}
                            >
                                β
                            </span>
                            <span
                                role="tooltip"
                                className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/90 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                            >
                                Beta
                            </span>
                        </span>
                    </Link>
                    <nav className="flex items-center gap-1 text-[14px] sm:gap-5">
                        <Link to="/?tab=explore" className="hidden text-white/75 hover:text-white sm:inline">Browse</Link>
                        <button type="button" onClick={() => goToForm('login')} className="min-h-[44px] px-3 text-white/85 hover:text-white">Log in</button>
                        <button type="button" onClick={() => goToForm('signup')} className="hidden rounded-full bg-white px-4 py-2 font-medium text-black hover:bg-white/90 sm:inline-flex">
                            Sign up
                        </button>
                    </nav>
                </header>

                <div className="mx-auto grid w-full max-w-7xl flex-1 content-start gap-5 px-4 pb-6 pt-5 sm:content-end sm:gap-8 sm:px-8 sm:pb-8 sm:pt-8 lg:grid-cols-[1fr_400px] lg:items-center lg:content-center lg:gap-16 lg:pb-14">
                    <div className="lg:pb-6">
                        <h1 className="text-[2.15rem] font-semibold leading-[1.06] tracking-tight text-white min-[400px]:text-[2.4rem] sm:text-6xl lg:text-[4.5rem]">
                            Theater or stream?
                            <span className="block" style={{ color: GOLD }}>Know before you watch.</span>
                        </h1>
                        <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-white/75 sm:mt-5 sm:text-[17px]">
                            Picks for your taste, in your languages, with where to stream them<span className="hidden sm:inline"> and an honest call on what’s worth the big screen</span>.
                        </p>
                    </div>

                    <div ref={formRef} className="w-full scroll-mt-20 rounded-2xl border border-white/12 bg-[#0a0907]/75 p-4 backdrop-blur-xl sm:p-6">
                        <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{AUTH_MODE_TITLES[mode]}</h2>
                        <p className="mb-3 mt-0.5 text-[13px] text-white/50 sm:mb-4">
                            {mode === 'signup' ? 'Free. Your first picks in about two minutes.' : mode === 'login' ? 'Pick up where you left off.' : ' '}
                        </p>
                        <AuthForm mode={mode} onModeChange={setMode} theme="gold" compact />
                        <p className="mt-3 text-center text-[11px] leading-relaxed text-white/35 sm:mt-4">
                            By continuing you agree to our{' '}
                            <Link to="/terms" className="underline underline-offset-2 hover:text-white/70">Terms</Link> and{' '}
                            <Link to="/privacy" className="underline underline-offset-2 hover:text-white/70">Privacy Policy</Link>.
                        </p>
                    </div>
                </div>

                {hero && (
                    <div className="mx-auto hidden w-full max-w-7xl px-5 pb-5 sm:block sm:px-8">
                        <Link to={moviePath(hero)} className="text-[12px] text-white/40 hover:text-white/75">
                            Still: {hero.title}{hero.year ? ` (${hero.year})` : ''}
                        </Link>
                    </div>
                )}
            </section>

            {/* ─── Poster wall ──────────────────────────────────────── */}
            <section aria-label="Trending this week" className="overflow-hidden border-y border-white/[0.07] py-4 sm:py-6">
                {marquee.length ? (
                    <div className="lp-marquee flex w-max gap-3">
                        {marquee.map((m, i) => (
                            <Link key={`${m.tmdbId}-${i}`} to={moviePath(m)} tabIndex={i >= wall.length ? -1 : 0} aria-hidden={i >= wall.length} className="block w-[92px] shrink-0 sm:w-[132px]">
                                <img src={`${IMG}/w185${m.poster}`} alt={m.title} loading="lazy" className="aspect-[2/3] w-full rounded-md object-cover opacity-80 transition hover:opacity-100" />
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="flex gap-3 px-5">
                        {Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-[2/3] w-[110px] shrink-0 animate-pulse rounded-md bg-white/[0.05] sm:w-[132px]" />)}
                    </div>
                )}
            </section>

            {/* ─── Live poll ────────────────────────────────────────── */}
            <section className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:gap-10 sm:px-8 sm:py-28 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
                <div className="lg:sticky lg:top-16 lg:self-start">
                    <h2 className="text-[2rem] font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl">
                        Theater, stream,<br /><span style={{ color: GOLD }}>or skip?</span>
                    </h2>
                    <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/65 sm:mt-5 sm:text-[17px]">
                        Three of the biggest releases right now, put to a vote. Make your call and watch the split move as people vote, live.
                    </p>
                    <p className="mt-4 hidden max-w-md text-[14px] leading-relaxed text-white/45 sm:block">
                        Sign up and every verdict is weighed against your own taste, so you know what’s worth it <em>for you</em>.
                    </p>
                    <button type="button" onClick={() => goToForm('signup')} className="mt-5 hidden min-h-[44px] items-center gap-2 border-b pb-0.5 text-[15px] font-medium text-white hover:text-[#f5c518] sm:mt-7 sm:inline-flex" style={{ borderColor: GOLD }}>
                        Get personal verdicts <FaArrowRight className="text-[11px]" />
                    </button>
                </div>
                <VerdictPoll movies={poll.length ? poll : hot.slice(0, 3)} onSignup={() => goToForm('signup')} />
            </section>

            {/* ─── What you get ─────────────────────────────────────── */}
            <section className="border-t border-white/[0.07]">
                <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:gap-10 sm:px-8 sm:py-28 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
                    <h2 className="text-[2rem] font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:sticky lg:top-16 lg:self-start">
                        Made for how you <span style={{ color: GOLD }}>actually</span> watch.
                    </h2>
                    <ol className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
                        {FEATURES.map((f, i) => (
                            <li key={f.title} className="py-5 sm:grid sm:grid-cols-[3.5rem_1fr] sm:gap-x-4 sm:py-7">
                                <span className="block text-[12px] tabular-nums text-white/35 sm:pt-1.5 sm:text-[13px]">{String(i + 1).padStart(2, '0')}</span>
                                <div>
                                    <h3 className="mt-1 text-[19px] font-semibold tracking-tight text-white sm:mt-0 sm:text-2xl">{f.title}</h3>
                                    <p className="mt-1.5 max-w-xl text-[14.5px] leading-relaxed text-white/55 sm:mt-2 sm:text-[15px]">{f.body}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* ─── Statement ────────────────────────────────────────── */}
            <section className="relative isolate overflow-hidden">
                {statementStill && <img src={`${IMG}/w1280${statementStill}`} srcSet={stillSrcSet(statementStill)} sizes="100vw" alt="" loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover" />}
                <div className="absolute inset-0 -z-10 bg-[#0a0907]/40" />
                <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0a0907] via-[#0a0907]/10 to-[#0a0907]" />
                <div className="mx-auto max-w-7xl px-4 py-20 sm:px-8 sm:py-40">
                    <p className="max-w-4xl text-[2.1rem] font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl">
                        Less time scrolling.<br /><span style={{ color: GOLD }}>More time watching.</span>
                    </p>
                    <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-center">
                        <button type="button" onClick={() => goToForm('signup')} className="rounded-full px-7 py-3.5 text-[15px] font-semibold text-black transition hover:brightness-110" style={{ background: GOLD }}>
                            Create a free account
                        </button>
                        <Link to="/?tab=explore" className="rounded-full px-7 py-3.5 text-center text-[15px] font-medium text-white/85 ring-1 ring-white/25 hover:ring-white/50">
                            Browse without an account
                        </Link>
                    </div>
                </div>
            </section>

            {/* ─── FAQ ──────────────────────────────────────────────── */}
            <section className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:gap-10 sm:px-8 sm:py-28 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
                <h2 className="text-[2rem] font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl">Good questions.</h2>
                <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
                    {FAQS.map((f) => (
                        <details key={f.q} className="group py-4 sm:py-5 [&_summary::-webkit-details-marker]:hidden">
                            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 text-[16px] text-white sm:text-[17px]">
                                {f.q}
                                <FaPlus className="shrink-0 text-xs text-white/40 transition group-open:rotate-45" />
                            </summary>
                            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/55">{f.a}</p>
                        </details>
                    ))}
                </div>
            </section>

            {/* ─── Sticky signup (phones) ───────────────────────────── */}
            <div
                className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0907]/90 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur-xl transition-transform duration-300 sm:hidden ${showStickyCta ? 'translate-y-0' : 'translate-y-full'}`}
                aria-hidden={!showStickyCta}
            >
                <div className="flex items-center gap-3">
                    <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/70">Picks for your taste, free.</p>
                    <button
                        type="button"
                        tabIndex={showStickyCta ? 0 : -1}
                        onClick={() => goToForm('signup')}
                        className="min-h-[44px] shrink-0 rounded-full px-5 text-[15px] font-semibold text-black"
                        style={{ background: GOLD }}
                    >
                        Sign up free
                    </button>
                </div>
            </div>

            {/* ─── Footer ───────────────────────────────────────────── */}
            <footer className="overflow-hidden border-t border-white/[0.07]">
                <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pt-10 sm:gap-8 sm:px-8 sm:pt-14 md:flex-row md:justify-between">
                    <p className="max-w-xs text-[15px] leading-relaxed text-white/55">
                        Honest verdicts, personal picks and where to watch, in every language you love.
                    </p>
                    <div className="grid grid-cols-2 gap-x-8 text-[14px] text-white/60 sm:grid-cols-3 sm:gap-x-16 sm:gap-y-2 [&>*]:flex [&>*]:min-h-[44px] [&>*]:items-center sm:[&>*]:min-h-0">
                        <Link to="/?tab=explore" className="hover:text-white">Browse movies</Link>
                        <Link to="/upcoming" className="hover:text-white">Coming soon</Link>
                        <Link to="/parent-guide" className="hover:text-white">Parent guide</Link>
                        <Link to="/about" className="hover:text-white">About</Link>
                        <Link to="/privacy" className="hover:text-white">Privacy</Link>
                        <Link to="/terms" className="hover:text-white">Terms</Link>
                        <Link to="/attributions" className="hover:text-white">Attributions</Link>
                        <button type="button" onClick={() => goToForm('login')} className="text-left hover:text-white">Log in</button>
                        <button type="button" onClick={openCookieSettings} className="text-left hover:text-white">Cookie settings</button>
                    </div>
                </div>
                <p
                    aria-hidden
                    className="mx-auto mt-8 max-w-7xl select-none whitespace-nowrap px-4 pb-2 text-center text-[10.5vw] font-semibold leading-[1.1] tracking-tight text-white/[0.06] sm:mt-12 sm:px-8 lg:text-[8.5rem]"
                >
                    {/* Each half lights up on its own hover: Theater yellow, Stream grey. */}
                    <span className="transition-colors duration-300 hover:text-[#f5c518]">Theater</span>{' '}
                    <span className="transition-colors duration-300 hover:text-[#9299a6]">or Stream</span>
                </p>
                <div className="border-t border-white/[0.07]">
                    <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-5 text-[12px] text-white/35 sm:flex-row sm:justify-between sm:px-8 sm:pb-5">
                        <p>© {new Date().getFullYear()} TheaterOrStream</p>
                        <p>Movie data and images from TMDB. Not endorsed or certified by TMDB.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
