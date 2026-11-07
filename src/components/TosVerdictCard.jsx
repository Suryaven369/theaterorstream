import React, { useEffect, useState } from 'react';
import { getTosVerdict } from '../lib/recommendationApi';

const STYLE = {
    Theater: { icon: '🎬', ring: 'border-[var(--primary)]/40', pill: 'bg-[var(--primary)] text-[#14181c]' },
    'Wait for OTT': { icon: '📺', ring: 'border-sky-400/30', pill: 'bg-sky-400/90 text-[#0b1720]' },
    Skip: { icon: '⏭️', ring: 'border-white/15', pill: 'bg-white/15 text-white' },
};

function Meter({ label, value, display }) {
    return (
        <div className="min-w-0">
            <div className="flex items-baseline justify-between text-[11px] text-white/50">
                <span>{label}</span>
                <span className="font-semibold text-white/80">{display}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
            </div>
        </div>
    );
}

/** Theater / Wait for OTT / Skip — quality, big-screen factor, personal fit, confidence. */
export default function TosVerdictCard({ tmdbId, mediaType = 'movie' }) {
    const [v, setV] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        setV(null);
        setFailed(false);
        if (!tmdbId) return undefined;
        getTosVerdict(tmdbId, mediaType).then((data) => {
            if (!alive) return;
            if (data) setV(data); else setFailed(true);
        });
        return () => { alive = false; };
    }, [tmdbId, mediaType]);

    if (failed) return null;
    if (!v) return <div className="mb-5 h-[132px] animate-pulse rounded-2xl skeleton" aria-hidden />;

    const s = STYLE[v.verdict] || STYLE.Skip;
    return (
        <section className={`mb-5 rounded-2xl border ${s.ring} bg-white/[0.03] p-4`} aria-label="TOS verdict">
            <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold ${s.pill}`}>
                    <span aria-hidden>{s.icon}</span> {v.verdict}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${v.confidence === 'early reviews' ? 'bg-amber-400/15 text-amber-200' : 'bg-white/8 text-white/50'}`}>
                    {v.confidence === 'early reviews' ? 'Early reviews' : `${v.confidence} confidence`}
                </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-white/75">{v.reason}</p>
            <div className={`mt-3 grid gap-3 ${v.personalFit != null ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <Meter label="Quality" value={v.qualityScore / 10} display={`${v.qualityScore.toFixed(1)}`} />
                <Meter label="Big screen" value={v.bigScreenScore} display={`${Math.round(v.bigScreenScore * 100)}%`} />
                {v.personalFit != null && <Meter label="For you" value={v.personalFit} display={`${Math.round(v.personalFit * 100)}%`} />}
            </div>
        </section>
    );
}
