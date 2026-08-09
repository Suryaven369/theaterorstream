import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';
import { createMovieLog, getUserMovieLogCount } from '../../lib/movieDiary';

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function posterUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `https://image.tmdb.org/t/p/w154${path}`;
}

export default function QuickLogModal({
    movie,
    userId,
    isOpen,
    onClose,
    onLogged,
    prefillRating = null,
    subtitle = null,
    releaseYear = null,
}) {
    const [watchedOn, setWatchedOn] = useState(todayISO());
    const [reviewText, setReviewText] = useState('');
    const [inTheater, setInTheater] = useState(false);
    const [visibility, setVisibility] = useState('public');
    const [priorLogCount, setPriorLogCount] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const tmdbId = movie?.tmdb_id || movie?.id;
    const mediaType = movie?.media_type || 'movie';

    useEffect(() => {
        if (!isOpen || !userId || !tmdbId) return;
        let cancelled = false;
        getUserMovieLogCount(userId, tmdbId, mediaType).then((n) => {
            if (!cancelled) setPriorLogCount(n);
        });
        return () => { cancelled = true; };
    }, [isOpen, userId, tmdbId, mediaType]);

    useEffect(() => {
        if (isOpen) {
            setWatchedOn(todayISO());
            setReviewText('');
            setInTheater(false);
            setVisibility('public');
            setError(null);
        }
    }, [isOpen, tmdbId]);

    if (!isOpen || !movie) return null;

    const title = movie.title || movie.name;
    const thumb = posterUrl(movie.poster_path);

    const handleSubmit = async () => {
        if (!userId) return;
        setSubmitting(true);
        setError(null);

        const watchedWith = inTheater ? ['theater'] : [];
        const isRewatch = priorLogCount > 0;

        const result = await createMovieLog(userId, {
            tmdbId,
            title,
            posterPath: movie.poster_path,
            mediaType,
            watchedOn,
            rating: prefillRating != null ? Number(prefillRating) : null,
            reviewText: reviewText.trim() || null,
            watchedWith,
            watchedInTheater: inTheater,
            visibility,
            rewatchCount: isRewatch ? 1 : 0,
        });

        setSubmitting(false);

        if (result.success) {
            onLogged?.(result.data);
            onClose();
        } else {
            setError(result.error?.message || 'Could not save log');
        }
    };

    const modal = (
        <div
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#14181c] border border-white/10 shadow-2xl animate-fadeIn"
                role="dialog"
                aria-labelledby="log-modal-title"
            >
                <div className="flex items-start justify-between gap-3 p-4 border-b border-white/10">
                    <div className="flex gap-3 min-w-0 flex-1">
                        {thumb && (
                            <img src={thumb} alt="" className="w-14 h-[84px] rounded object-cover border border-white/10 shrink-0" />
                        )}
                        <div className="min-w-0 pt-0.5">
                            <h3 id="log-modal-title" className="text-base font-bold text-white leading-snug line-clamp-2">
                                {title}
                            </h3>
                            {releaseYear && (
                                <p className="text-xs text-white/40 mt-0.5">{releaseYear}</p>
                            )}
                            <p className="text-[11px] uppercase tracking-wider text-[var(--accent-green)] mt-1.5 font-semibold">
                                {priorLogCount > 0 ? 'Log rewatch' : 'Log film'}
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="text-white/45 hover:text-white p-1 shrink-0" aria-label="Close">
                        <FaTimes />
                    </button>
                </div>

                <div className="p-4 space-y-5">
                    {subtitle && (
                        <p className="text-xs text-white/45 -mt-1">{subtitle}</p>
                    )}

                    <div>
                        <label htmlFor="log-watched-on" className="text-[11px] uppercase tracking-wide text-white/45 font-medium">
                            Watched on
                        </label>
                        <input
                            id="log-watched-on"
                            type="date"
                            value={watchedOn}
                            max={todayISO()}
                            onChange={(e) => setWatchedOn(e.target.value)}
                            className="mt-1.5 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white [color-scheme:dark]"
                        />
                    </div>

                    <div>
                        <label htmlFor="log-review" className="text-[11px] uppercase tracking-wide text-white/45 font-medium">
                            Review or notes
                        </label>
                        <textarea
                            id="log-review"
                            value={reviewText}
                            onChange={(e) => setReviewText(e.target.value)}
                            placeholder="Share your thoughts…"
                            rows={4}
                            className="mt-1.5 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/25 resize-none leading-relaxed"
                        />
                    </div>

                    <div className="flex flex-col gap-2.5">
                        <label className="flex items-center gap-2.5 text-sm text-white/70 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={inTheater}
                                onChange={(e) => setInTheater(e.target.checked)}
                                className="rounded border-white/20"
                            />
                            Watched in theaters
                        </label>
                        <label className="flex items-center gap-2.5 text-sm text-white/70 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={visibility === 'public'}
                                onChange={(e) => setVisibility(e.target.checked ? 'public' : 'private')}
                                className="rounded border-white/20"
                            />
                            Show in activity feed
                        </label>
                    </div>

                    {error && <p className="text-sm text-red-400">{error}</p>}

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="w-full py-3 rounded-lg bg-[var(--accent-green)] text-[#14181c] font-bold text-sm uppercase tracking-wide hover:brightness-110 disabled:opacity-50 transition-all"
                    >
                        {submitting ? 'Saving…' : 'Save log'}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}
