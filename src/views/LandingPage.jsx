import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    FaStar, FaLanguage, FaTv, FaMagic, FaChild, FaCalendarAlt, FaListUl, FaCheck, FaArrowRight, FaChevronDown,
} from 'react-icons/fa';
import SeoHead from '../components/SeoHead';
import AuthForm, { AUTH_MODE_TITLES } from '../components/auth/AuthForm';
import { getLandingData, getTosVerdict } from '../lib/recommendationApi';
import { generateSlugWithId } from '../lib/slugUtils';

const LOGO = 'https://res.cloudinary.com/ddhhlkyut/image/upload/v1768226006/a78a29523128c4555fdd178b6c612ac6_dbtyqp.jpg';
const IMG = 'https://image.tmdb.org/t/p';
const SERIF = { fontFamily: "'Fraunces', Georgia, 'Times New Roman', serif" };
// Fine film grain over the hero still.
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

const LANGUAGES = ['Hindi', 'Telugu', 'Tamil', 'Malayalam', 'Kannada', 'Bengali', 'Marathi', 'English', 'Korean', 'Japanese', 'Spanish', 'French'];

const FEATURES = [
    { icon: FaMagic, title: 'Picks that actually get you', body: 'Tell us the films and stars you love. Every week we line up movies that match your taste, not just what’s popular.' },
    { icon: FaLanguage, title: 'In the languages you watch', body: 'Pick Hindi and Telugu and that’s exactly what you get. No wading through movies you’d never watch.' },
    { icon: FaTv, title: 'Know where to stream', body: 'See which of your OTT services has it, in your country, right on every poster. No more app-hopping.' },
    { icon: FaChild, title: 'Parent guide, at a glance', body: 'Violence, language and scary scenes rated clearly, so family movie night never goes wrong.' },
    { icon: FaCalendarAlt, title: 'What’s coming soon', body: 'The biggest upcoming releases and fresh trailers, so you can plan your next theater trip.' },
    { icon: FaListUl, title: 'Your movie life, organised', body: 'Watchlist, diary, ratings and lists you can share with friends, all in one place.' },
];

const STEPS = [
    { n: '1', title: 'Tell us your taste', body: 'Languages, favourite films, stars and moods. It takes about two minutes.' },
    { n: '2', title: 'Get your picks', body: 'A fresh set of recommendations every week, on the services you already pay for.' },
    { n: '3', title: 'Theater or stream?', body: 'Check the verdict before you book tickets or press play. Never waste a movie night again.' },
];

const FAQS = [
    { q: 'Is TheaterOrStream free?', a: 'Yes. Creating an account and getting recommendations is completely free. No credit card, ever.' },
    { q: 'Which languages are supported?', a: 'Hindi, Telugu, Tamil, Malayalam, Kannada, Bengali, Marathi, English, Korean, Japanese, Spanish and French. Pick as many as you watch, and we only recommend movies in those languages.' },
    { q: 'How are my picks made?', a: 'From the movies you love, the actors and directors you follow, your moods and the services you use. The more you rate, the sharper your picks get.' },
    { q: 'Do I need a streaming subscription?', a: 'No. Add your services to see what you can watch right away, or skip it and use TheaterOrStream to decide what’s worth the theater.' },
];

const moviePath = (m) => `/movies/${generateSlugWithId(m.title, m.tmdbId, m.year)}`;

const VERDICT_EMOJI = { Theater: '🎟️', 'Wait for OTT': '📺', Skip: '⏭️' };

