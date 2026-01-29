import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowUp, FaArrowDown, FaStar, FaUser, FaClock, FaReply, FaTimes } from "react-icons/fa";
import {
    getMovieReviews,
    getMovieRatings,
    submitRating,
    submitReview,
    upvoteReview,
    downvoteReview,
    removeUpvoteReview
} from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

// Reddit-style rating slider
const RatingSlider = ({ label, value, onChange, color = "#22c55e" }) => {
    const getEmoji = (val) => {
        if (val >= 9) return "🤩";
        if (val >= 7) return "😊";
        if (val >= 5) return "😐";
        if (val >= 3) return "😕";
        return "😢";
    };

    return (
        <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white/80">{label}</span>
                <div className="flex items-center gap-2">
                    <span className="text-lg">{getEmoji(value)}</span>
                    <span className="text-sm font-bold" style={{ color }}>{value.toFixed(1)}</span>
                </div>
            </div>
            <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                    background: `linear-gradient(to right, ${color} 0%, ${color} ${value * 10}%, rgba(255,255,255,0.1) ${value * 10}%, rgba(255,255,255,0.1) 100%)`
                }}
            />
        </div>
    );
};

// Time ago helper
function getTimeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
}

// Reply Input Component
const ReplyInput = ({ onSubmit, onCancel, isSubmitting }) => {
    const [replyText, setReplyText] = useState('');
    const [username, setUsername] = useState('');

    const handleSubmit = () => {
        if (replyText.trim()) {
            onSubmit(replyText, username || 'Anonymous');
            setReplyText('');
            setUsername('');
        }
    };

    return (
        <div className="mt-3 ml-8 p-3 rounded-lg bg-white/[0.03] border border-white/10">
            <input
                type="text"
                placeholder="Your name (optional)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 border border-white/10 focus:border-blue-500/50 focus:outline-none mb-2"
            />
            <textarea
                placeholder="Write a reply..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={2}
                className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 border border-white/10 focus:border-blue-500/50 focus:outline-none resize-none"
                autoFocus
            />
            <div className="flex justify-end gap-2 mt-2">
                <button
                    onClick={onCancel}
                    className="px-3 py-1.5 text-sm text-white/50 hover:text-white transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={!replyText.trim() || isSubmitting}
                    className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? '...' : 'Reply'}
                </button>
            </div>
        </div>
    );
};

