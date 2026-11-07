import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaCheck, FaSearch, FaTimes } from 'react-icons/fa';
import { STARTER_MOVIES } from '../../constants/starterMovies';
import { REGIONS } from '../../constants/regions';
import { searchQuizMovies, getRegionProviders } from '../../lib/recommendationApi';

const POSTER = 'https://image.tmdb.org/t/p/w185';
const LOGO = 'https://image.tmdb.org/t/p/w92';

export function StepHeader({ index, total, question, hint }) {
    return (
        <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-green)]">
                Question {index + 1} of {total}
            </p>
            <h2 className="mt-1.5 text-xl font-bold leading-snug text-white sm:text-2xl">{question}</h2>
            {hint && <p className="mt-1.5 text-[13px] leading-relaxed text-white/50 sm:text-sm">{hint}</p>}
        </div>
    );
}

function PosterTile({ movie, selected, onToggle, tone = 'love' }) {
    const ring = tone === 'love' ? 'ring-[var(--primary)]' : 'ring-red-400';
    return (
        <button
            type="button"
            onClick={() => onToggle(movie)}
            aria-pressed={selected}
            aria-label={`${movie.title}${movie.year ? ` (${movie.year})` : ''}`}
            className="group relative block w-full text-left"
        >
            <div className={`relative aspect-[2/3] overflow-hidden rounded-lg bg-white/5 ring-2 transition ${selected ? ring : 'ring-transparent'}`}>
                {movie.poster
                    ? <img src={`${POSTER}${movie.poster}`} alt="" loading="lazy" className={`h-full w-full object-cover transition ${selected ? 'opacity-60' : ''}`} />
                    : <div className="flex h-full items-center justify-center p-1 text-center text-[10px] text-white/50">{movie.title}</div>}
                {selected && (
                    <span className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[11px] text-[#14181c] ${tone === 'love' ? 'bg-[var(--primary)]' : 'bg-red-400'}`}>
                        {tone === 'love' ? <FaCheck /> : <FaTimes />}
                    </span>
                )}
            </div>
            <p className="mt-1 line-clamp-1 text-[11px] text-white/70">{movie.title}</p>
            {movie.year && <p className="text-[10px] text-white/35">{movie.year}</p>}
        </button>
    );
}

/**
 * Pick films: debounced TMDB search + a starter grid. `selected` is a Map id → movie.
 */
export function MoviePickerStep({ selected, onToggle, exclude = [], tone = 'love', requiredHint }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const abortRef = useRef(null);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) {
            setResults([]);
            setSearching(false);
            return undefined;
        }
        setSearching(true);
        const timer = setTimeout(() => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            searchQuizMovies(q, { signal: controller.signal }).then((list) => {
                if (controller.signal.aborted) return;
                setResults(list);
                setSearching(false);
            });
        }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    const excluded = useMemo(() => new Set(exclude.map(Number)), [exclude]);
    const visible = (query.trim().length >= 2 ? results : STARTER_MOVIES).filter((m) => !excluded.has(Number(m.id)));
    const chosen = [...selected.values()];

    return (
        <div>
            <div className="relative">
                <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-white/35" />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search any movie…"
                    className="h-12 w-full rounded-xl border border-white/12 bg-white/[0.04] pl-10 pr-3 text-white placeholder:text-white/35 focus:border-[var(--primary)] focus:outline-none"
                />
            </div>

            {chosen.length > 0 && (
                <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-hide">
                    {chosen.map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => onToggle(m)}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] ${tone === 'love' ? 'border-[var(--primary)]/50 bg-[var(--primary)]/10 text-[var(--primary)]' : 'border-red-400/50 bg-red-400/10 text-red-300'}`}
                        >
                            <span className="max-w-[140px] truncate">{m.title}</span>
                            <FaTimes className="text-[9px] opacity-70" />
                        </button>
                    ))}
                </div>
            )}
            {requiredHint && <p className="mt-2 text-[12px] text-white/45">{requiredHint}</p>}

            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-white/35">
                {query.trim().length >= 2 ? (searching ? 'Searching…' : `Results for “${query.trim()}”`) : 'Popular picks'}
            </p>
            {!searching && query.trim().length >= 2 && !visible.length && (
                <p className="py-6 text-center text-sm text-white/40">No movies found — try another title.</p>
            )}
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                {visible.map((m) => (
                    <PosterTile key={m.id} movie={m} selected={selected.has(Number(m.id))} onToggle={onToggle} tone={tone} />
                ))}
            </div>
        </div>
    );
}

/** Region + streaming services (TMDB provider ids for that country). */
export function PlatformStep({ region, onRegion, selectedIds, onToggle }) {
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);
    useEffect(() => {
        let alive = true;
        setLoading(true);
        getRegionProviders(region).then((list) => {
            if (!alive) return;
            setCatalog(list || []);
            setLoading(false);
        });
        return () => { alive = false; };
    }, [region]);
    const visible = showAll ? catalog : catalog.slice(0, 15);

    return (
        <div>
            <label className="mb-3 flex items-center gap-2 text-[13px] text-white/55">
                Country
                <select
                    value={region}
                    onChange={(e) => onRegion(e.target.value)}
                    className="h-10 flex-1 rounded-lg border border-white/12 bg-[#1a1a1a] px-2 text-[15px] text-white focus:border-white/30 focus:outline-none sm:flex-none"
                >
                    {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.flag} {r.name}</option>)}
                </select>
            </label>
            {loading ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {Array.from({ length: 9 }).map((_, i) => <div key={i} className="h-[72px] animate-pulse rounded-xl skeleton" />)}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {visible.map((p) => {
                            const active = selectedIds.includes(p.id);
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => onToggle(p.id)}
                                    aria-pressed={active}
                                    className={`relative flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2 ${active ? 'border-[var(--primary)] bg-[var(--primary)]/12' : 'border-white/10 bg-white/[0.03]'}`}
                                >
                                    {p.logo && <img src={`${LOGO}${p.logo}`} alt="" className="h-8 w-8 rounded-lg object-cover" loading="lazy" />}
                                    <span className={`line-clamp-1 text-[10px] ${active ? 'text-white' : 'text-white/60'}`}>{p.name}</span>
                                    {active && (
                                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)] text-[8px] text-[#14181c]"><FaCheck /></span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    {catalog.length > 15 && (
                        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 min-h-[36px] text-[13px] font-medium text-[var(--primary)]">
                            {showAll ? 'Show fewer' : `Show all ${catalog.length}`}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

/** Single choice with a hint under each option. */
export function ChoiceStep({ options, value, onChange }) {
    return (
        <div className="grid gap-2">
            {options.map((o) => {
                const active = value === o.id;
                return (
                    <button
                        key={String(o.id)}
                        type="button"
                        onClick={() => onChange(o.id)}
                        aria-pressed={active}
                        className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${active ? 'border-[var(--primary)] bg-[var(--primary)]/12' : 'border-white/12 bg-white/[0.03]'}`}
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-white">{o.label}</span>
                            {o.hint && <span className="mt-0.5 block text-[12px] text-white/45">{o.hint}</span>}
                        </span>
                        {active && <FaCheck className="shrink-0 text-[11px] text-[var(--primary)]" />}
                    </button>
                );
            })}
        </div>
    );
}

/** Multi-select chips. */
export function ChipsStep({ options, values, onToggle }) {
    return (
        <div className="flex flex-wrap gap-2">
            {options.map((o) => {
                const active = values.includes(o.id);
                return (
                    <button
                        key={o.id}
                        type="button"
                        onClick={() => onToggle(o.id)}
                        aria-pressed={active}
                        className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-medium ${active ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]' : 'border-white/12 bg-white/[0.03] text-white/75'}`}
                    >
                        {o.label}
                        {active && <FaCheck className="text-[10px]" />}
                    </button>
                );
            })}
        </div>
    );
}