/** The real TOS verdict for one of this week's hot movies. */
function VerdictDemo({ movie }) {
    const [verdict, setVerdict] = useState(null);
    useEffect(() => {
        if (!movie?.tmdbId) return undefined;
        let alive = true;
        getTosVerdict(movie.tmdbId, 'movie').then((v) => { if (alive) setVerdict(v); });
        return () => { alive = false; };
    }, [movie?.tmdbId]);
    const current = verdict?.verdict || null;
    const verdicts = [
        { label: 'Theater', note: 'Worth the big screen' },
        { label: 'Wait for OTT', note: 'Fine at home' },
        { label: 'Skip', note: 'Not worth your time' },
    ];
    return (
        <div className="relative mx-auto w-full max-w-sm rounded-2xl border border-white/10 bg-[#14110c] p-4 shadow-2xl">
            <span className="absolute -top-3 left-4 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/60 backdrop-blur">Live verdict</span>
            <div className="flex gap-4">
                {movie?.poster
                    ? <img src={`${IMG}/w342${movie.poster}`} alt="" className="h-40 w-28 shrink-0 rounded-lg object-cover" loading="lazy" />
                    : <div className="h-40 w-28 shrink-0 rounded-lg bg-white/5" />}
                <div className="min-w-0">
                    <p className="line-clamp-2 text-lg font-semibold text-white" style={SERIF}>{movie?.title || 'Your next movie'}</p>
                    <p className="text-sm text-white/45">{movie?.year || ''}</p>
                    {current ? (
                        <>
                            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#e8b34b] px-3 py-1.5 text-sm font-bold text-[#16120a]">
                                {VERDICT_EMOJI[current]} {current}
                            </div>
                            {verdict.reason && <p className="mt-2 text-[13px] leading-snug text-white/55">{verdict.reason}</p>}
                        </>
                    ) : (
                        <div className="mt-3 h-8 w-28 animate-pulse rounded-full bg-white/10" />
                    )}
                </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
                {verdicts.map((v) => {
                    const active = v.label === current;
                    return (
                    <div key={v.label} className={`rounded-xl border px-2 py-2 text-center ${active ? 'border-[#e8b34b]/60 bg-[#e8b34b]/10' : 'border-white/10 bg-white/[0.02]'}`}>
                        <p className={`text-[12px] font-semibold ${active ? 'text-[#e8b34b]' : 'text-white/70'}`}>{v.label}</p>
                        <p className="mt-0.5 text-[10px] text-white/40">{v.note}</p>
                    </div>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Landing page for signed-out visitors: film-still hero with the signup form,
 * hot-right-now movies, features, how it works, FAQ and a final call to action.
 */
export default function LandingPage() {
    const [data, setData] = useState({ hero: null, hot: [], loading: true });
    const [mode, setMode] = useState('signup');
    const formRef = useRef(null);

    useEffect(() => {
        let alive = true;
        getLandingData().then((res) => { if (alive) setData({ ...res, loading: false }); });
        return () => { alive = false; };
    }, []);

    const goToForm = (nextMode = 'signup') => {
        setMode(nextMode);
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
            formRef.current?.querySelector('input[type="email"]')?.focus({ preventScroll: true });
        }, 450);
    };

    const { hero, hot } = data;
    const still = hero?.still ? `${IMG}/original${hero.still}` : null;

    return (
        <div className="min-h-screen bg-[#0b0a08] text-[#f5efe4] antialiased">
            <SeoHead
                title="TheaterOrStream · Theater or stream? Know before you watch"
                description="Movie picks that match your taste, in the languages you watch, with where to stream and an honest Theater / Wait for OTT / Skip verdict. Free."
            />

            {/* ─── Hero ─────────────────────────────────────────────── */}
            <section className="relative isolate overflow-hidden">
                <div className="absolute inset-0 -z-10">
                    {still ? (
                        <img src={still} alt="" className="h-full w-full object-cover object-center" fetchpriority="high" />
                    ) : (
                        <div className="h-full w-full bg-[radial-gradient(ellipse_at_top,#3a2a12_0%,#0b0a08_65%)]" />
                    )}
                    {/* Keep the still vivid: darken only behind the copy and at the edges. */}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0b0a08]/90 via-[#0b0a08]/40 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b0a08] via-transparent to-[#0b0a08]/50" />
                    <div className="absolute inset-0 opacity-[0.12] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
                </div>

                {/* Nav */}
                <header className="mx-auto flex max-w-6xl items-center justify-between px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:px-6">
                    <Link to="/" className="flex items-center gap-2.5">
                        <img src={LOGO} alt="" className="h-9 w-9 rounded-full object-cover" />
                        <span className="text-lg font-semibold tracking-tight">
                            <span className="text-[#e8b34b]">Theater</span><span className="text-white/70">OrStream</span>
                        </span>
                    </Link>
                    <nav className="flex items-center gap-1 sm:gap-2">
                        <Link to="/?tab=explore" className="hidden rounded-full px-3 py-2 text-sm font-medium text-white/75 hover:text-white sm:inline-flex">
                            Browse movies
                        </Link>
                        <button type="button" onClick={() => goToForm('login')} className="rounded-full px-3 py-2 text-sm font-medium text-white/80 hover:text-white">
                            Log in
                        </button>
                        <button type="button" onClick={() => goToForm('signup')} className="hidden rounded-full bg-[#e8b34b] px-4 py-2 text-sm font-semibold text-[#16120a] hover:bg-[#f0c463] sm:inline-flex">
                            Sign up free
                        </button>
                    </nav>
                </header>

                <div className="mx-auto grid max-w-6xl items-center gap-7 px-4 pb-16 pt-6 sm:gap-10 sm:px-6 sm:pt-16 lg:min-h-[78vh] lg:grid-cols-[1.15fr_0.85fr] lg:gap-14 lg:pb-24">
                    <div>
                        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#e8b34b]/30 bg-[#e8b34b]/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-[#e8b34b]">
                            Free · In every language you watch
                        </p>
                        <h1 className="text-[2.3rem] font-bold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-[4.2rem]" style={SERIF}>
                            Theater or stream?<br />
                            <span className="text-[#e8b34b]" style={SERIF}>Know before you watch.</span>
                        </h1>
                        <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-white/75 sm:mt-5 sm:text-lg">
                            Movies picked for your taste, in your languages, with exactly where to stream them, and an honest verdict on what’s worth the big screen.
                        </p>
                        <ul className="mt-6 hidden space-y-2.5 text-[15px] text-white/80 sm:block">
                            {['Personal picks every week, in your languages', 'Where to stream it, on the services you have', 'Theater, wait for OTT, or skip: decided in seconds'].map((line) => (
                                <li key={line} className="flex items-start gap-2.5">
                                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e8b34b]/15 text-[10px] text-[#e8b34b]"><FaCheck /></span>
                                    {line}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Signup / login card */}
                    <div ref={formRef} className="w-full scroll-mt-24 rounded-2xl border border-white/10 bg-[#0f0d0a]/85 p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md sm:p-6">
                        <h2 className="text-2xl font-bold text-white" style={SERIF}>{AUTH_MODE_TITLES[mode]}</h2>
                        <p className="mb-4 mt-1 text-sm text-white/50">
                            {mode === 'signup' ? 'Free forever. Your first picks in about two minutes.' : mode === 'login' ? 'Log in to see this week’s picks.' : ' '}
                        </p>
                        <AuthForm mode={mode} onModeChange={setMode} theme="gold" compact />
                        <p className="mt-4 text-center text-[11px] text-white/35">
                            By continuing, you agree to our{' '}
                            <Link to="/terms" className="underline underline-offset-2 hover:text-white/70">Terms</Link> and{' '}
                            <Link to="/privacy" className="underline underline-offset-2 hover:text-white/70">Privacy Policy</Link>.
                        </p>
                    </div>
                </div>

                {/* Still credit, like a film-festival caption */}
                {hero && (
                    <Link
                        to={moviePath(hero)}
                        className="absolute bottom-24 right-3 hidden origin-bottom-right rotate-[-90deg] translate-x-full text-[12px] tracking-wide text-white/40 hover:text-white/80 lg:block"
                    >
                        {hero.title}{hero.year ? ` (${hero.year})` : ''}
                    </Link>
                )}

                <div className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 text-white/30 lg:block" aria-hidden>
                    <FaChevronDown className="animate-bounce" />
                </div>
            </section>

            {/* ─── Language strip ───────────────────────────────────── */}
            <section className="border-y border-white/[0.06] bg-[#0e0c09]">
                <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-5 sm:flex-row sm:justify-between sm:px-6">
                    <p className="text-[13px] font-medium text-white/50">Made for movie lovers who watch in</p>
                    <div className="flex flex-wrap justify-center gap-1.5">
                        {LANGUAGES.map((l) => (
                            <span key={l} className="rounded-full border border-white/10 px-2.5 py-1 text-[12px] text-white/70">{l}</span>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── Hot right now ────────────────────────────────────── */}
            <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
                <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#e8b34b]">Hot right now</p>
                        <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl" style={SERIF}>What everyone’s watching</h2>
                    </div>
                    <button type="button" onClick={() => goToForm('signup')} className="inline-flex items-center gap-2 text-sm font-semibold text-[#e8b34b] hover:underline">
                        Get your verdict on every one <FaArrowRight className="text-xs" />
                    </button>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:gap-4 lg:grid-cols-6">
                    {(data.loading ? Array.from({ length: 6 }, () => null) : hot).map((m, i) => (
                        m ? (
                            <Link key={m.tmdbId} to={moviePath(m)} className="group block">
                                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10 transition group-hover:ring-[#e8b34b]/70">
                                    <img src={`${IMG}/w342${m.poster}`} alt={m.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                                    <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-white backdrop-blur">#{i + 1}</span>
                                    {m.rating ? (
                                        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                                            <FaStar className="text-[9px] text-[#e8b34b]" />{m.rating}
                                        </span>
                                    ) : null}
                                </div>
                                <p className="mt-2 line-clamp-1 text-[13px] font-medium text-white/85 group-hover:text-white">{m.title}</p>
                                <p className="text-[11px] text-white/40">{m.year}</p>
                            </Link>
                        ) : <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-white/[0.06]" />
                    ))}
                </div>
            </section>

            {/* ─── Verdict showcase ─────────────────────────────────── */}
            <section className="border-t border-white/[0.06] bg-[radial-gradient(ellipse_at_left,#1c150a_0%,#0b0a08_60%)]">
                <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
                    <div>
                        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#e8b34b]">The TOS verdict</p>
                        <h2 className="mt-2 text-3xl font-bold leading-tight text-white sm:text-4xl" style={SERIF}>
                            Before you buy tickets, know if it’s worth the big screen.
                        </h2>
                        <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-white/65">
                            Every new release gets a clear call: <strong className="text-white">Theater</strong>, <strong className="text-white">Wait for OTT</strong>, or <strong className="text-white">Skip</strong>. Sign in and it’s tuned to your taste, too.
                        </p>
                        <button type="button" onClick={() => goToForm('signup')} className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#e8b34b] px-6 py-3 text-[15px] font-semibold text-[#16120a] hover:bg-[#f0c463]">
                            Get personal verdicts <FaArrowRight className="text-xs" />
                        </button>
                    </div>
                    <VerdictDemo movie={hot[0] || hero} />
                </div>
            </section>

            {/* ─── Features ─────────────────────────────────────────── */}
            <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
                <div className="mx-auto mb-10 max-w-2xl text-center">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#e8b34b]">Everything in one place</p>
                    <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl" style={SERIF}>Spend less time scrolling, more time watching</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {FEATURES.map(({ icon: Icon, title, body }) => (
                        <div key={title} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 transition hover:border-[#e8b34b]/30 hover:bg-white/[0.035]">
                            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e8b34b]/12 text-lg text-[#e8b34b]"><Icon /></span>
                            <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
                            <p className="mt-2 text-[14px] leading-relaxed text-white/55">{body}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── How it works ─────────────────────────────────────── */}
            <section className="border-y border-white/[0.06] bg-[#0e0c09]">
                <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
                    <h2 className="text-center text-3xl font-bold text-white sm:text-4xl" style={SERIF}>Up and running in two minutes</h2>
                    <div className="mt-10 grid gap-6 md:grid-cols-3">
                        {STEPS.map((s) => (
                            <div key={s.n} className="relative rounded-2xl border border-white/[0.08] p-6">
                                <span className="text-5xl font-bold text-[#e8b34b]/80" style={SERIF}>{s.n}</span>
                                <h3 className="mt-3 text-lg font-semibold text-white">{s.title}</h3>
                                <p className="mt-2 text-[14px] leading-relaxed text-white/55">{s.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── FAQ ──────────────────────────────────────────────── */}
            <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
                <h2 className="text-center text-3xl font-bold text-white sm:text-4xl" style={SERIF}>Questions, answered</h2>
                <div className="mt-8 divide-y divide-white/[0.08] rounded-2xl border border-white/[0.08]">
                    {FAQS.map((f) => (
                        <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-white">
                                {f.q}
                                <FaChevronDown className="shrink-0 text-xs text-white/40 transition group-open:rotate-180" />
                            </summary>
                            <p className="mt-3 text-[14px] leading-relaxed text-white/60">{f.a}</p>
                        </details>
                    ))}
                </div>
            </section>

            {/* ─── Final call to action ─────────────────────────────── */}
            <section className="relative isolate overflow-hidden">
                {still && <img src={still} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-30 blur-[2px]" loading="lazy" />}
                <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0b0a08] via-[#0b0a08]/70 to-[#0b0a08]" />
                <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-28">
                    <h2 className="text-4xl font-bold leading-tight text-white sm:text-5xl" style={SERIF}>
                        Your next favourite movie is <span className="text-[#e8b34b]">waiting.</span>
                    </h2>
                    <p className="mx-auto mt-4 max-w-xl text-[16px] text-white/65">Answer a few quick questions and get picks made just for you. Free, forever.</p>
                    <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <button type="button" onClick={() => goToForm('signup')} className="w-full rounded-full bg-[#e8b34b] px-8 py-3.5 text-[16px] font-semibold text-[#16120a] shadow-[0_10px_40px_-10px_rgba(232,179,75,0.6)] hover:bg-[#f0c463] sm:w-auto">
                            Create my free account
                        </button>
                        <Link to="/?tab=explore" className="w-full rounded-full border border-white/15 px-8 py-3.5 text-[15px] font-medium text-white/80 hover:border-white/35 hover:text-white sm:w-auto">
                            Browse without an account
                        </Link>
                    </div>
                </div>
            </section>

            {/* ─── Footer ───────────────────────────────────────────── */}
            <footer className="border-t border-white/[0.08] bg-[#080705]">
                <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <img src={LOGO} alt="" className="h-9 w-9 rounded-full object-cover" />
                            <span className="text-lg font-semibold"><span className="text-[#e8b34b]">Theater</span><span className="text-white/70">OrStream</span></span>
                        </div>
                        <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-white/50">
                            Honest verdicts, personal picks and where to watch, for every language you love.
                        </p>
                    </div>
                    <div>
                        <p className="text-[12px] font-semibold uppercase tracking-wider text-white/40">Discover</p>
                        <ul className="mt-3 space-y-2 text-[14px] text-white/65">
                            <li><Link to="/?tab=explore" className="hover:text-white">Browse movies</Link></li>
                            <li><Link to="/upcoming" className="hover:text-white">Coming soon</Link></li>
                            <li><Link to="/parent-guide" className="hover:text-white">Parent guide</Link></li>
                            <li><button type="button" onClick={() => goToForm('signup')} className="hover:text-white">Get personal picks</button></li>
                        </ul>
                    </div>
                    <div>
                        <p className="text-[12px] font-semibold uppercase tracking-wider text-white/40">Company</p>
                        <ul className="mt-3 space-y-2 text-[14px] text-white/65">
                            <li><Link to="/about" className="hover:text-white">About</Link></li>
                            <li><Link to="/privacy" className="hover:text-white">Privacy</Link></li>
                            <li><Link to="/terms" className="hover:text-white">Terms</Link></li>
                            <li><Link to="/attributions" className="hover:text-white">Attributions</Link></li>
                        </ul>
                    </div>
                </div>
                <div className="border-t border-white/[0.06]">
                    <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-[12px] text-white/35 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                        <p>© {new Date().getFullYear()} TheaterOrStream</p>
                        <p>Movie data and images from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
