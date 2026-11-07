import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FaFire, FaHeart, FaMoon, FaUsers, FaCompass, FaMagic, FaGem } from 'react-icons/fa';
import {
    getForYouRecommendations,
    getTonightRecommendations,
    getTrendingPersonalized,
    getFamilyRecommendations,
    getMoodRecommendations,
    getTasteDashboard,
    getDiscoverySection,
    getStreamingServices,
    getRegionProviders,
} from '../lib/recommendationApi';
import { DISCOVERY_MOODS } from '../constants/discoveryTaste';
import { REGIONS } from '../constants/regions';
import SpotlightHero from '../components/discover/SpotlightHero';
import MoodPills from '../components/discover/MoodPills';
import RecommendationRow from '../components/discover/RecommendationRow';
import TasteDashboardPanel from '../components/discover/TasteDashboardPanel';
import TonightPicker from '../components/discover/TonightPicker';
import FollowingFeed from '../components/discover/FollowingFeed';
import SignInGate from '../components/SignInGate';
import { useAuth } from '../context/AuthContext';
import {
    getWatchSessionCache,
    setWatchSessionCache,
    removeFromWatchSessionCache,
    sharedWatchRequest,
} from '../lib/watchSessionCache';
import { getUserRegionCode } from '../lib/userRegion';

const initialRow = { items: [], loading: true };
const readyRow = (items = [], meta = {}) => ({ items, loading: false, meta });

const WATCH_RAIL =
    'w-full max-w-[842px] sm:max-w-[1080px] lg:max-w-[1170px]';

const MOOD_IDS = new Set(DISCOVERY_MOODS.map((m) => m.id));

function parseMoodParam(raw) {
    return raw && MOOD_IDS.has(raw) ? raw : null;
}

/** '' (any), 'my' (the user's services) or a TMDB provider id. */
function parseOttParam(raw) {
    if (!raw) return '';
    if (raw === 'my') return 'my';
    return /^\d{1,6}$/.test(String(raw)) ? String(raw) : '';
}

/**
 * Watch — the personalized Netflix-style discovery tab.
 * Session-cached so switching tabs does not re-run the full analysis.
 * Full page reload fetches again (server cache + light seen-filter).
 *
 * @param {{ embedded?: boolean }} props embedded = rendered inside the Home tab
 *   bar (which already clears the fixed header), so we drop the top header spacer.
 */
