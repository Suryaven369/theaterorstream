import React from "react";
import { useSelector } from "react-redux";
import moment from "moment";
import { Link } from "react-router-dom";
import { FaStar } from "react-icons/fa";

const Card = ({ data, trending, index, media_type }) => {
  const imageURL = useSelector((state) => state.movieData.imageURL);
  const mediaType = data.media_type ?? media_type;

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

        {/* Rating badge - always visible */}
        <div className="absolute top-2 right-2">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-xs font-medium text-yellow-400">
            <FaStar className="text-[10px]" />
            {Number(data.vote_average).toFixed(1)}
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
