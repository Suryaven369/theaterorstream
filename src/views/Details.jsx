import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link, useLocation } from "react-router-dom";

import useReviewAnalysis from "../hooks/useReviewAnalysis";
import { useSelector, useDispatch } from "react-redux";
import { cacheMovieDetails } from "../store/movieSlice";
import moment from "moment";
import VideoPlay from "../components/VideoPlay";
import ReviewAnalysis from "../components/ReviewAnalysis";
import TOSRating from "../components/TOSRating";
import axios from "axios";
import { FaStar, FaClock, FaCalendar, FaPlay } from "react-icons/fa";
import { IoArrowBack } from "react-icons/io5";
import UserRatingSystem, { RatingModal } from "../components/UserRatingSystem";
import { getMovieRatings, getUserRatingForMovie, toggleWatchedMovie } from "../lib/supabase";
import { getMovieDetailFromEdge } from "../lib/contentEdgeApi";
import { ShareButton } from "../components/ShareMovie";
import ParentGuide from "../components/ParentGuide";
import VibeChart from "../components/VibeChart";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import MovieActionButtons from "../components/MovieActionButtons";
import { extractIdFromSlug } from "../lib/slugUtils";

const DETAILS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

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

  const [tmbdID, setTmbdID] = useState(null);
  const [AIRatings, setAIRatings] = useState({});
  const [communityRatings, setCommunityRatings] = useState(null);
  const [displayRatings, setDisplayRatings] = useState(null);
  const [userRating, setUserRating] = useState(null);
  const imageURL = useSelector((state) => state.movieData.imageURL);

  // Fetch Details from DB or API
  const [data, setData] = useState(null);
  const [castData, setCastData] = useState(null);
  const [loading, setLoading] = useState(true);

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
        const { success, data: dbData } = await getMovieDetailFromEdge(movieId);

        let fetchedData = null;
        let fetchedCast = null;

        if (success && dbData) {
          console.log("Loaded from DB:", dbData);
          fetchedData = dbData;
          // In DB, cast is in 'credits' field
          if (dbData.credits) {
            fetchedCast = dbData.credits;
          } else {
            // If DB entry exists but no credits (legacy?), try fetch credits
            try {
              const castRes = await axios.get(`/${mediaType}/${movieId}/credits`);
              fetchedCast = castRes.data;
            } catch (e) { console.error("Credits fetch fail", e); }
          }
        } else {
          // 2. Fallback to API if not in DB
          console.log("Not found in DB, falling back to API");
          const response = await axios.get(`/${mediaType}/${movieId}`);
          fetchedData = response.data;

          const castResponse = await axios.get(`/${mediaType}/${movieId}/credits`);
          fetchedCast = castResponse.data;
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
  const [ratingsKey, setRatingsKey] = useState(0);

  const { analysis, loading: analysisLoading } = useReviewAnalysis(movieId);

  const handlePlayVideo = (data) => {
    setPlayVideoId(data);
    setPlayVideo(true);
  };

  const duration = (data?.runtime / 60)?.toFixed(1)?.split(".");
  const director = castData?.crew?.find((el) => el?.job === "Director");

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
      }
    };
  };

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

  // Handle rating submission success
  const handleRatingSubmitSuccess = async (submittedRatings) => {
    // 1. Keep UI in sync immediately, then refetch aggregates
    setRatingsKey(prev => prev + 1);

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

    // 2. Automatically mark as watched if authenticated
    if (isAuthenticated && user?.id && data) {
      try {
        console.log("Automatically marking as watched on rating...");
        await toggleWatchedMovie(
          user.id,
          movieId,
          data.title || data.name,
          data.poster_path,
          mediaType
        );
      } catch (e) {
        console.error("Error auto-marking watched:", e);
      }
    }
  };

  // AI/scraper ratings - backend service not available, use fallback
  // Note: This previously connected to localhost:3000/scraper/analyze
  // The scraper backend is not running, so we skip directly to fallback
  useEffect(() => {
    if (!data?.vote_average) return;

    // Use fallback ratings based on TMDB score (no external API call)
    setAIRatings(generateFallbackRatings(data.vote_average));
  }, [data?.vote_average]);

  // Determine which ratings to display
  useEffect(() => {
    if (communityRatings && communityRatings.totalRatings > 0) {
      const ratings = {
        acting: communityRatings.acting,
        screenplay: communityRatings.screenplay,
        sound: communityRatings.sound,
        direction: communityRatings.direction,
        entertainmentValue: communityRatings.entertainment,
        pacing: communityRatings.pacing,
        cinematicQuality: communityRatings.cinematography,
      };

      const avgScore = Object.values(ratings).filter(v => v).reduce((a, b) => a + b, 0) /
        Object.values(ratings).filter(v => v).length;

      setDisplayRatings({
        ratings: {
          ...ratings,
          verdict: avgScore >= 7 ? `Community Rating: Worth watching in theaters! (${communityRatings.totalRatings} ratings)`
            : avgScore >= 5 ? `Community Rating: A good streaming choice. (${communityRatings.totalRatings} ratings)`
              : `Community Rating: Mixed reviews. (${communityRatings.totalRatings} ratings)`
        },
        source: 'community'
      });
    } else if (AIRatings?.ratings) {
      setDisplayRatings({
        ratings: AIRatings.ratings,
        source: 'ai'
      });
    } else if (data?.vote_average) {
      setDisplayRatings(generateFallbackRatings(data.vote_average));
    }
  }, [communityRatings, AIRatings, data?.vote_average]);

  useEffect(() => {
    if (!data) return;

    const fetchID = async () => {
      try {
        let response;

        if (mediaType === "movie") {
          response = await axios.get(`/movie/${movieId}`);
        } else if (mediaType === "tv") {
          response = await axios.get(`/tv/${movieId}/external_ids`);
        }

        const imdbId = response?.data?.imdb_id;
        setTmbdID(imdbId);
      } catch (error) {
        console.log(error);
      }
    };

    fetchID();
  }, [data, mediaType, movieId]);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Hero Backdrop - Extended height */}
      <div className="relative h-[55vh] md:h-[65vh] lg:h-[75vh]">
        <div className="absolute inset-0">
          {data?.backdrop_path && (
            <img
              src={data.images && data.images.backdrop_base64 ? data.images.backdrop_base64 : imageURL + data?.backdrop_path}
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
          className="absolute top-24 left-6 z-10 flex items-center gap-2 text-white/70 hover:text-white transition-colors"
        >
          <IoArrowBack className="text-xl" />
          <span className="text-sm font-medium">Back</span>
        </button>
      </div>

      {/* Content - Positioned lower */}
      <div className="container mx-auto px-6 -mt-40 md:-mt-56 lg:-mt-64 relative z-10">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          {/* Left Column - Poster, Vibe Chart, Actions */}
          <div className="flex-shrink-0 w-full lg:w-72">
            {/* Poster */}
            <div className="w-48 md:w-64 lg:w-full mx-auto lg:mx-0 rounded-2xl overflow-hidden shadow-2xl">
              {data?.poster_path ? (
                <img
                  src={data.images && data.images.poster_base64 ? data.images.poster_base64 : imageURL + data?.poster_path}
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
              <div className="mt-4 hidden lg:block">
                <VibeChart genres={data.genres} compact={true} customVibes={data.custom_vibes} />
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
                />
              </div>
            )}
          </div>

          {/* Right Column - Details */}
          <div className="flex-1 pt-4 lg:pt-12">
            {/* Title */}
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2">
              {data?.title || data?.name}
            </h1>

            {data?.tagline && (
              <p className="text-white/40 text-lg italic mb-4">
                "{data.tagline}"
              </p>
            )}

            {/* Parent Guide Badges - Uses DB data if available, falls back to TMDB */}
            <ParentGuide
              movieId={movieId}
              mediaType={mediaType}
              genres={data?.genres}
              customParentGuide={data?.custom_parent_guide}
              customCertification={data?.certification}
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
                    className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-sm"
                  >
                    {genre.name}
                  </span>
                ))}
              </div>
            )}

            {/* Overview */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">
                Overview
              </h3>
              <p className="text-white/60 leading-relaxed">{data?.overview}</p>
            </div>

            {/* Vibe Chart - Mobile Only */}
            {data?.genres && (
              <div className="mb-6 lg:hidden">
                <VibeChart genres={data.genres} customVibes={data.custom_vibes} />
              </div>
            )}

            {/* TOS Rating */}
            {displayRatings?.ratings && (
              <TOSRating
                ratings={displayRatings.ratings}
                verdict={displayRatings.ratings.verdict}
                onRateClick={handleRateClick}
                hasUserRated={!!userRating}
              />
            )}

            {/* Credits */}
            <div className="flex gap-8 mb-6">
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
            </div>

            {/* Cast - Compact */}
            {castData?.cast?.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Top Cast</h3>
                <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-none">
                  {castData.cast
                    .filter((el) => el?.profile_path)
                    .slice(0, 8)
                    .map((actor) => (
                      <div
                        key={actor.id}
                        className="flex-shrink-0 flex items-center gap-2 bg-white/5 rounded-full pr-3"
                      >
                        <img
                          src={actor.profile_base64 ? actor.profile_base64 : imageURL + actor.profile_path}
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

            {/* Review Analysis */}
            <ReviewAnalysis analysis={analysis} loading={analysisLoading} />
          </div>
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
            />
          )}
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
    </div>
  );
};

export default Details;