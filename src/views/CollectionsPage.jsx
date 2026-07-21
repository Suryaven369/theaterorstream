import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSelector } from 'react-redux';
import {
    getProfileByUsername,
    getUserCollections,
    createUserCollection,
    deleteUserCollection,
    getCollectionBySlug,
} from '../lib/supabase';
import {
    ensureWatchedInTheaterCollection,
    isTheaterSystemCollection,
} from '../lib/theaterWatch';
import { FaFolder, FaPlus, FaLock, FaGlobe, FaChevronRight, FaArrowLeft, FaEllipsisH, FaTrash, FaShare, FaEdit } from 'react-icons/fa';
import ConfirmationModal from '../components/ConfirmationModal';
import { toPublicStorageUrl } from '../lib/storagePublicUrl';
import {
    getPageCache,
    loadWithPageCache,
    setPageCache,
    invalidatePageCache,
    collectionsListKey,
    collectionPageKey,
    prefetchCollectionPage,
} from '../lib/pageSessionCache';

const createSlug = (text) => {
    const slug = String(text || '')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
    return slug || 'collection';
};

const collectionPath = (collection) =>
    `/collection/${collection.slug || createSlug(collection.name) || collection.id}`;

const sortCollections = (list) =>
    [...(list || [])].sort((a, b) => {
        if (isTheaterSystemCollection(a)) return -1;
        if (isTheaterSystemCollection(b)) return 1;
        return 0;
    });

