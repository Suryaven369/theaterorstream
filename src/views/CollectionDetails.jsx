import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSelector } from 'react-redux';
import {
    getCollectionBySlug,
    removeFromCollection,
    addMoviesToCollection,
    updateUserCollection,
    saveFullMovieToLibrary,
    deleteUserCollection,
} from '../lib/supabase';
import { FaTrash, FaLock, FaGlobe, FaFolderOpen, FaArrowLeft, FaPlus, FaSearch, FaCheck, FaTimes, FaEdit, FaSave, FaShare, FaLink, FaTwitter, FaEllipsisH, FaImage } from 'react-icons/fa';
import ConfirmationModal from '../components/ConfirmationModal';
import { searchContentFromEdge, getMovieDetailFromEdge } from '../lib/contentEdgeApi';
import { isTheaterSystemCollection } from '../lib/theaterWatch';
import { getAvatarUrl, toPublicStorageUrl } from '../lib/storagePublicUrl';
import { resolveTmdbImageUrl } from '../utils/imageHelper';
import { uploadCollectionImage } from '../lib/profileSystem';
import {
    getPageCache,
    loadWithPageCache,
    setPageCache,
    invalidatePageCache,
    collectionPageKey,
    collectionsListKey,
} from '../lib/pageSessionCache';

// Helper to create URL-friendly slug
const createSlug = (text) => {
    const slug = String(text || '')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
    return slug || 'collection';
};

/** Overlapping owner + collaborator avatars (hover name, click → profile). */
const CollectionPeopleStack = ({ owner, collaborators = [] }) => {
    const people = [];
    if (owner?.username || owner?.id) {
        people.push({
            id: owner.id || 'owner',
            username: owner.username,
            displayName: owner.display_name || owner.username || 'Owner',
            avatarUrl: owner.avatar_url,
            isVerified: !!owner.is_verified,
        });
    }
    for (const c of collaborators || []) {
        if (!c?.username && !c?.id) continue;
        if (owner?.id && c.id === owner.id) continue;
        if (people.some((p) => p.id === c.id || p.username === c.username)) continue;
        people.push({
            id: c.id,
            username: c.username,
            displayName: c.display_name || c.username || 'Collaborator',
            avatarUrl: c.avatar_url,
            isVerified: !!c.is_verified,
        });
    }
    if (!people.length) return null;

    return (
        <div className="flex items-center gap-2.5">
            <div className="flex items-center -space-x-2">
                {people.map((p, i) => (
                    <Link
                        key={p.id || p.username || i}
                        to={p.username ? `/${p.username}/profile` : '#'}
                        className="relative group/avatar block rounded-full ring-2 ring-[#1a1a1a] hover:z-20 focus:z-20 focus:outline-none focus-visible:ring-purple-400/60"
                        style={{ zIndex: people.length - i }}
                    >
                        <span className="block w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500">
                            {p.avatarUrl ? (
                                <img
                                    src={getAvatarUrl(p.avatarUrl, 36)}
                                    alt=""
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <span className="w-full h-full flex items-center justify-center text-xs font-bold text-white">
                                    {(p.displayName || p.username || '?').charAt(0).toUpperCase()}
                                </span>
                            )}
                        </span>
                        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 rounded-md bg-black/90 border border-white/10 text-[10px] text-white whitespace-nowrap opacity-0 group-hover/avatar:opacity-100 transition-opacity z-30">
                            {p.username ? `@${p.username}` : p.displayName}
                        </span>
                    </Link>
                ))}
            </div>
        </div>
    );
};

// Poster Collage Component - Shows first 4 movie posters in a grid
const PosterCollage = ({ movies, imageURL, size = 'large' }) => {
    const posters = (movies || []).filter((m) => m?.poster_path).slice(0, 4);
    // Responsive sizing: smaller on mobile
    const sizeClasses = size === 'large' ? 'w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32' : 'w-16 h-16 sm:w-20 sm:h-20';

    if (posters.length === 0) {
        return (
            <div className={`${sizeClasses} rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center`}>
                <FaFolderOpen className="text-4xl text-white" />
            </div>
        );
    }

    if (posters.length === 1) {
        const src = resolveTmdbImageUrl(posters[0].poster_path, {
            base64: posters[0].images?.poster_base64,
            baseUrl: imageURL || undefined,
            size: 'w342',
        });
        return (
            <div className={`${sizeClasses} rounded-2xl overflow-hidden bg-black/40`}>
                {src ? (
                    <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800" />
                )}
            </div>
        );
    }

    return (
        <div className={`${sizeClasses} rounded-2xl overflow-hidden grid grid-cols-2 gap-0 bg-black/40`}>
            {posters.map((movie, index) => (
                <div key={movie.movie_id || index} className="relative overflow-hidden">
                    {(() => {
                        const src = resolveTmdbImageUrl(movie.poster_path, {
                            base64: movie.images?.poster_base64,
                            baseUrl: imageURL || undefined,
                            size: 'w342',
                        });
                        return src ? (
                            <img
                                src={src}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                                <span className="text-lg">🎬</span>
                            </div>
                        );
                    })()}
                </div>
            ))}
            {Array.from({ length: 4 - posters.length }).map((_, index) => (
                <div key={`empty-${index}`} className="bg-gradient-to-br from-gray-700 to-gray-800" />
            ))}
        </div>
    );
};

