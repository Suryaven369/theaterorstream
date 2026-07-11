import React, { useRef, useEffect, useState } from "react";
import {
    parseMentions, buildMovieToken, buildUserToken, buildPersonToken,
    detectSlashTrigger, detectAtTrigger,
} from "../lib/movieMentions";
import { detectHashTrigger } from "../lib/hashtags";
import { resolveTmdbImageUrl } from "../utils/imageHelper";
import MovieMentionPicker from "./MovieMentionPicker";
import UserPersonPicker from "./UserPersonPicker";
import HashtagPicker from "./HashtagPicker";

const MENTION_CHIP_CLASS =
    "inline-flex items-center gap-1 mx-0.5 px-1 py-0.5 rounded-md bg-white/10 border border-white/10 align-middle select-none";
const USER_CHIP_CLASS =
    "inline-block mx-0.5 px-1.5 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-300 text-sm font-medium align-middle select-none";
const PERSON_CHIP_CLASS =
    "inline-block mx-0.5 px-1.5 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-300 text-sm font-medium align-middle select-none";
const POSTER_BOX_CLASS = { sm: "w-4 h-6", md: "w-6 h-9", lg: "w-8 h-12" };

function renderMovieChipInner(chip) {
    chip.innerHTML = "";
    const { posterPath, size, title } = chip.dataset;

    if (size !== "none" && posterPath) {
        const imgWrap = document.createElement("span");
        imgWrap.className = `relative inline-block shrink-0 ${POSTER_BOX_CLASS[size] || POSTER_BOX_CLASS.sm}`;

        const img = document.createElement("img");
        img.src = resolveTmdbImageUrl(posterPath, { size: "w92" }) || "";
        img.alt = title;
        img.className = "w-full h-full object-cover rounded-sm";
        imgWrap.appendChild(img);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.setAttribute("data-mention-remove", "true");
        removeBtn.className =
            "absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-black text-white/80 hover:text-white flex items-center justify-center text-[9px] leading-none";
        removeBtn.textContent = "×";
        removeBtn.title = "Remove poster";
        imgWrap.appendChild(removeBtn);

        chip.appendChild(imgWrap);
    }

    const titleSpan = document.createElement("span");
    titleSpan.className = "text-orange-400 text-sm font-medium px-0.5";
    titleSpan.textContent = title;
    chip.appendChild(titleSpan);
}

function buildChipElement(seg) {
    const chip = document.createElement("span");
    chip.contentEditable = "false";
    chip.dataset.mention = "true";
    chip.dataset.mentionType = seg.type;

    if (seg.type === "user") {
        chip.dataset.userId = seg.userId;
        chip.dataset.username = seg.username;
        chip.dataset.displayName = seg.displayName;
        chip.className = USER_CHIP_CLASS;
        chip.textContent = `@${seg.displayName}`;
        return chip;
    }
    if (seg.type === "person") {
        chip.dataset.personId = seg.personId;
        chip.dataset.name = seg.name;
        chip.dataset.profilePath = seg.profilePath || "";
        chip.className = PERSON_CHIP_CLASS;
        chip.textContent = `🎭 ${seg.name}`;
        return chip;
    }
    // movie (default)
    chip.dataset.tmdbId = seg.tmdbId;
    chip.dataset.mediaType = seg.mediaType;
    chip.dataset.posterPath = seg.posterPath || "";
    chip.dataset.year = seg.year || "";
    chip.dataset.title = seg.title;
    chip.dataset.size = seg.size;
    chip.className = MENTION_CHIP_CLASS;
    renderMovieChipInner(chip);
    return chip;
}

