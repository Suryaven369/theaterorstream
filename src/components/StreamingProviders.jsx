import React, { useEffect, useState } from 'react';
import { getWatchProvidersFromEdge } from '../lib/contentEdgeApi';

const TMDB_LOGO_BASE = 'https://image.tmdb.org/t/p/w92';

function ProviderRow({ label, items, link }) {
    if (!items?.length) return null;
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">{label}</span>
            {items.map((p) => {
                const logo = p.logo_path ? `${TMDB_LOGO_BASE}${p.logo_path}` : null;
                const chip = (
                    <span
                        key={p.provider_id}
                        title={p.name}
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-white/80"
                    >
                        {logo && <img src={logo} alt={p.name} className="h-5 w-5 rounded" loading="lazy" />}
                        {p.name}
                    </span>
                );
                return link
                    ? <a key={p.provider_id} href={link} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-80">{chip}</a>
                    : chip;
            })}
        </div>
    );
}

/**
 * "Where to watch" — OTT availability from TMDB, by region.
 * Hides itself entirely when nothing is available.
 */
export default function StreamingProviders({ tmdbId, mediaType = 'movie', region = 'IN' }) {
    const [providers, setProviders] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tmdbId) return undefined;
        let alive = true;
        setLoading(true);
        getWatchProvidersFromEdge(tmdbId, mediaType, region)
            .then((res) => { if (alive) { setProviders(res?.data || null); setLoading(false); } })
            .catch(() => { if (alive) { setProviders(null); setLoading(false); } });
        return () => { alive = false; };
    }, [tmdbId, mediaType, region]);

    if (loading) {
        return <div className="h-10 w-48 animate-pulse rounded-lg skeleton" />;
    }

    const hasAny = providers && (providers.flatrate?.length || providers.rent?.length || providers.buy?.length);
    if (!hasAny) {
        return (
            <p className="text-sm text-white/40">
                Not currently listed on streaming{providers?.region ? ` in ${providers.region}` : ''}.
            </p>
        );
    }

    return (
        <div className="space-y-2.5">
            <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">Where to watch</h3>
                {providers.region && (
                    <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-white/45">{providers.region}</span>
                )}
            </div>
            <ProviderRow label="Stream" items={providers.flatrate} link={providers.link} />
            <ProviderRow label="Rent" items={providers.rent} link={providers.link} />
            <ProviderRow label="Buy" items={providers.buy} link={providers.link} />
            <p className="text-[10px] text-white/30">Availability via JustWatch / TMDB</p>
        </div>
    );
}
