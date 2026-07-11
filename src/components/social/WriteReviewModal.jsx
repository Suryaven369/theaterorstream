import React, { useState } from 'react';
import { createSocialReview } from '../../lib/socialReviews';

export default function WriteReviewModal({ movie, onClose, onSuccess }) {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [spoiler, setSpoiler] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!movie) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim() || content.trim().length < 20) {
            setError('Title and at least 20 characters required.');
            return;
        }
        setSubmitting(true);
        setError('');
        const res = await createSocialReview({
            tmdb_id: movie.tmdb_id || movie.id,
            media_type: movie.media_type || 'movie',
            movie_title: movie.title,
            poster_path: movie.poster_path,
            title: title.trim(),
            content: content.trim(),
            spoiler,
        });
        setSubmitting(false);
        if (res.ok) {
            onSuccess?.(res.review);
            onClose();
        } else {
            setError(res.error || 'Could not publish review.');
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Close" />
            <form
                onSubmit={handleSubmit}
                className="relative w-full max-w-lg surface-elevated p-6 rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto"
            >
                <h2 className="text-lg font-bold text-white mb-1">Write a review</h2>
                <p className="text-sm text-[var(--text-secondary)] mb-4">{movie.title}</p>

                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Review headline"
                    className="w-full mb-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-4 py-3 text-white text-sm focus:border-[var(--primary)] outline-none"
                    maxLength={120}
                />
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Share your thoughts (min 20 characters)…"
                    rows={6}
                    className="w-full mb-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-4 py-3 text-white text-sm focus:border-[var(--primary)] outline-none resize-none"
                />
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] mb-4">
                    <input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} />
                    Contains spoilers
                </label>
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                <div className="flex gap-3">
                    <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[var(--border-color)] text-white/70">
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 py-2.5 rounded-lg btn-accent-green disabled:opacity-50"
                    >
                        {submitting ? 'Publishing…' : 'Publish'}
                    </button>
                </div>
            </form>
        </div>
    );
}