const MiniPosterCollage = ({ movies, imageURL, coverImage }) => {
    const cover = coverImage ? (toPublicStorageUrl(coverImage) || coverImage) : null;
    if (cover) {
        return (
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/30 shrink-0">
                <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
        );
    }

    // Auto thumbnail from posters when no custom cover is uploaded
    const posters = (movies || []).filter((m) => m?.poster_path).slice(0, 4);

    if (posters.length === 0) {
        return (
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                <FaFolder className="text-2xl text-purple-400" />
            </div>
        );
    }

    if (posters.length === 1) {
        return (
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/30 shrink-0">
                <img
                    src={/^https?:\/\//i.test(posters[0].poster_path)
                        ? posters[0].poster_path
                        : `${imageURL || 'https://image.tmdb.org/t/p/w185'}${posters[0].poster_path}`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                />
            </div>
        );
    }

    return (
        <div className="w-16 h-16 rounded-xl overflow-hidden grid grid-cols-2 gap-0 bg-black/30">
            {posters.map((movie, index) => (
                <div key={movie.movie_id || index} className="relative overflow-hidden">
                    <img
                        src={/^https?:\/\//i.test(movie.poster_path)
                            ? movie.poster_path
                            : `${imageURL || 'https://image.tmdb.org/t/p/w185'}${movie.poster_path}`}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                </div>
            ))}
            {Array.from({ length: Math.max(0, 4 - posters.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-gray-700" />
            ))}
        </div>
    );
};

/** Overflow menu on every list card (Share / Edit / Add / Delete). */
const CollectionCardMenu = ({ collection, onDelete, onShareCopied }) => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const menuRef = useRef(null);
    const isTheater = isTheaterSystemCollection(collection);
    const path = collectionPath(collection);
    const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${path}`;

    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const go = (state) => {
        setOpen(false);
        navigate(path, { state });
    };

    const handleShare = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        try {
            await navigator.clipboard.writeText(shareUrl);
            onShareCopied?.();
        } catch {
            window.prompt('Copy link:', shareUrl);
        }
    };

    return (
        <div className="absolute top-2.5 right-2.5 z-20" ref={menuRef}>
            <button
                type="button"
                aria-label="Collection options"
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen((v) => !v);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
                <FaEllipsisH className="text-sm" />
            </button>
            {open && (
                <div
                    role="menu"
                    className="absolute right-0 top-9 z-30 min-w-[168px] rounded-xl border border-white/10 bg-[#1c1f22] shadow-2xl py-1 overflow-hidden"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                >
                    {collection.is_public && (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={handleShare}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-white/75 hover:bg-white/10 hover:text-white transition-colors"
                        >
                            <FaShare className="text-[11px] opacity-70" /> Share
                        </button>
                    )}
                    <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            go({ openEdit: true });
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-white/75 hover:bg-white/10 hover:text-white transition-colors"
                    >
                        <FaEdit className="text-[11px] opacity-70" /> Edit
                    </button>
                    {!isTheater && (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                go({ openAdd: true });
                            }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-white/75 hover:bg-white/10 hover:text-white transition-colors"
                        >
                            <FaPlus className="text-[11px] opacity-70" /> Add titles
                        </button>
                    )}
                    {!isTheater && (
                        <>
                            <div className="my-1 border-t border-white/10" />
                            <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setOpen(false);
                                    onDelete(collection);
                                }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                                <FaTrash className="text-[11px]" /> Delete
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

const CollectionsPage = () => {
    const { username } = useParams();
    const { user, profile: currentUserProfile, loading: authLoading } = useAuth();
    const imageURL = useSelector((state) => state.movieData.imageURL);

    const [viewedProfile, setViewedProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [collections, setCollections] = useState([]);
    const [showCreateCollection, setShowCreateCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [isPublicCollection, setIsPublicCollection] = useState(false);
    const [tagFranchise, setTagFranchise] = useState(false);
    const [creatingCollection, setCreatingCollection] = useState(false);
    const [success, setSuccess] = useState('');
    const [toDelete, setToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const isOwnProfile = !username
        || (currentUserProfile?.username || '').toLowerCase() === (username || '').toLowerCase();

    useEffect(() => {
        loadData();
    }, [username, currentUserProfile, user]);

    const loadData = async () => {
        let targetProfile = null;

        if (isOwnProfile) {
            if (!currentUserProfile && authLoading) return;
            targetProfile = currentUserProfile;
        } else {
            targetProfile = await getProfileByUsername(username);
        }

        setViewedProfile(targetProfile);

        if (!targetProfile?.id) {
            setCollections([]);
            setLoading(false);
            return;
        }

        const key = collectionsListKey(targetProfile.id, isOwnProfile);
        const cached = getPageCache(key);
        if (cached) {
            setCollections(cached);
            setLoading(false);
        } else {
            setLoading(true);
        }

        try {
            await loadWithPageCache({
                key,
                fetcher: async () => {
                    if (isOwnProfile && user?.id) {
                        await ensureWatchedInTheaterCollection(user.id);
                    }
                    const userCollections = await getUserCollections(targetProfile.id);
                    const sorted = sortCollections(userCollections);
                    return isOwnProfile ? sorted : sorted.filter((c) => c.is_public);
                },
                onCached: (data) => {
                    setCollections(data || []);
                    setLoading(false);
                },
                onFresh: (data) => {
                    setCollections(data || []);
                    setLoading(false);
                },
            });
        } catch (error) {
            console.error('Error loading collections:', error);
            if (!cached) setCollections([]);
            setLoading(false);
        }
    };

    const syncListCache = (next) => {
        setCollections(next);
        if (viewedProfile?.id) {
            setPageCache(collectionsListKey(viewedProfile.id, isOwnProfile), next);
        }
    };

    const prefetchCollection = (collection) => {
        const slug = collection.slug || createSlug(collection.name) || collection.id;
        if (!slug) return;
        prefetchCollectionPage(slug, user?.id || null, () =>
            getCollectionBySlug(slug, user?.id || null),
        );
    };

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim() || !user?.id) return;

        const createdName = newCollectionName.trim();
        const wantFranchise = tagFranchise;
        const wantPublic = isPublicCollection;

        setCreatingCollection(true);
        const result = await createUserCollection(
            user.id,
            createdName,
            '',
            wantPublic,
            { tags: wantFranchise ? ['franchise'] : [] },
        );

        if (result.success && result.data) {
            const created = {
                ...result.data,
                name: result.data.name || createdName,
                collection_movies: result.data.collection_movies || [],
            };
            syncListCache(sortCollections([
                created,
                ...collections.filter((c) => c.id !== created.id),
            ]));
            setNewCollectionName('');
            setIsPublicCollection(false);
            setTagFranchise(false);
            setShowCreateCollection(false);
            setSuccess(
                wantFranchise
                    ? 'Collection posted! It will show on Explore → Franchise after admin approval.'
                    : 'Collection created!',
            );
            setTimeout(() => setSuccess(''), 4000);

            getUserCollections(user.id).then((fresh) => {
                if (!fresh) return;
                const sorted = sortCollections(fresh);
                syncListCache(sorted);
            }).catch(() => {});
        } else {
            alert(result.error?.message || 'Could not create collection');
        }
        setCreatingCollection(false);
    };

    const handleConfirmDelete = async () => {
        if (!toDelete || !user?.id) return;
        setDeleting(true);
        const result = await deleteUserCollection(toDelete.id, user.id);
        setDeleting(false);
        if (result.success) {
            const slug = toDelete.slug || createSlug(toDelete.name) || toDelete.id;
            invalidatePageCache(collectionPageKey(slug, user?.id || null));
            syncListCache(collections.filter((c) => c.id !== toDelete.id));
            setSuccess('Collection deleted');
            setTimeout(() => setSuccess(''), 3000);
            setToDelete(null);
        } else {
            alert(result.error?.message || 'Could not delete collection');
        }
    };

    if (loading && collections.length === 0) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!viewedProfile) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="text-center">
                    <span className="text-6xl mb-4 block">🔍</span>
                    <h2 className="text-2xl font-bold text-white mb-2">User not found</h2>
                    <Link to="/" className="text-orange-400 hover:text-orange-300">
                        Go back home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] pt-[calc(4.5rem+env(safe-area-inset-top,0px))] sm:pt-24 pb-4 px-3 sm:px-4">
            <div className="max-w-4xl mx-auto min-w-0">
                <div className="mb-6 sm:mb-8">
                    <Link
                        to={`/${viewedProfile.username}/profile`}
                        className="inline-flex items-center gap-2 text-white/50 hover:text-white mb-5 sm:mb-6 transition-colors min-h-[44px]"
                    >
                        <FaArrowLeft />
                        <span>Back to Profile</span>
                    </Link>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 min-w-0">
                        <div className="min-w-0">
                            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">Collections</h1>
                            <p className="text-sm sm:text-base text-white/50 break-words">
                                {isOwnProfile ? 'Manage your movie collections' : `Collections by @${viewedProfile.username}`}
                            </p>
                        </div>
                    </div>
                </div>

                {success && (
                    <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm animate-fadeIn">
                        {success}
                    </div>
                )}

                {isOwnProfile && (
                    <div className="mb-8">
                        {showCreateCollection ? (
                            <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-[#1a1a1a] border border-white/10 animate-fadeIn">
                                <h3 className="text-lg font-bold text-white mb-4">New Collection</h3>
                                <input
                                    type="text"
                                    placeholder="Collection name (e.g., 'Weekend Vibes', 'Best Horror')"
                                    value={newCollectionName}
                                    onChange={(e) => setNewCollectionName(e.target.value)}
                                    className="w-full bg-white/5 rounded-xl px-4 py-3 text-white placeholder-white/30 border border-white/10 focus:border-purple-500/50 focus:outline-none mb-4"
                                    autoFocus
                                />
                                <div className="flex flex-col gap-3 mb-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsPublicCollection(!isPublicCollection)}
                                            aria-pressed={isPublicCollection}
                                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors min-h-[36px] w-fit ${
                                                isPublicCollection
                                                    ? 'bg-green-500/20 text-green-400 border-green-500/35'
                                                    : 'bg-white/5 text-white/55 border-white/15 hover:text-white hover:border-white/25'
                                            }`}
                                        >
                                            {isPublicCollection ? <FaGlobe className="text-[10px]" /> : <FaLock className="text-[10px]" />}
                                            {isPublicCollection ? 'Public' : 'Private'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTagFranchise((v) => !v)}
                                            aria-pressed={tagFranchise}
                                            className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors min-h-[36px] w-fit ${
                                                tagFranchise
                                                    ? 'bg-amber-400 text-[#14181c] border-amber-300'
                                                    : 'bg-white/5 text-white/55 border-white/15 hover:text-white hover:border-white/25'
                                            }`}
                                        >
                                            Franchise
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-white/40">
                                        Your collection posts right away. Franchise only appears on the Franchise page after admin approval.
                                    </p>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowCreateCollection(false);
                                            setTagFranchise(false);
                                        }}
                                        className="px-4 py-2.5 text-sm text-white/50 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCreateCollection}
                                        disabled={!newCollectionName.trim() || creatingCollection}
                                        className="px-5 py-2.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors font-medium"
                                    >
                                        {creatingCollection ? 'Creating...' : 'Create Collection'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowCreateCollection(true)}
                                className="w-full flex items-center justify-center gap-3 p-8 rounded-2xl bg-[#1a1a1a] border border-dashed border-white/20 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group"
                            >
                                <div className="w-12 h-12 rounded-full bg-white/5 group-hover:bg-purple-500/20 flex items-center justify-center transition-colors">
                                    <FaPlus className="text-white/50 group-hover:text-purple-400" />
                                </div>
                                <div className="text-left">
                                    <h3 className="font-medium text-white group-hover:text-purple-400">Create New Collection</h3>
                                    <p className="text-sm text-white/40">Create a list to organize your movies</p>
                                </div>
                            </button>
                        )}
                    </div>
                )}

                {collections.length > 0 ? (
                    <div className="grid md:grid-cols-2 gap-4">
                        {collections.map((collection) => (
                            <div
                                key={collection.id}
                                className="relative p-4 sm:p-5 pr-12 sm:pr-14 rounded-2xl bg-[#1a1a1a] hover:bg-[#222] transition-all border border-white/5 hover:border-purple-500/30 group overflow-hidden"
                            >
                                {isOwnProfile && (
                                    <CollectionCardMenu
                                        collection={collection}
                                        onDelete={setToDelete}
                                        onShareCopied={() => {
                                            setSuccess('Link copied');
                                            setTimeout(() => setSuccess(''), 2000);
                                        }}
                                    />
                                )}
                                <Link
                                    to={`/collection/${collection.slug || createSlug(collection.name) || collection.id}`}
                                    state={viewedProfile?.username ? {
                                        from: {
                                            path: `/${viewedProfile.username}/collections`,
                                            label: 'Collections',
                                            crumbs: [
                                                { path: `/${viewedProfile.username}/profile`, label: `@${viewedProfile.username}` },
                                                { path: `/${viewedProfile.username}/collections`, label: 'Collections' },
                                            ],
                                        },
                                    } : undefined}
                                    onMouseEnter={() => prefetchCollection(collection)}
                                    onFocus={() => prefetchCollection(collection)}
                                    className="flex items-center gap-3 sm:gap-4 min-w-0 w-full"
                                >
                                    <div className="shrink-0">
                                        <MiniPosterCollage
                                            movies={collection.collection_movies}
                                            imageURL={imageURL}
                                            coverImage={collection.cover_image}
                                        />
                                    </div>
                                    <div className="min-w-0 flex-1 overflow-hidden pr-1">
                                        <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-purple-400 transition-colors mb-1 min-w-0">
                                            {isTheaterSystemCollection(collection) && (
                                                <span aria-hidden className="mr-1.5">🍿</span>
                                            )}
                                            <span className="break-words line-clamp-2">
                                                {collection.name || 'Untitled collection'}
                                            </span>
                                        </h3>
                                        {isOwnProfile && isTheaterSystemCollection(collection) && (
                                            <p className="text-[11px] text-amber-400/80 mb-1 line-clamp-1">
                                                Auto-updated when you log &quot;In theater&quot;
                                            </p>
                                        )}
                                        <div className="flex items-center gap-2 sm:gap-3 text-xs text-white/40 flex-wrap">
                                            <span className="bg-white/5 px-2 py-0.5 rounded shrink-0">
                                                {collection.collection_movies?.length || 0} movies
                                            </span>
                                            {collection.is_public ? (
                                                <span className="flex items-center gap-1 text-green-400/70 shrink-0"><FaGlobe className="text-[10px]" /> Public</span>
                                            ) : (
                                                <span className="flex items-center gap-1 shrink-0"><FaLock className="text-[10px]" /> Private</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="hidden sm:flex w-9 h-9 rounded-full bg-white/5 items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <FaChevronRight className="text-white/40 group-hover:text-purple-400" />
                                    </div>
                                </Link>
                            </div>
                        ))}
                    </div>
                ) : (
                    !showCreateCollection && (
                        <div className="text-center py-20 rounded-2xl bg-[#1a1a1a]/50 border border-white/5">
                            <span className="text-6xl mb-4 block opacity-50">📂</span>
                            <h3 className="text-xl font-bold text-white mb-2">
                                No Collections
                            </h3>
                            <p className="text-white/50">
                                {isOwnProfile
                                    ? "You haven't created any collections yet."
                                    : `@${viewedProfile.username} hasn't created any public collections.`
                                }
                            </p>
                        </div>
                    )
                )}
            </div>

            <ConfirmationModal
                isOpen={!!toDelete}
                onClose={() => !deleting && setToDelete(null)}
                onConfirm={handleConfirmDelete}
                title="Delete collection"
                message={`Delete “${toDelete?.name}”? This removes the list and all titles in it. This cannot be undone.`}
                confirmText={deleting ? 'Deleting…' : 'Delete'}
                isDangerous
            />
        </div>
    );
};

export default CollectionsPage;
