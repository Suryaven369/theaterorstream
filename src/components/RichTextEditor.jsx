import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FaBold, FaItalic, FaHeading, FaQuoteRight, FaListUl, FaListOl, FaLink, FaImage, FaUnderline, FaTimes } from 'react-icons/fa';

/**
 * Lightweight rich-text editor (contentEditable + execCommand) producing HTML.
 * Link insertion uses an inline Word/Docs-style dropdown — never window.prompt.
 */

const ToolbarBtn = ({ onClick, title, children, active }) => (
    <button
        type="button"
        title={title}
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        className={`w-8 h-8 flex items-center justify-center rounded-md text-sm transition-colors ${active ? 'bg-[var(--primary)]/20 text-[var(--primary)]' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
    >
        {children}
    </button>
);

function normalizeUrl(raw) {
    const url = String(raw || '').trim();
    if (!url) return '';
    if (/^https?:\/\//i.test(url) || url.startsWith('mailto:') || url.startsWith('/')) return url;
    return `https://${url}`;
}

const RichTextEditor = ({ value, onChange, placeholder = 'Write your story…', onInsertImage }) => {
    const ref = useRef(null);
    const lastHtml = useRef(undefined);
    const savedRange = useRef(null);
    const linkBtnRef = useRef(null);
    const popoverRef = useRef(null);
    const [empty, setEmpty] = useState(!value);
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [linkText, setLinkText] = useState('');
    const [hasSelection, setHasSelection] = useState(false);

    useEffect(() => {
        if (value === lastHtml.current) return;
        if (ref.current) {
            ref.current.innerHTML = value || '';
            lastHtml.current = value;
            setEmpty(!ref.current.textContent.trim());
        }
    }, [value]);

    const emit = () => {
        const html = ref.current?.innerHTML || '';
        lastHtml.current = html;
        setEmpty(!ref.current?.textContent?.trim());
        onChange(html);
    };

    const exec = (cmd, arg = null) => {
        ref.current?.focus();
        document.execCommand(cmd, false, arg);
        emit();
    };

    const saveSelection = () => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            savedRange.current = null;
            return;
        }
        const range = sel.getRangeAt(0);
        if (ref.current && ref.current.contains(range.commonAncestorContainer)) {
            savedRange.current = range.cloneRange();
            setHasSelection(!sel.isCollapsed && !!sel.toString().trim());
            if (!sel.isCollapsed) setLinkText(sel.toString());
        }
    };

    const restoreSelection = () => {
        const range = savedRange.current;
        if (!range) return false;
        const sel = window.getSelection();
        if (!sel) return false;
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
    };

    const openLinkPopover = () => {
        saveSelection();
        // Prefill if caret is inside an existing link
        const sel = window.getSelection();
        let existing = '';
        if (sel?.anchorNode) {
            let node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
            while (node && node !== ref.current) {
                if (node.tagName === 'A') {
                    existing = node.getAttribute('href') || '';
                    break;
                }
                node = node.parentElement;
            }
        }
        setLinkUrl(existing);
        setLinkOpen(true);
        setTimeout(() => popoverRef.current?.querySelector('input')?.focus(), 0);
    };

    const closeLinkPopover = () => {
        setLinkOpen(false);
        setLinkUrl('');
        setLinkText('');
    };

    const applyLink = (e) => {
        e?.preventDefault?.();
        const url = normalizeUrl(linkUrl);
        if (!url) return;
        ref.current?.focus();
        restoreSelection();
        if (hasSelection || (window.getSelection() && !window.getSelection().isCollapsed)) {
            document.execCommand('createLink', false, url);
        } else {
            const label = (linkText || url).replace(/</g, '&lt;');
            document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>&nbsp;`);
        }
        emit();
        closeLinkPopover();
    };

    const removeLink = (e) => {
        e?.preventDefault?.();
        ref.current?.focus();
        restoreSelection();
        document.execCommand('unlink', false, null);
        emit();
        closeLinkPopover();
    };

    useEffect(() => {
        if (!linkOpen) return undefined;
        const onDoc = (ev) => {
            if (popoverRef.current?.contains(ev.target)) return;
            if (linkBtnRef.current?.contains(ev.target)) return;
            closeLinkPopover();
        };
        const onKey = (ev) => {
            if (ev.key === 'Escape') closeLinkPopover();
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [linkOpen]);

    const addImage = useCallback(async () => {
        if (onInsertImage) {
            const url = await onInsertImage();
            if (url) exec('insertImage', url);
        }
    }, [onInsertImage]);

    return (
        <div className="rounded-xl border border-white/10 bg-[#14181c] overflow-hidden">
            <div className="relative flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-white/10 bg-white/[0.02]">
                <ToolbarBtn title="Bold" onClick={() => exec('bold')}><FaBold /></ToolbarBtn>
                <ToolbarBtn title="Italic" onClick={() => exec('italic')}><FaItalic /></ToolbarBtn>
                <ToolbarBtn title="Underline" onClick={() => exec('underline')}><FaUnderline /></ToolbarBtn>
                <span className="w-px h-5 bg-white/10 mx-1" />
                <ToolbarBtn title="Heading" onClick={() => exec('formatBlock', 'H2')}><FaHeading /></ToolbarBtn>
                <ToolbarBtn title="Subheading" onClick={() => exec('formatBlock', 'H3')}><span className="text-[11px] font-bold">H3</span></ToolbarBtn>
                <ToolbarBtn title="Quote" onClick={() => exec('formatBlock', 'BLOCKQUOTE')}><FaQuoteRight /></ToolbarBtn>
                <span className="w-px h-5 bg-white/10 mx-1" />
                <ToolbarBtn title="Bullet list" onClick={() => exec('insertUnorderedList')}><FaListUl /></ToolbarBtn>
                <ToolbarBtn title="Numbered list" onClick={() => exec('insertOrderedList')}><FaListOl /></ToolbarBtn>
                <span className="w-px h-5 bg-white/10 mx-1" />
                <span className="relative" ref={linkBtnRef}>
                    <ToolbarBtn title="Link" onClick={openLinkPopover} active={linkOpen}><FaLink /></ToolbarBtn>
                    {linkOpen && (
                        <div
                            ref={popoverRef}
                            className="absolute left-0 top-full mt-1.5 z-30 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-white/15 bg-[#1a1f24] shadow-2xl p-3"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-white/80">Insert link</p>
                                <button
                                    type="button"
                                    onClick={closeLinkPopover}
                                    className="w-6 h-6 rounded-md text-white/40 hover:text-white hover:bg-white/10 flex items-center justify-center"
                                    aria-label="Close"
                                >
                                    <FaTimes className="text-[10px]" />
                                </button>
                            </div>
                            <label className="block text-[10px] uppercase tracking-wide text-white/40 mb-1">URL</label>
                            <input
                                type="url"
                                value={linkUrl}
                                onChange={(e) => setLinkUrl(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        applyLink(e);
                                    }
                                }}
                                placeholder="https://example.com"
                                className="w-full mb-2 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-[var(--primary)]"
                            />
                            {!hasSelection && (
                                <>
                                    <label className="block text-[10px] uppercase tracking-wide text-white/40 mb-1">Text (optional)</label>
                                    <input
                                        type="text"
                                        value={linkText}
                                        onChange={(e) => setLinkText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                applyLink(e);
                                            }
                                        }}
                                        placeholder="Link label"
                                        className="w-full mb-2 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-[var(--primary)]"
                                    />
                                </>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                                <button
                                    type="button"
                                    onClick={applyLink}
                                    disabled={!linkUrl.trim()}
                                    className="flex-1 py-1.5 rounded-lg bg-[var(--color-theater)] text-[#14181c] text-xs font-semibold disabled:opacity-40"
                                >
                                    Apply
                                </button>
                                <button
                                    type="button"
                                    onClick={removeLink}
                                    className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white/60 hover:text-white"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    )}
                </span>
                <ToolbarBtn title="Insert image" onClick={addImage}><FaImage /></ToolbarBtn>
            </div>

            <div className="relative">
                <div
                    ref={ref}
                    contentEditable
                    onInput={emit}
                    onBlur={emit}
                    suppressContentEditableWarning
                    className="rich-content min-h-[220px] max-h-[55vh] overflow-y-auto px-4 py-3 text-white/90 outline-none leading-relaxed"
                />
                {empty && (
                    <span className="pointer-events-none absolute top-3 left-4 text-white/30">{placeholder}</span>
                )}
            </div>
        </div>
    );
};

export default RichTextEditor;