function serializeContainer(container) {
    let out = "";
    container.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            out += node.nodeValue;
        } else if (node.nodeType === Node.ELEMENT_NODE && node.dataset?.mention === "true") {
            const type = node.dataset.mentionType;
            if (type === "user") {
                out += buildUserToken({ id: node.dataset.userId, username: node.dataset.username, display_name: node.dataset.displayName });
            } else if (type === "person") {
                out += buildPersonToken({ id: node.dataset.personId, name: node.dataset.name, profile_path: node.dataset.profilePath });
            } else {
                out += buildMovieToken(
                    { id: node.dataset.tmdbId, media_type: node.dataset.mediaType, poster_path: node.dataset.posterPath, release_date: node.dataset.year, title: node.dataset.title },
                    { size: node.dataset.size },
                );
            }
        } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR") {
            out += "\n";
        }
    });
    return out;
}

function buildDomFromValue(container, value) {
    container.innerHTML = "";
    parseMentions(value).forEach((seg) => {
        if (seg.type === "text") {
            container.appendChild(document.createTextNode(seg.value));
        } else {
            container.appendChild(buildChipElement(seg));
        }
    });
}

/**
 * Rich-ish composer for post/blog content: plain text editing with inline "/"
 * movie-mention chips (poster + title) instead of raw markup. The canonical value
 * is still a plain string (see lib/movieMentions.js token format) — this component
 * is just the editable view over it, so callers store/submit `value` exactly as before.
 */
