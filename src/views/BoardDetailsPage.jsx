import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
    FaArrowLeft, FaPlus, FaTrash, FaHeart, FaGlobe, FaLock, FaEdit, FaSave,
    FaTimes, FaSearch, FaThumbtack, FaComment, FaGripVertical, FaUser, FaImage,
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import {
    getBoardBySlug,
    updateBoard,
    addBoardItem,
    removeBoardItem,
    updateBoardItem,
    reorderBoardItems,
    incrementBoardViews,
    toggleBoardLike,
    isBoardLiked,
    getBoardComments,
    addBoardComment,
    deleteBoardComment,
    deleteBoard,
    boardPath,
    itemHref,
    itemImageUrl,
    stillItemId,
    BOARD_TITLE_MAX,
    BOARD_DESCRIPTION_MAX,
    BOARD_NOTE_MAX,
} from '../lib/supabase';
import FollowEntityButton from '../components/FollowEntityButton';
import SeoHead from '../components/SeoHead';
import { searchContentFromEdge, getTitlePostersFromEdge } from '../lib/contentEdgeApi';
import { searchPeople } from '../lib/peopleApi';
import { uploadCollectionImage } from '../lib/profileSystem';
import { resolveTmdbImageUrl } from '../utils/imageHelper';
import {
    extractImagesFromDataTransfer,
    extractImagesFromClipboard,
    fetchImageAsFile,
    normalizeImageFile,
} from '../lib/boardImageImport';

const TYPE_LABEL = {
    movie: 'Film',
    tv: 'Series',
    director: 'Director',
    actor: 'Actor',
    still: 'Still',
    image: 'Image',
};

/** Full CDN URL for a TMDB path or uploaded http(s) image. */
const posterFullUrl = (path, size = 'w500') => resolveTmdbImageUrl(path, { size }) || null;