export default function WatchPage({ embedded = false }) {
    const { user, isAuthenticated, loading: authLoading } = useAuth();
    const userId = user?.id;
    const [searchParams, setSearchParams] = useSearchParams();

    const cached = userId ? getWatchSessionCache(userId) : null;

    const [forYou, setForYou] = useState(() => cached?.forYou || initialRow);
    const [tonight, setTonight] = useState(() => cached?.tonight || initialRow);
    const [trending, setTrending] = useState(() => cached?.trending || initialRow);
    const [family, setFamily] = useState(() => cached?.family || initialRow);
    const [dashboard, setDashboard] = useState(() => cached?.dashboard ?? null);
    const [dashLoading, setDashLoading] = useState(() => !cached?.dashboard);
    const [railError, setRailError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    const [perfect, setPerfect] = useState(() => cached?.perfect || { movie: null, loading: true });
    const [becauseLoved, setBecauseLoved] = useState(() => cached?.becauseLoved || initialRow);
    const [hiddenGems, setHiddenGems] = useState(() => cached?.hiddenGems || initialRow);
    const [outsideComfort, setOutsideComfort] = useState(() => cached?.outsideComfort || initialRow);

    // Mood + OTT live in the URL so browser Back restores them after opening a poster.
    const activeMood = useMemo(
        () => parseMoodParam(searchParams.get('mood')),
        [searchParams],
    );
    const moodOtt = useMemo(
        () => parseOttParam(searchParams.get('ott')),
        [searchParams],
    );

    const [moodRow, setMoodRow] = useState(() => {
        const mood = parseMoodParam(
            typeof window !== 'undefined'
                ? new URLSearchParams(window.location.search).get('mood')
                : null,
        ) ?? cached?.activeMood ?? null;
        const ott = mood
            ? (parseOttParam(
                typeof window !== 'undefined'
                    ? new URLSearchParams(window.location.search).get('ott')
                    : null,
            ) || cached?.moodOtt || '')
            : '';
        const hit = cached?.moodRow;
        if (
            mood
            && hit?.mood === mood
            && (hit.ott ?? '') === ott
            && hit.loading === false
        ) {
            return hit;
        }
        return mood ? { items: [], loading: true, mood, ott } : null;
    });

    // The user's streaming services + the services available in their country.
    const [streaming, setStreaming] = useState(() => cached?.streaming ?? null);
    const [regionProviders, setRegionProviders] = useState(() => cached?.regionProviders ?? []);

    useEffect(() => {
        if (!isAuthenticated || !userId) return undefined;
        const hit = getWatchSessionCache(userId);
        if (hit?.streaming) {
            setStreaming(hit.streaming);
            setRegionProviders(hit.regionProviders || []);
            return undefined;
        }
        let alive = true;
        sharedWatchRequest(`${userId}:streaming`, async () => {
            const data = await getStreamingServices();
            const fallback = { region: getUserRegionCode(), services: [], hasServices: false };
            const setup = data ? { ...data, region: data.hasServices ? data.region : getUserRegionCode() } : fallback;
            const list = await getRegionProviders(setup.region);
            const result = { streaming: setup, regionProviders: (list || []).slice(0, 15) };
            if (data) setWatchSessionCache(userId, result);
            return result;
        }).then((result) => {
            if (!alive) return;
            setStreaming(result.streaming);
            setRegionProviders(result.regionProviders);
        });
        return () => { alive = false; };
    }, [isAuthenticated, userId]);

    useEffect(() => {
        if (!isAuthenticated || !userId) return undefined;

        // Load each row once per session:
        //  - a finished row comes from the session cache (no request at all);
        //  - a row still loading (StrictMode remount, tab switch mid-load, auth
        //    refresh) attaches to the request already in flight;
        //  - only missing rows hit the API. "Retry" (reloadKey) starts fresh.
        let alive = true;
        const hit = reloadKey === 0 ? getWatchSessionCache(userId) : null;
        if (reloadKey > 0) setRailError(null);

        const rowFrom = (r, withMeta = false) => readyRow(r?.data || [], withMeta ? (r?.meta || {}) : {});
        const rows = [
            { key: 'forYou', set: setForYou, core: true, fetch: () => getForYouRecommendations({ limit: 12 }), map: (r) => rowFrom(r, true) },
            { key: 'tonight', set: setTonight, core: true, fetch: () => getTonightRecommendations({ limit: 6 }), map: (r) => rowFrom(r, true) },
            { key: 'trending', set: setTrending, core: true, fetch: () => getTrendingPersonalized({ limit: 6 }), map: (r) => rowFrom(r) },
            { key: 'family', set: setFamily, fetch: () => getFamilyRecommendations({ limit: 6 }), map: (r) => rowFrom(r) },
            { key: 'becauseLoved', set: setBecauseLoved, fetch: () => getDiscoverySection('because-you-loved', { limit: 6 }), map: (r) => rowFrom(r, true) },
            { key: 'hiddenGems', set: setHiddenGems, fetch: () => getDiscoverySection('hidden-gems', { limit: 6 }), map: (r) => rowFrom(r) },
            { key: 'outsideComfort', set: setOutsideComfort, fetch: () => getDiscoverySection('outside-comfort-zone', { limit: 6 }), map: (r) => rowFrom(r) },
            {
                key: 'dashboard',
                set: (d) => { setDashboard(d); setDashLoading(false); },
                fetch: () => getTasteDashboard(),
                map: (d) => d,
                isError: (d) => !d,
                isReady: (v) => v != null,
                pending: undefined,
            },
        ];

        rows.forEach((row) => {
            const cachedRow = hit?.[row.key];
            const ready = row.isReady
                ? row.isReady(cachedRow)
                : (cachedRow && cachedRow.loading === false && !cachedRow.meta?.error);
            if (ready) {
                row.set(cachedRow);
                return;
            }
            if (row.pending !== undefined) row.set(row.pending);
            else if (row.key !== 'dashboard') row.set(initialRow);

            sharedWatchRequest(`${userId}:${row.key}:${reloadKey}`, row.fetch).then((r) => {
                const failed = row.isError ? row.isError(r) : !!r?.error;
                let value;
                if (!failed) value = row.map(r);
                else if (row.key === 'perfect') value = { movie: null, loading: false };
                else if (row.key !== 'dashboard') value = readyRow([], { error: r?.error || 'failed' });
                // Cache successes even if this mount is gone — the next mount reuses them.
                if (!failed) setWatchSessionCache(userId, { [row.key]: value });
                if (!alive) return;
                if (row.key === 'dashboard') {
                    setDashboard(failed ? null : value);
                    setDashLoading(false);
                } else {
                    row.set(value);
                }
                if (failed && row.core && r?.error) setRailError(r.error);
            });
        });

        return () => { alive = false; };
    }, [isAuthenticated, userId, reloadKey]);

    const handleDismiss = useCallback((movie) => {
        const id = movie?.tmdb_id ?? movie?.id;
        if (!id || !userId) return;
        removeFromWatchSessionCache(userId, id);
        const drop = (row) => ({
            ...row,
            items: (row.items || []).filter((m) => String(m.tmdb_id ?? m.id) !== String(id)),
        });
        setForYou(drop);
        setTonight(drop);
        setTrending(drop);
        setFamily(drop);
        setBecauseLoved(drop);
        setHiddenGems(drop);
        setOutsideComfort(drop);
        setMoodRow((prev) => (prev ? drop(prev) : prev));
        setPerfect((prev) => (
            prev?.movie && String(prev.movie.tmdb_id ?? prev.movie.id) === String(id)
                ? { movie: null, loading: false }
                : prev
        ));
    }, [userId]);

    const writeMoodParams = useCallback((moodId, ott) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (embedded) next.set('tab', 'watch');
            if (moodId) next.set('mood', moodId);
            else next.delete('mood');
            if (ott) next.set('ott', ott);
            else next.delete('ott');
            return next;
        }, { replace: true });
    }, [embedded, setSearchParams]);

    // Keep mood results in sync with URL filters (including browser Back).
    useEffect(() => {
        if (!isAuthenticated || !userId) return undefined;

        if (!activeMood) {
            setMoodRow(null);
            setWatchSessionCache(userId, { activeMood: null, moodOtt: moodOtt || '', moodRow: null });
            return undefined;
        }

        const hit = getWatchSessionCache(userId)?.moodRow;
        // Never reuse an empty mood cache — that locked users on "No titles on that OTT"
        // after a failed/partial fetch even when the API later returned picks.
        if (
            hit?.mood === activeMood
            && (hit.ott ?? '') === moodOtt
            && hit.loading === false
            && Array.isArray(hit.items)
            && hit.items.length > 0
        ) {
            setMoodRow(hit);
            return undefined;
        }

        let alive = true;
        setMoodRow({ items: [], loading: true, mood: activeMood, ott: moodOtt });

        // Server caches mood rows per mood + OTT, so no forced refresh here.
        const opts = { limit: 12 };
        if (moodOtt === 'my') {
            opts.ottMode = true;
        } else if (moodOtt) {
            // Region comes from the user's saved services on the server.
            opts.ottMode = false;
            opts.providerId = moodOtt;
        } else {
            opts.ottMode = false;
        }

        sharedWatchRequest(
            `${userId}:mood:${activeMood}:${moodOtt}`,
            () => getMoodRecommendations(activeMood, opts),
        ).then((r) => {
            const row = {
                items: r.data || [],
                loading: false,
                mood: activeMood,
                ott: moodOtt,
                error: r.error || null,
            };
            if (alive) setMoodRow(row);
            // Only persist successful non-empty rows so empties can retry next visit.
            if (row.items.length > 0) {
                setWatchSessionCache(userId, {
                    activeMood,
                    moodOtt,
                    moodRow: row,
                });
            } else if (alive) {
                setWatchSessionCache(userId, {
                    activeMood,
                    moodOtt,
                    moodRow: null,
                });
            }
        });

        return () => { alive = false; };
    }, [activeMood, moodOtt, isAuthenticated, userId]);

    const handleMood = useCallback((moodId) => {
        writeMoodParams(moodId || null, moodOtt);
    }, [writeMoodParams, moodOtt]);

    const handleMoodOtt = useCallback((value) => {
        writeMoodParams(activeMood, value || '');
    }, [writeMoodParams, activeMood]);

    if (authLoading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center px-6 py-16">
                <div className="h-8 w-8 animate-pulse rounded-full bg-white/15" aria-label="Loading" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <SignInGate
                title="AI recommendations need an account"
                description="Sign in to unlock Watch Tonight, For You picks, mood discovery, and your personal taste map. The Home feed stays free to browse."
            />
        );
    }

    // Hero carousel = top 6; the "For You" row shows the next 6 (no overlap).
    const heroPicks = (forYou.items.length ? forYou.items : trending.items).slice(0, 6);
    const forYouRest = forYou.items.length > 6 ? forYou.items.slice(6) : forYou.items;
    const activeMoodMeta = DISCOVERY_MOODS.find((m) => m.id === activeMood);
    const userServices = streaming?.services || [];
    const hasServices = !!streaming?.hasServices;
    const otherProviders = regionProviders.filter(
        (p) => !userServices.some((s) => String(s.id) === String(p.id)),
    );
    const providerName = (id) => (
        userServices.find((p) => String(p.id) === String(id))?.name
        || regionProviders.find((p) => String(p.id) === String(id))?.name
        || null
    );
    const moodOttLabel = moodOtt === 'my' ? 'your streaming services' : providerName(moodOtt);
    const regionName = REGIONS.find((r) => r.code === streaming?.region)?.name || null;

    const heroLoading = forYou.loading && trending.loading;
    const showHero = heroLoading || heroPicks.length > 0;

    const accuracyChip = dashboard?.accuracyScore != null
        ? `${dashboard.accuracyScore}% of your picks land`
        : null;
    const forYouSubtitle = forYou.meta?.llmRanked
        ? `✨ AI-tuned${accuracyChip ? ` · ${accuracyChip}` : ''}`
        : accuracyChip;
    const personalMessage = forYou.meta?.message;

    return (
        <div className={`min-h-screen bg-[var(--bg-primary)] overflow-x-hidden ${
            embedded
                ? 'pb-4 lg:pb-12'
                : 'pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] lg:pb-12'
        }`}>
            {showHero ? (
                <SpotlightHero movies={heroPicks} loading={heroLoading} onDismiss={handleDismiss} />
            ) : (
                !embedded && <div className="h-14 sm:h-20" />
            )}

            {/* Content stack — tight mobile rhythm, desktop rail offset */}
            <div className="lg:pl-16 xl:pl-24 2xl:pl-28">
            {personalMessage && (
                <div className={`px-4 sm:px-6 ${showHero ? 'mt-3 sm:mt-6' : embedded ? 'mt-2 sm:mt-4' : 'mt-2'}`}>
                    <div className={`${WATCH_RAIL} flex items-start gap-2 rounded-xl border border-[var(--primary)]/15 bg-[var(--primary)]/[0.07] px-3 py-2 sm:gap-2.5 sm:rounded-2xl sm:px-4 sm:py-3`}>
                        <FaMagic className="mt-0.5 shrink-0 text-[11px] text-[var(--primary)] sm:text-sm" />
                        <p className="text-[12px] leading-snug text-white/80 sm:text-[15px] sm:leading-relaxed">
                            {personalMessage}
                        </p>
                    </div>
                </div>
            )}

            {/* Tonight: 3 taps → 3 picks (replaces the single nightly pick). */}
            <div className={`${personalMessage ? 'mt-3 sm:mt-4' : showHero ? 'mt-3 sm:mt-6' : embedded ? 'mt-2 sm:mt-4' : 'mt-2'}`}>
                <TonightPicker />
            </div>

            <div className="mt-4 px-4 sm:mt-7 sm:px-6">
                <FollowingFeed />
            </div>

            {railError && (
                <div className="mx-4 mt-4 flex flex-col gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 sm:mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                    <p className="text-[13px] text-amber-100/90 sm:text-sm">
                        Recommendations couldn&apos;t load
                        {railError === 'not_signed_in'
                            ? ' — sign in again, then retry.'
                            : '. Check your connection and try again.'}
                    </p>
                    <button
                        type="button"
                        className="min-h-[40px] shrink-0 rounded-full border border-amber-400/40 bg-amber-500/20 px-4 text-sm font-medium text-amber-50 hover:bg-amber-500/30"
                        onClick={() => setReloadKey((k) => k + 1)}
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Mood — left-aligned like native section headers */}
            <div className="mb-4 mt-4 px-4 sm:mb-6 sm:mt-7 sm:px-6">
                <div className={WATCH_RAIL}>
                    <div className="mb-2 flex flex-col gap-2 sm:mb-2.5 sm:items-center sm:gap-2">
                        <div className="sm:text-center">
                            <h2 className="inline-flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-white sm:justify-center sm:gap-2 sm:text-xl">
                                <FaCompass className="text-[13px] text-[var(--primary)] sm:text-base" /> Browse by mood
                            </h2>
                            <p className="mt-0.5 text-[11px] text-white/40 sm:text-xs">What are you in the mood for?</p>
                        </div>
                        <div className="relative inline-flex self-start sm:self-center">
                            <select
                                aria-label="Filter mood picks by OTT"
                                value={moodOtt}
                                onChange={(e) => handleMoodOtt(e.target.value)}
                                className="appearance-none cursor-pointer rounded-lg border border-white/[0.1] bg-[#1a1a1a] py-1.5 pl-3 pr-8 text-xs text-white/85 hover:border-white/20 focus:border-white/30 focus:outline-none sm:text-sm"
                            >
                                <option value="">Any OTT</option>
                                {hasServices && <option value="my">My streaming services</option>}
                                {userServices.length > 0 && (
                                    <optgroup label="Your services">
                                        {userServices.map((p) => (
                                            <option key={`mine-${p.id}`} value={String(p.id)}>{p.name}</option>
                                        ))}
                                    </optgroup>
                                )}
                                {otherProviders.length > 0 && (
                                    <optgroup label={regionName ? `Popular in ${regionName}` : 'Popular services'}>
                                        {otherProviders.map((p) => (
                                            <option key={p.id} value={String(p.id)}>{p.name}</option>
                                        ))}
                                    </optgroup>
                                )}
                                {moodOtt && moodOtt !== 'my' && !providerName(moodOtt) && (
                                    <option value={moodOtt}>Selected service</option>
                                )}
                            </select>
                            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/40">▾</span>
                        </div>
                    </div>
                    <MoodPills activeMood={activeMood} onSelect={handleMood} />
                </div>
            </div>

            {streaming && !hasServices && (
                <div className="mx-4 mb-5 flex flex-col gap-3 rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/[0.06] px-3.5 py-3 sm:mx-6 sm:mb-7 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                    <div>
                        <p className="text-[13px] font-semibold text-white sm:text-sm">Which streaming services do you have?</p>
                        <p className="mt-0.5 text-[12px] text-white/55 sm:text-[13px]">
                            Add them and every pick shows what you can actually watch tonight.
                        </p>
                    </div>
                    <Link
                        to="/settings/taste#services"
                        className="btn-primary min-h-[40px] shrink-0 self-start text-sm sm:self-auto"
                    >
                        Add my services
                    </Link>
                </div>
            )}

            {!showHero && !forYou.loading && !forYouRest.length && !railError && (
                <div className="mx-4 mb-5 overflow-hidden rounded-xl border border-white/8 bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-card)] p-3.5 sm:mx-6 sm:mb-8 sm:rounded-2xl sm:p-6">
                    <h2 className="text-base font-bold text-white sm:text-2xl">
                        Let&apos;s find your <span className="text-gradient">next favorite</span>
                    </h2>
                    <p className="mt-1.5 max-w-xl text-[13px] text-white/55 sm:mt-2 sm:text-sm">
                        Pick a mood above, or rate a few films — recommendations get sharper with every tap.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 sm:mt-4 sm:gap-2.5">
                        <Link to="/" className="btn-primary min-h-[44px] text-sm">Browse what&apos;s on</Link>
                        <Link
                            to="/settings/taste"
                            className="inline-flex min-h-[44px] items-center rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white/80 transition-colors hover:border-white/35 hover:text-white"
                        >
                            Set your taste
                        </Link>
                    </div>
                </div>
            )}

            <div className="space-y-5 sm:space-y-9">
                {moodRow && (
                    <RecommendationRow
                        heading={`${activeMoodMeta?.emoji || ''} ${activeMoodMeta?.label || 'Mood'} picks`}
                        subtitle={moodOttLabel ? `On ${moodOttLabel}` : null}
                        accent={activeMoodMeta?.accent}
                        items={moodRow.items}
                        loading={moodRow.loading}
                        emptyHint={moodOtt
                            ? `No ${activeMoodMeta?.label || 'mood'} titles on that OTT — try another or Any OTT.`
                            : 'No strong matches yet — try rating a few more films.'}
                        onDismiss={handleDismiss}
                    />
                )}

                <RecommendationRow
                    heading="For You"
                    subtitle={forYouSubtitle}
                    icon={<FaHeart />}
                    accent="#ec4899"
                    items={forYouRest}
                    loading={forYou.loading}
                    emptyHint="Like or rate at least 3 movies to sharpen these picks."
                    onDismiss={handleDismiss}
                />

                <RecommendationRow
                    heading={hasServices ? 'Tonight on your streaming' : 'Tonight’s picks'}
                    subtitle={hasServices
                        ? (tonight.meta?.relaxedFilters?.includes('ott')
                            ? 'Few matches on your services — showing the best of the rest too'
                            : 'Under 2 hours, streaming on your services')
                        : 'Under 2 hours'}
                    icon={<FaMoon />}
                    accent="#8b5cf6"
                    items={tonight.items}
                    loading={tonight.loading}
                    emptyHint={hasServices
                        ? 'No matches on your services yet — rate more titles or check back later.'
                        : 'Rate a few titles to unlock tonight’s picks.'}
                    onDismiss={handleDismiss}
                />

                {(becauseLoved.loading || becauseLoved.items.length > 0) && (
                    <RecommendationRow
                        heading={becauseLoved.meta?.heading || 'Because you loved'}
                        icon={<FaHeart />}
                        accent="#f43f5e"
                        items={becauseLoved.items}
                        loading={becauseLoved.loading}
                        onDismiss={handleDismiss}
                    />
                )}

                <RecommendationRow
                    heading="Trending for your taste"
                    icon={<FaFire />}
                    accent="#f97316"
                    items={trending.items}
                    loading={trending.loading}
                    showReason={false}
                    onDismiss={handleDismiss}
                />

                <RecommendationRow
                    heading="Hidden Gems"
                    icon={<FaGem />}
                    accent="#06b6d4"
                    items={hiddenGems.items}
                    loading={hiddenGems.loading}
                    emptyHint={null}
                    onDismiss={handleDismiss}
                />

                <RecommendationRow
                    heading="Outside Your Comfort Zone"
                    icon={<FaCompass />}
                    accent="#a78bfa"
                    items={outsideComfort.items}
                    loading={outsideComfort.loading}
                    emptyHint={null}
                    onDismiss={handleDismiss}
                />

                <RecommendationRow
                    heading="Family-friendly"
                    icon={<FaUsers />}
                    accent="#22c55e"
                    items={family.items}
                    loading={family.loading}
                    showReason={false}
                    emptyHint={null}
                    onDismiss={handleDismiss}
                />

                {/* Phones: one tap to the full Taste Map instead of a long panel. */}
                <div className="px-4 lg:hidden">
                    <Link
                        to="/taste-map"
                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 active:bg-white/[0.06]"
                    >
                        <div className="min-w-0">
                            <p className="text-[15px] font-semibold text-white">Your Taste Map</p>
                            <p className="mt-0.5 line-clamp-1 text-[12px] text-white/50">
                                {(dashboard?.favoriteGenres || []).slice(0, 3).map((g) => g.name).join(' · ')
                                    || 'See what your ratings say about you'}
                            </p>
                        </div>
                        <span className="shrink-0 text-xl text-white/40" aria-hidden>›</span>
                    </Link>
                </div>
                <div className="hidden lg:block">
                    <TasteDashboardPanel dashboard={dashboard} loading={dashLoading} />
                </div>
            </div>
            </div>
        </div>
    );
}
