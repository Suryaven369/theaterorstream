import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    createBlogPost,
    updateBlogPost,
    upsertBlogDraft,
    getLatestBlogDraft,
    consolidateBlogDrafts,
    deleteAllBlogDrafts,
    BLOG_TITLE_MAX,
    BLOG_CONTENT_MAX,
} from '../../lib/blogs';
import RichTextEditor from '../RichTextEditor';
import { uploadBlogImage } from '../../lib/profileSystem';
import { FaCamera, FaTimes } from 'react-icons/fa';

const AUTOSAVE_MS = 1800;
const LOCAL_DRAFT_KEY = (userId) => `tos_blog_draft_${userId}`;

const htmlToText = (html) => {
    const el = document.createElement('div');
    el.innerHTML = html || '';
    return (el.textContent || '').trim();
};

export default function WriteBlogModal({ userId, onClose, onSuccess, initialBlog = null }) {
    const [title, setTitle] = useState(
        initialBlog?.title === 'Untitled draft' ? '' : (initialBlog?.title || ''),
    );
    const [content, setContent] = useState(initialBlog?.content || '');
    const [coverImage, setCoverImage] = useState(initialBlog?.cover_image || null);
    const [uploadingCover, setUploadingCover] = useState(false);
    const [isPublic, setIsPublic] = useState(
        initialBlog ? initialBlog.visibility === 'public' : true,
    );
    const editingPublished = initialBlog && initialBlog.visibility !== 'draft';
    const [draftId, setDraftId] = useState(initialBlog?.id || null);
    const [ready, setReady] = useState(!!initialBlog);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [saveState, setSaveState] = useState('idle');
    const [lastSavedAt, setLastSavedAt] = useState(null);
    const coverRef = useRef(null);
    const skipAutosave = useRef(true);
    const draftIdRef = useRef(draftId);
    const saveChain = useRef(Promise.resolve());
    const latestFields = useRef({ title, content, coverImage, isPublic });

    useEffect(() => {
        draftIdRef.current = draftId;
    }, [draftId]);

    useEffect(() => {
        latestFields.current = { title, content, coverImage, isPublic };
    }, [title, content, coverImage, isPublic]);

    // Resume the single existing draft (DB) when opening a fresh composer
    useEffect(() => {
        if (initialBlog || !userId) {
            setReady(true);
            return undefined;
        }
        let alive = true;
        (async () => {
            const latest = await getLatestBlogDraft(userId);
            if (!alive) return;
            if (latest) {
                setDraftId(latest.id);
                draftIdRef.current = latest.id;
                setTitle(latest.title === 'Untitled draft' ? '' : (latest.title || ''));
                setContent(latest.content || '');
                setCoverImage(latest.cover_image || null);
                await consolidateBlogDrafts(userId, latest.id);
            } else {
                // Fallback: local backup only if no DB draft
                try {
                    const raw = localStorage.getItem(LOCAL_DRAFT_KEY(userId));
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed?.draftId) {
                            setDraftId(parsed.draftId);
                            draftIdRef.current = parsed.draftId;
                        }
                        if (parsed?.title) setTitle(parsed.title);
                        if (parsed?.content) setContent(parsed.content);
                        if (parsed?.coverImage) setCoverImage(parsed.coverImage);
                        if (typeof parsed?.isPublic === 'boolean') setIsPublic(parsed.isPublic);
                    }
                } catch { /* ignore */ }
            }
            setReady(true);
            setTimeout(() => { skipAutosave.current = false; }, 400);
        })();
        return () => { alive = false; };
    }, [userId, initialBlog]);

    useEffect(() => {
        if (!initialBlog) return undefined;
        const t = setTimeout(() => { skipAutosave.current = false; }, 400);
        return () => clearTimeout(t);
    }, [initialBlog]);

    const textLength = htmlToText(content).length;
    const overLimit = textLength > BLOG_CONTENT_MAX;
    const hasDraftContent = !!(title.trim() || textLength > 0 || coverImage);

    const persistLocal = useCallback((payload) => {
        if (!userId) return;
        try {
            localStorage.setItem(LOCAL_DRAFT_KEY(userId), JSON.stringify(payload));
        } catch { /* ignore */ }
    }, [userId]);

    const clearLocal = useCallback(() => {
        if (!userId) return;
        try {
            localStorage.removeItem(LOCAL_DRAFT_KEY(userId));
        } catch { /* ignore */ }
    }, [userId]);

    /** Serialized autosave — one row only (draft upsert, or in-place update if editing public). */
    const saveDraft = useCallback(() => {
        if (!userId) return Promise.resolve(null);

        const run = async () => {
            const fields = latestFields.current;
            const plainLen = htmlToText(fields.content).length;
            if (!fields.title.trim() && plainLen === 0 && !fields.coverImage) return null;

            setSaveState('saving');

            let res;
            if (editingPublished && draftIdRef.current) {
                // Editing a published post: update same row, keep public/private — do NOT spawn a draft twin
                res = await updateBlogPost(draftIdRef.current, {
                    title: fields.title,
                    content: fields.content,
                    coverImage: fields.coverImage,
                    visibility: fields.isPublic ? 'public' : 'private',
                });
            } else {
                res = await upsertBlogDraft(userId, {
                    draftId: draftIdRef.current,
                    title: fields.title,
                    content: fields.content,
                    coverImage: fields.coverImage,
                });
            }

            if (res.success && res.data) {
                draftIdRef.current = res.data.id;
                setDraftId(res.data.id);
                setLastSavedAt(new Date());
                setSaveState('saved');
                if (!editingPublished) {
                    persistLocal({
                        draftId: res.data.id,
                        title: fields.title,
                        content: fields.content,
                        coverImage: fields.coverImage,
                        isPublic: fields.isPublic,
                    });
                }
                return res.data;
            }
            setSaveState('error');
            return null;
        };

        const next = saveChain.current.then(run, run);
        saveChain.current = next.catch(() => null);
        return next;
    }, [userId, persistLocal, editingPublished]);

    // Debounced autosave
    useEffect(() => {
        if (!ready || skipAutosave.current || !userId || !hasDraftContent) return undefined;
        const timer = setTimeout(() => {
            saveDraft();
        }, AUTOSAVE_MS);
        return () => clearTimeout(timer);
    }, [title, content, coverImage, userId, hasDraftContent, ready, saveDraft]);

    const handleCover = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !userId) return;
        setUploadingCover(true);
        const r = await uploadBlogImage(file, userId);
        setUploadingCover(false);
        if (r.ok) setCoverImage(r.url); else setError(r.error || 'Upload failed');
        e.target.value = '';
    };

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

        // Flush any pending draft write first
        await saveDraft();

        const visibility = isPublic ? 'public' : 'draft';
        const id = draftIdRef.current;
        let res;
        if (id) {
            res = await updateBlogPost(id, {
                title: title.trim(),
                content: content.trim(),
                coverImage,
                visibility,
            });
        } else {
            res = await createBlogPost(userId, {
                title: title.trim(),
                content: content.trim(),
                coverImage,
                isPublic,
                visibility,
            });
        }

        setSubmitting(false);
        if (res.success) {
            skipAutosave.current = true;
            clearLocal();
            if (visibility === 'public') {
                // Keep this one row public; remove any leftover draft twins
                draftIdRef.current = null;
                setDraftId(null);
                await deleteAllBlogDrafts(userId);
            } else {
                draftIdRef.current = res.data.id;
                setDraftId(res.data.id);
            }
            onSuccess?.(res.data, { draft: visibility === 'draft' });
            onClose();
        } else {
            setError(res.error?.message || 'Could not save blog.');
        }
    };

    const handleSaveDraftClick = async () => {
        const data = await saveDraft();
        if (data) onSuccess?.(data, { draft: true });
    };

    const saveLabel = (() => {
        if (!ready) return 'Loading draft…';
        if (saveState === 'saving') return 'Saving draft…';
        if (saveState === 'error') return 'Draft save failed — kept locally';
        if (saveState === 'saved' && lastSavedAt) {
            return `Draft saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        if (hasDraftContent) return 'Autosave on';
        return '';
    })();

    if (!ready) {
        return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/70" />
                <div className="relative text-sm text-white/60">Loading draft…</div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Close" />
            <form
                onSubmit={handleSubmit}
                className="relative w-full max-w-2xl surface-elevated p-6 rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto"
            >
                <div className="flex items-start justify-between gap-3 mb-1">
                    <div>
                        <h2 className="text-lg font-bold text-white">Write a blog</h2>
                        <p className="text-sm text-[var(--text-secondary)]">Share something long-form with the community</p>
                    </div>
                    {saveLabel && (
                        <span className={`text-[11px] shrink-0 pt-1 ${saveState === 'error' ? 'text-amber-400' : 'text-white/40'}`}>
                            {saveLabel}
                        </span>
                    )}
                </div>

                <div className="mb-3 mt-4">
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

                <div className="flex items-center justify-between gap-3 mb-4">
                    <p className="text-sm text-[var(--text-secondary)]">Visibility</p>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={isPublic}
                        onClick={() => setIsPublic((v) => !v)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-0.5 text-[11px] font-semibold"
                    >
                        <span className={`px-2.5 py-1 rounded-full ${!isPublic ? 'bg-amber-400 text-[#14181c]' : 'text-white/45'}`}>Draft</span>
                        <span className={`px-2.5 py-1 rounded-full ${isPublic ? 'bg-emerald-400 text-[#14181c]' : 'text-white/45'}`}>Public</span>
                    </button>
                </div>
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[var(--border-color)] text-white/70">Cancel</button>
                    {!editingPublished && (
                        <button
                            type="button"
                            onClick={handleSaveDraftClick}
                            disabled={!hasDraftContent || saveState === 'saving'}
                            className="flex-1 py-2.5 rounded-lg border border-white/15 text-white/80 hover:bg-white/5 disabled:opacity-40"
                        >
                            Save draft
                        </button>
                    )}
                    <button type="submit" disabled={submitting || overLimit} className="flex-1 py-2.5 rounded-lg btn-accent-green disabled:opacity-50">
                        {submitting ? 'Saving…' : (isPublic ? 'Save & publish' : 'Save as draft')}
                    </button>
                </div>
            </form>
        </div>
    );
}
