import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes, FaCheck } from 'react-icons/fa';
import { createMovieLog } from '../../lib/movieDiary';

const WATCHED_WITH_OPTIONS = [
    { id: 'solo', label: 'Solo' },
    { id: 'partner', label: 'Partner' },
    { id: 'theater', label: 'In theater' },
    { id: 'friends', label: 'Friends' },
    { id: 'family', label: 'Family' },
];

export default function QuickLogModal({
    movie,
    userId,
    isOpen,
    onClose,
    onLogged,
    prefillRating = null,
    subtitle = null,
}) {
    const [watchedWith, setWatchedWith] = useState([]);
    const [reviewText, setReviewText] = useState('');
    const [visibility, setVisibility] = useState('public');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setWatchedWith([]);
            setReviewText('');
            setVisibility('public');
            setError(null);
        }
    }, [isOpen, movie?.tmdb_id, movie?.id]);

    if (!isOpen || !movie) return null;

    const toggleWatchedWith = (id) => {
        setWatchedWith((prev) =>
            (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const handleSubmit = async () => {
        if (!userId) return;
        setSubmitting(true);
        setError(null);

        const result = await createMovieLog(userId, {
            tmdbId: movie.tmdb_id || movie.id,
            title: movie.title || movie.name,
            posterPath: movie.poster_path,
            mediaType: movie.media_type || 'movie',
            rating: prefillRating ?? null,
            reviewText: reviewText.trim() || null,
            watchedWith,
            visibility,
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
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-[#1a1a1a] border border-white/10 shadow-2xl animate-fadeIn">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div>
                        <h3 className="text-lg font-semibold text-white">Log to diary</h3>
                        {subtitle && (
                            <p className="text-xs text-white/45 mt-0.5">{subtitle}</p>
                        )}
                    </div>
                    <button type="button" onClick={onClose} className="text-white/50 hover:text-white">
                        <FaTimes />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    <p className="text-white font-medium">{movie.title || movie.name}</p>

                    {prefillRating != null && (
                        <p className="text-sm text-yellow-400/90">
                            Your TOS rating ({prefillRating.toFixed(1)}/10) is saved — add watch details below.
                        </p>
                    )}

                    <div>
                        <label className="text-xs text-white/50 uppercase tracking-wide">How did you watch?</label>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {WATCHED_WITH_OPTIONS.map((opt) => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => toggleWatchedWith(opt.id)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                        watchedWith.includes(opt.id)
                                            ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                                            : 'bg-white/5 border-white/10 text-white/60'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <textarea
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        placeholder="Optional note for your diary"
                        rows={2}
                        className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 resize-none"
                    />

                    <label className="flex items-center gap-2 text-sm text-white/60">
                        <input
                            type="checkbox"
                            checked={visibility === 'public'}
                            onChange={(e) => setVisibility(e.target.checked ? 'public' : 'private')}
                            className="rounded"
                        />
                        Show in friends feed
                    </label>

                    {error && <p className="text-sm text-red-400">{error}</p>}

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold disabled:opacity-50"
                    >
                        <FaCheck />
                        {submitting ? 'Saving…' : 'Save to diary'}
                    </button>

                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full py-2 text-sm text-white/40 hover:text-white/70"
                    >
                        Skip for now
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}
