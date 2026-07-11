import React, { useRef, useEffect, useState } from 'react';
import { FaBold, FaItalic, FaHeading, FaQuoteRight, FaListUl, FaListOl, FaLink, FaImage, FaUnderline } from 'react-icons/fa';

/**
 * Lightweight rich-text editor (contentEditable + execCommand) producing HTML.
 * Used by the blog composer. Output HTML is sanitized on render (see BlogDetails)
 * — never trust it raw. Supports bold/italic/underline, H2/H3, quote, lists,
 * links and inline image insertion.
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

const RichTextEditor = ({ value, onChange, placeholder = 'Write your story…', onInsertImage }) => {
    const ref = useRef(null);
    const lastHtml = useRef(undefined);
    const [empty, setEmpty] = useState(!value);

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
        setEmpty(!ref.current.textContent.trim());
        onChange(html);
    };

    const exec = (cmd, arg = null) => {
        ref.current?.focus();
        document.execCommand(cmd, false, arg);
        emit();
    };

    const addLink = () => {
        const url = window.prompt('Link URL');
        if (url) exec('createLink', url);
    };

    const addImage = async () => {
        if (onInsertImage) {
            const url = await onInsertImage();
            if (url) exec('insertImage', url);
            return;
        }
        const url = window.prompt('Image URL');
        if (url) exec('insertImage', url);
    };

    return (
        <div className="rounded-xl border border-white/10 bg-[#14181c] overflow-hidden">
            <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-white/10 bg-white/[0.02]">
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
                <ToolbarBtn title="Link" onClick={addLink}><FaLink /></ToolbarBtn>
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
