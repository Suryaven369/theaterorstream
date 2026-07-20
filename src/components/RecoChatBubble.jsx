import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaMagic, FaTimes, FaPaperPlane, FaStar } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { askRecoChat } from '../lib/recommendationApi';
import { generateSlugWithId } from '../lib/slugUtils';
import { resolveTmdbImageUrl } from '../utils/imageHelper';

const WELCOME =
    "Hey! I'm your watch buddy. What's your mood tonight — chill, pumped, emotional, or need a laugh?";

function PickCard({ movie }) {
    const reduxImageURL = useSelector((state) => state.movieData.imageURL);
    const tmdbId = movie.tmdb_id ?? movie.id;
    const mediaType = movie.media_type === 'tv' ? 'tv' : 'movie';
    const title = movie.title || movie.name || '';
    const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
    const slug = generateSlugWithId(title, tmdbId, year);
    const to = `${mediaType === 'tv' ? '/tv' : '/movies'}/${slug}`;
    const poster = resolveTmdbImageUrl(movie.poster_path, { baseUrl: reduxImageURL, size: 'w185' });
    const rating = Number(movie.vote_average || 0);
    const matchPct = typeof movie.score === 'number' ? Math.round(movie.score * 100) : null;

    return (
        <Link
            to={to}
            className="flex gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-2 transition hover:border-white/25 hover:bg-white/[0.06]"
        >
            <div className="h-[4.5rem] w-[3rem] shrink-0 overflow-hidden rounded-lg bg-black/40">
                {poster ? (
                    <img src={poster} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                    <div className="flex h-full items-center justify-center text-white/20 text-xs">🎬</div>
                )}
            </div>
            <div className="min-w-0 flex-1 py-0.5">
                <p className="text-[13px] font-semibold text-white leading-snug line-clamp-2">{title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/50">
                    {matchPct != null && (
                        <span className="font-semibold text-[var(--accent-green)]">{matchPct}% match</span>
                    )}
                    {rating > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-yellow-400/90">
                            <FaStar className="text-[8px]" /> {rating.toFixed(1)}
                        </span>
                    )}
                    {year && <span>{year}</span>}
                    {mediaType === 'tv' && <span className="rounded bg-white/10 px-1">Series</span>}
                </div>
                {movie.reason && (
                    <p className="mt-1 text-[11px] text-white/55 line-clamp-2 leading-relaxed">{movie.reason}</p>
                )}
            </div>
        </Link>
    );
}

/**
 * Floating AI watch buddy — chats about mood, then suggests titles like a friend.
 */
