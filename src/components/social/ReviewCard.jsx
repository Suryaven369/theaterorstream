import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaHeart, FaComment, FaBookmark } from 'react-icons/fa';
import { generateSlugWithId } from '../../lib/slugUtils';
import { toggleReviewLike } from '../../lib/socialReviews';
import { ShareButton } from '../ShareMovie';
import { getAvatarUrl } from '../../lib/storagePublicUrl';

function posterUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `https://image.tmdb.org/t/p/w154${path}`;
}

export default function ReviewCard({ review, profile, onLike, compact = false }) {
    const [likes, setLikes] = useState(review.likes_count || 0);
    const [liked, setLiked] = useState(false);
    const [liking, setLiking] = useState(false);

    const username = profile?.username || review.profile?.username;
    const slug = generateSlugWithId(review.movie_title, review.tmdb_id, '');
    const movieUrl = review.media_type === 'tv' ? `/tv/${slug}` : `/movies/${slug}`;

    const reviewShare = review.content?.trim() ? {
        text: review.content.trim(),
        headline: review.title || null,
        authorDisplayName: profile?.display_name || review.profile?.display_name || username,
        authorUsername: username,
        avatarUrl: getAvatarUrl(profile?.avatar_url || review.profile?.avatar_url, 256),
    } : null;

    const handleLike = async () => {
        if (liking) return;
        setLiking(true);
        const res = await toggleReviewLike(review.id);
        if (res.ok) {
            setLiked(res.liked);
            setLikes((n) => (res.liked ? n + 1 : Math.max(0, n - 1)));
            onLike?.(review.id, res.liked);
        }
        setLiking(false);
    };

    if (compact) {
        return (
            <article className="inline-flex flex-col items-start gap-1.5 py-2 rounded-md max-w-full w-full hover:bg-white/[0.04] transition-colors px-0.5">
                <div className="flex items-start gap-2.5 w-full min-w-0">
                    {review.poster_path && (
                        <Link to={movieUrl} className="shrink-0">
                            <img
                                src={posterUrl(review.poster_path)}
                                alt=""
                                className="w-9 h-[52px] object-cover rounded border border-white/10"
                            />
                        </Link>
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug">
                            {username ? (
                                <Link to={`/${username}/profile`} className="font-semibold text-[var(--primary)] hover:underline mr-1">
                                    @{username}
                                </Link>
                            ) : null}
                            <span className="text-white/45">Reviewed </span>
                            <Link to={movieUrl} className="font-medium text-white hover:text-[var(--accent-green)]">
                                {review.movie_title}
                            </Link>
                        </p>
                        {review.title && (
                            <p className="text-sm font-medium text-white/90 mt-0.5">{review.title}</p>
                        )}
                        <p className={`text-xs text-white/55 mt-1 line-clamp-2 ${review.spoiler ? 'blur-sm hover:blur-none transition' : ''}`}>
                            {review.content?.length > 200 ? `${review.content.slice(0, 200)}…` : review.content}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5">
                            <time className="text-[11px] text-white/35">
                                {new Date(review.created_at).toLocaleDateString()}
                            </time>
                            <button
                                type="button"
                                onClick={handleLike}
                                disabled={liking}
                                className={`flex items-center gap-1 text-[11px] transition-colors ${liked ? 'text-rose-400' : 'text-white/40 hover:text-rose-400'}`}
                            >
                                <FaHeart className="text-[10px]" />
                                {likes}
                            </button>
                        </div>
                    </div>
                </div>
            </article>
        );
    }

    return (
        <article className="review-card">
            <div className="flex items-center gap-2 mb-3">
                {username ? (
                    <Link to={`/${username}/profile`} className="font-semibold text-[var(--primary)] hover:underline text-sm">
                        @{username}
                    </Link>
                ) : (
                    <span className="text-sm text-white/50">Cinephile</span>
                )}
                <span className="text-white/30 text-xs">·</span>
                <time className="text-xs text-[var(--text-muted)]">
                    {new Date(review.created_at).toLocaleDateString()}
                </time>
            </div>

            <div className="flex gap-3">
                {review.poster_path && (
                    <Link to={movieUrl} className="shrink-0">
                        <img
                            src={posterUrl(review.poster_path)}
                            alt=""
                            className="w-14 h-20 object-cover rounded-md border border-[var(--border-color)]"
                        />
                    </Link>
                )}
                <div className="min-w-0 flex-1">
                    <Link to={movieUrl} className="text-xs text-[var(--accent-green)] hover:underline block mb-1">
                        {review.movie_title}
                    </Link>
                    <h3 className="font-semibold text-white text-sm mb-1">{review.title}</h3>
                    <p className={`text-sm text-[var(--text-secondary)] leading-relaxed ${review.spoiler ? 'blur-sm hover:blur-none transition' : ''}`}>
                        {review.content?.length > 280 ? `${review.content.slice(0, 280)}…` : review.content}
                    </p>
                    {review.spoiler && (
                        <span className="text-[10px] text-amber-400/80 mt-1 inline-block">Spoiler — hover to reveal</span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[var(--border-color)]">
                <button
                    type="button"
                    onClick={handleLike}
                    disabled={liking}
                    className={`flex items-center gap-1.5 text-xs transition-colors ${liked ? 'text-rose-400' : 'text-[var(--text-muted)] hover:text-rose-400'}`}
                >
                    <FaHeart />
                    {likes}
                </button>
                <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <FaComment />
                    {review.comments_count || 0}
                </span>
                {reviewShare && (
                    <div className="ml-auto min-w-0 flex-1 max-w-[200px]">
                        <ShareButton
                            className="!w-full !py-2 !px-3 !rounded-xl !text-xs"
                            movieTitle={review.movie_title}
                            movieYear={null}
                            posterUrl={review.poster_path}
                            mediaType={review.media_type || 'movie'}
                            reviewShare={reviewShare}
                        />
                    </div>
                )}
                {!reviewShare && (
                    <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] ml-auto">
                        <FaBookmark />
                        Save
                    </span>
                )}
            </div>
        </article>
    );
}
