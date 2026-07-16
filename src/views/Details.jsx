import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link, useLocation } from "react-router-dom";

import useReviewAnalysis from "../hooks/useReviewAnalysis";
import { useSelector, useDispatch } from "react-redux";
import { cacheMovieDetails } from "../store/movieSlice";
import moment from "moment";
import VideoPlay from "../components/VideoPlay";
import ReviewAnalysis from "../components/ReviewAnalysis";
import TOSRating from "../components/TOSRating";
import { FaStar, FaClock, FaCalendar, FaPlay } from "react-icons/fa";
import { IoArrowBack } from "react-icons/io5";
import UserRatingSystem, { RatingModal } from "../components/UserRatingSystem";
import { getMovieRatings, getUserRatingForMovie } from "../lib/supabase";
import { computeOverallFromCategories } from "../lib/ratingUtils";
import QuickLogModal from "../components/social/QuickLogModal";
import WriteReviewModal from "../components/social/WriteReviewModal";
import { getMovieDetailFromEdge } from "../lib/contentEdgeApi";
import { ShareButton } from "../components/ShareMovie";
import ParentGuide from "../components/ParentGuide";
import VibeChart from "../components/VibeChart";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import MovieActionButtons from "../components/MovieActionButtons";
import TVSeasonsList from "../components/TVSeasonsList";
import { extractIdFromSlug } from "../lib/slugUtils";
import { resolveTmdbImageUrl } from "../utils/imageHelper";
import { trackEvent, EVENT_TYPES } from "../lib/eventTracking";
import StreamingProviders from "../components/StreamingProviders";
import SimilarMoviesSection from "../components/discover/SimilarMoviesSection";
import { getTitleAnalysisFromEdge } from "../lib/contentEdgeApi";
import { mergeParentGuides } from "../lib/parentGuide";
import SeoHead from "../components/SeoHead";

