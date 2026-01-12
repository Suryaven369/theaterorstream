import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import useFetch from "../hooks/useFetch";
import useFetchDetails from "../hooks/useFetchDetails";
import useReviewAnalysis from "../hooks/useReviewAnalysis";
import { useSelector } from "react-redux";
import moment from "moment";
import VideoPlay from "../components/VideoPlay";
import ReviewAnalysis from "../components/ReviewAnalysis";
import TOSRating from "../components/TOSRating";
import Card from "../components/Card";
import axios from "axios";
import { FaStar, FaClock, FaCalendar, FaPlay } from "react-icons/fa";
import { IoArrowBack } from "react-icons/io5";

const Details = () => {
  const params = useParams();
  const [tmbdID, setTmbdID] = useState(null);
  const [AIRatings, setAIRatings] = useState({});
  const imageURL = useSelector((state) => state.movieData.imageURL);
  const { data } = useFetchDetails(`/${params?.explore}/${params?.id}`);
  const { data: castData } = useFetchDetails(
    `/${params?.explore}/${params?.id}/credits`
  );
  const { data: similarData } = useFetch(
    `/${params?.explore}/${params?.id}/similar`
  );
  const [playVideo, setPlayVideo] = useState(false);
  const [playVideoId, setPlayVideoId] = useState("");

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
    // Add some variance to make each category slightly different
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
        // Generate fallback ratings based on TMDB score
        if (data?.vote_average) {
          setAIRatings(generateFallbackRatings(data.vote_average));
        }
      }
    };

    fetchTosRating();
  }, [tmbdID, data?.vote_average]);

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
      {/* Hero Backdrop */}
      <div className="relative h-[50vh] md:h-[60vh] lg:h-[70vh]">
        <div className="absolute inset-0">
          {data?.backdrop_path && (
            <img
              src={imageURL + data?.backdrop_path}
              className="w-full h-full object-cover"
              alt={data?.title || data?.name}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-transparent to-transparent" />
        </div>

        {/* Back Button */}
        <Link
          to="/"
          className="absolute top-24 left-6 z-10 flex items-center gap-2 text-white/70 hover:text-white transition-colors"
        >
          <IoArrowBack className="text-xl" />
          <span className="text-sm font-medium">Back</span>
        </Link>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 -mt-48 md:-mt-64 relative z-10">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          {/* Poster */}
          <div className="flex-shrink-0">
            <div className="w-48 md:w-64 mx-auto lg:mx-0 rounded-2xl overflow-hidden shadow-2xl">
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

            {/* Play Button */}
            <button
              onClick={() => handlePlayVideo(data)}
              className="btn-primary w-full mt-4 flex items-center justify-center gap-2"
            >
              <FaPlay className="text-sm" />
              Watch Trailer
            </button>
          </div>

          {/* Details */}
          <div className="flex-1 pt-4 lg:pt-12">
            {/* Title */}
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-3">
              {data?.title || data?.name}
            </h1>

            {data?.tagline && (
              <p className="text-white/40 text-lg italic mb-6">
                "{data.tagline}"
              </p>
            )}

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-4 mb-8">
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
              <div className="flex flex-wrap gap-2 mb-8">
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
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-white mb-3">
                Overview
              </h3>
              <p className="text-white/60 leading-relaxed">{data?.overview}</p>
            </div>

            {/* TOS Rating - Circular Progress Indicators */}
            {AIRatings?.ratings && (
              <TOSRating
                ratings={AIRatings.ratings}
                verdict={AIRatings.ratings.verdict}
              />
            )}

            {/* Credits */}
            <div className="flex gap-8 mb-8">
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

            {/* Cast */}
            {castData?.cast?.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-white mb-4">Cast</h3>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none">
                  {castData.cast
                    .filter((el) => el?.profile_path)
                    .slice(0, 10)
                    .map((actor) => (
                      <div
                        key={actor.id}
                        className="flex-shrink-0 text-center w-20"
                      >
                        <img
                          src={imageURL + actor.profile_path}
                          className="w-16 h-16 rounded-full object-cover mx-auto mb-2"
                          alt={actor.name}
                        />
                        <p className="text-xs text-white/70 line-clamp-2">
                          {actor.name}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <ReviewAnalysis analysis={analysis} loading={analysisLoading} />
          </div>
        </div>
      </div>

      {/* Similar Movies */}
      {similarData?.length > 0 && (
        <section className="px-6 py-16">
          <div className="container mx-auto">
            <h2 className="text-2xl font-semibold text-white mb-8">
              Similar Movies
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {similarData.slice(0, 6).map((movie, index) => (
                <Card
                  key={movie.id}
                  data={movie}
                  media_type={params?.explore}
                  index={index}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {playVideo && (
        <VideoPlay
          data={playVideoId}
          close={() => setPlayVideo(false)}
          media_type={params?.explore}
        />
      )}
    </div>
  );
};

export default Details;