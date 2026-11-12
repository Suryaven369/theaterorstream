import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaMoon, FaRedo, FaEye, FaHeart, FaMeh, FaBan } from 'react-icons/fa';
import { ensureWatchedMovie, toggleLikedMovie } from '../../lib/supabase';
import { trackEvent, EVENT_TYPES } from '../../lib/eventTracking';
import { useAuth } from '../../context/AuthContext';
import { TONIGHT_MOODS, TONIGHT_TIMES, TONIGHT_COMPANY } from '../../constants/tonight';
import { getTonightPicks } from '../../lib/recommendationApi';
import { generateSlugWithId } from '../../lib/slugUtils';

const POSTER = 'https://image.tmdb.org/t/p/w342';
const LOGO = 'https://image.tmdb.org/t/p/w92';

function Option({ active, onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`flex min-h-[52px] items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-[14px] font-medium transition-colors ${active ? 'border-[var(--primary)] bg-[var(--primary)]/12 text-white' : 'border-white/12 bg-white/[0.03] text-white/80 active:bg-white/[0.07]'}`}
        >
            {children}
        </button>
    );
}

const FEEDBACK = [
    { id: 'watched', label: 'Watched', Icon: FaEye },
    { id: 'loved', label: 'Loved', Icon: FaHeart },
    { id: 'meh', label: 'Meh', Icon: FaMeh },
    { id: 'not_interested', label: 'Not for me', Icon: FaBan },
];

/** Record feedback: Loved → loved set; Meh / Not interested → disliked set. */
async function sendFeedback(action, pick, userId) {
    const payload = { tmdbId: pick.tmdbId, mediaType: 'movie', metadata: { surface: 'tonight', why: pick.why } };
    const watched = () => ensureWatchedMovie(userId, pick.tmdbId, pick.title, pick.poster, 'movie');
    if (action === 'watched') { await watched(); trackEvent(EVENT_TYPES.MOVIE_WATCHED, payload); }
    if (action === 'loved') { await toggleLikedMovie(userId, pick.tmdbId, pick.title, pick.poster, 'movie'); trackEvent(EVENT_TYPES.MOVIE_LIKED, payload); }
    if (action === 'meh') { await watched(); trackEvent(EVENT_TYPES.MOVIE_MEH, payload); }
    if (action === 'not_interested') trackEvent(EVENT_TYPES.NOT_INTERESTED, payload);
}