const DETAILS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function formatMoney(amount) {
  const n = Number(amount);
  if (!n || n <= 0) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${n.toLocaleString('en-US')}`;
}

const CREW_JOB_PRIORITY = [
  'Director',
  'Writer',
  'Screenplay',
  'Story',
  'Novel',
  'Teleplay',
  'Producer',
  'Executive Producer',
  'Co-Producer',
  'Associate Producer',
];

const CREW_JOB_LABEL = {
  Director: 'Director',
  Writer: 'Writer',
  Screenplay: 'Writer',
  Story: 'Writer',
  Novel: 'Writer',
  Teleplay: 'Writer',
  Producer: 'Producer',
  'Executive Producer': 'Producer',
  'Co-Producer': 'Producer',
  'Associate Producer': 'Producer',
};

/** One card per person; combine roles e.g. "Director, Writer". */
function mergeCrewPeople(crew) {
  const allowed = new Set(CREW_JOB_PRIORITY);
  const byId = new Map();

  (crew || []).forEach((person) => {
    if (!person?.id || !allowed.has(person.job)) return;
    const existing = byId.get(person.id);
    if (!existing) {
      byId.set(person.id, {
        id: person.id,
        name: person.name,
        profile_path: person.profile_path,
        profile_base64: person.profile_base64,
        jobs: [person.job],
      });
      return;
    }
    if (!existing.jobs.includes(person.job)) existing.jobs.push(person.job);
    if (!existing.profile_path && person.profile_path) {
      existing.profile_path = person.profile_path;
      existing.profile_base64 = person.profile_base64;
    }
  });

  return Array.from(byId.values())
    .map((person) => {
      const labels = [];
      const seenLabel = new Set();
      CREW_JOB_PRIORITY.forEach((job) => {
        if (!person.jobs.includes(job)) return;
        const label = CREW_JOB_LABEL[job];
        if (seenLabel.has(label)) return;
        seenLabel.add(label);
        labels.push(label);
      });
      return {
        ...person,
        rolesLabel: labels.join(', '),
        sortRank: Math.min(
          ...person.jobs.map((job) => {
            const idx = CREW_JOB_PRIORITY.indexOf(job);
            return idx === -1 ? 99 : idx;
          }),
        ),
      };
    })
    .sort((a, b) => a.sortRank - b.sortRank || a.name.localeCompare(b.name));
}

const Details = () => {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const dispatch = useDispatch();
  const movieDetailsCache = useSelector((state) => state.movieData.movieDetailsCache);

  // Determine if using new slug-based URL or legacy ID-based URL
  // New format: /movies/greenland-2-840464 or /tv/breaking-bad-1396
  // Legacy format: /movie/840464 or /tv/1396
  const isSlugRoute = location.pathname.startsWith('/movies/') || location.pathname.startsWith('/tv/');

  // Extract movie ID and media type based on route type
  const movieId = useMemo(() => {
    if (isSlugRoute && params.slug) {
      // Extract ID from end of slug (e.g., "greenland-2-840464" -> "840464")
      return extractIdFromSlug(params.slug) || params.slug;
    }
    return params.id;
  }, [isSlugRoute, params.slug, params.id]);

  const mediaType = useMemo(() => {
    if (location.pathname.startsWith('/movies/')) return 'movie';
    if (location.pathname.startsWith('/tv/')) return 'tv';
    return params.explore || 'movie';
  }, [location.pathname, params.explore]);

  // Behavioural signal: a movie page view (+2). One per movie id.
  useEffect(() => {
    if (movieId) {
      trackEvent(EVENT_TYPES.MOVIE_VIEW, { tmdbId: movieId, mediaType });
    }
  }, [movieId, mediaType]);

  // Accurate Parent Guide + Vibes (TMDB certification + LLM), works for tv too.
  const [contentAnalysis, setContentAnalysis] = useState(null);
  useEffect(() => {
    if (!movieId) return undefined;
    let alive = true;
    getTitleAnalysisFromEdge(movieId, mediaType)
      .then((r) => { if (alive) setContentAnalysis(r?.data || null); })
      .catch(() => { if (alive) setContentAnalysis(null); });
    return () => { alive = false; };
  }, [movieId, mediaType]);

  const [tmbdID, setTmbdID] = useState(null);
  const [communityRatings, setCommunityRatings] = useState(null);
  const [displayRatings, setDisplayRatings] = useState(null);
  const [userRating, setUserRating] = useState(null);
  const imageURL = useSelector((state) => state.movieData.imageURL);

  // Fetch Details from DB or API
  const [data, setData] = useState(null);
  const [castData, setCastData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Prefer admin/DB + live analysis merged conservatively (lowest severity wins),
  // so a false "Sex/Nudity · Moderate" in DB is corrected when analysis says none.
  const _hasObj = (o) => o && typeof o === 'object' && Object.keys(o).length > 0;
  const effParentGuide = useMemo(() => {
    const stored = _hasObj(data?.custom_parent_guide) ? data.custom_parent_guide : null;
    const live = _hasObj(contentAnalysis?.parentGuide) ? contentAnalysis.parentGuide : null;
    if (stored && live) return mergeParentGuides(stored, live);
    return stored || live || null;
  }, [data?.custom_parent_guide, contentAnalysis?.parentGuide]);
  const effVibes = _hasObj(data?.custom_vibes) ? data.custom_vibes : (contentAnalysis?.vibes || null);
  const effCertification = data?.certification || contentAnalysis?.certification || null;

  const posterSrc = useMemo(
    () => resolveTmdbImageUrl(data?.poster_path, {
      base64: data?.images?.poster_base64,
      baseUrl: imageURL,
      size: 'w500',
    }),
    [data?.poster_path, data?.images?.poster_base64, imageURL]
  );

  const backdropSrc = useMemo(
    () => resolveTmdbImageUrl(data?.backdrop_path, {
      base64: data?.images?.backdrop_base64,
      baseUrl: imageURL,
      size: 'original',
    }),
    [data?.backdrop_path, data?.images?.backdrop_base64, imageURL]
  );

  const getProfileSrc = (profilePath, profileBase64) =>
    resolveTmdbImageUrl(profilePath, {
      base64: profileBase64,
      baseUrl: imageURL,
      size: 'w185',
    });

  useEffect(() => {
    const fetchDetails = async () => {
      if (!movieId) return;

      // Check Redux cache first
      const cached = movieDetailsCache[movieId];
      if (cached && cached.data && (Date.now() - cached.timestamp < DETAILS_CACHE_TTL)) {
        console.log(`\u26a1 Using cached details for ${movieId}`);
        setData(cached.data);
        setCastData(cached.castData);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // 1. Try DB first
        console.log(`Fetching details for ${movieId} (${mediaType})`);
        const { success, data: dbData } = await getMovieDetailFromEdge(movieId, mediaType);

        let fetchedData = null;
        let fetchedCast = null;

        if (success && dbData) {
          console.log("Loaded from DB:", dbData);
          fetchedData = dbData;
          if (dbData.credits) {
            fetchedCast = dbData.credits;
          }
        } else {
          console.warn(`Movie ${movieId} not found in library`);
        }

        setData(fetchedData);
        setCastData(fetchedCast);

        // Cache in Redux for future visits
        if (fetchedData) {
          dispatch(cacheMovieDetails({ movieId, data: fetchedData, castData: fetchedCast }));
        }
      } catch (error) {
        console.error("Error fetching details:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [movieId, mediaType]);

  const [playVideo, setPlayVideo] = useState(false);
  const [playVideoId, setPlayVideoId] = useState("");
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [logPrefillRating, setLogPrefillRating] = useState(null);
  const [ratingsKey, setRatingsKey] = useState(0);

  const { analysis, loading: analysisLoading } = useReviewAnalysis(movieId);

  const handlePlayVideo = (data) => {
    setPlayVideoId(data);
    setPlayVideo(true);
  };

  const duration = (data?.runtime / 60)?.toFixed(1)?.split(".");
  const director = castData?.crew?.find((el) => el?.job === "Director");
  const crewPeople = useMemo(
    () => mergeCrewPeople(castData?.crew).slice(0, 6),
    [castData?.crew],
  );

  // Generate fallback TOS ratings based on TMDB score
  const generateFallbackRatings = (tmdbScore) => {
    const baseScore = tmdbScore || 7;
    const variance = () => (Math.random() - 0.5) * 1.5;
    const clamp = (val) => Math.max(1, Math.min(10, val));

    return {
      ratings: {
        acting: clamp(baseScore + variance()),
        screenplay: clamp(baseScore + variance()),
        sound: clamp(baseScore + variance()),
        direction: clamp(baseScore + variance()),
        entertainmentValue: clamp(baseScore + variance()),
        pacing: clamp(baseScore + variance()),
        cinematicQuality: clamp(baseScore + variance()),
        verdict: baseScore >= 7 ? "Worth watching in theaters for the full experience!"
          : baseScore >= 5 ? "A good streaming choice for movie night."
            : "You might want to wait for reviews before watching."
      },
      source: 'fallback',
    };
  };

  const mapWebRatingsToDisplay = (webRatings) => {
    if (!webRatings) return null;
    return {
      acting: webRatings.acting,
      screenplay: webRatings.screenplay,
      sound: webRatings.sound,
      direction: webRatings.direction,
      entertainmentValue: webRatings.entertainment,
      pacing: webRatings.pacing,
      cinematicQuality: webRatings.cinematography,
      verdict: webRatings.verdict,
    };
  };

  const mapCommunityToDisplay = (community) => {
    if (!community || community.totalRatings <= 0) return null;
    return {
      acting: community.acting,
      screenplay: community.screenplay,
      sound: community.sound,
      direction: community.direction,
      entertainmentValue: community.entertainment,
      pacing: community.pacing,
      cinematicQuality: community.cinematography,
    };
  };

  const communityOverallLabel = useMemo(() => {
    if (!communityRatings || communityRatings.totalRatings <= 0) return null;
    const display = mapCommunityToDisplay(communityRatings);
    const vals = Object.values(display).filter((v) => v != null && typeof v === 'number');
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return `Community: ${avg.toFixed(1)} (${communityRatings.totalRatings} ratings)`;
  }, [communityRatings]);

  // Fetch community ratings from Supabase
  useEffect(() => {
    const fetchCommunityRatings = async () => {
      if (!movieId) return;

      try {
        const ratings = await getMovieRatings(movieId);
        if (ratings && ratings.totalRatings > 0) {
          setCommunityRatings(ratings);
        }
      } catch (error) {
        console.log("Error fetching community ratings:", error);
      }
    };

    fetchCommunityRatings();
  }, [movieId, ratingsKey]);

  // Fetch user's existing rating for this movie
  useEffect(() => {
    const fetchUserRating = async () => {
      if (!movieId || !user?.id) {
        setUserRating(null);
        return;
      }

      try {
        const rating = await getUserRatingForMovie(user.id, movieId);
        setUserRating(rating);
      } catch (error) {
        console.log("Error fetching user rating:", error);
      }
    };

    fetchUserRating();
  }, [movieId, user?.id, ratingsKey]);

  // Handle rate button click
  const handleRateClick = () => {
    if (!isAuthenticated) {
      sessionStorage.setItem('authMessage', 'Please sign up or login to rate movies');
      navigate('/auth');
      return;
    }
    setRatingModalOpen(true);
  };

  // Handle rating submission success — rating is saved in RatingModal; then open diary log
  const handleRatingSubmitSuccess = (submittedRatings) => {
    setRatingModalOpen(false);
    setRatingsKey((prev) => prev + 1);

    if (submittedRatings && user?.id && movieId) {
      setUserRating((prev) => ({
        ...(prev || {}),
        user_id: user.id,
        movie_id: String(movieId),
        movie_title: data?.title || data?.name,
        ...submittedRatings,
        updated_at: new Date().toISOString(),
      }));
    }

    if (user?.id && movieId) {
      const score = submittedRatings
        ? computeOverallFromCategories(submittedRatings)
        : null;
      setLogPrefillRating(score);
      setLogModalOpen(true);
    }
  };

  // Determine which ratings to display (web consensus > community > TMDB fallback)
  useEffect(() => {
    const web = data?.web_ratings;
    if (web?.acting != null) {
      const reviewCount = web.review_count || 0;
      setDisplayRatings({
        ratings: mapWebRatingsToDisplay(web),
        source: 'web',
        sourceLabel: reviewCount > 0
          ? `Web consensus · ${reviewCount} TMDB reviews`
          : 'Web consensus',
        secondaryLabel: communityOverallLabel,
      });
      return;
    }

    if (communityRatings && communityRatings.totalRatings > 0) {
      const ratings = mapCommunityToDisplay(communityRatings);
      const avgScore = Object.values(ratings).filter((v) => v).reduce((a, b) => a + b, 0) /
        Object.values(ratings).filter((v) => v).length;

      setDisplayRatings({
        ratings: {
          ...ratings,
          verdict: avgScore >= 7 ? `Community: Worth watching in theaters! (${communityRatings.totalRatings} ratings)`
            : avgScore >= 5 ? `Community: A good streaming choice. (${communityRatings.totalRatings} ratings)`
              : `Community: Mixed reviews. (${communityRatings.totalRatings} ratings)`,
        },
        source: 'community',
        sourceLabel: `Community · ${communityRatings.totalRatings} ratings`,
      });
      return;
    }

    if (data?.vote_average) {
      setDisplayRatings(generateFallbackRatings(data.vote_average));
    } else {
      setDisplayRatings(null);
    }
  }, [communityRatings, data?.web_ratings, data?.vote_average, communityOverallLabel]);

  useEffect(() => {
    if (data?.imdb_id) {
      setTmbdID(data.imdb_id);
    }
  }, [data?.imdb_id]);

  const pageTitle = data?.title || data?.name || 'Title';
  const year = (data?.release_date || data?.first_air_date || '').slice(0, 4);
  const seoTitle = year ? `${pageTitle} (${year})` : pageTitle;
  const seoDesc = (data?.overview || '').trim().slice(0, 160)
    || `Ratings, streaming info, and theater vs stream guidance for ${pageTitle}.`;
  const seoImage = backdropSrc || posterSrc || null;
  const seoUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${location.pathname}`
    : location.pathname;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {data && (
        <SeoHead
          title={`${seoTitle} | TheaterOrStream`}
          description={seoDesc}
          image={seoImage}
          url={seoUrl}
          type="video.movie"
        />
      )}
      {/* Hero Backdrop - Extended height */}
      <div className="relative h-[55vh] md:h-[65vh] lg:h-[75vh]">
        <div className="absolute inset-0">
          {backdropSrc && (
            <img
              src={backdropSrc}
              className="w-full h-full object-cover object-top"
              alt={data?.title || data?.name}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/80 via-transparent to-transparent" />
        </div>

        {/* Centered Play Button on Backdrop */}
        <button
          onClick={() => handlePlayVideo(data)}
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 group"
        >
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:bg-white/20 group-hover:shadow-2xl group-hover:shadow-white/10">
            <FaPlay className="text-white text-2xl md:text-3xl ml-1 group-hover:scale-110 transition-transform" />
          </div>
          <span className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-sm text-white/60 font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Watch Trailer
          </span>
        </button>

        {/* Back Button */}
        <button
          onClick={() => {
            if (location.key !== "default") {
              navigate(-1);
            } else {
              navigate("/");
            }
          }}
          className="absolute top-[calc(4.75rem+env(safe-area-inset-top,0px))] left-4 sm:left-6 z-10 flex items-center gap-2 text-white/70 hover:text-white transition-colors tap-target"
        >
          <IoArrowBack className="text-xl" />
          <span className="text-sm font-medium">Back</span>
        </button>
      </div>

      {/* Content — extra left room on ~15" laptop widths */}
      <div className="container mx-auto px-4 sm:px-6 md:pl-16 md:pr-10 lg:pl-24 lg:pr-14 xl:pl-28 xl:pr-16 2xl:px-12 -mt-28 sm:-mt-40 md:-mt-48 lg:-mt-64 relative z-10">
        <div className="flex flex-col md:flex-row gap-6 md:gap-10 lg:gap-16">
          {/* Left Column - Poster, Vibe Chart, Actions */}
          <div className="flex-shrink-0 w-full md:w-56 lg:w-72">
            {/* Poster */}
            <div className="w-40 sm:w-48 md:w-full mx-auto md:mx-0 rounded-2xl overflow-hidden shadow-2xl">
              {posterSrc ? (
                <img
                  src={posterSrc}
                  className="w-full aspect-[2/3] object-cover"
                  alt={data?.title || data?.name}
                />
              ) : (
                <div className="w-full aspect-[2/3] bg-white/5 flex items-center justify-center text-white/30">
                  No image
                </div>
              )}
            </div>

            {/* Vibe Chart - RIGHT BELOW POSTER */}
            {data?.genres && (
              <div className="mt-4 hidden md:block">
                <VibeChart genres={data.genres} compact={true} customVibes={effVibes} />
              </div>
            )}

            {/* Movie Action Buttons - Watchlist, Watched, Like, Save */}
            {data && (
              <MovieActionButtons
                key={ratingsKey}
                movieId={movieId}
                movieTitle={data?.title || data?.name}
                posterPath={data?.poster_path}
                mediaType={mediaType}
              />
            )}
            {data && isAuthenticated && (
              <button
                type="button"
                onClick={() => setReviewModalOpen(true)}
                className="mt-3 w-full py-2.5 rounded-xl border border-[var(--accent-green)]/40 text-[var(--accent-green)] text-sm font-medium hover:bg-[var(--accent-green-dim)] transition-colors"
              >
                Write a review
              </button>
            )}

            {/* Share Button */}
            {displayRatings?.ratings && (
              <div className="mt-3">
                <ShareButton
                  movieTitle={data?.title || data?.name}
                  movieYear={data?.release_date?.split('-')[0] || data?.first_air_date?.split('-')[0]}
                  posterUrl={data?.poster_path}
                  backdropUrl={data?.backdrop_path}
                  posterBase64={data?.images?.poster_base64}
                  backdropBase64={data?.images?.backdrop_base64}
                  ratings={displayRatings.ratings}
                  imageURL={imageURL}
                  genres={data?.genres}
                  mediaType={data?.media_type || (data?.first_air_date ? 'tv' : 'movie')}
                />
              </div>
            )}
          </div>

          {/* Right Column - Details */}
          <div className="flex-1 pt-4 lg:pt-12 md:pl-4 lg:pl-8 xl:pl-10 min-w-0">
            {/* Title */}
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2">
              {data?.title || data?.name}
            </h1>

            {data?.tagline && (
              <p className="text-white/40 text-lg italic mb-4">
                "{data.tagline}"
              </p>
            )}

            {/* Parent Guide — DB/analysis levels; none hidden; tags link to browse */}
            <ParentGuide
              genres={data?.genres}
              customParentGuide={effParentGuide}
              customCertification={effCertification}
            />

            {/* Streaming Platforms - from DB */}
            {data?.streaming_platforms?.length > 0 && (
              <div className="mb-5">
                <div className="flex flex-wrap gap-2.5">
                  {data.streaming_platforms.map((platform, i) => {
                    const name = platform.name?.toLowerCase() || '';
                    const platformData = {
                      'netflix': { bg: 'bg-red-600/20', border: 'border-red-500/40', text: 'text-red-400', logo: 'https://images.ctfassets.net/4cd45et68cgf/Rx83JoRDMkYNlMC9MKzcB/2b14d5a59fc3937afd3f03191e19502d/Netflix-Symbol.png?w=700&h=456' },
                      'amazon prime': { bg: 'bg-blue-500/20', border: 'border-blue-400/40', text: 'text-blue-400', logo: 'https://www.citypng.com/public/uploads/preview/amazon-prime-ios-app-icon-701751695133984u2yuon8nlu.png?v=2026011918' },
                      'prime video': { bg: 'bg-blue-500/20', border: 'border-blue-400/40', text: 'text-blue-400', logo: 'https://www.citypng.com/public/uploads/preview/amazon-prime-ios-app-icon-701751695133984u2yuon8nlu.png?v=2026011918' },
                      'disney+': { bg: 'bg-blue-600/20', border: 'border-blue-500/40', text: 'text-blue-300', logo: null },
                      'apple tv+': { bg: 'bg-gray-500/20', border: 'border-gray-400/40', text: 'text-gray-300', logo: 'https://www.clipartmax.com/png/middle/241-2419842_apple-tv-logo-png.png' },
                      'apple tv': { bg: 'bg-gray-500/20', border: 'border-gray-400/40', text: 'text-gray-300', logo: 'https://www.clipartmax.com/png/middle/241-2419842_apple-tv-logo-png.png' },
                      'hbo max': { bg: 'bg-purple-600/20', border: 'border-purple-500/40', text: 'text-purple-400', logo: 'https://static.cdn.turner.com/styles/scale_792/s3/images/2025-05/hbo-max-logo.jpg?itok=v7Dk_88s' },
                      'hulu': { bg: 'bg-green-500/20', border: 'border-green-400/40', text: 'text-green-400', logo: null },
                      'paramount+': { bg: 'bg-blue-700/20', border: 'border-blue-600/40', text: 'text-blue-400', logo: null },
                      'jiocinema': { bg: 'bg-pink-500/20', border: 'border-pink-400/40', text: 'text-pink-400', logo: null },
                      'hotstar': { bg: 'bg-blue-500/20', border: 'border-blue-400/40', text: 'text-blue-300', logo: 'https://play-lh.googleusercontent.com/bp4jknyVZ8yDKhER9thIS1p9MBeU2LABqBX-sO8uaL1h5_keqlgMUmXv-CjfRWaqKw' },
                      'zee5': { bg: 'bg-purple-500/20', border: 'border-purple-400/40', text: 'text-purple-400', logo: 'https://www.medianews4u.com/wp-content/uploads/2025/06/Zee-5.jpg' },
                      'sonyliv': { bg: 'bg-blue-500/20', border: 'border-blue-400/40', text: 'text-blue-300', logo: 'https://upload.wikimedia.org/wikipedia/commons/f/f7/SonyLIV_2020.png' },
                    };
                    const pData = platformData[name] || { bg: 'bg-white/10', border: 'border-white/20', text: 'text-white/70', logo: null };
                    const Tag = platform.url ? 'a' : 'span';
                    const linkProps = platform.url ? { href: platform.url, target: '_blank', rel: 'noopener noreferrer' } : {};
                    return (
                      <Tag
                        key={i}
                        {...linkProps}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border ${pData.bg} ${pData.border} ${pData.text} text-xs font-medium transition-all hover:scale-105 hover:brightness-125 cursor-pointer`}
                      >
                        {pData.logo ? (
                          <img src={pData.logo} alt={platform.name} className="w-5 h-5 rounded object-contain" />
                        ) : (
                          <span className="text-sm">📺</span>
                        )}
                        <span>{platform.name}</span>
                      </Tag>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Where to watch (live OTT availability from TMDB) */}
            <div className="mb-5">
              <StreamingProviders
                tmdbId={movieId}
                mediaType={mediaType}
                region="IN"
              />
            </div>

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <span className="rating-badge flex items-center gap-1.5">
                <FaStar className="text-yellow-400" />
                {Number(data?.vote_average).toFixed(1)}
              </span>

              {duration && duration[0] !== "NaN" && (
                <span className="flex items-center gap-2 text-white/50 text-sm">
                  <FaClock className="text-white/30" />
                  {duration[0]}h {duration[1]}m
                </span>
              )}

              <span className="flex items-center gap-2 text-white/50 text-sm">
                <FaCalendar className="text-white/30" />
                {moment(data?.release_date || data?.first_air_date).format(
                  "MMMM Do, YYYY"
                )}
              </span>
            </div>

            {/* Genres */}
            {data?.genres && (
              <div className="flex flex-wrap gap-2 mb-6">
                {data.genres.map((genre) => (
                  <span
                    key={genre.id}
                    className="inline-flex items-center px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-sm"
                  >
                    {genre.name}
                  </span>
                ))}
              </div>
            )}

            {/* Overview */}
            <div className="mb-6 max-w-xl">
              <h3 className="text-lg font-semibold text-white mb-3">
                Overview
              </h3>
              <p className="text-white/60 leading-relaxed text-sm sm:text-base">
                {data?.overview}
              </p>
            </div>

            {/* Vibe Chart - Mobile Only */}
            {data?.genres && (
              <div className="mb-6 lg:hidden">
                <VibeChart genres={data.genres} customVibes={effVibes} />
              </div>
            )}

            {/* TOS Rating — inline for mobile/tablet; moves to right column on desktop */}
            {displayRatings?.ratings && (
              <div className="lg:hidden">
                <TOSRating
                  ratings={displayRatings.ratings}
                  verdict={displayRatings.ratings.verdict}
                  onRateClick={handleRateClick}
                  hasUserRated={!!userRating}
                  sourceLabel={displayRatings.sourceLabel}
                  secondaryLabel={displayRatings.secondaryLabel}
                />
              </div>
            )}

            {/* Credits */}
            <div className="flex flex-wrap gap-8 mb-6">
              {director && (
                <div>
                  <p className="text-white/40 text-sm mb-1">Director</p>
                  <p className="text-white font-medium">{director.name}</p>
                </div>
              )}
              {data?.status && (
                <div>
                  <p className="text-white/40 text-sm mb-1">Status</p>
                  <p className="text-white font-medium">{data.status}</p>
                </div>
              )}
              {mediaType === 'movie' && Number(data?.budget) > 0 && (
                <div>
                  <p className="text-white/40 text-sm mb-1">Budget</p>
                  <p className="text-white font-medium">{formatMoney(data.budget)}</p>
                </div>
              )}
              {mediaType === 'movie' && Number(data?.revenue) > 0 && (
                <div>
                  <p className="text-white/40 text-sm mb-1">Box office</p>
                  <p className="text-white font-medium">{formatMoney(data.revenue)}</p>
                </div>
              )}
            </div>

            {/* Seasons (TV only) */}
            {mediaType === 'tv' && data?.seasons?.length > 0 && (
              <TVSeasonsList tmdbId={movieId} title={data?.name || data?.title} seasons={data.seasons} />
            )}

            {/* Cast - Compact */}
            {castData?.cast?.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Top Cast</h3>
                <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-none">
                  {castData.cast
                    .filter((el) => el?.profile_path)
                    .slice(0, 6)
                    .map((actor) => (
                      <div
                        key={actor.id}
                        className="flex-shrink-0 flex items-center gap-2 bg-white/5 rounded-full pr-3"
                      >
                        <img
                          src={getProfileSrc(actor.profile_path, actor.profile_base64)}
                          className="w-10 h-10 rounded-full object-cover"
                          alt={actor.name}
                        />
                        <span className="text-xs text-white/70 whitespace-nowrap">
                          {actor.name}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Crew — one person, combined roles (e.g. Director, Writer) */}
            {crewPeople.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-4">Crew</h3>
                <div className="flex gap-5 overflow-x-auto pb-2 scrollbar-none">
                  {crewPeople.map((person) => (
                    <div
                      key={person.id}
                      className="flex-shrink-0 w-[88px] flex flex-col items-center text-center"
                    >
                      {person.profile_path ? (
                        <img
                          src={getProfileSrc(person.profile_path, person.profile_base64)}
                          className="w-16 h-16 rounded-full object-cover mb-2"
                          alt={person.name}
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-lg text-white/40 mb-2">
                          {person.name?.charAt(0) || "?"}
                        </div>
                      )}
                      <p className="text-sm font-medium text-white leading-tight line-clamp-2">
                        {person.name}
                      </p>
                      <p className="text-xs text-white/45 mt-0.5 leading-tight line-clamp-2">
                        {person.rolesLabel}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Review Analysis */}
            <ReviewAnalysis analysis={analysis} loading={analysisLoading} />
          </div>

          {/* Right Column - TOS Rating (desktop only, vertical) */}
          {displayRatings?.ratings && (
            <div className="hidden lg:block flex-shrink-0 w-72 xl:w-80 pt-12">
              <div className="lg:sticky lg:top-24">
                <TOSRating
                  ratings={displayRatings.ratings}
                  verdict={displayRatings.ratings.verdict}
                  onRateClick={handleRateClick}
                  hasUserRated={!!userRating}
                  sourceLabel={displayRatings.sourceLabel}
                  secondaryLabel={displayRatings.secondaryLabel}
                  vertical={true}
                />
              </div>
            </div>
          )}
        </div>

        {/* Community Discussion Section - FULL WIDTH, DISPLAYED DIRECTLY */}
        <div className="mt-12 pb-16">
          {/* <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">💬</span>
            <h2 className="text-2xl font-bold text-white">Community Discussion</h2>
            <span className="text-white/40 text-sm">Share your thoughts like a Reddit thread</span>
          </div> */}

          {/* User Rating System - Now displayed directly */}
          {data && (
            <UserRatingSystem
              movieId={movieId}
              movieTitle={data?.title || data?.name}
              hasUserRated={!!userRating}
              existingRating={userRating}
              userId={user?.id}
              onRatingSubmitted={handleRatingSubmitSuccess}
            />
          )}
        </div>

        {/* More like this — similar titles from the recommendation engine */}
        <div className="-mx-4 sm:-mx-6 pb-8 sm:pb-12">
          <SimilarMoviesSection tmdbId={movieId} mediaType={mediaType} />
        </div>
      </div>

      {/* Video Player Modal */}
      {playVideo && (
        <VideoPlay
          data={playVideoId}
          close={() => setPlayVideo(false)}
          media_type={mediaType}
        />
      )}

      {/* Rating Modal */}
      <RatingModal
        isOpen={ratingModalOpen}
        onClose={() => setRatingModalOpen(false)}
        movieId={movieId}
        movieTitle={data?.title || data?.name}
        onSubmitSuccess={handleRatingSubmitSuccess}
        existingRating={userRating}
        userId={user?.id}
      />

      {reviewModalOpen && data && (
        <WriteReviewModal
          movie={{
            tmdb_id: movieId,
            title: data?.title || data?.name,
            poster_path: data?.poster_path,
            media_type: mediaType,
          }}
          onClose={() => setReviewModalOpen(false)}
          onSuccess={() => setReviewModalOpen(false)}
        />
      )}

      <QuickLogModal
        isOpen={logModalOpen}
        onClose={() => {
          setLogModalOpen(false);
          setLogPrefillRating(null);
        }}
        userId={user?.id}
        movie={{
          id: movieId,
          tmdb_id: movieId,
          title: data?.title || data?.name,
          poster_path: data?.poster_path,
          media_type: mediaType,
        }}
        prefillRating={logPrefillRating}
        subtitle="Rating saved — add how you watched (optional)"
        onLogged={() => setLogPrefillRating(null)}
      />
    </div>
  );
};

export default Details;