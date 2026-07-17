import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import moment from "moment";
import { Link } from "react-router-dom";
import { generateSlugWithId } from "../lib/slugUtils";
import { pickBestPosterPath, resolveTmdbImageUrl } from "../utils/imageHelper";
import { formatHotTagLabel } from "../utils/hotContentTags";
import PosterQuickActions from "./PosterQuickActions";

const POSTER_SIZE = 'w500';

const Card = ({ data, trending, index, media_type }) => {
  const userRatedMovieIds = useSelector((state) => state.movieData.userRatedMovieIds);
  const mediaType = data.media_type ?? media_type;

  const movieId = String(data.id ?? data.tmdb_id ?? "");

  // Generate SEO-friendly slug URL
  const movieUrl = useMemo(() => {
    const title = data?.title || data?.name || '';
    const year = data?.release_date?.split('-')[0] || data?.first_air_date?.split('-')[0];
    const slug = generateSlugWithId(title, data.id, year);
    const basePath = mediaType === 'tv' ? '/tv' : '/movies';
    return `${basePath}/${slug}`;
  }, [data, mediaType]);

  // Prefer TOS when present (section cache or user's own rating); else TMDB
  const userRated = userRatedMovieIds[movieId];
  const tosScore = data.tos_rating?.score ?? userRated?.score;
  const displayRating = Number(tosScore ?? data.vote_average ?? 0);

  const posterPath = pickBestPosterPath(data);

  // Construct image source with proper fallbacks
  const imageSrc = resolveTmdbImageUrl(posterPath, { size: POSTER_SIZE })
    || (data.images?.poster_base64?.startsWith('data:image') ? data.images.poster_base64 : null);

  return (
    <Link
      to={movieUrl}
      className="group relative block animate-fadeInUp hover:z-40 focus-within:z-50"
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
    >
      <div className="relative overflow-hidden rounded-xl bg-white/5 card-hover">
        {/* Image */}
        <div className="aspect-[2/3] overflow-hidden">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={data?.title || data?.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
              onError={(e) => {
                // Hide broken images gracefully
                e.target.style.display = 'none';
                e.target.nextSibling?.classList?.remove('hidden');
              }}
            />
          ) : null}
          <div className={`w-full h-full flex items-center justify-center text-white/20 text-xs bg-gradient-to-br from-gray-800 to-gray-900 ${imageSrc ? 'hidden absolute inset-0' : ''}`}>
            🎬
          </div>
        </div>

        {/* Rating badge — yellow number only (TOS if available, else TMDB) */}
        {displayRating > 0 && (
          <div className="absolute top-2 right-2 z-10">
            <span
              className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-xs font-medium text-yellow-400"
              title={tosScore != null ? 'TOS Rating' : 'TMDB Rating'}
            >
              {displayRating.toFixed(1)}
            </span>
          </div>
        )}

        {/* Trending badge */}
        {trending && (
          <div className="absolute top-2 left-2 z-10">
            <span className="px-2 py-0.5 rounded-md bg-gradient-to-r from-orange-500 to-red-500 text-black text-xs font-bold">
              #{index + 1}
            </span>
          </div>
        )}

        {/* Content tags — sit above the action bar */}
        {data.hot_tags?.length > 0 && (
          <div className="absolute left-2 right-2 bottom-12 z-10 flex flex-wrap gap-1">
            {data.hot_tags.map((tag) => (
              <span
                key={tag}
                className={`px-1.5 py-0.5 rounded text-[9px] font-medium backdrop-blur-sm ${
                  tag === 'announcement'
                    ? 'bg-[var(--color-theater)]/90 text-[var(--color-background)]'
                    : 'bg-black/75 text-white/90'
                }`}
              >
                {formatHotTagLabel(tag)}
              </span>
            ))}
          </div>
        )}

        {/* Always available on mobile; fade in on desktop hover */}
        <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <PosterQuickActions
            movieId={movieId}
            movieTitle={data?.title || data?.name}
            posterPath={posterPath || data.poster_path}
            mediaType={mediaType}
          />
        </div>
      </div>

      {/* Title and year below card */}
      <div className="mt-2 px-0.5">
        <h3 className="text-sm font-medium text-white group-hover:text-yellow-400 transition-colors line-clamp-1">
          {data?.title || data?.name}
        </h3>
        <p className="text-xs text-white/40 mt-0.5">
          {moment(data.release_date || data.first_air_date).format("YYYY")}
          {data.media_type === "tv" && " • Series"}
        </p>
      </div>
    </Link>
  );
};

export default Card;
