import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import { FaTimes } from 'react-icons/fa';
import { createMovieLog, getUserMovieLogCount, publishRatingActivity } from '../../lib/movieDiary';
import {
    getUserRatingForMovie,
    getMovieRatings,
    submitRating,
    toggleLikedMovie,
    ensureWatchedMovie,
    togglePartyMovieWatched,
} from '../../lib/supabase';
import { computeOverallFromCategories, computeTosScoreFromAggregates } from '../../lib/ratingUtils';
import { requestTasteProfileRebuild } from '../../lib/tasteProfileApi';
import { markUserRatedMovie, patchHomepageMovieTosRating } from '../../store/movieSlice';
import TosCategoryRatingForm from '../ratings/TosCategoryRatingForm';
import { DEFAULT_TOS_RATINGS, tosRatingsFromRow } from '../ratings/tosRatingCategories';
import { trackEvent, EVENT_TYPES } from '../../lib/eventTracking';

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function posterUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `https://image.tmdb.org/t/p/w154${path}`;
}

const INTENT_COPY = {
    log: { badge: 'Log film', cta: 'Save to diary', ctaShort: 'Save' },
    watched: { badge: 'Mark watched', cta: 'Save & mark watched', ctaShort: 'Mark watched' },
    like: { badge: 'You liked this', cta: 'Save & like', ctaShort: 'Save & like' },
    party: { badge: 'Watch party', cta: 'Save & mark watched', ctaShort: 'Mark watched' },
};

function ToggleChip({ active, onClick, disabled, children }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={`flex-1 min-h-[44px] rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors touch-manipulation disabled:opacity-50 ${
                active
                    ? 'border-[var(--accent-green)]/50 bg-[var(--accent-green)]/10 text-[var(--accent-green)]'
                    : 'border-white/10 bg-white/5 text-white/55 active:bg-white/10'
            }`}
        >
            {children}
        </button>
    );
}

/**
 * Log sheet with TOS category ratings, review, and watched date.
 */
