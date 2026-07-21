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
    getOnePerfectMovie,
    getDiscoverySection,
} from '../lib/recommendationApi';
import { DISCOVERY_MOODS } from '../constants/discoveryTaste';
import { OTT_PROVIDERS } from '../constants/searchCategories';
import SpotlightHero from '../components/discover/SpotlightHero';
import MoodPills from '../components/discover/MoodPills';
import RecommendationRow from '../components/discover/RecommendationRow';
import TasteDashboardPanel from '../components/discover/TasteDashboardPanel';
import OnePerfectTonight from '../components/discover/OnePerfectTonight';
import FollowingFeed from '../components/discover/FollowingFeed';
import SignInGate from '../components/SignInGate';
import { useAuth } from '../context/AuthContext';
import {
    getWatchSessionCache,
    setWatchSessionCache,
    removeFromWatchSessionCache,
} from '../lib/watchSessionCache';

const initialRow = { items: [], loading: true };
const readyRow = (items = [], meta = {}) => ({ items, loading: false, meta });

const WATCH_RAIL =
    'w-full max-w-[842px] sm:max-w-[1080px] lg:max-w-[1170px]';

const MOOD_IDS = new Set(DISCOVERY_MOODS.map((m) => m.id));
const OTT_IDS = new Set(OTT_PROVIDERS.map((p) => String(p.id)));

function parseMoodParam(raw) {
    return raw && MOOD_IDS.has(raw) ? raw : null;
}

