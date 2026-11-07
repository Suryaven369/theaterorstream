import React, { useEffect, useMemo, useState } from 'react';
import { FaCheck } from 'react-icons/fa';
import { REGIONS } from '../constants/regions';
import {
    getStreamingServices,
    saveStreamingServices,
    getRegionProviders,
} from '../lib/recommendationApi';
import { clearWatchSessionCache } from '../lib/watchSessionCache';
import { getUserRegionCode } from '../lib/userRegion';

const TMDB_LOGO = 'https://image.tmdb.org/t/p/w92';
const INITIAL_VISIBLE = 18;

/**
 * Pick the streaming services you pay for, in your country. Recommendations
 * filter and rank by what is actually streaming on them.
 */
export default function StreamingServicesPicker({ onSaved }) {
    const [loading, setLoading] = useState(true);
    const [region, setRegion] = useState(getUserRegionCode);
    const [catalog, setCatalog] = useState([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [selected, setSelected] = useState(() => new Map()); // id → { id, name, logo }
    const [showAll, setShowAll] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null); // 'saved' | error string
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        let alive = true;
        getStreamingServices().then((data) => {
            if (!alive) return;
            // Saved services keep their country; otherwise use the detected one.
            if (data?.hasServices && data?.region) setRegion(data.region);
            const map = new Map();
            (data?.services || []).forEach((s) => map.set(Number(s.id), s));
            setSelected(map);
            setLoading(false);
        });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        let alive = true;
        setCatalogLoading(true);
        getRegionProviders(region).then((list) => {
            if (!alive) return;
            setCatalog(list || []);
            setCatalogLoading(false);
        });
        return () => { alive = false; };
    }, [region]);

    // Selected services stay visible even when they sit outside the top list.
    const visible = useMemo(() => {
        if (showAll) return catalog;
        const top = catalog.slice(0, INITIAL_VISIBLE);
        const extra = catalog.slice(INITIAL_VISIBLE).filter((p) => selected.has(Number(p.id)));
        return [...top, ...extra];
    }, [catalog, showAll, selected]);

    const toggle = (provider) => {
        setStatus(null);
        setDirty(true);
        setSelected((prev) => {
            const next = new Map(prev);
            const id = Number(provider.id);
            if (next.has(id)) next.delete(id);
            else next.set(id, { id, name: provider.name, logo: provider.logo });
            return next;
        });
    };

    const changeRegion = (code) => {
        if (code === region) return;
        setRegion(code);
        setSelected(new Map()); // services differ by country
        setShowAll(false);
        setDirty(true);
        setStatus(null);
    };

    const save = async () => {
        setSaving(true);
        setStatus(null);
        const res = await saveStreamingServices({ region, providers: [...selected.values()] });
        setSaving(false);
        if (res?.ok) {
            setStatus('saved');
            setDirty(false);
            clearWatchSessionCache();
            onSaved?.(res.data);
        } else {
            setStatus(res?.error || 'Could not save. Please try again.');
        }
    };

    return (
        <section id="services" className="mb-8 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:mb-10 sm:p-5">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-[15px] font-semibold text-white sm:text-base">Your streaming services</h2>
                    <p className="mt-0.5 text-[12px] text-white/50 sm:text-[13px]">
                        Picks are filtered to what is streaming on these, in your country.
                    </p>
                </div>
                <label className="relative inline-flex shrink-0 items-center gap-2 text-[12px] text-white/50">
                    Country
                    <select
                        value={region}
                        onChange={(e) => changeRegion(e.target.value)}
                        disabled={loading}
                        className="appearance-none rounded-lg border border-white/12 bg-[#1a1a1a] py-1.5 pl-2.5 pr-7 text-[13px] text-white focus:border-white/30 focus:outline-none"
                    >
                        {REGIONS.map((r) => (
                            <option key={r.code} value={r.code}>{r.flag} {r.name}</option>
                        ))}
                    </select>
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/40">▾</span>
                </label>
            </div>

            {loading || catalogLoading ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="h-[72px] animate-pulse rounded-xl skeleton" />
                    ))}
                </div>
            ) : catalog.length === 0 ? (
                <p className="text-sm text-white/45">Couldn&apos;t load services for this country. Try again later.</p>
            ) : (
                <>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {visible.map((p) => {
                            const active = selected.has(Number(p.id));
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => toggle(p)}
                                    aria-pressed={active}
                                    title={p.name}
                                    className={`relative flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2 text-center transition-all ${
                                        active
                                            ? 'border-[var(--primary)] bg-[var(--primary)]/12'
                                            : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                                    }`}
                                >
                                    {p.logo ? (
                                        <img src={`${TMDB_LOGO}${p.logo}`} alt="" className="h-8 w-8 rounded-lg object-cover" loading="lazy" />
                                    ) : (
                                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs text-white/60">{p.name?.[0]}</span>
                                    )}
                                    <span className={`line-clamp-1 text-[10px] leading-tight sm:text-[11px] ${active ? 'text-white' : 'text-white/60'}`}>
                                        {p.name}
                                    </span>
                                    {active && (
                                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)] text-[8px] text-[#14181c]">
                                            <FaCheck />
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    {catalog.length > INITIAL_VISIBLE && (
                        <button
                            type="button"
                            onClick={() => setShowAll((v) => !v)}
                            className="mt-2 min-h-[36px] text-[13px] font-medium text-[var(--primary)] hover:underline"
                        >
                            {showAll ? 'Show fewer' : `Show all ${catalog.length} services`}
                        </button>
                    )}
                </>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={save}
                    disabled={saving || loading || !dirty}
                    className="btn-primary min-h-[44px] disabled:opacity-50"
                >
                    {saving ? 'Saving…' : selected.size ? `Save ${selected.size} service${selected.size === 1 ? '' : 's'}` : 'Save'}
                </button>
                {status === 'saved' && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-[var(--accent-green)]">
                        <FaCheck /> Saved — your picks will update
                    </span>
                )}
                {status && status !== 'saved' && <span className="text-sm text-red-400">{status}</span>}
            </div>
        </section>
    );
}
