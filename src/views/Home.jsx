import React, { useState, useEffect, lazy, Suspense } from "react";
import { useSelector, useDispatch } from "react-redux";
import { FaFilm, FaHome, FaMagic } from "react-icons/fa";
import { useSearchParams } from "react-router-dom";
import { getSavedRegion, persistRegion } from "../constants/regions";
import { REGION_CHANGE_EVENT } from "../lib/userRegion";
import { getAllUserRatings, getHomepageSections } from "../lib/supabase";
import { computeOverallFromRatingRow } from "../lib/ratingUtils";
import { setHomepageSections, setUserRatedMovies, invalidateHomepageSections } from "../store/movieSlice";
import { useAuth } from "../context/AuthContext";

const WatchPage = lazy(() => import("./WatchPage"));
const HomeBrowseTab = lazy(() => import("../components/home/HomeBrowseTab"));
const HomeFeed = lazy(() => import("../components/home/HomeFeed"));

const VALID_TABS = ['watch', 'explore', 'feed'];

/** Watch is the landing tab. Legacy ?tab=my-feed → explore, ?tab=home → feed. */
function normalizeHomeTab(tab) {
  if (tab === 'my-feed') return 'explore';
  if (tab === 'home') return 'feed';
  return VALID_TABS.includes(tab) ? tab : 'watch';
}

const SECTIONS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const SECTIONS_REV_KEY = 'homepage_sections_rev';

const TABS = [
  { id: 'watch', label: 'Watch', Icon: FaMagic },
  { id: 'explore', label: 'Explore', Icon: FaFilm },
  { id: 'feed', label: 'Feed', Icon: FaHome },
];

const TabFallback = () => (
  <div className="min-h-[40vh] flex items-center justify-center">
    <div className="animate-spin w-8 h-8 border-2 border-[var(--accent-green)] border-t-transparent rounded-full" />
  </div>
);