// Reddit-style review card with threading support
const ReviewCard = ({ review, replies = [], onUpvote, onDownvote, onReply, depth = 0, isAuthenticated, onAuthRequired }) => {
    const [voted, setVoted] = useState(null);
    const [showReplyInput, setShowReplyInput] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const score = (review.upvotes || 0) - (review.downvotes || 0);

    const handleUpvote = async () => {
        if (voted === 'up') return;
        await onUpvote(review.id);
        setVoted('up');
    };

    const handleDownvote = async () => {
        if (voted === 'down') return;
        await onDownvote(review.id);
        setVoted('down');
    };

    const handleReplyClick = () => {
        if (!isAuthenticated) {
            onAuthRequired();
            return;
        }
        setShowReplyInput(!showReplyInput);
    };

    const handleReplySubmit = async (text, username) => {
        setIsSubmitting(true);
        await onReply(review.id, text, username);
        setIsSubmitting(false);
        setShowReplyInput(false);
    };

    // Limit nesting depth visually
    const maxDepth = 4;
    const effectiveDepth = Math.min(depth, maxDepth);
    const borderColors = ['border-l-blue-500', 'border-l-green-500', 'border-l-purple-500', 'border-l-orange-500', 'border-l-pink-500'];

    return (
        <div className={`${depth > 0 ? `ml-4 pl-3 border-l-2 ${borderColors[effectiveDepth % borderColors.length]}` : ''}`}>
            <div className="flex gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-all">
                {/* Vote buttons */}
                <div className="flex flex-col items-center gap-0.5">
                    <button
                        onClick={handleUpvote}
                        className={`p-1 rounded transition-all ${voted === 'up'
                            ? 'text-orange-500 bg-orange-500/20'
                            : 'text-white/30 hover:text-orange-500 hover:bg-orange-500/10'
                            }`}
                    >
                        <FaArrowUp className="text-xs" />
                    </button>
                    <span className={`text-xs font-bold ${score > 0 ? 'text-orange-500' : score < 0 ? 'text-blue-500' : 'text-white/40'}`}>
                        {score}
                    </span>
                    <button
                        onClick={handleDownvote}
                        className={`p-1 rounded transition-all ${voted === 'down'
                            ? 'text-blue-500 bg-blue-500/20'
                            : 'text-white/30 hover:text-blue-500 hover:bg-blue-500/10'
                            }`}
                    >
                        <FaArrowDown className="text-xs" />
                    </button>
                </div>

                {/* Review content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <FaUser className="text-[8px] text-white" />
                        </div>
                        <span className="text-xs font-medium text-white">{review.username || 'Anonymous'}</span>
                        <span className="text-white/20">•</span>
                        <span className="text-[10px] text-white/40 flex items-center gap-1">
                            <FaClock className="text-[8px]" /> {getTimeAgo(review.created_at)}
                        </span>
                    </div>
                    <p className="text-sm text-white/70 leading-relaxed mb-2">{review.review_text}</p>

                    {/* Reply button */}
                    <button
                        onClick={handleReplyClick}
                        className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/70 transition-colors"
                    >
                        <FaReply />
                        Reply
                    </button>
                </div>
            </div>

            {/* Reply Input */}
            {showReplyInput && (
                <ReplyInput
                    onSubmit={handleReplySubmit}
                    onCancel={() => setShowReplyInput(false)}
                    isSubmitting={isSubmitting}
                />
            )}

            {/* Nested Replies */}
            {replies.length > 0 && (
                <div className="mt-2">
                    {replies.map(reply => (
                        <ReviewCard
                            key={reply.id}
                            review={reply}
                            replies={reply.replies || []}
                            onUpvote={onUpvote}
                            onDownvote={onDownvote}
                            onReply={onReply}
                            depth={depth + 1}
                            isAuthenticated={isAuthenticated}
                            onAuthRequired={onAuthRequired}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// Rating Modal Component
export const RatingModal = ({ isOpen, onClose, movieId, movieTitle, onSubmitSuccess, existingRating, userId }) => {
    const [submitting, setSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    // Initialize with existing rating or defaults
    const getInitialRatings = () => {
        if (existingRating) {
            return {
                acting: existingRating.acting || 5,
                screenplay: existingRating.screenplay || 5,
                sound: existingRating.sound || 5,
                direction: existingRating.direction || 5,
                entertainment: existingRating.entertainment || 5,
                pacing: existingRating.pacing || 5,
                cinematography: existingRating.cinematography || 5
            };
        }
        return {
            acting: 5,
            screenplay: 5,
            sound: 5,
            direction: 5,
            entertainment: 5,
            pacing: 5,
            cinematography: 5
        };
    };

    const [userRatings, setUserRatings] = useState(getInitialRatings);

    // Reset ratings when modal opens or existingRating changes
    useEffect(() => {
        if (isOpen) {
            setUserRatings(getInitialRatings());
            setShowSuccess(false);
        }
    }, [isOpen, existingRating]);

    const isUpdating = !!existingRating;

    const ratingCategories = [
        { key: "acting", label: "Acting", color: "#22c55e" },
        { key: "screenplay", label: "Screenplay", color: "#3b82f6" },
        { key: "sound", label: "Sound", color: "#a855f7" },
        { key: "direction", label: "Direction", color: "#f97316" },
        { key: "entertainment", label: "Entertainment", color: "#ec4899" },
        { key: "pacing", label: "Pacing", color: "#06b6d4" },
        { key: "cinematography", label: "Cinematography", color: "#f59e0b" },
    ];

    const userOverall = Object.values(userRatings).reduce((a, b) => a + b, 0) / Object.keys(userRatings).length;

    const handleSubmit = async () => {
        setSubmitting(true);

        const ratingResult = await submitRating(movieId, movieTitle, userRatings, userId || 'anonymous');

        if (ratingResult.success) {
            setShowSuccess(true);
            setTimeout(() => {
                setShowSuccess(false);
                onClose();
                onSubmitSuccess?.();
            }, 1500);
        }

        setSubmitting(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-[#1a1a1a] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-white/10">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10 sticky top-0 bg-[#1a1a1a] z-10">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isUpdating
                            ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                            : 'bg-gradient-to-br from-orange-500 to-red-500'
                            }`}>
                            <FaStar className="text-white text-sm" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">
                                {isUpdating ? 'Update Your Rating' : 'Rate This Movie'}
                            </h3>
                            <p className="text-xs text-white/40">{movieTitle}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    >
                        <FaTimes />
                    </button>
                </div>

                {showSuccess && (
                    <div className="p-4 m-4 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center gap-2">
                        <span className="text-green-400">✓</span>
                        <span className="text-sm text-green-400">Rating submitted successfully!</span>
                    </div>
                )}

                <div className="p-4">
                    {/* Overall Score Display */}
                    <div className="text-center mb-6">
                        <div className="inline-flex flex-col items-center">
                            <span className="text-5xl font-bold text-orange-400">{userOverall.toFixed(1)}</span>
                            <span className="text-white/40 text-sm">Your Overall Rating</span>
                        </div>
                    </div>

                    {/* Rating Sliders */}
                    <div className="mb-6">
                        <p className="text-sm text-white/60 mb-4">Rate each category:</p>
                        <div className="grid md:grid-cols-2 gap-x-6">
                            {ratingCategories.map((cat) => (
                                <RatingSlider
                                    key={cat.key}
                                    label={cat.label}
                                    value={userRatings[cat.key]}
                                    onChange={(val) => setUserRatings(prev => ({ ...prev, [cat.key]: val }))}
                                    color={cat.color}
                                />
                            ))}
                        </div>
                    </div>



                    {/* Submit Button */}
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className={`w-full py-3 rounded-xl text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${isUpdating
                            ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
                            : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600'
                            }`}
                    >
                        {submitting ? (
                            <span className="animate-spin">⏳</span>
                        ) : (
                            <>
                                <FaStar /> {isUpdating ? 'Update Rating' : 'Submit Rating'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Build thread hierarchy from flat array
const buildThreads = (reviews) => {
    const reviewMap = {};
    const rootReviews = [];

    // Create a map of all reviews
    reviews.forEach(review => {
        reviewMap[review.id] = { ...review, replies: [] };
    });

    // Build the hierarchy
    reviews.forEach(review => {
        if (review.parent_id && reviewMap[review.parent_id]) {
            reviewMap[review.parent_id].replies.push(reviewMap[review.id]);
        } else if (!review.parent_id) {
            rootReviews.push(reviewMap[review.id]);
        }
    });

    // Sort root reviews by score (upvotes - downvotes)
    rootReviews.sort((a, b) => {
        const scoreA = (a.upvotes || 0) - (a.downvotes || 0);
        const scoreB = (b.upvotes || 0) - (b.downvotes || 0);
        return scoreB - scoreA;
    });

    return rootReviews;
};

// Reviews List Component with threaded replies
export const ReviewsList = ({ movieId, movieTitle, onRateClick, hasUserRated }) => {
    const navigate = useNavigate();
    const { isAuthenticated, profile } = useAuth();
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [communityRatings, setCommunityRatings] = useState(null);

    // Review input state
    const [reviewText, setReviewText] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);

    // Like and reply state
    const [likedReviews, setLikedReviews] = useState(new Set());
    const [replyingTo, setReplyingTo] = useState(null);
    const [replyText, setReplyText] = useState('');
    const [submittingReply, setSubmittingReply] = useState(false);

    const handleAuthRequired = () => {
        sessionStorage.setItem('authMessage', 'Please sign up or login to rate and review movies');
        navigate('/auth');
    };

    const handleRateClick = () => {
        if (!isAuthenticated) {
            handleAuthRequired();
            return;
        }
        onRateClick();
    };

    useEffect(() => {
        fetchData();
    }, [movieId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [reviewsData, ratingsData] = await Promise.all([
                getMovieReviews(movieId),
                getMovieRatings(movieId)
            ]);
            setReviews(reviewsData);
            setCommunityRatings(ratingsData);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
        setLoading(false);
    };

    // Optimistic like toggle (like/unlike)
    const handleLike = async (reviewId) => {
        if (!isAuthenticated) {
            handleAuthRequired();
            return;
        }

        const isCurrentlyLiked = likedReviews.has(reviewId);

        if (isCurrentlyLiked) {
            // Unlike - remove from liked set and decrement
            setLikedReviews(prev => {
                const newSet = new Set(prev);
                newSet.delete(reviewId);
                return newSet;
            });
            setReviews(prev => prev.map(r =>
                r.id === reviewId ? { ...r, upvotes: Math.max(0, (r.upvotes || 0) - 1) } : r
            ));
            // API call in background
            await removeUpvoteReview(reviewId);
        } else {
            // Like - add to liked set and increment
            setLikedReviews(prev => new Set([...prev, reviewId]));
            setReviews(prev => prev.map(r =>
                r.id === reviewId ? { ...r, upvotes: (r.upvotes || 0) + 1 } : r
            ));
            // API call in background
            await upvoteReview(reviewId);
        }
    };

    // Toggle reply input
    const handleReplyClick = (reviewId) => {
        if (!isAuthenticated) {
            handleAuthRequired();
            return;
        }
        setReplyingTo(replyingTo === reviewId ? null : reviewId);
        setReplyText('');
    };

    // Submit reply with optimistic update
    const handleSubmitReply = async (parentId) => {
        if (!replyText.trim()) return;

        setSubmittingReply(true);
        const displayName = profile?.username || profile?.display_name || 'Anonymous';

        // Optimistic update - add reply immediately
        const newReply = {
            id: `temp-${Date.now()}`,
            review_text: replyText,
            username: displayName,
            created_at: new Date().toISOString(),
            parent_id: parentId
        };

        setReviews(prev => [...prev, newReply]);
        setReplyText('');
        setReplyingTo(null);

        // API call
        await submitReview(movieId, movieTitle, replyText, 'anonymous', displayName, parentId);
        setSubmittingReply(false);

        // Refresh to get real ID
        fetchData();
    };

    // Submit new review with optimistic update
    const handleSubmitReview = async () => {
        if (!isAuthenticated) {
            handleAuthRequired();
            return;
        }

        if (!reviewText.trim()) return;

        setSubmittingReview(true);
        const displayName = profile?.username || profile?.display_name || 'Anonymous';

        // Optimistic update
        const newReview = {
            id: `temp-${Date.now()}`,
            review_text: reviewText,
            username: displayName,
            created_at: new Date().toISOString(),
            upvotes: 0,
            downvotes: 0,
            parent_id: null
        };

        setReviews(prev => [newReview, ...prev]);
        setReviewText('');

        // API call
        await submitReview(movieId, movieTitle, reviewText, 'anonymous', displayName, null);
        setSubmittingReview(false);

        // Refresh to get real ID
        fetchData();
    };

    // Get user avatar info
    const getUserAvatar = () => {
        if (profile?.avatar_id) {
            const avatars = {
                'avatar_1': '🎬', 'avatar_2': '🎭', 'avatar_3': '🎪', 'avatar_4': '🌟',
                'avatar_5': '🎯', 'avatar_6': '🦋', 'avatar_7': '🌈', 'avatar_8': '🎸',
                'avatar_9': '🎮', 'avatar_10': '📚', 'avatar_11': '🚀', 'avatar_12': '🎨'
            };
            return avatars[profile.avatar_id] || '👤';
        }
        return '👤';
    };

    const getDisplayName = () => {
        return profile?.username || profile?.display_name || 'Anonymous';
    };

    // Build threaded structure
    const threadedReviews = buildThreads(reviews);

    return (
        <div className="mt-8 max-w-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold text-white">Reviews</h2>
                    <button
                        onClick={handleRateClick}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-medium transition-all ${hasUserRated
                            ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
                            : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600'
                            }`}
                    >
                        <FaStar className="text-xs" />
                        {hasUserRated ? 'Rated ✓' : 'Rate'}
                    </button>
                </div>
                <select className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                    <option value="liked">Most Liked</option>
                    <option value="recent">Most Recent</option>
                </select>
            </div>

            {/* Write Review Box */}
            <div className="p-5 rounded-2xl bg-[#1a1a1a] border border-white/10 mb-6">
                {/* User info row */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center text-lg">
                        {isAuthenticated ? getUserAvatar() : '👤'}
                    </div>
                    <span className="text-white font-medium">
                        {isAuthenticated ? `@${getDisplayName()}` : '@guest'}
                    </span>
                </div>

                {/* Textarea */}
                <div className="relative">
                    <textarea
                        value={reviewText}
                        onChange={(e) => {
                            if (e.target.value.length <= 1000) {
                                setReviewText(e.target.value);
                            }
                        }}
                        placeholder="Write your review here..."
                        rows={4}
                        className="w-full bg-transparent text-white placeholder-white/30 focus:outline-none resize-none text-sm leading-relaxed"
                    />
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-white/10" />
                </div>

                {/* Footer with character count and post button */}
                <div className="flex items-center justify-between mt-4">
                    <span className="text-xs text-white/40">{reviewText.length}/1000</span>
                    <button
                        onClick={handleSubmitReview}
                        disabled={submittingReview || !reviewText.trim()}
                        className="px-6 py-2 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submittingReview ? 'Posting...' : 'Post'}
                    </button>
                </div>
            </div>

            {/* Reviews List */}
            {loading ? (
                <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="animate-pulse p-5 rounded-xl bg-[#1a1a1a]">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-full bg-white/5" />
                                <div className="h-4 bg-white/5 rounded w-24" />
                            </div>
                            <div className="h-3 bg-white/5 rounded w-3/4 mb-2" />
                            <div className="h-3 bg-white/5 rounded w-1/2" />
                        </div>
                    ))}
                </div>
            ) : threadedReviews.length > 0 ? (
                <div className="space-y-4">
                    {threadedReviews.map((review) => (
                        <div key={review.id} className="p-5 rounded-xl bg-[#1a1a1a] border border-white/5 transition-all duration-200">
                            {/* Review header */}
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center overflow-hidden">
                                        <FaUser className="text-white text-sm" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-white">{review.username || 'Anonymous'}</p>
                                        <p className="text-xs text-white/40">{getTimeAgo(review.created_at)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Review text */}
                            <p className="text-white/80 text-sm leading-relaxed mb-4">
                                {review.review_text}
                            </p>

                            {/* Review footer */}
                            <div className="flex items-center gap-4">
                                {/* Like button */}
                                <button
                                    onClick={() => handleLike(review.id)}
                                    className={`flex items-center gap-1.5 transition-all duration-200 ${likedReviews.has(review.id)
                                        ? 'text-red-500 scale-110'
                                        : 'text-white/50 hover:text-red-400'
                                        }`}
                                >
                                    <svg
                                        className="w-4 h-4 transition-transform duration-200"
                                        fill={likedReviews.has(review.id) ? "currentColor" : "none"}
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                    </svg>
                                    <span className="text-sm">{review.upvotes || 0}</span>
                                </button>

                                {/* Reply button */}
                                <button
                                    onClick={() => handleReplyClick(review.id)}
                                    className={`flex items-center gap-1.5 transition-colors ${replyingTo === review.id
                                        ? 'text-blue-400'
                                        : 'text-white/50 hover:text-white/70'
                                        }`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                    <span className="text-sm">{review.replies?.length || 0}</span>
                                </button>
                            </div>

                            {/* Reply Input */}
                            {replyingTo === review.id && (
                                <div className="mt-4 pt-4 border-t border-white/5 animate-fadeIn">
                                    <div className="flex gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center text-sm flex-shrink-0">
                                            {getUserAvatar()}
                                        </div>
                                        <div className="flex-1">
                                            <textarea
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                placeholder="Write a reply..."
                                                rows={2}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
                                                autoFocus
                                            />
                                            <div className="flex justify-end gap-2 mt-2">
                                                <button
                                                    onClick={() => setReplyingTo(null)}
                                                    className="px-3 py-1.5 text-xs text-white/50 hover:text-white/70"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => handleSubmitReply(review.id)}
                                                    disabled={submittingReply || !replyText.trim()}
                                                    className="px-4 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                                                >
                                                    {submittingReply ? 'Posting...' : 'Reply'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Replies */}
                            {review.replies && review.replies.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                                    {review.replies.map((reply) => (
                                        <div key={reply.id} className="pl-4 border-l-2 border-white/10 animate-fadeIn">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-medium text-white">{reply.username || 'Anonymous'}</span>
                                                <span className="text-xs text-white/40">{getTimeAgo(reply.created_at)}</span>
                                            </div>
                                            <p className="text-sm text-white/70">{reply.review_text}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 rounded-xl bg-[#1a1a1a]">
                    <span className="text-4xl mb-3 block">🎬</span>
                    <p className="text-white/40 text-sm">No reviews yet. Be the first to share your thoughts!</p>
                </div>
            )}
        </div>
    );
};

// Main UserRatingSystem Component
const UserRatingSystem = ({ movieId, movieTitle, hasUserRated, existingRating, userId }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    return (
        <>
            <ReviewsList
                key={refreshKey}
                movieId={movieId}
                movieTitle={movieTitle}
                onRateClick={() => setIsModalOpen(true)}
                hasUserRated={hasUserRated}
            />
            <RatingModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                movieId={movieId}
                movieTitle={movieTitle}
                onSubmitSuccess={() => setRefreshKey(prev => prev + 1)}
                existingRating={existingRating}
                userId={userId}
            />
        </>
    );
};

export default UserRatingSystem;