function parseOttParam(raw) {
    if (!raw) return '';
    if (raw === 'my') return 'my';
    return OTT_IDS.has(String(raw)) ? String(raw) : '';
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

    useEffect(() => {
        if (!isAuthenticated || !userId) return undefined;

        // Tab switch: reuse session cache — no re-analysis.
        // Require core rows to be ready so a mid-fetch tab-away doesn't freeze empties.
        // Skip cache when forcing a reload after an API failure.
        const hit = reloadKey === 0 ? getWatchSessionCache(userId) : null;
        const cacheReady = hit?.forYou && !hit.forYou.loading
            && hit?.tonight && !hit.tonight.loading
            && hit?.trending && !hit.trending.loading
            && (hit.forYou.items?.length > 0 || hit.tonight.items?.length > 0 || hit.trending.items?.length > 0);
        if (cacheReady) {
            setForYou(hit.forYou);
            setTonight(hit.tonight);
            setTrending(hit.trending);
            setFamily(hit.family?.loading === false ? hit.family : readyRow());
            setBecauseLoved(hit.becauseLoved?.loading === false ? hit.becauseLoved : readyRow());
            setHiddenGems(hit.hiddenGems?.loading === false ? hit.hiddenGems : readyRow());
            setOutsideComfort(hit.outsideComfort?.loading === false ? hit.outsideComfort : readyRow());
            setPerfect(hit.perfect?.loading === false
                ? hit.perfect
                : { movie: null, loading: false });
            if (hit.dashboard) {
                setDashboard(hit.dashboard);
                setDashLoading(false);
            }
            return undefined;
        }

        let alive = true;
        const payload = {};
        setRailError(null);
        setForYou(initialRow);
        setTonight(initialRow);
        setTrending(initialRow);

        const save = () => {
            if (!alive) return;
            setWatchSessionCache(userId, {
                forYou: payload.forYou,
                tonight: payload.tonight,
                trending: payload.trending,
                family: payload.family,
                becauseLoved: payload.becauseLoved,
                hiddenGems: payload.hiddenGems,
                outsideComfort: payload.outsideComfort,
                perfect: payload.perfect,
                dashboard: payload.dashboard,
            });
        };

        const noteError = (err) => {
            if (!alive || !err) return;
            setRailError(err);
        };

        getForYouRecommendations({ limit: 12 }).then((r) => {
            if (!alive) return;
            if (r.error) {
                noteError(r.error);
                setForYou(readyRow([], { error: r.error }));
                return;
            }
            payload.forYou = readyRow(r.data || [], r.meta || {});
            setForYou(payload.forYou);
            save();
        });
        getTonightRecommendations({ limit: 6 }).then((r) => {
            if (!alive) return;
            if (r.error) {
                noteError(r.error);
                setTonight(readyRow([], { error: r.error }));
                return;
            }
            payload.tonight = readyRow(r.data || []);
            setTonight(payload.tonight);
            save();
        });
        getTrendingPersonalized({ limit: 6 }).then((r) => {
            if (!alive) return;
            if (r.error) {
                noteError(r.error);
                setTrending(readyRow([], { error: r.error }));
                return;
            }
            payload.trending = readyRow(r.data || []);
            setTrending(payload.trending);
            save();
        });
        getFamilyRecommendations({ limit: 6 }).then((r) => {
            if (!alive) return;
            if (r.error) return;
            payload.family = readyRow(r.data || []);
            setFamily(payload.family);
            save();
        });
        getTasteDashboard().then((d) => {
            if (!alive) return;
            payload.dashboard = d;
            setDashboard(d);
            setDashLoading(false);
            save();
        });
        getOnePerfectMovie().then((r) => {
            if (!alive) return;
            payload.perfect = { movie: r?.movie || null, loading: false };
            setPerfect(payload.perfect);
            save();
        });
        getDiscoverySection('because-you-loved', { limit: 6 }).then((r) => {
            if (!alive) return;
            payload.becauseLoved = readyRow(r.data || [], r.meta || {});
            setBecauseLoved(payload.becauseLoved);
            save();
        });
        getDiscoverySection('hidden-gems', { limit: 6 }).then((r) => {
            if (!alive) return;
            payload.hiddenGems = readyRow(r.data || []);
            setHiddenGems(payload.hiddenGems);
            save();
        });
        getDiscoverySection('outside-comfort-zone', { limit: 6 }).then((r) => {
            if (!alive) return;
            payload.outsideComfort = readyRow(r.data || []);
            setOutsideComfort(payload.outsideComfort);
            save();
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

        const opts = { limit: 12, refresh: true };
        if (moodOtt === 'my') {
            opts.ottMode = true;
        } else if (moodOtt) {
            opts.ottMode = false;
            opts.providerId = moodOtt;
            opts.watchRegion = 'IN';
        } else {
            opts.ottMode = false;
        }

        getMoodRecommendations(activeMood, opts).then((r) => {
            if (!alive) return;
            const row = {
                items: r.data || [],
                loading: false,
                mood: activeMood,
                ott: moodOtt,
                error: r.error || null,
            };
            setMoodRow(row);
            // Only persist successful non-empty rows so empties can retry next visit.
            if (row.items.length > 0) {
                setWatchSessionCache(userId, {
                    activeMood,
                    moodOtt,
                    moodRow: row,
                });
            } else {
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
    const moodOttLabel = moodOtt === 'my'
        ? 'on your streaming'
        : (OTT_PROVIDERS.find((p) => String(p.id) === String(moodOtt))?.name || null);

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
        <div className="min-h-screen bg-[var(--bg-primary)] pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] lg:pb-12 overflow-x-hidden">
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

            {(perfect.loading || perfect.movie) && (
                <div className={`${personalMessage ? 'mt-3 sm:mt-4' : showHero ? 'mt-3 sm:mt-6' : embedded ? 'mt-2 sm:mt-4' : 'mt-2'}`}>
                    <OnePerfectTonight movie={perfect.movie} loading={perfect.loading} />
                </div>
            )}

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
                                <option value="my">My streaming services</option>
                                {OTT_PROVIDERS.map((p) => (
                                    <option key={p.id} value={String(p.id)}>{p.name}</option>
                                ))}
                            </select>
                            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/40">▾</span>
                        </div>
                    </div>
                    <MoodPills activeMood={activeMood} onSelect={handleMood} />
                </div>
            </div>

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
                    heading="Tonight on your streaming"
                    icon={<FaMoon />}
                    accent="#8b5cf6"
                    items={tonight.items}
                    loading={tonight.loading}
                    emptyHint="No matches on your linked services yet — rate more titles or check back later."
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

                <TasteDashboardPanel dashboard={dashboard} loading={dashLoading} />
            </div>
            </div>
        </div>
    );
}