export default function QuickLogModal({
    movie,
    userId,
    isOpen,
    onClose,
    onLogged,
    intent = 'log',
    partyCollectionId = null,
    subtitle = null,
    releaseYear = null,
    initialRatings = null,
    ratingAlreadySaved = false,
}) {
    const dispatch = useDispatch();
    const [watchedOn, setWatchedOn] = useState(todayISO());
    const [userRatings, setUserRatings] = useState({ ...DEFAULT_TOS_RATINGS });
    const [ratingTouched, setRatingTouched] = useState(false);
    const [reviewText, setReviewText] = useState('');
    const [inTheater, setInTheater] = useState(false);
    const [visibility, setVisibility] = useState('public');
    const [priorLogCount, setPriorLogCount] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const tmdbId = movie?.tmdb_id || movie?.id;
    const mediaType = movie?.media_type || 'movie';
    const copy = INTENT_COPY[intent] || INTENT_COPY.log;
    const showTosRating = mediaType === 'movie';

    useEffect(() => {
        if (!isOpen || !userId || !tmdbId) return;
        let cancelled = false;
        Promise.all([
            getUserMovieLogCount(userId, tmdbId, mediaType),
            showTosRating ? getUserRatingForMovie(userId, tmdbId) : Promise.resolve(null),
        ]).then(([n, existingRating]) => {
            if (cancelled) return;
            setPriorLogCount(n);
            if (initialRatings) {
                setUserRatings(tosRatingsFromRow(initialRatings));
                setRatingTouched(true);
            } else if (existingRating) {
                setUserRatings(tosRatingsFromRow(existingRating));
                setRatingTouched(true);
            } else {
                setUserRatings({ ...DEFAULT_TOS_RATINGS });
                setRatingTouched(false);
            }
        });
        return () => { cancelled = true; };
    }, [isOpen, userId, tmdbId, mediaType, initialRatings, showTosRating]);

    useEffect(() => {
        if (!isOpen) return;
        setWatchedOn(todayISO());
        setReviewText('');
        setInTheater(false);
        setVisibility('public');
        setError(null);
    }, [isOpen, tmdbId]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [isOpen]);

    if (!isOpen || !movie) return null;

    const title = movie.title || movie.name || movie.movie_title;
    const thumb = posterUrl(movie.poster_path);
    const isRewatch = priorLogCount > 0;

    const handleRatingsChange = (next) => {
        setUserRatings(next);
        setRatingTouched(true);
    };

    const syncRatingSideEffects = (savedCategories) => {
        const userScore = computeOverallFromCategories(savedCategories);
        if (!userId || userScore == null) return;

        dispatch(markUserRatedMovie({ movieId: String(tmdbId), score: userScore }));

        void (async () => {
            try {
                const community = await getMovieRatings(tmdbId);
                const communityScore = computeTosScoreFromAggregates(community);
                const tosRating = communityScore != null
                    ? { score: communityScore, count: community.totalRatings }
                    : { score: userScore, count: 1 };
                dispatch(patchHomepageMovieTosRating({
                    movieId: String(tmdbId),
                    tos_rating: tosRating,
                }));
            } catch {
                dispatch(patchHomepageMovieTosRating({
                    movieId: String(tmdbId),
                    tos_rating: { score: userScore, count: 1 },
                }));
            }
            requestTasteProfileRebuild({ includeEmbedding: true }).catch(() => {});
        })();
    };

    const handleSubmit = async () => {
        if (!userId) return;
        setSubmitting(true);
        setError(null);

        const shouldSaveRating = showTosRating && ratingTouched && !ratingAlreadySaved;
        const tosScore = showTosRating && ratingTouched
            ? computeOverallFromCategories(userRatings)
            : null;
        const watchedWith = inTheater ? ['theater'] : [];

        const result = await createMovieLog(userId, {
            tmdbId,
            title,
            posterPath: movie.poster_path,
            mediaType,
            watchedOn,
            rating: tosScore,
            reviewText: reviewText.trim() || null,
            watchedWith,
            watchedInTheater: inTheater,
            visibility,
            rewatchCount: isRewatch ? 1 : 0,
        });

        if (!result.success) {
            setSubmitting(false);
            setError(result.error?.message || 'Could not save log');
            return;
        }

        if (shouldSaveRating) {
            const ratingResult = await submitRating(tmdbId, title, userRatings, userId);
            if (ratingResult.success) {
                syncRatingSideEffects(userRatings);
                publishRatingActivity(userId, ratingResult.data || {
                    movie_id: tmdbId,
                    movie_title: title,
                    ...userRatings,
                }, { title, mediaType }).catch(() => {});
            }
        }

        if (intent === 'like') {
            await toggleLikedMovie(userId, tmdbId, title, movie.poster_path, mediaType);
            trackEvent(EVENT_TYPES.MOVIE_LIKED, { tmdbId, mediaType });
        }

        if (intent === 'watched' || intent === 'like' || intent === 'party' || intent === 'log') {
            await ensureWatchedMovie(userId, tmdbId, title, movie.poster_path, mediaType);
            trackEvent(EVENT_TYPES.MOVIE_WATCHED, { tmdbId, mediaType });
        }

        if (intent === 'party' && partyCollectionId) {
            await togglePartyMovieWatched(partyCollectionId, userId, {
                movieId: String(tmdbId),
                movieTitle: title,
                posterPath: movie.poster_path,
                mediaType,
                watched: true,
            });
        }

        setSubmitting(false);
        onLogged?.({
            log: result.data,
            intent,
            ratings: ratingTouched ? userRatings : null,
            tosScore,
            liked: intent === 'like',
            watched: true,
            partyMarked: intent === 'party',
        });
        onClose();
    };

    const modal = (
        <div
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4"
            role="presentation"
        >
            <button
                type="button"
                className="absolute inset-0 bg-black/80 backdrop-blur-[2px]"
                aria-label="Close"
                disabled={submitting}
                onClick={() => { if (!submitting) onClose(); }}
            />

            <div
                className="relative w-full max-w-lg flex flex-col max-h-[min(94dvh,94vh)] sheet-mobile sm:max-h-[90vh] sm:rounded-2xl bg-[#14181c] border border-white/10 border-b-0 sm:border-b shadow-2xl animate-fadeIn"
                role="dialog"
                aria-modal="true"
                aria-labelledby="log-modal-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0" aria-hidden>
                    <div className="w-9 h-1 rounded-full bg-white/25" />
                </div>

                <div className="shrink-0 flex items-start justify-between gap-2 px-4 pt-1 sm:pt-4 pb-2.5 sm:pb-3 border-b border-white/10">
                    <div className="flex gap-2.5 min-w-0 flex-1">
                        {thumb && (
                            <img
                                src={thumb}
                                alt=""
                                className="w-10 h-[60px] sm:w-14 sm:h-[84px] rounded-md object-cover border border-white/10 shrink-0"
                            />
                        )}
                        <div className="min-w-0 pt-0.5">
                            <h3 id="log-modal-title" className="text-[15px] sm:text-base font-bold text-white leading-snug line-clamp-2">
                                {title}
                            </h3>
                            {releaseYear && (
                                <p className="text-xs text-white/40 mt-0.5">{releaseYear}</p>
                            )}
                            <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[var(--accent-green)] mt-1 font-semibold">
                                {isRewatch ? 'Log rewatch' : copy.badge}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="text-white/45 hover:text-white p-2 -mr-1 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 touch-manipulation"
                        aria-label="Close"
                    >
                        <FaTimes className="text-lg" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 px-4 py-3 sm:py-4 space-y-3 sm:space-y-4">
                    {subtitle && (
                        <p className="text-xs text-white/45 leading-relaxed">{subtitle}</p>
                    )}

                    {showTosRating && (
                        <TosCategoryRatingForm
                            value={userRatings}
                            onChange={handleRatingsChange}
                            disabled={submitting}
                            variant="compact"
                        />
                    )}

                    <div>
                        <label htmlFor="log-review" className="text-[11px] uppercase tracking-wide text-white/45 font-medium">
                            Review
                        </label>
                        <textarea
                            id="log-review"
                            value={reviewText}
                            onChange={(e) => setReviewText(e.target.value)}
                            placeholder="What did you think?"
                            rows={2}
                            disabled={submitting}
                            enterKeyHint="done"
                            className="mt-1.5 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-base sm:text-sm text-white placeholder-white/25 resize-none leading-relaxed disabled:opacity-60"
                        />
                    </div>

                    <div>
                        <label htmlFor="log-watched-on" className="text-[11px] uppercase tracking-wide text-white/45 font-medium">
                            Watched on
                        </label>
                        <input
                            id="log-watched-on"
                            type="date"
                            value={watchedOn}
                            max={todayISO()}
                            disabled={submitting}
                            onChange={(e) => setWatchedOn(e.target.value)}
                            className="mt-1.5 w-full min-h-[44px] rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-base sm:text-sm text-white [color-scheme:dark] disabled:opacity-60"
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                        <ToggleChip
                            active={inTheater}
                            disabled={submitting}
                            onClick={() => setInTheater((v) => !v)}
                        >
                            In theaters
                        </ToggleChip>
                        <ToggleChip
                            active={visibility === 'public'}
                            disabled={submitting}
                            onClick={() => setVisibility((v) => (v === 'public' ? 'private' : 'public'))}
                        >
                            Share to feed
                        </ToggleChip>
                    </div>

                    {error && <p className="text-sm text-red-400">{error}</p>}
                </div>

                <div className="shrink-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-[#14181c]/95 backdrop-blur-md flex gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="flex-1 min-h-[48px] rounded-xl border border-white/10 text-white/65 text-sm font-medium active:bg-white/5 disabled:opacity-50 touch-manipulation"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="flex-[1.35] min-h-[48px] rounded-xl bg-[var(--accent-green)] text-[#14181c] font-bold text-sm uppercase tracking-wide active:brightness-95 disabled:opacity-50 transition-all touch-manipulation px-2"
                    >
                        <span className="sm:hidden">{submitting ? 'Saving…' : copy.ctaShort}</span>
                        <span className="hidden sm:inline">{submitting ? 'Saving…' : copy.cta}</span>
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}