const BoardDetailsPage = () => {
    const { slug, username: routeUsername } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user, profile, isAuthenticated } = useAuth();
    const imageURL = useSelector((s) => s.movieData.imageURL);

    const [board, setBoard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [liked, setLiked] = useState(false);
    const [comments, setComments] = useState([]);
    const [commentText, setCommentText] = useState('');
    const [commentBusy, setCommentBusy] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editPublic, setEditPublic] = useState(true);
    const [editShowNotes, setEditShowNotes] = useState(true);
    const [saving, setSaving] = useState(false);

    const [showAdd, setShowAdd] = useState(false);
    const [addTab, setAddTab] = useState('titles'); // titles | people | stills
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [personRole, setPersonRole] = useState('director'); // director | actor

    const [dragId, setDragId] = useState(null);
    const [noteDraft, setNoteDraft] = useState(null);
    // mode: add | add-stills | change | cover
    const [posterPicker, setPosterPicker] = useState(null);
    const [posterBusy, setPosterBusy] = useState(false);
    const [dropActive, setDropActive] = useState(false);
    const [importBusy, setImportBusy] = useState(false);
    const [importHint, setImportHint] = useState('');
    const coverRef = useRef(null);
    const customPosterRef = useRef(null);
    const uploadImageRef = useRef(null);
    const importLockRef = useRef(false);

    const isOwner = user?.id && board?.user_id === user.id;
    const ownerUsername = board?.user_profiles?.username || routeUsername || null;

    const load = useCallback(async (opts = {}) => {
        const silent = !!opts.silent;
        if (!silent) setLoading(true);
        const data = await getBoardBySlug(slug, user?.id, routeUsername || null);
        setBoard(data);
        if (data) {
            setEditTitle(data.title);
            setEditDescription(data.description || '');
            setEditPublic(data.is_public);
            setEditShowNotes(data.show_notes !== false);
            if (!silent && data.is_public) incrementBoardViews(data.id);
            if (user?.id) isBoardLiked(user.id, data.id).then(setLiked);
            getBoardComments(data.id).then(setComments);
        }
        if (!silent) setLoading(false);
    }, [slug, routeUsername, user?.id]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!showAdd || query.trim().length < 2) {
            setResults([]);
            return undefined;
        }
        const t = setTimeout(async () => {
            setSearching(true);
            try {
                if (addTab === 'titles' || addTab === 'stills') {
                    const payload = await searchContentFromEdge(query, { limit: 20 });
                    setResults((payload.data || []).filter((x) => x.poster_path).slice(0, 20));
                } else {
                    const people = await searchPeople(query, {
                        limit: 12,
                        dept: personRole === 'director' ? 'Directing' : null,
                    });
                    setResults(people || []);
                }
            } catch {
                setResults([]);
            }
            setSearching(false);
        }, 280);
        return () => clearTimeout(t);
    }, [query, showAdd, addTab, personRole]);

    const handleSaveMeta = async () => {
        if (!board || !editTitle.trim()) return;
        setSaving(true);
        const result = await updateBoard(board.id, {
            title: editTitle.trim(),
            description: editDescription.trim(),
            is_public: editPublic,
            show_notes: editShowNotes,
        });
        setSaving(false);
        if (result.success) {
            const next = result.data;
            const path = boardPath(next, ownerUsername || profile?.username);
            if (path !== window.location.pathname) navigate(path, { replace: true });
            else await load();
            setIsEditing(false);
        }
    };

    const handleCover = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !user?.id || !board) return;
        const r = await uploadCollectionImage(file, user.id);
        if (r.ok) {
            await updateBoard(board.id, { cover_image: r.url });
            await load();
        }
        e.target.value = '';
    };

    const handleDeleteBoard = async () => {
        if (!board || !isOwner || !user?.id) return;
        if (!window.confirm(`Delete board “${board.title}”? This cannot be undone.`)) return;
        const result = await deleteBoard(board.id, user.id);
        if (result.success) {
            navigate(ownerUsername ? `/${ownerUsername}/boards` : '/boards');
        } else {
            alert(result.error?.message || 'Could not delete board');
        }
    };

    const handleLike = async () => {
        if (!isAuthenticated) {
            sessionStorage.setItem('authMessage', 'Sign in to like boards');
            return navigate('/auth');
        }
        const next = !liked;
        setLiked(next);
        setBoard((b) => b ? { ...b, likes_count: Math.max(0, (b.likes_count || 0) + (next ? 1 : -1)) } : b);
        const res = await toggleBoardLike(user.id, board.id);
        if (!res.success) {
            setLiked(!next);
            setBoard((b) => b ? { ...b, likes_count: Math.max(0, (b.likes_count || 0) + (next ? -1 : 1)) } : b);
        } else setLiked(res.liked);
    };

    const openPosterPicker = async ({
        mode,
        title,
        mediaType,
        tmdbId,
        itemId = null,
        currentPath = null,
        pending = null,
        artKind = 'posters', // posters | stills
    }) => {
        const wantStills = mode === 'add-stills' || artKind === 'stills';
        setPosterPicker({
            mode,
            title,
            mediaType: mediaType === 'tv' ? 'tv' : 'movie',
            tmdbId: String(tmdbId),
            itemId,
            currentPath,
            pending,
            artKind: wantStills ? 'stills' : 'posters',
            posters: [],
            backdrops: currentPath && wantStills ? [{ file_path: currentPath }] : [],
            loading: true,
            selected: wantStills ? null : (currentPath || null),
            selectedSet: wantStills && currentPath ? [currentPath] : [],
        });
        try {
            const data = await getTitlePostersFromEdge(tmdbId, mediaType === 'tv' ? 'tv' : 'movie');
            const posters = data.posters || [];
            const backdrops = data.backdrops || [];
            const fallbackPoster = currentPath || pending?.poster_path || data.default_poster || null;
            const fallbackStill = currentPath || data.default_backdrop || backdrops[0]?.file_path || null;
            setPosterPicker((prev) => prev && prev.tmdbId === String(tmdbId) ? {
                ...prev,
                posters: posters.length ? posters : (fallbackPoster ? [{ file_path: fallbackPoster }] : []),
                backdrops: backdrops.length ? backdrops : (fallbackStill ? [{ file_path: fallbackStill }] : []),
                selected: prev.mode === 'add-stills' ? prev.selected : (prev.selected || fallbackPoster),
                selectedSet: prev.mode === 'add-stills'
                    ? (prev.selectedSet?.length ? prev.selectedSet : (fallbackStill ? [fallbackStill] : []))
                    : prev.selectedSet,
                loading: false,
            } : prev);
        } catch {
            setPosterPicker((prev) => prev ? { ...prev, loading: false } : prev);
        }
    };

    const handleAddTitle = (item) => {
        const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
        const year = (item.release_date || item.first_air_date || '').slice(0, 4);
        openPosterPicker({
            mode: 'add',
            title: item.title || item.name,
            mediaType,
            tmdbId: item.tmdb_id || item.id,
            currentPath: item.poster_path || null,
            pending: {
                item_type: mediaType,
                item_id: item.tmdb_id || item.id,
                title: item.title || item.name,
                subtitle: year || null,
                poster_path: item.poster_path,
            },
        });
    };

    const handleAddStillsFromTitle = (item) => {
        const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
        const year = (item.release_date || item.first_air_date || '').slice(0, 4);
        openPosterPicker({
            mode: 'add-stills',
            title: item.title || item.name,
            mediaType,
            tmdbId: item.tmdb_id || item.id,
            artKind: 'stills',
            pending: {
                media_type: mediaType,
                tmdb_id: item.tmdb_id || item.id,
                title: item.title || item.name,
                subtitle: year || null,
            },
        });
    };

    const handleChangePoster = (item) => {
        if (item.item_type !== 'movie' && item.item_type !== 'tv') return;
        openPosterPicker({
            mode: 'change',
            title: item.title,
            mediaType: item.item_type,
            tmdbId: item.item_id,
            itemId: item.id,
            currentPath: item.image_path || null,
        });
    };

    const handleSetCoverFromItem = async (item) => {
        if (!board || !item?.image_path) return;
        const url = posterFullUrl(item.image_path, item.item_type === 'still' || item.item_type === 'image' ? 'w1280' : 'w780');
        await updateBoard(board.id, { cover_image: url });
        setBoard((b) => (b ? { ...b, cover_image: url } : b));
    };

    const toggleStillSelection = (path) => {
        setPosterPicker((prev) => {
            if (!prev) return prev;
            const set = new Set(prev.selectedSet || []);
            if (set.has(path)) set.delete(path);
            else set.add(path);
            return { ...prev, selectedSet: [...set], selected: path };
        });
    };

    const confirmPosterSelection = async () => {
        if (!board || !user?.id || !posterPicker || posterBusy) return;
        const isStills = posterPicker.mode === 'add-stills';
        if (!isStills && !posterPicker.selected) return;
        if (isStills && !(posterPicker.selectedSet || []).length) return;

        setPosterBusy(true);
        try {
            if (posterPicker.mode === 'add' && posterPicker.pending) {
                await addBoardItem(board.id, {
                    item_type: posterPicker.pending.item_type,
                    item_id: posterPicker.pending.item_id,
                    title: posterPicker.pending.title,
                    subtitle: posterPicker.pending.subtitle,
                    image_path: posterPicker.selected,
                }, user.id);
                setPosterPicker(null);
                setShowAdd(false);
                setQuery('');
                setResults([]);
                await load({ silent: true });
            } else if (posterPicker.mode === 'add-stills' && posterPicker.pending) {
                const paths = [...new Set(posterPicker.selectedSet || [])];
                for (const path of paths) {
                    await addBoardItem(board.id, {
                        item_type: 'still',
                        item_id: stillItemId(posterPicker.pending.media_type, posterPicker.pending.tmdb_id, path),
                        title: posterPicker.pending.title,
                        subtitle: posterPicker.pending.subtitle
                            ? `Still · ${posterPicker.pending.subtitle}`
                            : 'Still',
                        image_path: path,
                    }, user.id);
                }
                setPosterPicker(null);
                setShowAdd(false);
                setQuery('');
                setResults([]);
                await load({ silent: true });
            } else if (posterPicker.mode === 'change' && posterPicker.itemId) {
                await updateBoardItem(posterPicker.itemId, { image_path: posterPicker.selected });
                setBoard((b) => ({
                    ...b,
                    board_items: (b.board_items || []).map((x) =>
                        x.id === posterPicker.itemId ? { ...x, image_path: posterPicker.selected } : x
                    ),
                }));
                setPosterPicker(null);
            } else if (posterPicker.mode === 'cover') {
                const url = posterFullUrl(posterPicker.selected, 'w780');
                await updateBoard(board.id, { cover_image: url });
                setBoard((b) => (b ? { ...b, cover_image: url } : b));
                setPosterPicker(null);
            }
        } finally {
            setPosterBusy(false);
        }
    };

    const handleCustomPosterUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !user?.id || !posterPicker) return;
        const r = await uploadCollectionImage(file, user.id);
        if (r.ok) {
            setPosterPicker((prev) => {
                if (!prev) return prev;
                if (prev.mode === 'add-stills') {
                    return {
                        ...prev,
                        backdrops: [{ file_path: r.url }, ...(prev.backdrops || [])],
                        selectedSet: [...new Set([r.url, ...(prev.selectedSet || [])])],
                        selected: r.url,
                    };
                }
                return {
                    ...prev,
                    posters: [{ file_path: r.url }, ...(prev.posters || [])],
                    selected: r.url,
                };
            });
        }
        e.target.value = '';
    };

    const addImportedImageToBoard = async (imagePath, title = 'Image') => {
        if (!board || !user?.id || !imagePath) {
            return { ok: false, error: 'Not ready to save' };
        }
        // Skip if this exact image is already on the board
        const already = (board.board_items || []).some((x) => x.image_path === imagePath);
        if (already) return { ok: true, skipped: true };

        const result = await addBoardItem(board.id, {
            item_type: 'image',
            item_id: `img_${crypto.randomUUID()}`,
            title,
            subtitle: 'Imported',
            image_path: imagePath,
        }, user.id);
        if (result?.success) {
            // Optimistic append so we don't flash a full reload / duplicate rows
            if (result.data) {
                setBoard((b) => {
                    if (!b) return b;
                    const items = b.board_items || [];
                    if (items.some((x) => x.id === result.data.id || x.image_path === imagePath)) return b;
                    return {
                        ...b,
                        board_items: [...items, result.data],
                        items_count: (b.items_count || items.length) + 1,
                    };
                });
            }
            return { ok: true };
        }
        const msg = result?.error?.message || result?.error || 'Could not save to board';
        const hint = /item_type|check constraint|violates/i.test(String(msg))
            ? 'Run migration 20260713000000_board_stills_images.sql in Supabase, then retry.'
            : String(msg);
        return { ok: false, error: hint };
    };

    /** Resolve files + remote URLs into stored board images (upload when possible). */
    const importImagesFromSources = async ({ files = [], urls = [] }, { intoPicker = false } = {}) => {
        if (importLockRef.current) return 0;
        if (!user?.id) {
            setImportHint('Sign in to add images');
            return 0;
        }

        // One gesture often includes BOTH a File and the same image as a URL —
        // prefer the file and ignore URLs so we don't add the image twice.
        const fileList = files.filter(Boolean);
        const urlList = fileList.length
            ? []
            : [...new Set((urls || []).filter(Boolean))].slice(0, intoPicker ? 8 : 1);

        if (!fileList.length && !urlList.length) {
            setImportHint('No image found in that drop/paste. Try: right-click → Copy image → click the drop zone → Ctrl+V.');
            setTimeout(() => setImportHint(''), 6000);
            return 0;
        }

        importLockRef.current = true;
        setImportBusy(true);
        setImportHint('Importing…');
        let added = 0;
        let skipped = 0;
        let lastError = '';
        const seenPaths = new Set();
        try {
            const pushToPicker = (path) => {
                if (seenPaths.has(path)) return false;
                seenPaths.add(path);
                setPosterPicker((prev) => {
                    if (!prev) return prev;
                    if (prev.mode === 'add-stills') {
                        return {
                            ...prev,
                            backdrops: [{ file_path: path }, ...(prev.backdrops || []).filter((p) => p.file_path !== path)],
                            selectedSet: [...new Set([path, ...(prev.selectedSet || [])])],
                            selected: path,
                        };
                    }
                    return {
                        ...prev,
                        posters: [{ file_path: path }, ...(prev.posters || []).filter((p) => p.file_path !== path)],
                        selected: path,
                    };
                });
                return true;
            };

            for (const raw of fileList.slice(0, 1)) {
                const file = normalizeImageFile(raw);
                const r = await uploadCollectionImage(file, user.id);
                if (!r.ok) {
                    lastError = r.error || 'Upload failed';
                    continue;
                }
                if (seenPaths.has(r.url)) continue;
                seenPaths.add(r.url);
                if (intoPicker) {
                    if (pushToPicker(r.url)) added += 1;
                } else {
                    const saved = await addImportedImageToBoard(r.url, (file.name || 'Image').replace(/\.[^.]+$/, '') || 'Image');
                    if (saved.ok) {
                        if (saved.skipped) skipped += 1;
                        else added += 1;
                    } else lastError = saved.error;
                }
            }

            for (const url of urlList) {
                const file = await fetchImageAsFile(url);
                let path = null;
                let title = 'Web image';
                if (file) {
                    const normalized = normalizeImageFile(file);
                    const r = await uploadCollectionImage(normalized, user.id);
                    if (r.ok) path = r.url;
                    else lastError = r.error || 'Upload failed';
                }
                if (!path && /^https?:\/\//i.test(url)) {
                    path = url;
                    title = 'Linked image';
                }
                if (!path) {
                    if (!lastError) lastError = 'Could not download that image (blocked by the site)';
                    continue;
                }
                if (seenPaths.has(path)) continue;
                seenPaths.add(path);
                if (intoPicker) {
                    if (pushToPicker(path)) added += 1;
                } else {
                    const saved = await addImportedImageToBoard(path, title);
                    if (saved.ok) {
                        if (saved.skipped) skipped += 1;
                        else added += 1;
                    } else lastError = saved.error;
                }
            }
        } finally {
            importLockRef.current = false;
            setImportBusy(false);
            if (added) {
                setImportHint(`Added ${added} image${added === 1 ? '' : 's'}`);
                if (!intoPicker) {
                    setShowAdd(false);
                    setQuery('');
                    setResults([]);
                    // Soft refresh counts/order without wiping the optimistic item
                    load({ silent: true });
                }
            } else if (skipped) {
                setImportHint('That image is already on this board');
            } else {
                setImportHint(lastError || 'Could not import that image — try Copy image, then paste here.');
            }
            setTimeout(() => setImportHint(''), 7000);
        }
        return added;
    };

    const handleUploadBoardImage = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        await importImagesFromSources({ files: [file] });
    };

    const onImageDrop = async (e, { intoPicker = false } = {}) => {
        e.preventDefault();
        e.stopPropagation();
        setDropActive(false);
        const { files, urls } = extractImagesFromDataTransfer(e.dataTransfer);
        await importImagesFromSources({ files, urls }, { intoPicker });
    };

    const onImageDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        setDropActive(true);
    };

    const onImageDragLeave = (e) => {
        e.preventDefault();
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setDropActive(false);
    };

    // Paste while Add (stills) or poster picker is open — even if search input is focused
    useEffect(() => {
        const stillsOpen = showAdd && addTab === 'stills';
        const pickerOpen = !!posterPicker;
        if (!stillsOpen && !pickerOpen) return undefined;

        const onPaste = async (e) => {
            const { files, urls } = await extractImagesFromClipboard(e);
            if (!files.length && !urls.length) return;
            e.preventDefault();
            await importImagesFromSources({ files, urls }, { intoPicker: pickerOpen });
        };

        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showAdd, addTab, posterPicker, board?.id, user?.id]);

    const handleAddPerson = async (person) => {
        await addBoardItem(board.id, {
            item_type: personRole,
            item_id: person.id || person.tmdb_id,
            title: person.name,
            subtitle: person.known_for_department || (personRole === 'director' ? 'Director' : 'Actor'),
            image_path: person.profile_path,
        }, user.id);
        await load();
    };

    const handleRemove = async (item) => {
        await removeBoardItem(board.id, item.id);
        setBoard((b) => ({
            ...b,
            board_items: (b.board_items || []).filter((x) => x.id !== item.id),
            items_count: Math.max(0, (b.items_count || 1) - 1),
        }));
    };

    const handlePin = async (item) => {
        const next = !item.is_pinned;
        await updateBoardItem(item.id, { is_pinned: next });
        setBoard((b) => ({
            ...b,
            board_items: [...(b.board_items || [])]
                .map((x) => (x.id === item.id ? { ...x, is_pinned: next } : x))
                .sort((a, c) => {
                    if (!!a.is_pinned !== !!c.is_pinned) return a.is_pinned ? -1 : 1;
                    return (a.sort_order || 0) - (c.sort_order || 0);
                }),
        }));
    };

    const handleSaveNote = async () => {
        if (!noteDraft) return;
        await updateBoardItem(noteDraft.id, { note: noteDraft.text.trim() || null });
        setBoard((b) => ({
            ...b,
            board_items: (b.board_items || []).map((x) =>
                x.id === noteDraft.id ? { ...x, note: noteDraft.text.trim() || null } : x,
            ),
        }));
        setNoteDraft(null);
    };

    const onDragStart = (id) => {
        if (!isOwner) return;
        setDragId(id);
    };

    const onDragOver = (e, overId) => {
        e.preventDefault();
        if (!isOwner || !dragId || dragId === overId) return;
        setBoard((b) => {
            const items = [...(b.board_items || [])];
            const from = items.findIndex((x) => x.id === dragId);
            const to = items.findIndex((x) => x.id === overId);
            if (from < 0 || to < 0) return b;
            const [moved] = items.splice(from, 1);
            items.splice(to, 0, moved);
            return { ...b, board_items: items.map((x, i) => ({ ...x, sort_order: i })) };
        });
    };

    const onDragEnd = async () => {
        if (!isOwner || !dragId || !board) {
            setDragId(null);
            return;
        }
        const ids = (board.board_items || []).map((x) => x.id);
        setDragId(null);
        await reorderBoardItems(board.id, ids, user.id);
    };

    const submitComment = async () => {
        if (!isAuthenticated) {
            sessionStorage.setItem('authMessage', 'Sign in to comment');
            return navigate('/auth');
        }
        if (!commentText.trim()) return;
        setCommentBusy(true);
        const res = await addBoardComment(board.id, user.id, commentText);
        setCommentBusy(false);
        if (res.success) {
            setCommentText('');
            const list = await getBoardComments(board.id);
            setComments(list);
            setBoard((b) => b ? { ...b, comments_count: (b.comments_count || 0) + 1 } : b);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#080808] flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!board) {
        return (
            <div className="min-h-screen bg-[#080808] flex items-center justify-center text-center">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Board not found</h2>
                    <Link to="/boards" className="text-amber-400 hover:underline">Explore boards</Link>
                </div>
            </div>
        );
    }

    if (!board.is_public && !isOwner) {
        return (
            <div className="min-h-screen bg-[#080808] flex items-center justify-center text-center">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Private board</h2>
                    <Link to="/boards" className="text-amber-400 hover:underline">Explore boards</Link>
                </div>
            </div>
        );
    }

    const items = board.board_items || [];
    const heroImages = items.filter((i) => i.image_path).slice(0, 5);
    const shareUrl = `${window.location.origin}${boardPath(board, ownerUsername)}`;
    const movies = items.filter((i) => i.item_type === 'movie').length;
    const tv = items.filter((i) => i.item_type === 'tv').length;
    const people = items.filter((i) => i.item_type === 'director' || i.item_type === 'actor').length;
    const stills = items.filter((i) => i.item_type === 'still' || i.item_type === 'image').length;

    const coverSrc = board.cover_image || board.banner_image || null;
    const collageItems = heroImages.slice(0, 4);

    return (
        <>
            <SeoHead
                title={`${board.title} · Board · TheaterOrStream`}
                description={board.description || `A cinematic board by @${ownerUsername || 'user'}`}
                image={coverSrc || (heroImages[0] ? itemImageUrl(imageURL, heroImages[0]) : null)}
                url={shareUrl}
            />

            <div className="min-h-screen bg-[#0a0a0a] pt-[calc(4.5rem+env(safe-area-inset-top,0px))] sm:pt-24 pb-4 px-3 sm:px-4 relative">
                {/* Soft ambient wash — not a full-viewport hero */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-56 overflow-hidden opacity-40">
                    {coverSrc ? (
                        <img src={coverSrc} alt="" className="w-full h-full object-cover blur-2xl scale-110" />
                    ) : heroImages[0] ? (
                        <img src={itemImageUrl(imageURL, heroImages[0])} alt="" className="w-full h-full object-cover blur-2xl scale-110" />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-b from-amber-950/40 to-transparent" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/30 via-[#0a0a0a]/80 to-[#0a0a0a]" />
                </div>

                <div className="relative max-w-6xl mx-auto">
                    {(() => {
                        const from = location.state?.from;
                        const ownerBoardsPath = ownerUsername ? `/${ownerUsername}/boards` : '/boards';
                        const backPath = from?.path || ownerBoardsPath;
                        const backLabel = from?.label ? `Back to ${from.label}` : 'Boards';
                        const trailCrumbs = from?.crumbs?.length
                            ? from.crumbs
                            : ownerUsername
                                ? [
                                    { path: `/${ownerUsername}/profile`, label: `@${ownerUsername}` },
                                    { path: ownerBoardsPath, label: 'Boards' },
                                ]
                                : [{ path: '/boards', label: 'Boards' }];
                        return (
                            <>
                                <Link
                                    to={backPath}
                                    className="inline-flex items-center gap-2 text-white/50 hover:text-white text-sm mb-3 transition-colors"
                                >
                                    <FaArrowLeft /> {backLabel}
                                </Link>
                                {trailCrumbs.length > 0 && (
                                    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs sm:text-sm text-white/40 mb-5 min-w-0">
                                        {trailCrumbs.map((crumb, i) => (
                                            <React.Fragment key={`${crumb.path || crumb.label}-${i}`}>
                                                {i > 0 && <span className="text-white/20" aria-hidden>/</span>}
                                                {crumb.path ? (
                                                    <Link to={crumb.path} className="hover:text-white/70 transition-colors truncate max-w-[40vw] sm:max-w-none">
                                                        {crumb.label}
                                                    </Link>
                                                ) : (
                                                    <span className="truncate max-w-[40vw] sm:max-w-none">{crumb.label}</span>
                                                )}
                                            </React.Fragment>
                                        ))}
                                        <span className="text-white/20" aria-hidden>/</span>
                                        <span className="text-white/70 truncate max-w-[50vw] sm:max-w-xs">{board.title}</span>
                                    </nav>
                                )}
                            </>
                        );
                    })()}

                    {/* Compact board header */}
                    <div className="bg-[#141414] border border-white/[0.07] rounded-2xl p-4 sm:p-6 mb-8">
                        {isEditing ? (
                            <div className="space-y-3 max-w-xl">
                                <input
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value.slice(0, BOARD_TITLE_MAX))}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xl font-semibold focus:outline-none focus:border-amber-500/40"
                                />
                                <textarea
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value.slice(0, BOARD_DESCRIPTION_MAX))}
                                    rows={3}
                                    placeholder="What is this board about?"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm resize-none focus:outline-none focus:border-amber-500/40"
                                />
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={() => setEditPublic(!editPublic)} className={`px-3 py-1.5 rounded-lg text-sm ${editPublic ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/50'}`}>
                                        {editPublic ? <><FaGlobe className="inline mr-1" />Public</> : <><FaLock className="inline mr-1" />Private</>}
                                    </button>
                                    <button type="button" onClick={() => setEditShowNotes(!editShowNotes)} className="px-3 py-1.5 rounded-lg text-sm bg-white/10 text-white/70">
                                        Notes {editShowNotes ? 'on' : 'off'}
                                    </button>
                                    <button type="button" onClick={() => coverRef.current?.click()} className="px-3 py-1.5 rounded-lg text-sm bg-white/10 text-white/70">Upload cover</button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const withArt = (board.board_items || []).filter((i) => i.image_path);
                                            if (!withArt.length) {
                                                alert('Add a film or series first, then pick its poster as the cover.');
                                                return;
                                            }
                                            setPosterPicker({
                                                mode: 'cover',
                                                title: board.title,
                                                mediaType: 'movie',
                                                tmdbId: 'board',
                                                posters: withArt.map((i) => ({ file_path: i.image_path, _label: i.title })),
                                                selected: board.cover_image || withArt[0].image_path,
                                                loading: false,
                                            });
                                        }}
                                        className="px-3 py-1.5 rounded-lg text-sm bg-white/10 text-white/70"
                                    >
                                        Poster cover
                                    </button>
                                    <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={handleCover} />
                                </div>
                                <div className="flex flex-wrap justify-between gap-2 pt-1">
                                    <button type="button" onClick={handleDeleteBoard} className="px-3 py-1.5 text-sm text-red-400/80 hover:text-red-400 inline-flex items-center gap-1.5">
                                        <FaTrash className="text-[11px]" /> Delete board
                                    </button>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-sm text-white/50">Cancel</button>
                                        <button type="button" onClick={handleSaveMeta} disabled={saving} className="px-4 py-1.5 text-sm rounded-lg bg-amber-500 text-black font-semibold inline-flex items-center gap-2">
                                            <FaSave /> {saving ? 'Saving…' : 'Save'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-5">
                                <div className="flex items-start gap-4 sm:gap-5">
                                    {/* Cover collage */}
                                    <div className="w-[4.5rem] h-[4.5rem] sm:w-28 sm:h-28 rounded-xl overflow-hidden shrink-0 bg-zinc-900 border border-white/10 shadow-lg">
                                        {coverSrc ? (
                                            <img src={coverSrc} alt="" className="w-full h-full object-cover" />
                                        ) : collageItems.length ? (
                                            <div className="grid grid-cols-2 h-full gap-px bg-white/10">
                                                {collageItems.map((item, i) => (
                                                    <img key={i} src={itemImageUrl(imageURL, item)} alt="" className="w-full h-full object-cover" />
                                                ))}
                                                {Array.from({ length: Math.max(0, 4 - collageItems.length) }).map((_, i) => (
                                                    <div key={`e-${i}`} className="bg-zinc-800" />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="w-full h-full bg-gradient-to-br from-amber-900/50 to-zinc-900 flex items-center justify-center text-amber-200/40 text-2xl">▣</div>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] uppercase tracking-[0.22em] text-amber-400/90 mb-1.5">Movie Board</p>
                                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white tracking-tight break-words">{board.title}</h1>
                                            {board.is_public ? (
                                                <span className="px-2 py-0.5 rounded-md bg-green-500/15 text-green-400 text-[11px] inline-flex items-center gap-1">
                                                    <FaGlobe className="text-[9px]" /> Public
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-md bg-white/10 text-white/55 text-[11px] inline-flex items-center gap-1">
                                                    <FaLock className="text-[9px]" /> Private
                                                </span>
                                            )}
                                        </div>
                                        {board.description ? (
                                            <p className="text-white/55 text-sm leading-relaxed line-clamp-2 sm:line-clamp-3 mb-2">{board.description}</p>
                                        ) : null}
                                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-white/40">
                                            {ownerUsername ? (
                                                <Link to={`/${ownerUsername}/profile`} className="hover:text-white transition-colors">@{ownerUsername}</Link>
                                            ) : null}
                                            <span className="text-white/20">·</span>
                                            <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                                            {movies > 0 && <><span className="text-white/20">·</span><span>{movies} films</span></>}
                                            {tv > 0 && <><span className="text-white/20">·</span><span>{tv} series</span></>}
                                            {people > 0 && <><span className="text-white/20">·</span><span>{people} people</span></>}
                                            {stills > 0 && <><span className="text-white/20">·</span><span>{stills} images</span></>}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {board.is_public && (
                                        <button
                                            type="button"
                                            onClick={handleLike}
                                            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm transition ${
                                                liked ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                                            }`}
                                        >
                                            <FaHeart className="text-xs" /> {board.likes_count || 0}
                                        </button>
                                    )}
                                    {board.is_public && !isOwner && (
                                        <FollowEntityButton
                                            targetType="board"
                                            targetId={board.id}
                                            targetLabel={board.title}
                                            targetImage={board.cover_image || null}
                                            size="sm"
                                        />
                                    )}
                                    {isOwner && (
                                        <>
                                            <button type="button" onClick={() => setIsEditing(true)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10">
                                                <FaEdit /> Edit
                                            </button>
                                            <button type="button" onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-500 text-black font-semibold text-sm hover:bg-amber-400">
                                                <FaPlus /> Add
                                            </button>
                                            <button type="button" onClick={handleDeleteBoard} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-white/40 text-sm hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 ml-auto sm:ml-0">
                                                <FaTrash className="text-[11px]" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Items */}
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <h2 className="text-base sm:text-lg font-semibold text-white">
                            On this board
                            <span className="ml-2 text-white/35 font-normal text-sm">{items.length}</span>
                        </h2>
                        {isOwner && items.length > 1 && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs text-white/55 bg-white/[0.06] border border-white/10 rounded-full px-2.5 py-1">
                                <FaGripVertical className="text-[9px] text-white/40" />
                                Drag to reorder
                            </span>
                        )}
                    </div>

                    {items.length === 0 ? (
                        <div className="text-center py-16 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
                            <p className="text-white/45 mb-4">This board is empty.</p>
                            {isOwner && (
                                <button type="button" onClick={() => setShowAdd(true)} className="px-5 py-2 rounded-lg bg-amber-500 text-black font-semibold text-sm">
                                    Add titles or people
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-3.5">
                            {items.map((item) => {
                                const isPerson = item.item_type === 'director' || item.item_type === 'actor';
                                const isWide = item.item_type === 'still' || item.item_type === 'image';
                                const href = itemHref(item);
                                const media = (
                                    <div className={`relative ${isWide ? 'aspect-video' : 'aspect-[2/3]'} bg-zinc-900`}>
                                        {item.image_path ? (
                                            <img
                                                src={itemImageUrl(imageURL, item)}
                                                alt=""
                                                className={`w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-400 ${isPerson ? 'object-top' : ''}`}
                                                loading="lazy"
                                                draggable={false}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white/20">
                                                {isPerson ? <FaUser className="text-3xl" /> : isWide ? <FaImage className="text-3xl" /> : '🎬'}
                                            </div>
                                        )}
                                        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/75 to-transparent" />
                                        <span className="absolute bottom-1.5 left-1.5 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/65 text-amber-200/90">
                                            {TYPE_LABEL[item.item_type] || item.item_type}
                                        </span>
                                    </div>
                                );
                                return (
                                    <div
                                        key={item.id}
                                        draggable={isOwner}
                                        onDragStart={() => onDragStart(item.id)}
                                        onDragOver={(e) => onDragOver(e, item.id)}
                                        onDragEnd={onDragEnd}
                                        className={`group relative rounded-xl overflow-hidden bg-[#121212] border border-white/[0.06] hover:border-amber-500/35 transition ${
                                            isWide ? 'col-span-2' : ''
                                        } ${
                                            dragId === item.id ? 'opacity-60 scale-[0.98]' : ''
                                        } ${isOwner ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                    >
                                        {isOwner && (
                                            <span className="absolute top-1.5 left-1.5 z-10 w-6 h-6 rounded-md bg-black/65 flex items-center justify-center text-white/45 opacity-0 group-hover:opacity-100">
                                                <FaGripVertical className="text-[9px]" />
                                            </span>
                                        )}
                                        {item.is_pinned && (
                                            <span className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-md bg-black/70 flex items-center justify-center text-amber-400">
                                                <FaThumbtack className="text-[9px]" />
                                            </span>
                                        )}
                                        {href !== '#' ? (
                                            <Link to={href} className="block">{media}</Link>
                                        ) : (
                                            <div className="block">{media}</div>
                                        )}
                                        <div className="p-2 sm:p-2.5">
                                            {href !== '#' ? (
                                                <Link to={href}>
                                                    <h3 className="text-[13px] font-medium text-white line-clamp-2 leading-snug group-hover:text-amber-100">{item.title}</h3>
                                                </Link>
                                            ) : (
                                                <h3 className="text-[13px] font-medium text-white line-clamp-2 leading-snug">{item.title}</h3>
                                            )}
                                            {item.subtitle && <p className="text-[11px] text-white/40 mt-0.5 truncate">{item.subtitle}</p>}
                                            {board.show_notes !== false && item.note && (
                                                <p className="mt-1.5 text-[11px] text-white/50 italic line-clamp-2">&ldquo;{item.note}&rdquo;</p>
                                            )}
                                            {isOwner && (
                                                <div className="flex flex-wrap gap-2 mt-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                    {(item.item_type === 'movie' || item.item_type === 'tv') && (
                                                        <button type="button" onClick={() => handleChangePoster(item)} className="text-[11px] text-white/40 hover:text-amber-400 inline-flex items-center gap-1" title="Change poster">
                                                            <FaImage /> Poster
                                                        </button>
                                                    )}
                                                    {item.image_path && (
                                                        <button type="button" onClick={() => handleSetCoverFromItem(item)} className="text-[11px] text-white/40 hover:text-white" title="Use as board cover">
                                                            Cover
                                                        </button>
                                                    )}
                                                    <button type="button" onClick={() => handlePin(item)} className="text-[11px] text-white/40 hover:text-amber-400" title="Pin"><FaThumbtack /></button>
                                                    {board.show_notes !== false && (
                                                        <button type="button" onClick={() => setNoteDraft({ id: item.id, text: item.note || '' })} className="text-[11px] text-white/40 hover:text-white">Note</button>
                                                    )}
                                                    <button type="button" onClick={() => handleRemove(item)} className="text-[11px] text-white/40 hover:text-red-400 ml-auto"><FaTrash /></button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Comments */}
                    <section className="mt-10 sm:mt-12 max-w-2xl">
                        <h2 className="text-base sm:text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <FaComment className="text-amber-500/80 text-sm" /> Comments
                            <span className="text-white/35 text-sm font-normal">({board.comments_count || comments.length})</span>
                        </h2>
                        <div className="flex gap-2 mb-5">
                            <input
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value.slice(0, 1000))}
                                placeholder={isAuthenticated ? 'Share a thought on this board…' : 'Sign in to comment'}
                                disabled={!isAuthenticated}
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-amber-500/40 disabled:opacity-50"
                            />
                            <button
                                type="button"
                                onClick={submitComment}
                                disabled={commentBusy || !commentText.trim()}
                                className="px-4 py-2 rounded-xl bg-amber-500 text-black text-sm font-semibold disabled:opacity-50"
                            >
                                Post
                            </button>
                        </div>
                        <div className="space-y-4">
                            {comments.map((c) => (
                                <div key={c.id} className="flex gap-3">
                                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/50 shrink-0">
                                        {(c.user_profiles?.username || '?')[0]?.toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 text-xs text-white/40 mb-1">
                                            <span className="text-white/70 font-medium">@{c.user_profiles?.username || 'user'}</span>
                                            <span>{new Date(c.created_at).toLocaleDateString()}</span>
                                            {user?.id === c.user_id && (
                                                <button
                                                    type="button"
                                                    className="ml-auto text-white/30 hover:text-red-400"
                                                    onClick={async () => {
                                                        await deleteBoardComment(c.id, user.id);
                                                        setComments((prev) => prev.filter((x) => x.id !== c.id));
                                                    }}
                                                >
                                                    <FaTrash className="text-[10px]" />
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-sm text-white/80 whitespace-pre-wrap">{c.content}</p>
                                    </div>
                                </div>
                            ))}
                            {!comments.length && <p className="text-sm text-white/35">No comments yet.</p>}
                        </div>
                    </section>
                </div>
            </div>

            {/* Note modal */}
            {noteDraft && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setNoteDraft(null)}>
                    <div className="w-full max-w-md bg-[#141414] border border-white/10 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-white font-semibold mb-3">Personal note</h3>
                        <textarea
                            value={noteDraft.text}
                            onChange={(e) => setNoteDraft({ ...noteDraft, text: e.target.value.slice(0, BOARD_NOTE_MAX) })}
                            rows={4}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-amber-500/40"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2 mt-3">
                            <button type="button" onClick={() => setNoteDraft(null)} className="px-3 py-1.5 text-sm text-white/50">Cancel</button>
                            <button type="button" onClick={handleSaveNote} className="px-4 py-1.5 text-sm rounded-lg bg-amber-500 text-black font-semibold">Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Poster / stills picker */}
            {posterPicker && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80" onClick={() => !posterBusy && setPosterPicker(null)}>
                    <div className="w-full max-w-3xl max-h-[min(92dvh,92vh)] sheet-mobile sm:max-h-[88vh] bg-[#121212] border border-white/10 rounded-t-2xl sm:rounded-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="sm:hidden flex justify-center pt-2 pb-1">
                            <span className="h-1 w-10 rounded-full bg-white/25" />
                        </div>
                        <div className="p-4 border-b border-white/10 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400/90 mb-1">
                                    {posterPicker.mode === 'cover'
                                        ? 'Board cover'
                                        : posterPicker.mode === 'change'
                                            ? 'Change poster'
                                            : posterPicker.mode === 'add-stills'
                                                ? 'Add stills'
                                                : 'Choose poster'}
                                </p>
                                <h2 className="text-lg font-semibold text-white truncate">{posterPicker.title}</h2>
                                <p className="text-xs text-white/40 mt-1">
                                    {posterPicker.mode === 'add-stills'
                                        ? 'Select one or more movie stills to pin on this board'
                                        : 'Pick the art that goes on this board'}
                                </p>
                            </div>
                            <button type="button" onClick={() => !posterBusy && setPosterPicker(null)} className="text-white/50 hover:text-white shrink-0"><FaTimes /></button>
                        </div>
                        <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-white/5">
                            <button
                                type="button"
                                onClick={() => customPosterRef.current?.click()}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
                            >
                                <FaImage className="text-xs" /> Upload custom
                            </button>
                            <input ref={customPosterRef} type="file" accept="image/*" className="hidden" onChange={handleCustomPosterUpload} />
                            {posterPicker.mode === 'add-stills' && (posterPicker.selectedSet || []).length > 0 && (
                                <span className="text-xs text-amber-300/90">{posterPicker.selectedSet.length} selected</span>
                            )}
                            {posterPicker.loading && (
                                <span className="text-xs text-white/40 inline-flex items-center gap-2">
                                    <span className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                    Loading…
                                </span>
                            )}
                        </div>
                        <div
                            className={`mx-4 mt-3 rounded-xl border border-dashed px-3 py-2.5 text-center text-[11px] transition ${
                                dropActive ? 'border-amber-500 bg-amber-500/10 text-amber-200' : 'border-white/15 text-white/40'
                            }`}
                            onDragEnter={onImageDragOver}
                            onDragOver={onImageDragOver}
                            onDragLeave={onImageDragLeave}
                            onDrop={(e) => onImageDrop(e, { intoPicker: true })}
                        >
                            {importBusy ? 'Importing…' : 'Drop or paste an image from Google / another tab into this picker'}
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            {(() => {
                                const isStills = posterPicker.mode === 'add-stills';
                                const list = isStills ? (posterPicker.backdrops || []) : (posterPicker.posters || []);
                                if (!posterPicker.loading && !list.length) {
                                    return <p className="text-sm text-white/40 text-center py-10">{isStills ? 'No stills found for this title.' : 'No posters found for this title.'}</p>;
                                }
                                return (
                                    <div className={`grid gap-2.5 ${isStills ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'}`}>
                                        {list.map((p) => {
                                            const path = p.file_path;
                                            const selected = isStills
                                                ? (posterPicker.selectedSet || []).includes(path)
                                                : posterPicker.selected === path;
                                            const src = posterFullUrl(path, isStills ? 'w780' : 'w185');
                                            return (
                                                <button
                                                    key={path}
                                                    type="button"
                                                    onClick={() => (isStills ? toggleStillSelection(path) : setPosterPicker((prev) => prev ? { ...prev, selected: path } : prev))}
                                                    className={`relative rounded-xl overflow-hidden border-2 transition ${
                                                        selected ? 'border-amber-500 ring-2 ring-amber-500/30' : 'border-transparent hover:border-white/20'
                                                    }`}
                                                >
                                                    <img src={src} alt="" className={`${isStills ? 'aspect-video' : 'aspect-[2/3]'} w-full object-cover`} loading="lazy" />
                                                    {selected && (
                                                        <span className="absolute inset-x-0 bottom-0 bg-amber-500 text-black text-[10px] font-semibold py-1 text-center">
                                                            {isStills ? 'Selected' : 'Selected'}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="p-4 border-t border-white/10 flex justify-end gap-2 pb-sheet">
                            <button type="button" onClick={() => setPosterPicker(null)} disabled={posterBusy} className="px-3 py-2.5 text-sm text-white/50 tap-target">Cancel</button>
                            <button
                                type="button"
                                onClick={confirmPosterSelection}
                                disabled={
                                    posterBusy
                                    || (posterPicker.mode === 'add-stills'
                                        ? !(posterPicker.selectedSet || []).length
                                        : !posterPicker.selected)
                                }
                                className="px-4 py-2.5 rounded-lg bg-amber-500 text-black text-sm font-semibold disabled:opacity-50 tap-target"
                            >
                                {posterBusy
                                    ? 'Saving…'
                                    : posterPicker.mode === 'add'
                                        ? 'Add to board'
                                        : posterPicker.mode === 'add-stills'
                                            ? `Add ${(posterPicker.selectedSet || []).length || ''} still${(posterPicker.selectedSet || []).length === 1 ? '' : 's'}`
                                            : posterPicker.mode === 'cover'
                                                ? 'Set as cover'
                                                : 'Save poster'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add modal */}
            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80" onClick={() => setShowAdd(false)}>
                    <div className="w-full max-w-3xl max-h-[min(92dvh,92vh)] sheet-mobile sm:max-h-[85vh] bg-[#121212] border border-white/10 rounded-t-2xl sm:rounded-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="sm:hidden flex justify-center pt-2 pb-1">
                            <span className="h-1 w-10 rounded-full bg-white/25" />
                        </div>
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-white">Add to board</h2>
                            <button type="button" onClick={() => setShowAdd(false)} className="text-white/50 hover:text-white"><FaTimes /></button>
                        </div>
                        <p className="px-4 pt-2 text-xs text-white/40">
                            {addTab === 'stills'
                                ? 'Search a title to pick cinematic stills, or upload your own image.'
                                : 'Films & TV open a poster picker so you can choose the art that appears on the board.'}
                        </p>
                        <div className="px-4 pt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={() => { setAddTab('titles'); setResults([]); }} className={`px-3 py-1.5 rounded-full text-sm ${addTab === 'titles' ? 'bg-amber-500 text-black' : 'bg-white/5 text-white/50'}`}>Films & TV</button>
                            <button type="button" onClick={() => { setAddTab('stills'); setResults([]); }} className={`px-3 py-1.5 rounded-full text-sm ${addTab === 'stills' ? 'bg-amber-500 text-black' : 'bg-white/5 text-white/50'}`}>Stills & images</button>
                            <button type="button" onClick={() => { setAddTab('people'); setResults([]); }} className={`px-3 py-1.5 rounded-full text-sm ${addTab === 'people' ? 'bg-amber-500 text-black' : 'bg-white/5 text-white/50'}`}>Directors & Actors</button>
                        </div>
                        {addTab === 'stills' && (
                            <div className="px-4 pt-3 space-y-2">
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => !importBusy && uploadImageRef.current?.click()}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            uploadImageRef.current?.click();
                                        }
                                    }}
                                    onDragEnter={onImageDragOver}
                                    onDragOver={onImageDragOver}
                                    onDragLeave={onImageDragLeave}
                                    onDrop={(e) => onImageDrop(e, { intoPicker: false })}
                                    className={`w-full rounded-xl border-2 border-dashed px-4 py-6 text-center transition cursor-pointer ${
                                        dropActive
                                            ? 'border-amber-500 bg-amber-500/10'
                                            : 'border-white/20 bg-white/[0.03] hover:border-white/35 hover:bg-white/[0.05]'
                                    }`}
                                >
                                    <FaImage className={`mx-auto text-xl mb-2 ${dropActive ? 'text-amber-400' : 'text-white/40'}`} />
                                    <p className="text-sm text-white/80 font-medium">
                                        {importBusy ? 'Importing…' : dropActive ? 'Drop image to add' : 'Drop or paste an image'}
                                    </p>
                                    <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed max-w-md mx-auto">
                                        Best on phone: long-press image → <span className="text-white/60">Copy</span> → tap here → paste.
                                        Or tap below to choose from your camera roll.
                                    </p>
                                    <p className="text-[11px] text-amber-400/80 mt-2">Click to browse files</p>
                                </div>
                                <input ref={uploadImageRef} type="file" accept="image/*" className="hidden" onChange={handleUploadBoardImage} />
                                {importHint && (
                                    <p className={`text-xs ${importHint.startsWith('Could') ? 'text-red-400/90' : 'text-white/50'}`}>{importHint}</p>
                                )}
                            </div>
                        )}
                        {addTab === 'people' && (
                            <div className="px-4 pt-2 flex gap-2">
                                <button type="button" onClick={() => setPersonRole('director')} className={`px-3 py-1 rounded-lg text-xs ${personRole === 'director' ? 'bg-white/15 text-white' : 'text-white/40'}`}>Directors</button>
                                <button type="button" onClick={() => setPersonRole('actor')} className={`px-3 py-1 rounded-lg text-xs ${personRole === 'actor' ? 'bg-white/15 text-white' : 'text-white/40'}`}>Actors</button>
                            </div>
                        )}
                        <div className="p-4">
                            <div className="relative">
                                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 text-sm" />
                                <input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={
                                        addTab === 'people'
                                            ? `Search ${personRole}s…`
                                            : addTab === 'stills'
                                                ? 'Search a film or series for stills…'
                                                : 'Search movies & TV…'
                                    }
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500/40"
                                    autoFocus
                                />
                                {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 pb-6">
                            {addTab === 'people' ? (
                                <div className="space-y-2">
                                    {results.map((person) => {
                                        const id = String(person.id || person.tmdb_id);
                                        const already = items.some((x) => String(x.item_id) === id && x.item_type === personRole);
                                        return (
                                            <button
                                                key={id}
                                                type="button"
                                                disabled={already}
                                                onClick={() => handleAddPerson(person)}
                                                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 disabled:opacity-40 text-left"
                                            >
                                                <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-800 shrink-0">
                                                    {person.profile_path ? (
                                                        <img src={`https://image.tmdb.org/t/p/w185${person.profile_path}`} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-white/30"><FaUser /></div>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-sm text-white font-medium">{person.name}</p>
                                                    <p className="text-xs text-white/40">{person.known_for_department || personRole}</p>
                                                </div>
                                                <span className="ml-auto text-xs text-amber-400">{already ? 'Added' : 'Add'}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3">
                                    {results.map((item) => {
                                        const id = String(item.tmdb_id || item.id);
                                        const already = addTab === 'titles' && items.some((x) => String(x.item_id) === id && (x.item_type === 'movie' || x.item_type === 'tv'));
                                        return (
                                            <button
                                                key={`${addTab}-${id}`}
                                                type="button"
                                                disabled={already}
                                                onClick={() => (addTab === 'stills' ? handleAddStillsFromTitle(item) : handleAddTitle(item))}
                                                className="text-left rounded-xl overflow-hidden border border-white/5 hover:border-amber-500/40 disabled:opacity-40"
                                            >
                                                <img
                                                    src={resolveTmdbImageUrl(item.poster_path, { size: 'w342' })}
                                                    alt=""
                                                    className="aspect-[2/3] w-full object-cover bg-zinc-900"
                                                    loading="lazy"
                                                />
                                                <p className="p-1.5 text-[11px] text-white/70 line-clamp-2">{item.title || item.name}</p>
                                                {addTab === 'stills' && (
                                                    <p className="px-1.5 pb-1.5 text-[10px] text-amber-400/80">Pick stills</p>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default BoardDetailsPage;
