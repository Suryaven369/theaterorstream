import React from "react";
import { Link } from "react-router-dom";
import { parseMentions } from "../lib/movieMentions";
import { splitTextWithHashtags } from "../lib/hashtags";
import { generateSlugWithId } from "../lib/slugUtils";
import { resolveTmdbImageUrl } from "../utils/imageHelper";

const TMDB_SIZE = { sm: "w92", md: "w185", lg: "w342" };
const POSTER_CLASS = { sm: "w-5 h-7", md: "w-10 h-14", lg: "w-20 h-28" };

function renderTextWithHashtags(text, keyPrefix) {
  return splitTextWithHashtags(text).map((part, j) => {
    if (part.type === "hashtag") {
      return (
        <Link
          key={`${keyPrefix}-h-${j}`}
          to={`/tag/${part.slug}`}
          className="font-medium text-orange-400 hover:text-orange-300"
          onClick={(e) => e.stopPropagation()}
        >
          #{part.displayName}
        </Link>
      );
    }
    return (
      <span key={`${keyPrefix}-t-${j}`} className="whitespace-pre-wrap break-words">
        {part.value}
      </span>
    );
  });
}

/**
 * Renders post/blog content with movie/@ mentions and clickable #hashtags.
 */
const MovieMentionText = ({ content, className = "" }) => {
  const segments = parseMentions(content);

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return (
            <React.Fragment key={i}>
              {renderTextWithHashtags(seg.value, i)}
            </React.Fragment>
          );
        }

        if (seg.type === "user") {
          return (
            <Link key={i} to={`/${seg.username}/profile`} className="font-medium text-violet-400 hover:text-violet-300">
              @{seg.displayName}
            </Link>
          );
        }

        if (seg.type === "person") {
          return (
            <Link key={i} to={`/search?q=${encodeURIComponent(seg.name)}`} className="inline-flex items-center gap-1 font-medium text-sky-400 hover:text-sky-300">
              🎭 {seg.name}
            </Link>
          );
        }

        const slug = generateSlugWithId(seg.title, seg.tmdbId, seg.year);
        const url = seg.mediaType === "tv" ? `/tv/${slug}` : `/movies/${slug}`;
        const showPoster = seg.size !== "none" && seg.posterPath;
        const isLarge = seg.size === "lg";

        if (isLarge && showPoster) {
          return (
            <Link
              key={i}
              to={url}
              className="block my-2 w-fit max-w-xs rounded-xl overflow-hidden bg-white/5 border border-white/10 hover:border-orange-500/50 transition-colors"
            >
              <img
                src={resolveTmdbImageUrl(seg.posterPath, { size: TMDB_SIZE.lg })}
                alt={seg.title}
                className="w-full aspect-[2/3] object-cover"
              />
              <p className="px-2.5 py-2 text-sm font-medium text-orange-400 truncate">{seg.title}</p>
            </Link>
          );
        }

        return (
          <Link
            key={i}
            to={url}
            className="inline-flex items-center gap-1.5 mx-0.5 my-0.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:border-orange-500/50 align-middle transition-colors"
          >
            {showPoster && (
              <img
                src={resolveTmdbImageUrl(seg.posterPath, { size: TMDB_SIZE[seg.size] || TMDB_SIZE.sm })}
                alt={seg.title}
                className={`${POSTER_CLASS[seg.size] || POSTER_CLASS.sm} object-cover rounded shrink-0`}
              />
            )}
            <span className="text-sm font-medium text-orange-400">{seg.title}</span>
          </Link>
        );
      })}
    </span>
  );
};

export default MovieMentionText;
