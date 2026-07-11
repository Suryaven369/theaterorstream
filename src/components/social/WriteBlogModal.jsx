import React, { useState, useRef } from 'react';
import { createBlogPost, BLOG_TITLE_MAX, BLOG_CONTENT_MAX } from '../../lib/blogs';
import RichTextEditor from '../RichTextEditor';
import { uploadBlogImage } from '../../lib/profileSystem';
import { FaCamera, FaTimes } from 'react-icons/fa';

const htmlToText = (html) => {
    const el = document.createElement('div');
    el.innerHTML = html || '';
    return (el.textContent || '').trim();
};

export default function WriteBlogModal({ userId, onClose, onSuccess }) {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [coverImage, setCoverImage] = useState(null);
    const [uploadingCover, setUploadingCover] = useState(false);
    const [isPublic, setIsPublic] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const coverRef = useRef(null);

    const textLength = htmlToText(content).length;
    const overLimit = textLength > BLOG_CONTENT_MAX;

    const handleCover = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !userId) return;
        setUploadingCover(true);
        const r = await uploadBlogImage(file, userId);
        setUploadingCover(false);
        if (r.ok) setCoverImage(r.url); else setError(r.error || 'Upload failed');
        e.target.value = '';
    };

    // Inline image insertion from the editor toolbar.
    const insertInlineImage = async () => {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return resolve(null);
                const r = await uploadBlogImage(file, userId);
                resolve(r.ok ? r.url : null);
            };
            input.click();
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim() || textLength < 20 || overLimit) {
            setError(overLimit ? `Content is over the ${BLOG_CONTENT_MAX} character limit.` : 'Title and at least 20 characters required.');
            return;
        }
        setSubmitting(true);
        setError('');
        const res = await createBlogPost(userId, {
            title: title.trim(),
            content: content.trim(),
            coverImage,
            isPublic,
        });
        setSubmitting(false);
        if (res.success) {
            onSuccess?.(res.data);
            onClose();
        } else {
            setError(res.error?.message || 'Could not publish blog.');
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Close" />
            <form
                onSubmit={handleSubmit}
                className="relative w-full max-w-2xl surface-elevated p-6 rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto"
            >
                <h2 className="text-lg font-bold text-white mb-1">Write a blog</h2>
                <p className="text-sm text-[var(--text-secondary)] mb-4">Share something long-form with the community</p>

                {/* Cover image */}
                <div className="mb-3">
                    <div onClick={() => coverRef.current?.click()} className="relative h-36 rounded-xl overflow-hidden border border-[var(--border-color)] bg-gradient-to-br from-[#14181c] to-[#0f1214] cursor-pointer group">
                        {coverImage && <img src={coverImage} alt="" className="w-full h-full object-cover" />}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="flex items-center gap-2 text-sm text-white"><FaCamera /> {uploadingCover ? 'Uploading…' : 'Add a cover image'}</span>
                        </div>
                        {coverImage && <button type="button" onClick={(e) => { e.stopPropagation(); setCoverImage(null); }} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"><FaTimes className="text-[10px]" /></button>}
                    </div>
                    <input ref={coverRef} type="file" accept="image/*" onChange={handleCover} className="hidden" />
                </div>

                <div className="relative mb-3">
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value.slice(0, BLOG_TITLE_MAX))}
                        placeholder="Blog title"
                        maxLength={BLOG_TITLE_MAX}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-4 py-3 pr-14 text-white text-base font-semibold focus:border-[var(--primary)] outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/30">{title.length}/{BLOG_TITLE_MAX}</span>
                </div>

                <RichTextEditor value={content} onChange={setContent} onInsertImage={insertInlineImage} placeholder="Write your story… (min 20 characters)" />
                <div className="flex justify-end mt-1 mb-3">
                    <span className={`text-[11px] ${overLimit ? 'text-red-400' : 'text-white/30'}`}>{textLength}/{BLOG_CONTENT_MAX}</span>
                </div>

                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] mb-4">
                    <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                    Visible to everyone
                </label>
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                <div className="flex gap-3">
                    <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[var(--border-color)] text-white/70">Cancel</button>
                    <button type="submit" disabled={submitting || overLimit} className="flex-1 py-2.5 rounded-lg btn-accent-green disabled:opacity-50">
                        {submitting ? 'Publishing…' : 'Publish'}
                    </button>
                </div>
            </form>
        </div>
    );
}