const Home = () => {
  const dispatch = useDispatch();
  const { user } = useAuth();
  const cachedSections = useSelector((state) => state.movieData.homepageSections);
  const cachedTimestamp = useSelector((state) => state.movieData.homepageSectionsTimestamp);

  // Main tab state — synced to the URL (?tab=) so browser back returns to the
  // tab the user was on (e.g. opening a movie from Watch and hitting Back).
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = normalizeHomeTab(searchParams.get('tab'));

  const setActiveTab = (tab) => {
    const nextTab = normalizeHomeTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextTab === 'watch') next.delete('tab');
      else next.set('tab', nextTab);
      // Mood/OTT filters belong to Watch only — drop them when leaving the tab.
      if (nextTab !== 'watch') {
        next.delete('mood');
        next.delete('ott');
      }
      return next;
    }, { replace: true });
  };

  const [selectedRegion, setSelectedRegion] = useState(getSavedRegion);

  // Follow auto-detection (first visit) — a manual pick is kept by getSavedRegion.

  useEffect(() => {

    const onRegion = () => setSelectedRegion(getSavedRegion());

    window.addEventListener(REGION_CHANGE_EVENT, onRegion);

    return () => window.removeEventListener(REGION_CHANGE_EVENT, onRegion);

  }, []);
  const [cmsSections, setCmsSections] = useState(cachedSections || []);
  const [loadingSections, setLoadingSections] = useState(!cachedSections);

  // Keep local sections in sync when Redux cache is patched
  useEffect(() => {
    if (cachedSections) setCmsSections(cachedSections);
  }, [cachedSections]);

  // Load ratings when Explore/Watch need them
  useEffect(() => {
    if (activeTab !== 'explore' && activeTab !== 'watch') return undefined;

    const loadUserRatings = async () => {
      if (!user?.id) {
        dispatch(setUserRatedMovies({}));
        return;
      }
      const ratings = await getAllUserRatings(user.id);
      const ratedMap = {};
      ratings.forEach((rating) => {
        const score = computeOverallFromRatingRow(rating);
        if (score != null) ratedMap[String(rating.movie_id)] = { score };
      });
      dispatch(setUserRatedMovies(ratedMap));
    };

    loadUserRatings();
    return undefined;
  }, [user?.id, dispatch, activeTab]);

  // Explore sections from Supabase (skip edge CDN so admin publishes show immediately)
  useEffect(() => {
    if (activeTab !== 'explore') return undefined;
    const now = Date.now();
    const isCacheValid = cachedSections && cachedTimestamp && (now - cachedTimestamp < SECTIONS_CACHE_TTL);
    if (isCacheValid) {
      setCmsSections(cachedSections);
      setLoadingSections(false);
      return undefined;
    }

    let cancelled = false;
    const fetchCmsSections = async () => {
      // Keep showing cached posters while refreshing — don't blank to skeletons
      if (!cachedSections?.length) setLoadingSections(true);
      try {
        const sections = await getHomepageSections(true);
        if (cancelled) return;
        setCmsSections(sections || []);
        dispatch(setHomepageSections(sections || []));
      } catch (err) {
        console.error('Failed to load homepage sections', err);
        if (!cancelled) setCmsSections(cachedSections || []);
      } finally {
        if (!cancelled) setLoadingSections(false);
      }
    };
    fetchCmsSections();
    return () => { cancelled = true; };
  }, [cachedSections, cachedTimestamp, dispatch, activeTab]);

  // After admin Save/Fetch in another tab, refresh when this window is focused
  useEffect(() => {
    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const rev = localStorage.getItem(SECTIONS_REV_KEY);
        if (rev && rev !== window.__tosSectionsRev) {
          window.__tosSectionsRev = rev;
          dispatch(invalidateHomepageSections());
        }
      } catch { /* ignore */ }
    };
    refreshIfStale();
    window.addEventListener('focus', refreshIfStale);
    document.addEventListener('visibilitychange', refreshIfStale);
    window.addEventListener('storage', refreshIfStale);
    return () => {
      window.removeEventListener('focus', refreshIfStale);
      document.removeEventListener('visibilitychange', refreshIfStale);
      window.removeEventListener('storage', refreshIfStale);
    };
  }, [dispatch]);

  const handleRegionSelect = (region) => {
    setSelectedRegion(region);
    persistRegion(region);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Clears fixed site header; tab bar sticks directly under it while scrolling */}
      <div className="hidden lg:block h-24 shrink-0" aria-hidden />
      <section
        className="hidden lg:block sticky z-40 bg-[var(--bg-primary)]/95 backdrop-blur-md border-b border-white/10 px-3 sm:px-8 md:px-8 lg:pl-16 top-[calc(env(safe-area-inset-top,0px)+3.5rem)]"
      >
        <div className="container mx-auto">
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2.5 sm:py-3 text-sm font-medium border-b-2 transition-colors shrink-0 ${
                  activeTab === id
                    ? 'border-[var(--accent-green)] text-white'
                    : 'border-transparent text-white/50 hover:text-white'
                }`}
              >
                <Icon className="text-sm" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {activeTab === 'watch' ? (
        <div className="page-below-header lg:pt-0">
          <Suspense fallback={<TabFallback />}>
            <WatchPage embedded />
          </Suspense>
        </div>
      ) : activeTab === 'feed' ? (
        <section className="page-below-header lg:pt-0 px-3 sm:px-8 py-4 sm:py-8">
          <Suspense fallback={<TabFallback />}>
            <HomeFeed />
          </Suspense>
        </section>
      ) : (
        <section className="page-below-header lg:pt-0 px-3 sm:px-8 py-4 sm:py-6">
          <Suspense fallback={<TabFallback />}>
            <HomeBrowseTab
              selectedRegion={selectedRegion}
              onRegionSelect={handleRegionSelect}
              cmsSections={cmsSections}
              loadingSections={loadingSections}
            />
          </Suspense>
        </section>
      )}
    </div>
  );
};

export default Home;
