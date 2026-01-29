import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import useFetchDetails from "../hooks/useFetchDetails";
import useReviewAnalysis from "../hooks/useReviewAnalysis";
import { useSelector } from "react-redux";
import moment from "moment";
import VideoPlay from "../components/VideoPlay";
import ReviewAnalysis from "../components/ReviewAnalysis";
import TOSRating from "../components/TOSRating";
import axios from "axios";
import { FaStar, FaClock, FaCalendar, FaPlay } from "react-icons/fa";
import { IoArrowBack } from "react-icons/io5";
import UserRatingSystem, { RatingModal } from "../components/UserRatingSystem";
import { getMovieRatings, getUserRatingForMovie } from "../lib/supabase";
import { ShareButton } from "../components/ShareMovie";
import ParentGuide from "../components/ParentGuide";
import VibeChart from "../components/VibeChart";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import MovieActionButtons from "../components/MovieActionButtons";

const Details = () => {
  const params = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [tmbdID, setTmbdID] = useState(null);
  const [AIRatings, setAIRatings] = useState({});
  const [communityRatings, setCommunityRatings] = useState(null);
  const [displayRatings, setDisplayRatings] = useState(null);
  const [userRating, setUserRating] = useState(null); // User's existing rating
  const imageURL = useSelector((state) => state.movieData.imageURL);
  const { data } = useFetchDetails(`/${params?.explore}/${params?.id}`);
  const { data: castData } = useFetchDetails(
    `/${params?.explore}/${params?.id}/credits`
  );
  const [playVideo, setPlayVideo] = useState(false);
  const [playVideoId, setPlayVideoId] = useState("");
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [ratingsKey, setRatingsKey] = useState(0); // For refreshing ratings

  const { analysis, loading: analysisLoading } = useReviewAnalysis(params?.id);

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
      if (!params?.id) return;

      try {
        const ratings = await getMovieRatings(params.id);
        if (ratings && ratings.totalRatings > 0) {
          setCommunityRatings(ratings);
        }
      } catch (error) {
        console.log("Error fetching community ratings:", error);
      }
    };

    fetchCommunityRatings();
  }, [params?.id, ratingsKey]);

  // Fetch user's existing rating for this movie
  useEffect(() => {
    const fetchUserRating = async () => {
      if (!params?.id || !user?.id) {
        setUserRating(null);
        return;
      }

      try {
        const rating = await getUserRatingForMovie(user.id, params.id);
        setUserRating(rating);
      } catch (error) {
        console.log("Error fetching user rating:", error);
      }
    };

    fetchUserRating();
  }, [params?.id, user?.id, ratingsKey]);

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
  const handleRatingSubmitSuccess = () => {
    setRatingsKey(prev => prev + 1); // Force refetch of ratings and user rating
  };

  // Fetch AI/scraper ratings
  useEffect(() => {
    if (!tmbdID && !data?.vote_average) return;

    const fetchTosRating = async () => {
      try {
        const response = await axios.get(
          `http://localhost:3000/scraper/analyze/${tmbdID}`
        );
        setAIRatings(response?.data);
      } catch (error) {
        console.log("Rating fetch error, using fallback:", error);
        if (data?.vote_average) {
          setAIRatings(generateFallbackRatings(data.vote_average));
        }
      }
    };

    fetchTosRating();
  }, [tmbdID, data?.vote_average]);

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

        if (params?.explore === "movie") {
          response = await axios.get(`/movie/${params?.id}`);
        } else if (params?.explore === "tv") {
          response = await axios.get(`/tv/${params?.id}/external_ids`);
        }

        const imdbId = response?.data?.imdb_id;
        setTmbdID(imdbId);
      } catch (error) {
        console.log(error);
      }
    };

    fetchID();
  }, [data, params?.explore]);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Hero Backdrop - Extended height */}
      <div className="relative h-[55vh] md:h-[65vh] lg:h-[75vh]">
        <div className="absolute inset-0">
          {data?.backdrop_path && (
            <img
              src={imageURL + data?.backdrop_path}
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
        <Link
          to="/"
          className="absolute top-24 left-6 z-10 flex items-center gap-2 text-white/70 hover:text-white transition-colors"
        >
          <IoArrowBack className="text-xl" />
          <span className="text-sm font-medium">Back</span>
        </Link>
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
                  src={imageURL + data?.poster_path}
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
                <VibeChart genres={data.genres} compact={true} />
              </div>
            )}

            {/* Movie Action Buttons - Watchlist, Watched, Like, Save */}
            {data && (
              <MovieActionButtons
                movieId={params?.id}
                movieTitle={data?.title || data?.name}
                posterPath={data?.poster_path}
                mediaType={params?.explore}
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

            {/* Parent Guide Badges - Fetches real TMDB certifications */}
            <ParentGuide
              movieId={params?.id}
              mediaType={params?.explore}
              genres={data?.genres}
            />

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
                <VibeChart genres={data.genres} />
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
                          src={imageURL + actor.profile_path}
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
              movieId={params?.id}
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
          media_type={params?.explore}
        />
      )}

      {/* Rating Modal */}
      <RatingModal
        isOpen={ratingModalOpen}
        onClose={() => setRatingModalOpen(false)}
        movieId={params?.id}
        movieTitle={data?.title || data?.name}
        onSubmitSuccess={handleRatingSubmitSuccess}
        existingRating={userRating}
        userId={user?.id}
      />
    </div>
  );
};

export default Details;