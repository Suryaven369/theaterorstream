import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
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

    const cached = userId ? getWatchSessionCache(userId) : null;

    const [forYou, setForYou] = useState(() => cached?.forYou || initialRow);
    const [tonight, setTonight] = useState(() => cached?.tonight || initialRow);
    const [trending, setTrending] = useState(() => cached?.trending || initialRow);
    const [family, setFamily] = useState(() => cached?.family || initialRow);
    const [dashboard, setDashboard] = useState(() => cached?.dashboard ?? null);
    const [dashLoading, setDashLoading] = useState(() => !cached?.dashboard);

    const [perfect, setPerfect] = useState(() => cached?.perfect || { movie: null, loading: true });
    const [becauseLoved, setBecauseLoved] = useState(() => cached?.becauseLoved || initialRow);
    const [hiddenGems, setHiddenGems] = useState(() => cached?.hiddenGems || initialRow);
    const [outsideComfort, setOutsideComfort] = useState(() => cached?.outsideComfort || initialRow);

    const [activeMood, setActiveMood] = useState(null);
    const [moodRow, setMoodRow] = useState(null);

    useEffect(() => {
        if (!isAuthenticated || !userId) return undefined;

        // Tab switch: reuse session cache — no re-analysis.
        // Require core rows to be ready so a mid-fetch tab-away doesn't freeze empties.
        const hit = getWatchSessionCache(userId);
        const cacheReady = hit?.forYou && !hit.forYou.loading
            && hit?.tonight && !hit.tonight.loading
            && hit?.trending && !hit.trending.loading;
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

        getForYouRecommendations({ limit: 12 }).then((r) => {
            if (!alive) return;
            payload.forYou = readyRow(r.data || [], r.meta || {});
            setForYou(payload.forYou);
            save();
        });
        getTonightRecommendations({ limit: 6 }).then((r) => {
            if (!alive) return;
            payload.tonight = readyRow(r.data || []);
            setTonight(payload.tonight);
            save();
        });
        getTrendingPersonalized({ limit: 6 }).then((r) => {
            if (!alive) return;
            payload.trending = readyRow(r.data || []);
            setTrending(payload.trending);
            save();
        });
        getFamilyRecommendations({ limit: 6 }).then((r) => {
            if (!alive) return;
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
    }, [isAuthenticated, userId]);

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
        setPerfect((prev) => (
            prev?.movie && String(prev.movie.tmdb_id ?? prev.movie.id) === String(id)
                ? { movie: null, loading: false }
                : prev
        ));
    }, [userId]);

    if (!authLoading && !isAuthenticated) {
        return (
            <SignInGate
                title="AI recommendations need an account"
                description="Sign in to unlock Watch Tonight, For You picks, mood discovery, and your personal taste map. The Home feed stays free to browse."
            />
        );
    }

    const handleMood = useCallback((moodId) => {
        setActiveMood(moodId);
        if (!moodId) { setMoodRow(null); return; }
        setMoodRow({ items: [], loading: true, mood: moodId });
        getMoodRecommendations(moodId, { limit: 6 }).then((r) => {
            setMoodRow({ items: r.data || [], loading: false, mood: moodId });
        });
    }, []);

    // Hero carousel = top 6; the "For You" row shows the next 6 (no overlap).
    const heroPicks = (forYou.items.length ? forYou.items : trending.items).slice(0, 6);
    const forYouRest = forYou.items.length > 6 ? forYou.items.slice(6) : forYou.items;
    const activeMoodMeta = DISCOVERY_MOODS.find((m) => m.id === activeMood);

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
        <div className="min-h-screen bg-[var(--bg-primary)] pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-12 overflow-x-hidden">
            {showHero ? (
                <SpotlightHero movies={heroPicks} loading={heroLoading} onDismiss={handleDismiss} />
            ) : (
                // No hero yet (cold start): clear the fixed header on the route view.
                !embedded && <div className="h-16 sm:h-20" />
            )}

            {/* Mobile: even gutters. Desktop: slight left nudge under the rail. */}
            <div className="lg:pl-16 xl:pl-24 2xl:pl-28">
            {/* Personalized AI greeting about tonight's picks */}
            {personalMessage && (
                <div className={`px-3 sm:px-6 ${showHero ? 'mt-4 sm:mt-6' : embedded ? 'mt-3 sm:mt-4' : 'mt-2'}`}>
                    <div className="flex items-start gap-2 rounded-xl border border-[var(--primary)]/20 bg-gradient-to-r from-[var(--primary)]/10 to-transparent px-3 py-2.5 sm:gap-2.5 sm:rounded-2xl sm:px-4 sm:py-3">
                        <FaMagic className="mt-0.5 shrink-0 text-sm text-[var(--primary)]" />
                        <p className="text-[13px] leading-relaxed text-white/85 sm:text-[15px]">
                            {personalMessage}
                        </p>
                    </div>
                </div>
            )}

            {/* One Perfect Movie Tonight — the single daily pick */}
            {(perfect.loading || perfect.movie) && (
                <div className={`${personalMessage ? 'mt-3 sm:mt-4' : showHero ? 'mt-4 sm:mt-6' : embedded ? 'mt-3 sm:mt-4' : 'mt-2'}`}>
                    <OnePerfectTonight movie={perfect.movie} loading={perfect.loading} />
                </div>
            )}

            {/* New from your follows — directors / genres / franchises */}
            <div className="mt-5 px-3 sm:mt-7 sm:px-6">
                <FollowingFeed />
            </div>

            {/* Mood discovery */}
            <div className="mb-5 mt-5 sm:mb-6 sm:mt-7">
                <div className="mb-2 px-3 sm:px-6">
                    <h2 className="flex items-center gap-2 text-base font-bold text-white sm:text-xl">
                        <FaCompass className="text-[var(--primary)]" /> Browse by mood
                    </h2>
                    <p className="text-[11px] text-white/45 sm:text-xs">What are you in the mood for tonight?</p>
                </div>
                <MoodPills activeMood={activeMood} onSelect={handleMood} />
            </div>

            {/* Cold-start welcome: no hero + no personalized picks yet */}
            {!showHero && !forYou.loading && !forYouRest.length && (
                <div className="mx-3 mb-6 overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-card)] p-4 sm:mx-6 sm:mb-8 sm:p-6">
                    <h2 className="text-lg font-bold text-white sm:text-2xl">
                        Let's find your <span className="text-gradient">next favorite</span>
                    </h2>
                    <p className="mt-2 max-w-xl text-sm text-white/60">
                        Pick a mood above, or just start browsing, rating, and watchlisting.
                        Your taste map builds itself — recommendations get sharper with every tap.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2.5">
                        <Link to="/" className="btn-primary min-h-[44px] text-sm">Browse what's on</Link>
                        <Link
                            to="/settings/taste"
                            className="inline-flex min-h-[44px] items-center rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white/80 transition-colors hover:border-white/35 hover:text-white"
                        >
                            Set your taste
                        </Link>
                    </div>
                </div>
            )}

            <div className="space-y-6 sm:space-y-9">
                {/* Mood result row (when a mood is selected) */}
                {moodRow && (
                    <RecommendationRow
                        heading={`${activeMoodMeta?.emoji || ''} ${activeMoodMeta?.label || 'Mood'} picks`}
                        accent={activeMoodMeta?.accent}
                        items={moodRow.items}
                        loading={moodRow.loading}
                        emptyHint="No strong matches for this mood yet — try rating a few more films."
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
                    emptyHint="No matches on your linked streaming services yet — rate more titles or check back later."
                    onDismiss={handleDismiss}
                />

                {/* Because you loved X */}
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
                    heading="Hidden Gems You Missed"
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
                    heading="Family-friendly picks"
                    icon={<FaUsers />}
                    accent="#22c55e"
                    items={family.items}
                    loading={family.loading}
                    showReason={false}
                    emptyHint={null}
                    onDismiss={handleDismiss}
                />

                {/* Taste dashboard */}
                <TasteDashboardPanel dashboard={dashboard} loading={dashLoading} />
            </div>
            </div>
        </div>
    );
}
