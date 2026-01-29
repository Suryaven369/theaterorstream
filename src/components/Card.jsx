import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import moment from "moment";
import { Link } from "react-router-dom";
import { FaStar } from "react-icons/fa";
import { getMovieRatings } from "../lib/supabase";

const Card = ({ data, trending, index, media_type }) => {
  const imageURL = useSelector((state) => state.movieData.imageURL);
  const mediaType = data.media_type ?? media_type;
  const [tosRating, setTosRating] = useState(null);

  // Fetch TOS community rating from Supabase
  useEffect(() => {
    const fetchTosRating = async () => {
      if (!data?.id) return;

      try {
        const ratings = await getMovieRatings(data.id.toString());
        if (ratings && ratings.totalRatings > 0) {
          // Calculate average from all categories
          const categories = ['acting', 'screenplay', 'sound', 'direction', 'entertainment', 'pacing', 'cinematography'];
          const validRatings = categories.filter(cat => ratings[cat] !== null && ratings[cat] !== undefined);
          if (validRatings.length > 0) {
            const avg = validRatings.reduce((sum, cat) => sum + ratings[cat], 0) / validRatings.length;
            setTosRating({
              score: avg,
              count: ratings.totalRatings
            });
          }
        }
      } catch (error) {
        // Silently fail, will use TMDB rating
      }
    };

    fetchTosRating();
  }, [data?.id]);

  // Determine which rating to display
  const displayRating = tosRating ? tosRating.score : (data.vote_average || 0);
  const isTosRating = tosRating !== null;

  return (
    <Link
      to={"/" + mediaType + "/" + data.id}
      className="group block animate-fadeInUp"
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
    >
      <div className="relative overflow-hidden rounded-xl bg-white/5 card-hover">
        {/* Image */}
        <div className="aspect-[2/3] overflow-hidden">
          {data?.poster_path ? (
            <img
              src={imageURL + data?.poster_path}
              alt={data?.title || data?.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
              No image
            </div>
          )}
        </div>

        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Rating badge - TOS or TMDB */}
        <div className="absolute top-2 right-2">
          <span
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md backdrop-blur-sm text-xs font-medium ${isTosRating
                ? 'bg-gradient-to-r from-orange-500/80 to-red-500/80 text-white'
                : 'bg-black/60 text-yellow-400'
              }`}
            title={isTosRating ? `TOS Rating (${tosRating.count} votes)` : 'TMDB Rating'}
          >
            {isTosRating ? (
              <>
                <span className="text-[8px] font-bold">TOS</span>
                {displayRating.toFixed(1)}
              </>
            ) : (
              <>
                <FaStar className="text-[10px]" />
                {Number(displayRating).toFixed(1)}
              </>
            )}
          </span>
        </div>

        {/* Trending badge */}
        {trending && (
          <div className="absolute top-2 left-2">
            <span className="px-2 py-0.5 rounded-md bg-gradient-to-r from-orange-500 to-red-500 text-black text-xs font-bold">
              #{index + 1}
            </span>
          </div>
        )}

        {/* Hover overlay with details */}
        <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          <p className="text-[11px] text-white/70 line-clamp-2 leading-relaxed">
            {data.overview || "No description available"}
          </p>
        </div>
      </div>

      {/* Title and year below card */}
      <div className="mt-2 px-0.5">
        <h3 className="text-sm font-medium text-white group-hover:text-yellow-400 transition-colors line-clamp-1">
          {data?.title || data?.name}
        </h3>
        <p className="text-xs text-white/40 mt-0.5">
          {moment(data.release_date || data.first_air_date).format("YYYY")}
          {data.media_type === "tv" && " • TV"}
        </p>
      </div>
    </Link>
  );
};

export default Card;
