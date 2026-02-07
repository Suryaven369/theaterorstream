import { Outlet, useLocation } from "react-router-dom";
import axios from "axios";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setImageURL, invalidateHomepageSections, invalidateMovieDetails } from "./store/movieSlice";
import { supabase } from "./lib/supabase";

// components
import Header from "./components/Header";
import Footer from "./components/Footer";
import MobileNavigation from "./components/MobileNavigation";

function App() {
  const dispatch = useDispatch();
  const location = useLocation();
  const imageURL = useSelector((state) => state.movieData.imageURL);

  const fetchConfiguration = async () => {
    try {
      const response = await axios.get("/configuration");
      dispatch(setImageURL(response.data.images.secure_base_url + "original"));
    } catch (error) {
      console.log("Configuration fetch error:", error);
    }
  };

  useEffect(() => {
    if (!imageURL) {
      fetchConfiguration();
    }
  }, []);

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
          dispatch(invalidateMovieDetails(tmdbId || null));
          dispatch(invalidateHomepageSections());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dispatch]);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  return (
    <div className="bg-[#0a0a0a] min-h-screen">
      <Header />
      <main className="pb-20 lg:pb-0">
        <Outlet />
      </main>
      <Footer />
      <MobileNavigation />
    </div>
  );
}

export default App;