// Share Modal Component
const ShareModal = ({ collection, movies, imageURL, shareUrl, onClose }) => {
    const [copied, setCopied] = useState(false);
    const canvasRef = useRef(null);

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = shareUrl;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleNativeShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: collection.name,
                    text: collection.description || `Check out this movie collection: ${collection.name}`,
                    url: shareUrl
                });
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Share failed:', err);
                }
            }
        }
    };

    const handleTwitterShare = () => {
        const text = encodeURIComponent(`Check out my movie collection: ${collection.name} 🎬`);
        const url = encodeURIComponent(shareUrl);
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
    };

    const posters = movies.slice(0, 4);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">Share Collection</h2>
                    <button onClick={onClose} className="text-white/50 hover:text-white">
                        <FaTimes className="text-xl" />
                    </button>
                </div>

                {/* Preview Card */}
                <div className="p-6">
                    <div className="bg-gradient-to-br from-purple-900/50 to-pink-900/50 rounded-xl p-4 border border-white/10">
                        {/* Collection Cover Preview */}
                        <div className="flex gap-4 items-start">
                            {/* Poster Grid */}
                            <div className="w-24 h-24 rounded-xl overflow-hidden grid grid-cols-2 gap-0 bg-black/30 flex-shrink-0">
                                {posters.map((movie, index) => (
                                    <div key={movie.movie_id || index} className="relative overflow-hidden">
                                        {movie.poster_path ? (
                                            <img
                                                src={`${imageURL}${movie.poster_path}`}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-gray-700" />
                                        )}
                                    </div>
                                ))}
                                {Array.from({ length: Math.max(0, 4 - posters.length) }).map((_, i) => (
                                    <div key={`empty-${i}`} className="bg-gray-700" />
                                ))}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-orange-400 text-xs font-bold">TOS</span>
                                    <span className="text-white/40 text-xs">•</span>
                                    <span className="text-white/40 text-xs">Collection</span>
                                </div>
                                <h3 className="text-white font-bold text-lg leading-tight mb-1 truncate">
                                    {collection.name}
                                </h3>
                                <p className="text-white/50 text-sm line-clamp-2">
                                    {collection.description || `${movies.length} movies curated with love`}
                                </p>
                                <div className="mt-2 scale-90 origin-left">
                                    <CollectionPeopleStack
                                        owner={collection.user_profiles}
                                        collaborators={collection.collaborators}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Share Options */}
                    <div className="mt-6 space-y-3">
                        {/* Copy Link */}
                        <button
                            onClick={handleCopyLink}
                            className={`w-full flex items-center justify-center gap-3 p-4 rounded-xl transition-all ${copied
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                                }`}
                        >
                            {copied ? <FaCheck /> : <FaLink />}
                            {copied ? 'Link Copied!' : 'Copy Link'}
                        </button>

                        {/* Share Buttons Row */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* Native Share (mobile) */}
                            {navigator.share && (
                                <button
                                    onClick={handleNativeShare}
                                    className="flex items-center justify-center gap-2 p-4 rounded-xl bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30 transition-all"
                                >
                                    <FaShare /> Share
                                </button>
                            )}

                            {/* Twitter */}
                            <button
                                onClick={handleTwitterShare}
                                className={`flex items-center justify-center gap-2 p-4 rounded-xl bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30 transition-all ${!navigator.share ? 'col-span-2' : ''}`}
                            >
                                <FaTwitter /> Tweet
                            </button>
                        </div>
                    </div>

                    {/* URL Display */}
                    <div className="mt-4 p-3 bg-black/30 rounded-lg border border-white/5">
                        <p className="text-xs text-white/40 truncate">{shareUrl}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CollectionDetails = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { slug } = useParams();
    const { user, profile, loading: authLoading } = useAuth();
    const imageURL = useSelector((state) => state.movieData.imageURL);

    const [collection, setCollection] = useState(null);
    const [loading, setLoading] = useState(true);
    const [removing, setRemoving] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [deleteCollectionOpen, setDeleteCollectionOpen] = useState(false);
    const [deletingCollection, setDeletingCollection] = useState(false);

    // Edit mode state
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editIsPublic, setEditIsPublic] = useState(false);
    const [editFranchise, setEditFranchise] = useState(false);
    const [editCoverImage, setEditCoverImage] = useState(null);
    const [coverUploading, setCoverUploading] = useState(false);
    const [coverError, setCoverError] = useState('');
    const [saving, setSaving] = useState(false);
    const coverInputRef = useRef(null);

    // Share modal state
    const [showShareModal, setShowShareModal] = useState(false);
    const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
    const actionsMenuRef = useRef(null);

    // Add Movies Modal State
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [selectedMovies, setSelectedMovies] = useState([]);
    const [addingMovies, setAddingMovies] = useState(false);

    useEffect(() => {
        if (slug) {
            loadCollection();
        }
    }, [slug, user?.id]);

    useEffect(() => {
        if (!actionsMenuOpen) return undefined;
        const onDoc = (e) => {
            if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target)) {
                setActionsMenuOpen(false);
            }
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setActionsMenuOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [actionsMenuOpen]);

    const applyCollectionToForm = (data) => {
        if (!data) return;
        setEditName(data.name);
        setEditDescription(data.description || '');
        setEditIsPublic(data.is_public);
        setEditFranchise(
            data.category === 'franchise'
            || (Array.isArray(data.tags) && data.tags.includes('franchise')),
        );
        setEditCoverImage(toPublicStorageUrl(data.cover_image) || data.cover_image || null);
        setCoverError('');
    };

    const loadCollection = async () => {
        const key = collectionPageKey(slug, user?.id || null);
        const existing = getPageCache(key);
        let showedCache = Boolean(existing);
        if (existing) {
            setCollection(existing);
            applyCollectionToForm(existing);
            setLoading(false);
        } else {
            setCollection(null);
            setLoading(true);
        }

        try {
            await loadWithPageCache({
                key,
                fetcher: () => getCollectionBySlug(slug, user?.id || null),
                onCached: (data) => {
                    showedCache = true;
                    setCollection(data);
                    applyCollectionToForm(data);
                    setLoading(false);
                },
                onFresh: (data) => {
                    setCollection(data);
                    applyCollectionToForm(data);
                    setLoading(false);
                },
            });
        } catch (error) {
            console.error('Error loading collection:', error);
            if (!showedCache) setCollection(null);
            setLoading(false);
        }
    };

    const bumpCollectionCache = (next) => {
        setCollection(next);
        if (next && slug) setPageCache(collectionPageKey(slug, user?.id || null), next);
        if (next?.user_id) {
            invalidatePageCache(collectionsListKey(next.user_id, true));
            invalidatePageCache(collectionsListKey(next.user_id, false));
        }
    };

    // Check if viewing own collection
    const isOwnCollection = user?.id && collection?.user_id === user.id;
    const isTheaterCollection = isTheaterSystemCollection(collection);

    // Open edit / add from Collections list ⋯ menu (any list, not just franchise)
    useEffect(() => {
        if (!collection || loading) return;
        const openEdit = location.state?.openEdit;
        const openAdd = location.state?.openAdd;
        if (!openEdit && !openAdd) return;
        if (openEdit && isOwnCollection) setIsEditing(true);
        if (openAdd && isOwnCollection && !isTheaterCollection) setShowAddModal(true);
        navigate(location.pathname, { replace: true, state: { from: location.state?.from } });
    }, [collection, loading, location.state, location.pathname, isOwnCollection, isTheaterCollection, navigate]);

    const confirmRemove = async () => {
        if (!itemToDelete || !isOwnCollection) return;
        const movie = itemToDelete;
        const movieId = movie.movie_id;

        setRemoving(movieId);
        const result = await removeFromCollection(collection.id, movieId);
        if (result.success) {
            bumpCollectionCache({
                ...collection,
                collection_movies: (collection.collection_movies || []).filter((m) => m.movie_id !== movieId),
            });
        }
        setRemoving(null);
        setItemToDelete(null);
    };

    const confirmDeleteCollection = async () => {
        if (!collection?.id || !user?.id || isTheaterCollection) return;
        setDeletingCollection(true);
        const result = await deleteUserCollection(collection.id, user.id);
        setDeletingCollection(false);
        setDeleteCollectionOpen(false);
        if (result.success) {
            invalidatePageCache(collectionPageKey(slug, user?.id || null));
            if (collection.user_id) {
                invalidatePageCache(collectionsListKey(collection.user_id, true));
                invalidatePageCache(collectionsListKey(collection.user_id, false));
            }
            const uname = collection.user_profiles?.username || profile?.username;
            navigate(uname ? `/${uname}/collections` : '/');
        } else {
            alert(result.error?.message || 'Could not delete collection');
        }
    };

    // Live search as user types
    useEffect(() => {
        const searchMovies = async () => {
            if (!searchQuery.trim() || searchQuery.length < 2) {
                setSearchResults([]);
                return;
            }

            setSearching(true);
            try {
                const payload = await searchContentFromEdge(searchQuery, { limit: 20 });
                setSearchResults((payload.data || []).filter((item) => item.poster_path).slice(0, 20));
            } catch (error) {
                console.error("Search error", error);
            }
            setSearching(false);
        };

        const timeoutId = setTimeout(searchMovies, 300);
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const toggleMovieSelection = (movie) => {
        setSelectedMovies(prev => {
            const exists = prev.find(m => m.id === movie.id);
            if (exists) {
                return prev.filter(m => m.id !== movie.id);
            } else {
                return [...prev, movie];
            }
        });
    };

    const handleBatchAdd = async () => {
        if (selectedMovies.length === 0 || !collection) return;

        setAddingMovies(true);

        try {
            // Fetch full details for each selected movie and save to library (including images)
            const processedMovies = [];

            for (const movie of selectedMovies) {
                try {
                    const movieId = movie.tmdb_id || movie.id;
                    const { success, data: fullData } = await getMovieDetailFromEdge(movieId);

                    if (success && fullData) {
                        await saveFullMovieToLibrary(fullData);
                        processedMovies.push(fullData);
                    } else {
                        processedMovies.push({
                            ...movie,
                            id: movieId,
                            title: movie.title || movie.name,
                        });
                    }
                } catch (error) {
                    console.error(`Failed to process movie ${movie.id}`, error);
                    // Fallback: use selected movie data (might be partial) but save loop
                    processedMovies.push(movie);
                }
            }

            // Link to collection
            const result = await addMoviesToCollection(collection.id, processedMovies);

            if (result.success) {
                invalidatePageCache(collectionPageKey(slug, user?.id || null));
                if (collection.user_id) {
                    invalidatePageCache(collectionsListKey(collection.user_id, true));
                    invalidatePageCache(collectionsListKey(collection.user_id, false));
                }
                await loadCollection();
                closeAddModal();
            } else {
                console.error("Failed to add movies:", result.error);
                alert(`Failed to add movies: ${result.error?.message || 'Unknown error'}`);
            }

        } catch (error) {
            console.error("Batch add failed", error);
            alert("Something went wrong while adding movies.");
        }

        setAddingMovies(false);
    };

    const closeAddModal = () => {
        setShowAddModal(false);
        setSearchQuery('');
        setSearchResults([]);
        setSelectedMovies([]);
    };

    const beginEditing = () => {
        setEditName(collection?.name || '');
        setEditDescription(collection?.description || '');
        setEditIsPublic(!!collection?.is_public);
        setEditFranchise(
            collection?.category === 'franchise'
            || (Array.isArray(collection?.tags) && collection.tags.includes('franchise')),
        );
        setEditCoverImage(toPublicStorageUrl(collection?.cover_image) || collection?.cover_image || null);
        setCoverError('');
        setIsEditing(true);
    };

    const handleCoverUpload = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !user?.id) return;
        setCoverError('');
        setCoverUploading(true);
        const r = await uploadCollectionImage(file, user.id);
        setCoverUploading(false);
        if (!r.ok) {
            setCoverError(r.error || 'Upload failed');
            return;
        }
        setEditCoverImage(r.url);
    };

    const handleSaveEdit = async () => {
        if (!isTheaterCollection && !editName.trim()) return;

        setSaving(true);
        const result = await updateUserCollection(collection.id, {
            name: isTheaterCollection ? collection.name : editName.trim(),
            description: editDescription.trim(),
            is_public: editIsPublic,
            franchise: isTheaterCollection ? false : editFranchise,
            cover_image: editCoverImage || null,
        });

        if (result.success) {
            invalidatePageCache(collectionPageKey(slug, user?.id || null));
            if (collection.user_id) {
                invalidatePageCache(collectionsListKey(collection.user_id, true));
                invalidatePageCache(collectionsListKey(collection.user_id, false));
            }
            if (!isTheaterCollection) {
                const newSlug = createSlug(editName.trim());
                if (newSlug !== slug) {
                    invalidatePageCache(collectionPageKey(newSlug, user?.id || null));
                    navigate(`/collection/${newSlug}`, { replace: true });
                    setIsEditing(false);
                    setSaving(false);
                    return;
                }
            }
            await loadCollection();
            setIsEditing(false);
        } else {
            alert(`Failed to update: ${result.error?.message || 'Unknown error'}`);
        }
        setSaving(false);
    };

    if ((authLoading && !collection) || loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!collection) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="text-center">
                    <span className="text-6xl mb-4 block">📁</span>
                    <h2 className="text-2xl font-bold text-white mb-2">Collection not found</h2>
                    <Link to="/" className="text-orange-400 hover:text-orange-300">
                        Go back home
                    </Link>
                </div>
            </div>
        );
    }

    if (!collection.is_public && !isOwnCollection) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="text-center">
                    <span className="text-6xl mb-4 block">🔒</span>
                    <h2 className="text-2xl font-bold text-white mb-2">Private Collection</h2>
                    <p className="text-white/50 mb-6">This collection is private.</p>
                    <Link to="/" className="text-orange-400 hover:text-orange-300">
                        Go back home
                    </Link>
                </div>
            </div>
        );
    }

    const movies = collection.collection_movies || [];
    const shareUrl = `${window.location.origin}/collection/${slug}`;
    const from = location.state?.from;
    const ownerUsername = collection.user_profiles?.username;
    const ownerCollectionsPath = ownerUsername ? `/${ownerUsername}/collections` : '/';
    // Prefer explicit referrer, otherwise Home — never force owner's collections list
    // (that made Home → list → Back land on Collections instead of Home).
    const fallbackPath = from?.path || '/';
    const backLabel = from?.label
        ? `Back to ${from.label}`
        : 'Back';
    const trailCrumbs = from?.crumbs?.length
        ? from.crumbs
        : ownerUsername
            ? [
                { path: `/${ownerUsername}/profile`, label: `@${ownerUsername}` },
                { path: ownerCollectionsPath, label: 'Collections' },
            ]
            : [];

    const handleBack = (e) => {
        e.preventDefault();
        // SPA history index — Back returns to the real previous page (Home feed, Explore, etc.)
        const idx = typeof window !== 'undefined' ? window.history.state?.idx : null;
        if (typeof idx === 'number' && idx > 0) {
            navigate(-1);
            return;
        }
        navigate(fallbackPath);
    };

    // Get first poster for OG image (uploaded cover, else auto from posters)
    const ogImage = (() => {
        const uploaded = collection.cover_image || collection.banner_image;
        if (uploaded && /^https?:\/\//i.test(uploaded)) return uploaded;
        if (uploaded && String(uploaded).startsWith('/')) {
            return `https://image.tmdb.org/t/p/w500${uploaded}`;
        }
        const withPoster = movies.find((m) => m.poster_path);
        if (!withPoster?.poster_path) return null;
        if (/^https?:\/\//i.test(withPoster.poster_path)) return withPoster.poster_path;
        return `https://image.tmdb.org/t/p/w500${withPoster.poster_path}`;
    })();

    return (
        <>
            {/* SEO Meta Tags */}
            <title>{collection.name} | TheaterOrStream</title>
            <meta name="description" content={collection.description || `A curated collection of ${movies.length} movies`} />
            <meta property="og:title" content={`${collection.name} | TheaterOrStream`} />
            <meta property="og:description" content={collection.description || `A curated collection of ${movies.length} movies`} />
            <meta property="og:type" content="website" />
            <meta property="og:url" content={shareUrl} />
            {ogImage && <meta property="og:image" content={ogImage} />}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={collection.name} />
            <meta name="twitter:description" content={collection.description || `${movies.length} movies curated with love`} />
            {ogImage && <meta name="twitter:image" content={ogImage} />}

            <div className="min-h-screen bg-[#0a0a0a] pt-[calc(4.5rem+env(safe-area-inset-top,0px))] sm:pt-24 pb-4 px-3 sm:px-4 relative">
                <div className="max-w-6xl mx-auto min-w-0">
                    {/* Header */}
                    <div className="mb-6 sm:mb-8">
                        <Link
                            to={fallbackPath}
                            onClick={handleBack}
                            className="inline-flex items-center gap-2 text-white/50 hover:text-white mb-3 sm:mb-4 transition-colors min-h-[44px]"
                        >
                            <FaArrowLeft />
                            <span>{backLabel}</span>
                        </Link>
                        {trailCrumbs.length > 0 && (
                            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs sm:text-sm text-white/40 mb-5 sm:mb-6 min-w-0">
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
                                <span className="text-white/70 truncate max-w-[50vw] sm:max-w-xs">{collection.name}</span>
                            </nav>
                        )}

                        <div className="bg-[#1a1a1a] p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl border border-white/5">
                            {isEditing ? (
                                /* Edit Mode */
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs text-white/50 mb-2 block">Thumbnail</label>
                                        <div className="flex items-start gap-3 sm:gap-4">
                                            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                                                {editCoverImage ? (
                                                    <img
                                                        src={toPublicStorageUrl(editCoverImage) || editCoverImage}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <FaImage className="text-white/25 text-xl" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1 space-y-2">
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        disabled={coverUploading}
                                                        onClick={() => coverInputRef.current?.click()}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm bg-white/10 text-white/75 hover:bg-white/15 hover:text-white border border-white/10 transition-colors disabled:opacity-50"
                                                    >
                                                        <FaImage className="text-[11px] opacity-70" />
                                                        {coverUploading ? 'Uploading…' : (editCoverImage ? 'Change' : 'Upload')}
                                                    </button>
                                                    {editCoverImage && (
                                                        <button
                                                            type="button"
                                                            disabled={coverUploading}
                                                            onClick={() => {
                                                                setEditCoverImage(null);
                                                                setCoverError('');
                                                            }}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm text-white/45 hover:text-white/80 hover:bg-white/5 transition-colors disabled:opacity-50"
                                                        >
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-white/35 leading-snug">
                                                    Optional. JPG, PNG, or WEBP · max 6MB. Falls back to posters if empty.
                                                </p>
                                                {coverError && (
                                                    <p className="text-[11px] text-red-400">{coverError}</p>
                                                )}
                                                <input
                                                    ref={coverInputRef}
                                                    type="file"
                                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                                    className="hidden"
                                                    onChange={handleCoverUpload}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs text-white/50 mb-2 block">Collection Name</label>
                                        {isTheaterCollection ? (
                                            <p className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white/70">
                                                {collection.name}
                                                <span className="block text-[11px] text-white/35 mt-1">
                                                    System collection name cannot be changed
                                                </span>
                                            </p>
                                        ) : (
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                                                placeholder="Collection name..."
                                            />
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-xs text-white/50 mb-2 block">Description</label>
                                        <textarea
                                            value={editDescription}
                                            onChange={(e) => setEditDescription(e.target.value)}
                                            rows={3}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-none"
                                            placeholder="Describe your collection..."
                                        />
                                    </div>
                                    {!isTheaterCollection && (
                                        <div>
                                            <p className="text-[11px] uppercase tracking-wide text-white/35 mb-2">Tags</p>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditFranchise((v) => !v)}
                                                    aria-pressed={editFranchise}
                                                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors min-h-[36px] ${
                                                        editFranchise
                                                            ? 'bg-amber-400 text-[#14181c] border-amber-300'
                                                            : 'bg-white/5 text-white/55 border-white/15 hover:text-white hover:border-white/25'
                                                    }`}
                                                >
                                                    Franchise
                                                </button>
                                            </div>
                                            <p className="text-[11px] text-white/40 mt-2">
                                                {collection.moderation_status === 'approved' && editFranchise
                                                    ? 'Live on Explore → Franchise.'
                                                    : 'Collection stays posted. Franchise page only after admin approval.'}
                                            </p>
                                        </div>
                                    )}
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setEditIsPublic(!editIsPublic)}
                                            aria-pressed={editIsPublic}
                                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors min-h-[36px] w-fit ${
                                                editIsPublic
                                                    ? 'bg-green-500/20 text-green-400 border-green-500/35'
                                                    : 'bg-white/5 text-white/55 border-white/15 hover:text-white hover:border-white/25'
                                            }`}
                                        >
                                            {editIsPublic ? <FaGlobe className="text-[10px]" /> : <FaLock className="text-[10px]" />}
                                            {editIsPublic ? 'Public' : 'Private'}
                                        </button>
                                        <div className="flex gap-3 justify-end">
                                            <button
                                                type="button"
                                                onClick={() => setIsEditing(false)}
                                                className="px-4 py-2 text-white/50 hover:text-white"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleSaveEdit}
                                                disabled={saving || (!isTheaterCollection && !editName.trim())}
                                                className="flex items-center gap-2 px-5 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
                                            >
                                                <FaSave /> {saving ? 'Saving...' : 'Save Changes'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* View Mode */
                                <div className="flex items-start gap-3 sm:gap-5">
                                    {collection.cover_image ? (
                                        <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl overflow-hidden bg-white/5 shrink-0">
                                            <img
                                                src={toPublicStorageUrl(collection.cover_image) || collection.cover_image}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    ) : (
                                        <PosterCollage movies={movies} imageURL={imageURL} size="large" />
                                    )}

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start gap-2 mb-2">
                                            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                                                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white break-words">{collection.name}</h1>
                                                {collection.is_public ? (
                                                    <span className="px-2 py-0.5 rounded-md bg-green-500/15 text-green-400 text-[11px] sm:text-xs flex items-center gap-1 shrink-0">
                                                        <FaGlobe className="text-[9px]" /> Public
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-md bg-white/10 text-white/55 text-[11px] sm:text-xs flex items-center gap-1 shrink-0">
                                                        <FaLock className="text-[9px]" /> Private
                                                    </span>
                                                )}
                                                {collection.moderation_status === 'approved'
                                                    && (collection.category === 'franchise' || collection.tags?.includes?.('franchise')) && (
                                                    <span className="px-2 py-0.5 rounded-md text-[11px] sm:text-xs bg-amber-500/15 text-amber-300 shrink-0">
                                                        Franchise
                                                    </span>
                                                )}
                                            </div>

                                            {(collection.is_public || isOwnCollection) && (
                                                <div className="relative shrink-0 -mt-0.5" ref={actionsMenuRef}>
                                                    <button
                                                        type="button"
                                                        aria-label="Collection options"
                                                        aria-expanded={actionsMenuOpen}
                                                        aria-haspopup="menu"
                                                        onClick={() => setActionsMenuOpen((v) => !v)}
                                                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-white/45 hover:text-white hover:bg-white/10 transition-colors"
                                                    >
                                                        <FaEllipsisH className="text-sm" />
                                                    </button>
                                                    {actionsMenuOpen && (
                                                        <div
                                                            role="menu"
                                                            className="absolute right-0 top-9 z-30 min-w-[168px] rounded-xl border border-white/10 bg-[#1c1f22] shadow-2xl py-1 overflow-hidden"
                                                        >
                                                            {collection.is_public && (
                                                                <button
                                                                    type="button"
                                                                    role="menuitem"
                                                                    onClick={() => {
                                                                        setActionsMenuOpen(false);
                                                                        setShowShareModal(true);
                                                                    }}
                                                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-white/75 hover:bg-white/10 hover:text-white transition-colors"
                                                                >
                                                                    <FaShare className="text-[11px] opacity-70" /> Share
                                                                </button>
                                                            )}
                                                            {isOwnCollection && (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        role="menuitem"
                                                                        onClick={() => {
                                                                            setActionsMenuOpen(false);
                                                                            beginEditing();
                                                                        }}
                                                                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-white/75 hover:bg-white/10 hover:text-white transition-colors"
                                                                    >
                                                                        <FaEdit className="text-[11px] opacity-70" /> Edit
                                                                    </button>
                                                                    {!isTheaterCollection && (
                                                                        <button
                                                                            type="button"
                                                                            role="menuitem"
                                                                            onClick={() => {
                                                                                setActionsMenuOpen(false);
                                                                                setShowAddModal(true);
                                                                            }}
                                                                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-white/75 hover:bg-white/10 hover:text-white transition-colors"
                                                                        >
                                                                            <FaPlus className="text-[11px] opacity-70" /> Add titles
                                                                        </button>
                                                                    )}
                                                                    {!isTheaterCollection && (
                                                                        <>
                                                                            <div className="my-1 border-t border-white/10" />
                                                                            <button
                                                                                type="button"
                                                                                role="menuitem"
                                                                                onClick={() => {
                                                                                    setActionsMenuOpen(false);
                                                                                    setDeleteCollectionOpen(true);
                                                                                }}
                                                                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                                                            >
                                                                                <FaTrash className="text-[11px]" /> Delete
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <p className="text-white/55 text-sm sm:text-[15px] leading-relaxed line-clamp-2 sm:line-clamp-none mb-2.5 sm:mb-3">
                                            {collection.description || 'No description'}
                                        </p>
                                        {isOwnCollection && isTheaterCollection && (
                                            <p className="text-xs text-amber-400/90 mb-2">
                                                🍿 Titles appear here when you log a movie with &quot;In theater&quot; on your diary.
                                            </p>
                                        )}
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs sm:text-sm text-white/40">
                                            <CollectionPeopleStack
                                                owner={collection.user_profiles}
                                                collaborators={collection.collaborators}
                                            />
                                            <span className="text-white/25">•</span>
                                            <span>{movies.length} items</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {isEditing && isOwnCollection && movies.length > 0 && (
                        <p className="text-xs text-white/40 mb-3 -mt-2 sm:-mt-3">
                            Tap the <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-black/60 border border-white/20 text-[9px] mx-0.5 align-middle"><FaTimes /></span> on a poster to remove it from this list.
                        </p>
                    )}

                    {/* Movies Grid — 3 across on phones */}
                    {movies.length > 0 ? (
                        <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-3 md:gap-4">
                            {movies.map((movie) => (
                                <div
                                    key={movie.id || movie.movie_id}
                                    className="group relative rounded-lg sm:rounded-xl overflow-hidden bg-[#1a1a1a] transition-all min-w-0"
                                >
                                    <div className="aspect-[2/3] relative">
                                        <Link
                                            to={`/${movie.media_type || 'movie'}/${movie.movie_id}`}
                                            className="absolute inset-0 block"
                                            tabIndex={isEditing ? -1 : undefined}
                                            onClick={isEditing ? (e) => e.preventDefault() : undefined}
                                        >
                                            {(() => {
                                                const posterSrc = resolveTmdbImageUrl(movie.poster_path, {
                                                    base64: movie.images?.poster_base64,
                                                    baseUrl: imageURL || undefined,
                                                    size: 'w500',
                                                });
                                                return posterSrc ? (
                                                    <img
                                                        src={posterSrc}
                                                        alt={movie.movie_title || movie.title}
                                                        className={`w-full h-full object-cover transition-transform duration-300 ${
                                                            isEditing ? '' : 'group-hover:scale-105'
                                                        }`}
                                                        loading="lazy"
                                                        decoding="async"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                                                        <span className="text-2xl sm:text-4xl">🎬</span>
                                                    </div>
                                                );
                                            })()}
                                            {!isEditing && (
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                            )}
                                        </Link>
                                        {isEditing && isOwnCollection && (
                                            <button
                                                type="button"
                                                aria-label={`Remove ${movie.movie_title || 'title'}`}
                                                disabled={removing === movie.movie_id}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setItemToDelete(movie);
                                                }}
                                                className="absolute top-1.5 right-1.5 z-10 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-black/75 text-white/90 hover:bg-red-500 hover:text-white flex items-center justify-center shadow-lg transition-colors disabled:opacity-50"
                                            >
                                                {removing === movie.movie_id ? (
                                                    <div className="w-3 h-3 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <FaTimes className="text-xs sm:text-sm" />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                    <div className="p-1.5 sm:p-3">
                                        <Link
                                            to={`/${movie.media_type || 'movie'}/${movie.movie_id}`}
                                            className="block min-w-0 overflow-hidden"
                                            tabIndex={isEditing ? -1 : undefined}
                                            onClick={isEditing ? (e) => e.preventDefault() : undefined}
                                        >
                                            <h3 className="text-[11px] sm:text-sm font-medium text-white leading-snug line-clamp-2 break-words hover:text-purple-400 transition-colors">
                                                {movie.movie_title}
                                            </h3>
                                            <p className="text-[10px] sm:text-xs text-white/40 mt-0.5 truncate">
                                                {(() => {
                                                    const released = movie.release_date || movie.first_air_date;
                                                    if (released) {
                                                        const y = new Date(released).getFullYear();
                                                        if (Number.isFinite(y) && y > 1900 && y <= new Date().getFullYear() + 2) {
                                                            return String(y);
                                                        }
                                                    }
                                                    if (!movie.added_at) return '';
                                                    const y = new Date(movie.added_at).getFullYear();
                                                    if (y > new Date().getFullYear() + 1) return '';
                                                    return `Added ${new Date(movie.added_at).toLocaleDateString()}`;
                                                })()}
                                            </p>
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20 rounded-2xl bg-[#1a1a1a] border border-white/5">
                            <span className="text-6xl mb-4 block">🕸️</span>
                            <h3 className="text-xl font-bold text-white mb-2">
                                It's empty here
                            </h3>
                            <p className="text-white/50 mb-6">
                                {isOwnCollection ? 'Start adding movies to this collection!' : 'No movies in this collection yet.'}
                            </p>
                            {isOwnCollection && (
                                <button
                                    onClick={() => setShowAddModal(true)}
                                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg"
                                >
                                    <FaPlus /> Add Movies
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Share Modal */}
                {showShareModal && (
                    <ShareModal
                        collection={collection}
                        movies={movies}
                        imageURL={imageURL}
                        shareUrl={shareUrl}
                        onClose={() => setShowShareModal(false)}
                    />
                )}

                {/* Add Movies Modal */}
                {showAddModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
                        <div className="w-full max-w-4xl bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
                            {/* Modal Header */}
                            <div className="p-6 border-b border-white/10 flex items-center justify-center relative">
                                <h2 className="text-xl font-bold text-white text-center">Add Movies to Collection</h2>
                                <button onClick={closeAddModal} className="absolute right-6 text-white/50 hover:text-white">
                                    <FaTimes className="text-xl" />
                                </button>
                            </div>

                            {/* Search Bar */}
                            <div className="p-6 pb-0">
                                <div className="relative">
                                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                                    <input
                                        type="text"
                                        placeholder="Start typing to search movies..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                                        autoFocus
                                    />
                                    {searching && (
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                    )}
                                </div>
                            </div>

                            {/* Results Grid */}
                            <div className="flex-1 overflow-y-auto p-6 min-h-[300px]">
                                {searchResults.length > 0 ? (
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                        {searchResults.map(movie => {
                                            const isSelected = selectedMovies.some(m => m.id === movie.id);
                                            const alreadyInCollection = movies.some(m => String(m.movie_id) === String(movie.id));
                                            const isDisabled = alreadyInCollection;

                                            return (
                                                <button
                                                    key={movie.id}
                                                    onClick={() => !isDisabled && toggleMovieSelection(movie)}
                                                    disabled={isDisabled}
                                                    className={`relative aspect-[2/3] rounded-lg overflow-hidden group transition-all ${isSelected ? 'ring-2 ring-purple-500 ring-offset-2 ring-offset-[#1a1a1a]' :
                                                        isDisabled ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:scale-105'
                                                        }`}
                                                >
                                                    {movie.poster_path ? (
                                                        <img
                                                            src={`${imageURL}${movie.poster_path}`}
                                                            alt={movie.title || movie.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full bg-white/10 flex items-center justify-center">
                                                            <span className="text-2xl">🎬</span>
                                                        </div>
                                                    )}

                                                    <div className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${isSelected || isDisabled ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                        {isDisabled ? (
                                                            <span className="text-xs font-medium text-white bg-black/50 px-2 py-1 rounded">Added</span>
                                                        ) : isSelected ? (
                                                            <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white">
                                                                <FaCheck />
                                                            </div>
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white">
                                                                <FaPlus />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <p className="text-xs text-white truncate text-center">{movie.title || movie.name}</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : searchQuery.length >= 2 && !searching ? (
                                    <div className="h-full flex flex-col items-center justify-center text-white/30">
                                        <p>No movies found for "{searchQuery}"</p>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-white/30">
                                        <FaSearch className="text-4xl mb-4 opacity-50" />
                                        <p>Type to search for movies</p>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-6 border-t border-white/10 flex items-center justify-between bg-[#1f1f1f] rounded-b-2xl">
                                <div className="text-sm text-white/50">
                                    {selectedMovies.length} {selectedMovies.length === 1 ? 'movie' : 'movies'} selected
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={closeAddModal}
                                        className="px-5 py-2.5 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleBatchAdd}
                                        disabled={selectedMovies.length === 0 || addingMovies}
                                        className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 transition-all flex items-center gap-2"
                                    >
                                        {addingMovies ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                Adding...
                                            </>
                                        ) : (
                                            <>Add Selected ({selectedMovies.length})</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <ConfirmationModal
                isOpen={!!itemToDelete}
                onClose={() => setItemToDelete(null)}
                onConfirm={confirmRemove}
                title="Remove from Collection"
                message={`Are you sure you want to remove "${itemToDelete?.movie_title}" from this collection?`}
            />
            <ConfirmationModal
                isOpen={deleteCollectionOpen}
                onClose={() => !deletingCollection && setDeleteCollectionOpen(false)}
                onConfirm={confirmDeleteCollection}
                title="Delete collection"
                message={`Delete “${collection?.name}”? This removes the list and all titles in it. This cannot be undone.`}
                confirmText={deletingCollection ? 'Deleting…' : 'Delete'}
            />
        </>
    );
};

export default CollectionDetails;