const MentionEditor = ({ value, onChange, placeholder, className = "", minHeightClass = "min-h-[28px]" }) => {
    const containerRef = useRef(null);
    const lastEmittedRef = useRef(undefined);
    const triggerRef = useRef(null);
    const [mentionQuery, setMentionQuery] = useState(null);
    const [mentionType, setMentionType] = useState("movie"); // 'movie' | 'mention' | 'hashtag'
    const [isEmpty, setIsEmpty] = useState(!value);

    // Rebuild the DOM only when `value` changes from *outside* this component
    // (initial mount, or the parent resetting it after submit) — never on every
    // keystroke, since that would blow away the caret position.
    useEffect(() => {
        if (value === lastEmittedRef.current) return;
        const container = containerRef.current;
        if (!container) return;
        buildDomFromValue(container, value || "");
        lastEmittedRef.current = value;
        setIsEmpty(!container.textContent);
    }, [value]);

    const emitChange = () => {
        const container = containerRef.current;
        if (!container) return;
        // Browsers often leave a stray <br> or empty text node behind after the
        // user deletes everything — collapse that back to a truly empty editor so
        // the CSS placeholder (:empty) keeps showing.
        if (!container.textContent && container.childNodes.length) {
            container.innerHTML = "";
        }
        const newValue = serializeContainer(container);
        lastEmittedRef.current = newValue;
        setIsEmpty(!container.textContent);
        onChange(newValue);
    };

    const clearTrigger = () => {
        triggerRef.current = null;
        setMentionQuery(null);
    };

    const checkTriggerFromSelection = () => {
        const sel = window.getSelection();
        const container = containerRef.current;
        if (!sel || !sel.isCollapsed || !sel.anchorNode || !container) return clearTrigger();
        if (sel.anchorNode.nodeType !== Node.TEXT_NODE || !container.contains(sel.anchorNode)) return clearTrigger();

        const text = sel.anchorNode.textContent;
        const off = sel.anchorOffset;
        const slash = detectSlashTrigger(text, off);
        const at = detectAtTrigger(text, off);
        const hash = detectHashTrigger(text, off);

        const candidates = [];
        if (slash) candidates.push({ type: "movie", index: slash.slashIndex, query: slash.query });
        if (at) candidates.push({ type: "mention", index: at.atIndex, query: at.query });
        if (hash) candidates.push({ type: "hashtag", index: hash.hashIndex, query: hash.query });

        if (!candidates.length) return clearTrigger();
        candidates.sort((a, b) => b.index - a.index);
        const active = candidates[0];

        triggerRef.current = { node: sel.anchorNode, slashOffset: active.index, type: active.type };
        setMentionType(active.type);
        setMentionQuery(active.query);
    };

    const handleInput = () => {
        emitChange();
        checkTriggerFromSelection();
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;
            const range = sel.getRangeAt(0);
            range.deleteContents();
            const lineBreak = document.createTextNode("\n");
            range.insertNode(lineBreak);
            range.setStartAfter(lineBreak);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            handleInput();
        } else if (e.key === "Escape" && mentionQuery !== null) {
            clearTrigger();
        }
    };

    const handleClick = (e) => {
        const removeBtn = e.target.closest("[data-mention-remove]");
        if (removeBtn) {
            e.preventDefault();
            const chip = removeBtn.closest("[data-mention]");
            if (chip) {
                chip.dataset.size = "none";
                renderMovieChipInner(chip);
                emitChange();
            }
            return;
        }
        checkTriggerFromSelection();
    };

    const handleInsertHashtag = (tag) => {
        const trigger = triggerRef.current;
        const container = containerRef.current;
        if (!trigger || !container) return;

        const sel = window.getSelection();
        const { node, slashOffset } = trigger;
        const cursorOffset = sel && sel.anchorNode === node ? sel.anchorOffset : node.textContent.length;
        const display = String(tag.display_name || tag.displayName || tag.slug || "").replace(/^#/, "");
        const token = `#${display}`;

        const range = document.createRange();
        range.setStart(node, slashOffset);
        range.setEnd(node, cursorOffset);
        range.deleteContents();

        const textNode = document.createTextNode(`${token} `);
        range.insertNode(textNode);

        const newRange = document.createRange();
        newRange.setStart(textNode, textNode.textContent.length);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        container.focus();
        clearTrigger();
        emitChange();
    };

    const handleInsertMention = (item, opts = {}) => {
        const trigger = triggerRef.current;
        const container = containerRef.current;
        if (!trigger || !container) return;

        const sel = window.getSelection();
        const { node, slashOffset } = trigger;
        const cursorOffset = sel && sel.anchorNode === node ? sel.anchorOffset : node.textContent.length;

        const token =
            item.mentionType === "user" ? buildUserToken(item)
            : item.mentionType === "person" ? buildPersonToken(item)
            : buildMovieToken(item, { size: opts.size });
        const [seg] = parseMentions(token);

        const range = document.createRange();
        range.setStart(node, slashOffset);
        range.setEnd(node, cursorOffset);
        range.deleteContents();

        const chip = buildChipElement(seg);
        range.insertNode(chip);

        const spaceNode = document.createTextNode(" ");
        chip.after(spaceNode);

        const newRange = document.createRange();
        newRange.setStart(spaceNode, 1);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        container.focus();
        clearTrigger();
        emitChange();
    };

    return (
        <div className="relative">
            <div
                ref={containerRef}
                contentEditable
                role="textbox"
                aria-multiline="true"
                data-placeholder={placeholder}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onKeyUp={checkTriggerFromSelection}
                onClick={handleClick}
                onBlur={clearTrigger}
                suppressContentEditableWarning
                className={`${className} ${minHeightClass} whitespace-pre-wrap break-words outline-none ${
                    isEmpty ? "before:content-[attr(data-placeholder)] before:text-white/40 before:pointer-events-none" : ""
                }`}
            />
            {mentionQuery !== null && (
                mentionType === "hashtag" ? (
                    <HashtagPicker
                        query={mentionQuery}
                        onSelect={handleInsertHashtag}
                        onClose={clearTrigger}
                    />
                ) : mentionType === "mention" ? (
                    <UserPersonPicker
                        query={mentionQuery}
                        onInsert={handleInsertMention}
                        onClose={clearTrigger}
                    />
                ) : (
                    <MovieMentionPicker
                        query={mentionQuery}
                        onInsert={handleInsertMention}
                        onClose={clearTrigger}
                    />
                )
            )}
        </div>
    );
};

export default MentionEditor;