export default function RecoChatBubble() {
    const location = useLocation();
    const { isAuthenticated, loading: authLoading } = useAuth();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [messages, setMessages] = useState([]);
    const bottomRef = useRef(null);
    const startedRef = useRef(false);

    const hide =
        location.pathname.startsWith('/admin')
        || location.pathname.startsWith('/auth')
        || location.pathname === '/search';

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, busy, open]);

    // Seed a friendly opener once per open session (signed-in only).
    useEffect(() => {
        if (!open || !isAuthenticated || authLoading || startedRef.current) return;
        startedRef.current = true;
        setMessages([
            {
                id: 'welcome',
                role: 'assistant',
                reply: WELCOME,
                items: [],
                llmUsed: true,
            },
        ]);
    }, [open, isAuthenticated, authLoading]);

    // Reset welcome when closed so next open feels fresh.
    useEffect(() => {
        if (open) return;
        startedRef.current = false;
    }, [open]);

    if (hide) return null;

    const historyForApi = (list) => list
        .map((m) => ({
            role: m.role,
            text: m.role === 'user' ? m.text : m.reply,
        }))
        .filter((m) => m.text);

    const runAsk = async (message) => {
        const text = String(message || '').trim();
        if (!text || busy) return;

        if (authLoading) {
            setMessages((prev) => [
                ...prev,
                {
                    id: `w-${Date.now()}`,
                    role: 'assistant',
                    reply: 'Still loading your session — try again in a second.',
                    items: [],
                },
            ]);
            return;
        }

        if (!isAuthenticated) {
            setMessages((prev) => [
                ...prev,
                {
                    id: `g-${Date.now()}`,
                    role: 'assistant',
                    reply: 'Sign in so I can chat using your taste and suggest picks for you.',
                    items: [],
                    needsAuth: true,
                },
            ]);
            return;
        }

        const userMsg = { id: `u-${Date.now()}`, role: 'user', text };
        const nextMessages = [...messages, userMsg];
        setMessages(nextMessages);
        setBusy(true);
        setDraft('');

        try {
            const res = await askRecoChat({
                message: text,
                history: historyForApi(nextMessages.slice(0, -1)),
                limit: 3,
            });

            if (!res.ok) {
                const needsAuth = res.error === 'not_signed_in';
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `a-${Date.now()}`,
                        role: 'assistant',
                        reply: needsAuth
                            ? 'Your session expired — sign in again and we can keep chatting.'
                            : (res.error || 'Something went wrong — try again in a moment.'),
                        items: [],
                        needsAuth,
                    },
                ]);
                return;
            }

            setMessages((prev) => [
                ...prev,
                {
                    id: `a-${Date.now()}`,
                    role: 'assistant',
                    reply: res.reply || (res.mode === 'ask'
                        ? 'Tell me a bit more about your mood?'
                        : 'Here are a few picks for you.'),
                    items: res.items || [],
                    llmUsed: !!res.meta?.llmUsed || res.mode === 'ask',
                    mode: res.mode || res.meta?.mode,
                },
            ]);
        } finally {
            setBusy(false);
        }
    };

    const onSubmit = (e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text) return;
        runAsk(text);
    };

    const startFresh = () => {
        startedRef.current = true;
        setMessages(
            isAuthenticated
                ? [{
                    id: 'welcome',
                    role: 'assistant',
                    reply: WELCOME,
                    items: [],
                    llmUsed: true,
                }]
                : [],
        );
    };

    return (
        <div className="fixed z-[45] right-3 sm:right-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 pointer-events-none">
            {open && (
                <div
                    className="pointer-events-auto mb-3 flex h-[min(70vh,32rem)] w-[min(100vw-1.5rem,22rem)] flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#121212]/97 shadow-2xl backdrop-blur-xl"
                    role="dialog"
                    aria-label="Watch buddy chat"
                >
                    <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3.5 py-3 shrink-0">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                                <FaMagic className="text-[var(--primary)] text-xs" />
                                Watch buddy
                            </p>
                            <p className="text-[11px] text-white/45 truncate">
                                Chat about your mood · then get picks
                            </p>
                        </div>
                        <div className="flex items-center gap-0.5">
                            {messages.length > 1 && (
                                <button
                                    type="button"
                                    onClick={startFresh}
                                    className="rounded-lg px-2 py-1.5 text-[11px] text-white/45 hover:bg-white/10 hover:text-white"
                                >
                                    New chat
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"
                                aria-label="Close"
                            >
                                <FaTimes />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 space-y-3">
                        {messages.length === 0 && !isAuthenticated && !authLoading && (
                            <div className="space-y-3 px-0.5">
                                <p className="text-[13px] text-white/80 leading-relaxed">
                                    Sign in so I can chat about your mood and suggest titles from your taste.
                                </p>
                                <Link
                                    to="/auth"
                                    state={{ from: location.pathname + location.search }}
                                    className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-[13px] font-semibold text-black hover:brightness-110"
                                >
                                    Sign in to chat
                                </Link>
                            </div>
                        )}

                        {authLoading && messages.length === 0 && (
                            <p className="text-[12px] text-white/45 px-0.5">Loading your session…</p>
                        )}

                        {messages.map((m) => (
                            <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'space-y-2'}>
                                {m.role === 'user' ? (
                                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--primary)]/20 border border-[var(--primary)]/30 px-3 py-2 text-[13px] text-white">
                                        {m.text}
                                    </div>
                                ) : (
                                    <>
                                        <div className="max-w-[95%] rounded-2xl rounded-bl-md bg-white/[0.06] border border-white/10 px-3 py-2.5 text-[13px] text-white/90 leading-relaxed">
                                            <p className="whitespace-pre-wrap">{m.reply}</p>
                                            {m.llmUsed && (
                                                <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-[var(--primary)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary)]">
                                                    <FaMagic className="text-[8px]" /> AI
                                                </span>
                                            )}
                                            {m.needsAuth && (
                                                <Link
                                                    to="/auth"
                                                    state={{ from: location.pathname + location.search }}
                                                    className="mt-2 block text-[12px] font-medium text-[var(--primary)] hover:underline"
                                                >
                                                    Sign in →
                                                </Link>
                                            )}
                                        </div>
                                        {!!m.items?.length && (
                                            <div className="space-y-1.5">
                                                <p className="text-[10px] uppercase tracking-wide text-white/35 px-0.5">
                                                    For you
                                                </p>
                                                {m.items.map((movie, i) => (
                                                    <PickCard key={`${movie.tmdb_id ?? movie.id}-${i}`} movie={movie} />
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}

                        {busy && (
                            <div className="flex items-center gap-2 text-[12px] text-white/45 px-1">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
                                Thinking…
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    <form
                        onSubmit={onSubmit}
                        className="shrink-0 border-t border-white/10 p-2.5 flex items-end gap-2"
                    >
                        <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value.slice(0, 400))}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    onSubmit(e);
                                }
                            }}
                            rows={2}
                            placeholder={
                                isAuthenticated
                                    ? 'Tell me how you feel… or what you’re craving'
                                    : 'Sign in to chat…'
                            }
                            className="min-h-[44px] max-h-24 flex-1 resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[13px] text-white placeholder:text-white/35 focus:border-white/25 focus:outline-none"
                            disabled={busy || authLoading}
                        />
                        <button
                            type="submit"
                            disabled={busy || authLoading || !draft.trim()}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-black disabled:opacity-40 transition hover:brightness-110"
                            aria-label="Send"
                        >
                            <FaPaperPlane className="text-sm" />
                        </button>
                    </form>
                </div>
            )}

            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border shadow-lg transition active:scale-95 ${
                    open
                        ? 'border-white/20 bg-[#1a1a1a] text-white'
                        : 'border-[var(--primary)]/40 bg-[var(--primary)] text-black hover:brightness-110'
                }`}
                aria-label={open ? 'Close watch buddy' : 'Open watch buddy'}
                aria-expanded={open}
            >
                {open ? <FaTimes className="text-lg" /> : <FaMagic className="text-lg" />}
            </button>
        </div>
    );
}
