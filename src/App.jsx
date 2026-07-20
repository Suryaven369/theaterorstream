import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { setImageURL, invalidateHomepageSections, invalidateMovieDetails } from "./store/movieSlice";
import { supabase } from "./lib/supabase";
import { TMDB_IMAGE_BASE } from "./utils/imageHelper";

// components
import Header from "./components/Header";
import Footer from "./components/Footer";
import MobileNavigation from "./components/MobileNavigation";
import RecoChatBubble from "./components/RecoChatBubble";

function App() {
  const dispatch = useDispatch();
  const location = useLocation();

  useEffect(() => {
    dispatch(setImageURL(`${TMDB_IMAGE_BASE}original`));
  }, [dispatch]);

  // Supabase Realtime: auto-invalidate cache when DB content changes
  useEffect(() => {
    const channel = supabase
      .channel('db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'homepage_sections' },
        (payload) => {
          console.log('\u26a1 Realtime: homepage_sections changed', payload.eventType);
          dispatch(invalidateHomepageSections());
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'movies_library' },
        (payload) => {
          console.log('\u26a1 Realtime: movies_library changed', payload.eventType);
          const tmdbId = payload.new?.tmdb_id || payload.old?.tmdb_id;
          // Only invalidate the changed title — do not refetch all homepage sections
          // on every library sync (that thrashed egress on connected clients).
          dispatch(invalidateMovieDetails(tmdbId || null));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dispatch]);

  const isSearchPage = location.pathname === '/search';

  // Scroll to top on route / home-tab change (not mood/ott filter tweaks)
  const homeTab = new URLSearchParams(location.search).get('tab') || '';
  useEffect(() => {
    if (!isSearchPage) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname, homeTab, isSearchPage]);

  return (
    <div className="bg-[var(--bg-primary)] min-h-screen">
      {!isSearchPage && <Header />}
      <main className={isSearchPage ? '' : 'pb-nav'}>
        <Outlet />
      </main>
      {!isSearchPage && <Footer />}
      {!isSearchPage && <MobileNavigation />}
      <RecoChatBubble />
    </div>
  );
}

export default App;