function PickCard({ pick, index, feedback, onFeedback }) {
    const slug = generateSlugWithId(pick.title, pick.tmdbId, pick.year);
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
        <Link to={`/movies/${slug}`} className="flex gap-3 p-3 active:bg-white/[0.06]">
            <div className="w-[84px] shrink-0 overflow-hidden rounded-lg bg-white/5">
                {pick.poster && <img src={`${POSTER}${pick.poster}`} alt="" className="aspect-[2/3] w-full object-cover" loading="lazy" />}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--primary)]">Pick {index + 1}</p>
                <h3 className="mt-0.5 line-clamp-2 text-[16px] font-bold leading-snug text-white">{pick.title}</h3>
                <p className="mt-0.5 text-[12px] text-white/45">
                    {[pick.year, pick.runtimeLabel].filter(Boolean).join(' · ')}
                </p>
                <p className="mt-1.5 line-clamp-3 text-[13px] leading-snug text-white/75">{pick.why}</p>
                {pick.whereToWatch?.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5">
                        {pick.whereToWatch.slice(0, 3).map((p) => (
                            p.logo
                                ? <img key={p.id} src={`${LOGO}${p.logo}`} alt={p.name} title={p.name} className="h-6 w-6 rounded-md object-cover" />
                                : <span key={p.id} className="text-[11px] text-white/50">{p.name}</span>
                        ))}
                        <span className="text-[11px] text-white/45">{pick.onYourServices ? 'on your services' : 'streaming'}</span>
                    </div>
                )}
            </div>
        </Link>
        <div className="grid grid-cols-4 border-t border-white/10">
            {FEEDBACK.map(({ id, label, Icon }) => {
                const active = feedback === id;
                return (
                    <button
                        key={id}
                        type="button"
                        disabled={!!feedback && !active}
                        onClick={() => onFeedback(id)}
                        aria-pressed={active}
                        className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] disabled:opacity-30 ${active ? 'text-[var(--primary)]' : 'text-white/55 active:text-white'}`}
                    >
                        <Icon className="text-[13px]" />
                        {label}
                    </button>
                );
            })}
        </div>
        </div>
    );
}

/**
 * Tonight: 3 taps (mood → time → company) → exactly 3 picks.
 */
export default function TonightPicker() {
    const { user } = useAuth();
    const [feedback, setFeedback] = useState({}); // tmdbId → action
    const feedbackRef = useRef({});
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);
    const [mood, setMood] = useState(null);
    const [minutes, setMinutes] = useState(null);
    const [company, setCompany] = useState(null);
    const [result, setResult] = useState(null); // { picks, meta } | { error }
    const [loading, setLoading] = useState(false);

    /** Picks shown but never acted on count as a weak negative ("skipped"). */
    const flushSkipped = () => {
        (result?.picks || []).forEach((p) => {
            if (!feedbackRef.current[p.tmdbId]) {
                trackEvent(EVENT_TYPES.RECOMMENDATION_IGNORED, { tmdbId: p.tmdbId, mediaType: 'movie', metadata: { surface: 'tonight' } });
            }
        });
    };

    const reset = () => {
        flushSkipped();
        feedbackRef.current = {};
        setFeedback({});
        setStep(0); setMood(null); setMinutes(null); setCompany(null); setResult(null);
    };

    const handleFeedback = (pick, action) => {
        if (!user?.id || feedbackRef.current[pick.tmdbId]) return;
        feedbackRef.current = { ...feedbackRef.current, [pick.tmdbId]: action };
        setFeedback(feedbackRef.current);
        sendFeedback(action, pick, user.id).catch(() => {});
        // Show the tap briefly, then swap in the next saved backup pick.
        setTimeout(() => {
            setResult((prev) => {
                if (!prev?.picks) return prev;
                const used = new Set([
                    ...prev.picks.map((p) => p.tmdbId),
                    ...Object.keys(feedbackRef.current).map(Number),
                ]);
                const reserve = [...(prev.reserve || [])];
                let next = reserve.shift();
                while (next && used.has(next.tmdbId)) next = reserve.shift();
                if (!next) return prev; // no backups left: keep the card with its feedback
                return {
                    ...prev,
                    reserve,
                    picks: prev.picks.map((p) => (p.tmdbId === pick.tmdbId ? next : p)),
                };
            });
        }, 900);
    };

    const run = async (c) => {
        setCompany(c);
        setStep(3);
        setLoading(true);
        const res = await getTonightPicks({ mood, minutes, company: c });
        setLoading(false);
        setResult(res?.ok ? res : { error: res?.error || 'Couldn’t get picks right now.' });
    };

    if (!open) {
        return (
            <div className="px-4 sm:px-6">
                <button
                    type="button"
                    onClick={() => { reset(); setOpen(true); }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-[var(--primary)]/25 bg-gradient-to-r from-[var(--primary)]/[0.12] to-transparent px-4 py-4 text-left active:opacity-80 sm:max-w-xl"
                >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[#14181c]"><FaMoon /></span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold text-white">What should I watch tonight?</span>
                        <span className="block text-[12px] text-white/55">3 quick taps → 3 picks, not a list</span>
                    </span>
                    <span className="text-xl text-white/40" aria-hidden>›</span>
                </button>
            </div>
        );
    }

    const questions = [
        { title: 'What’s the mood?', options: Object.entries(TONIGHT_MOODS).map(([id, m]) => ({ id, label: `${m.emoji} ${m.label}` })), value: mood, set: (v) => { setMood(v); setStep(1); } },
        { title: 'How much time do you have?', options: TONIGHT_TIMES.map((t) => ({ id: t.id, label: t.label })), value: minutes, set: (v) => { setMinutes(v); setStep(2); } },
        { title: 'Who’s watching?', options: Object.entries(TONIGHT_COMPANY).map(([id, c]) => ({ id, label: `${c.emoji} ${c.label}` })), value: company, set: run },
    ];

    return (
        <section className="px-4 sm:px-6">
            <div className="rounded-2xl border border-white/10 bg-[var(--bg-elevated,#16181b)] p-4 sm:max-w-xl">
                <div className="mb-3 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => {
                            if (step === 0 || step === 3) { flushSkipped(); feedbackRef.current = {}; setFeedback({}); setResult(null); setOpen(false); } else setStep((s) => s - 1);
                        }}
                        className="inline-flex min-h-[36px] items-center gap-1.5 text-[13px] text-white/55"
                    >
                        <FaArrowLeft className="text-[11px]" /> {step === 0 || step === 3 ? 'Close' : 'Back'}
                    </button>
                    {step < 3 && <span className="text-[12px] text-white/40">{step + 1} of 3</span>}
                    {step === 3 && !loading && (
                        <button type="button" onClick={reset} className="inline-flex min-h-[36px] items-center gap-1.5 text-[13px] font-medium text-[var(--primary)]">
                            <FaRedo className="text-[11px]" /> Start over
                        </button>
                    )}
                </div>

                {step < 3 && (
                    <>
                        <h3 className="mb-3 text-lg font-bold text-white">{questions[step].title}</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {questions[step].options.map((o) => (
                                <Option key={o.id} active={questions[step].value === o.id} onClick={() => questions[step].set(o.id)}>
                                    {o.label}
                                </Option>
                            ))}
                        </div>
                    </>
                )}

                {step === 3 && (
                    <div>
                        <h3 className="mb-3 text-lg font-bold text-white">Your 3 for tonight</h3>
                        {loading && (
                            <div className="space-y-3">
                                {[0, 1, 2].map((i) => <div key={i} className="h-[138px] animate-pulse rounded-2xl skeleton" />)}
                            </div>
                        )}
                        {!loading && result?.error && <p className="text-sm text-red-400">{result.error}</p>}
                        {!loading && result?.picks && (
                            result.picks.length
                                ? <div className="space-y-3">{result.picks.map((p, i) => <PickCard key={p.tmdbId} pick={p} index={i} feedback={feedback[p.tmdbId]} onFeedback={(a) => handleFeedback(p, a)} />)}</div>
                                : <p className="text-sm text-white/55">Nothing fits that combination on your services — try more time or another mood.</p>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
