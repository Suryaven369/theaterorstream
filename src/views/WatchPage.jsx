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

const initialRow = { items: [], loading: true };

/**
 * Watch — the personalized Netflix-style discovery tab.
 * Helps users find something they'll love in ~30s: a spotlight pick, mood
 * browsing, explainable rows, and a live taste map. All recommendation rows
 * come from the hybrid engine with per-item reasons + match scores.
 *
 * @param {{ embedded?: boolean }} props embedded = rendered inside the Home tab
 *   bar (which already clears the fixed header), so we drop the top header spacer.
 */
export default function WatchPage({ embedded = false }) {
    const { isAuthenticated, loading: authLoading } = useAuth();
    const [forYou, setForYou] = useState(initialRow);
    const [tonight, setTonight] = useState(initialRow);
    const [trending, setTrending] = useState(initialRow);
    const [family, setFamily] = useState(initialRow);
    const [dashboard, setDashboard] = useState(null);
    const [dashLoading, setDashLoading] = useState(true);

    const [perfect, setPerfect] = useState({ movie: null, loading: true });
    const [becauseLoved, setBecauseLoved] = useState(initialRow);
    const [hiddenGems, setHiddenGems] = useState(initialRow);
    const [outsideComfort, setOutsideComfort] = useState(initialRow);

    const [activeMood, setActiveMood] = useState(null);
    const [moodRow, setMoodRow] = useState(null);

    useEffect(() => {
        if (!isAuthenticated) return undefined;

        let alive = true;

        // Fetch 12 For You so the hero shows the top 6 and the row the next 6.
        getForYouRecommendations({ limit: 12 }).then((r) => alive && setForYou({ items: r.data || [], loading: false, meta: r.meta || {} }));
        getTonightRecommendations({ limit: 6 }).then((r) => alive && setTonight({ items: r.data || [], loading: false }));
        getTrendingPersonalized({ limit: 6 }).then((r) => alive && setTrending({ items: r.data || [], loading: false }));
        getFamilyRecommendations({ limit: 6 }).then((r) => alive && setFamily({ items: r.data || [], loading: false }));
        getTasteDashboard().then((d) => { if (alive) { setDashboard(d); setDashLoading(false); } });

        getOnePerfectMovie().then((r) => alive && setPerfect({ movie: r?.movie || null, loading: false }));
        getDiscoverySection('because-you-loved', { limit: 6 }).then((r) => alive && setBecauseLoved({ items: r.data || [], loading: false, meta: r.meta || {} }));
        getDiscoverySection('hidden-gems', { limit: 6 }).then((r) => alive && setHiddenGems({ items: r.data || [], loading: false }));
        getDiscoverySection('outside-comfort-zone', { limit: 6 }).then((r) => alive && setOutsideComfort({ items: r.data || [], loading: false }));

        return () => { alive = false; };
    }, [isAuthenticated]);

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
        <div className="min-h-screen bg-[var(--bg-primary)] pb-24 lg:pb-12 lg:pl-20 xl:pl-28 2xl:pl-0">
            {showHero ? (
                <SpotlightHero movies={heroPicks} loading={heroLoading} />
            ) : (
                // No hero yet (cold start): clear the fixed header on the route view.
                !embedded && <div className="h-16 sm:h-20" />
            )}

            {/* Personalized AI greeting about tonight's picks */}
            {personalMessage && (
                <div className={`px-4 sm:px-6 ${showHero ? 'mt-6' : embedded ? 'mt-4' : 'mt-2'}`}>
                    <div className="flex items-start gap-2.5 rounded-2xl border border-[var(--primary)]/20 bg-gradient-to-r from-[var(--primary)]/10 to-transparent px-4 py-3">
                        <FaMagic className="mt-0.5 shrink-0 text-[var(--primary)]" />
                        <p className="text-sm leading-relaxed text-white/85 sm:text-[15px]">
                            {personalMessage}
                        </p>
                    </div>
                </div>
            )}

            {/* One Perfect Movie Tonight — the single daily pick */}
            {(perfect.loading || perfect.movie) && (
                <div className={`${personalMessage ? 'mt-4' : showHero ? 'mt-6' : embedded ? 'mt-4' : 'mt-2'}`}>
                    <OnePerfectTonight movie={perfect.movie} loading={perfect.loading} />
                </div>
            )}

            {/* New from your follows — directors / genres / franchises */}
            <div className="mt-7 px-4 sm:px-6">
                <FollowingFeed />
            </div>

            {/* Mood discovery */}
            <div className="mb-6 mt-7">
                <div className="mb-2 px-4 sm:px-6">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-white sm:text-xl">
                        <FaCompass className="text-[var(--primary)]" /> Browse by mood
                    </h2>
                    <p className="text-xs text-white/45">What are you in the mood for tonight?</p>
                </div>
                <MoodPills activeMood={activeMood} onSelect={handleMood} />
            </div>

            {/* Cold-start welcome: no hero + no personalized picks yet */}
            {!showHero && !forYou.loading && !forYouRest.length && (
                <div className="mx-4 mb-8 overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-card)] p-6 sm:mx-6">
                    <h2 className="text-xl font-bold text-white sm:text-2xl">
                        Let's find your <span className="text-gradient">next favorite</span>
                    </h2>
                    <p className="mt-2 max-w-xl text-sm text-white/60">
                        Pick a mood above, or just start browsing, rating, and watchlisting.
                        Your taste map builds itself — recommendations get sharper with every tap.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2.5">
                        <Link to="/" className="btn-primary text-sm">Browse what's on</Link>
                        <Link
                            to="/settings/taste"
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white/80 transition-colors hover:border-white/35 hover:text-white"
                        >
                            Set your taste
                        </Link>
                    </div>
                </div>
            )}

            <div className="space-y-9">
                {/* Mood result row (when a mood is selected) */}
                {moodRow && (
                    <RecommendationRow
                        heading={`${activeMoodMeta?.emoji || ''} ${activeMoodMeta?.label || 'Mood'} picks`}
                        accent={activeMoodMeta?.accent}
                        items={moodRow.items}
                        loading={moodRow.loading}
                        emptyHint="No strong matches for this mood yet — try rating a few more films."
                    />
                )}

                <RecommendationRow
                    heading="For You"
                    subtitle={forYouSubtitle}
                    icon={<FaHeart />}
                    accent="#ec4899"
                    items={forYouRest}
                    loading={forYou.loading}
                    emptyHint="Rate or watchlist a few movies and your personalized picks will appear here."
                />

                <RecommendationRow
                    heading="Tonight on your streaming"
                    icon={<FaMoon />}
                    accent="#8b5cf6"
                    items={tonight.items}
                    loading={tonight.loading}
                    emptyHint="No matches on your linked streaming services yet — rate more titles or check back later."
                />

                {/* Because you loved X */}
                {(becauseLoved.loading || becauseLoved.items.length > 0) && (
                    <RecommendationRow
                        heading={becauseLoved.meta?.heading || 'Because you loved'}
                        icon={<FaHeart />}
                        accent="#f43f5e"
                        items={becauseLoved.items}
                        loading={becauseLoved.loading}
                    />
                )}

                <RecommendationRow
                    heading="Trending for your taste"
                    icon={<FaFire />}
                    accent="#f97316"
                    items={trending.items}
                    loading={trending.loading}
                    showReason={false}
                />

                <RecommendationRow
                    heading="Hidden Gems You Missed"
                    icon={<FaGem />}
                    accent="#06b6d4"
                    items={hiddenGems.items}
                    loading={hiddenGems.loading}
                    emptyHint={null}
                />

                <RecommendationRow
                    heading="Outside Your Comfort Zone"
                    icon={<FaCompass />}
                    accent="#a78bfa"
                    items={outsideComfort.items}
                    loading={outsideComfort.loading}
                    emptyHint={null}
                />

                <RecommendationRow
                    heading="Family-friendly picks"
                    icon={<FaUsers />}
                    accent="#22c55e"
                    items={family.items}
                    loading={family.loading}
                    showReason={false}
                    emptyHint={null}
                />

                {/* Taste dashboard */}
                <TasteDashboardPanel dashboard={dashboard} loading={dashLoading} />
            </div>
        </div>
    );
}
