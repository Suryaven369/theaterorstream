import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSelector } from 'react-redux';
import {
    getCollectionBySlug,
    removeFromCollection,
    addMoviesToCollection,
    updateUserCollection
} from '../lib/supabase';
import { FaTrash, FaLock, FaGlobe, FaFolderOpen, FaArrowLeft, FaPlus, FaSearch, FaCheck, FaTimes, FaEdit, FaSave, FaShare, FaLink, FaTwitter } from 'react-icons/fa';
import axios from "axios";

// Helper to create URL-friendly slug
const createSlug = (text) => {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
};

// Poster Collage Component - Shows first 4 movie posters in a grid
const PosterCollage = ({ movies, imageURL, size = 'large' }) => {
    const posters = movies.slice(0, 4);
    // Responsive sizing: smaller on mobile
    const sizeClasses = size === 'large' ? 'w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32' : 'w-16 h-16 sm:w-20 sm:h-20';

    if (posters.length === 0) {
        return (
            <div className={`${sizeClasses} rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg`}>
                <FaFolderOpen className="text-4xl text-white" />
            </div>
        );
    }

    return (
        <div className={`${sizeClasses} rounded-2xl overflow-hidden grid grid-cols-2 gap-0.5 bg-white/10 shadow-lg`}>
            {posters.map((movie, index) => (
                <div key={movie.movie_id || index} className="relative overflow-hidden">
                    {movie.poster_path ? (
                        <img
                            src={`${imageURL}${movie.poster_path}`}
                            alt=""
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                            <span className="text-lg">🎬</span>
                        </div>
                    )}
                </div>
            ))}
            {/* Fill remaining slots if less than 4 movies */}
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
                            <div className="w-24 h-24 rounded-xl overflow-hidden grid grid-cols-2 gap-0.5 bg-black/30 flex-shrink-0">
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
                                <p className="text-white/30 text-xs mt-2">
                                    by @{collection.user_profiles?.username || 'user'}
                                </p>
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
    const { slug } = useParams();
    const { user, loading: authLoading } = useAuth();
    const imageURL = useSelector((state) => state.movieData.imageURL);

    const [collection, setCollection] = useState(null);
    const [loading, setLoading] = useState(true);
    const [removing, setRemoving] = useState(null);

    // Edit mode state
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editIsPublic, setEditIsPublic] = useState(false);
    const [saving, setSaving] = useState(false);

    // Share modal state
    const [showShareModal, setShowShareModal] = useState(false);

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
    }, [slug]);

    const loadCollection = async () => {
        setLoading(true);
        try {
            const data = await getCollectionBySlug(slug);
            console.log("Loaded collection:", data);
            setCollection(data);
            if (data) {
                setEditName(data.name);
                setEditDescription(data.description || '');
                setEditIsPublic(data.is_public);
            }
        } catch (error) {
            console.error("Error loading collection:", error);
        }
        setLoading(false);
    };

    // Check if viewing own collection
    const isOwnCollection = user?.id && collection?.user_id === user.id;

    const handleRemove = async (movieId) => {
        if (!isOwnCollection) return;
        setRemoving(movieId);
        const result = await removeFromCollection(collection.id, movieId);
        if (result.success) {
            setCollection(prev => ({
                ...prev,
                collection_movies: prev.collection_movies.filter(m => m.movie_id !== movieId)
            }));
        }
        setRemoving(null);
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
                const response = await axios.get(`search/multi`, {
                    params: { query: searchQuery }
                });
                const results = response.data.results.filter(
                    item => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path
                );
                setSearchResults(results.slice(0, 20));
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
        const result = await addMoviesToCollection(collection.id, selectedMovies);

        if (result.success) {
            await loadCollection();
            closeAddModal();
        } else {
            console.error("Failed to add movies:", result.error);
            alert(`Failed to add movies: ${result.error?.message || 'Unknown error'}`);
        }
        setAddingMovies(false);
    };

    const closeAddModal = () => {
        setShowAddModal(false);
        setSearchQuery('');
        setSearchResults([]);
        setSelectedMovies([]);
    };

    const handleSaveEdit = async () => {
        if (!editName.trim()) return;

        setSaving(true);
        const result = await updateUserCollection(collection.id, {
            name: editName.trim(),
            description: editDescription.trim(),
            is_public: editIsPublic
        });

        if (result.success) {
            const newSlug = createSlug(editName.trim());
            if (newSlug !== slug) {
                navigate(`/collection/${newSlug}`, { replace: true });
            }
            await loadCollection();
            setIsEditing(false);
        } else {
            alert(`Failed to update: ${result.error?.message || 'Unknown error'}`);
        }
        setSaving(false);
    };

    if (authLoading || loading) {
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

    // Get first poster for OG image
    const ogImage = movies.length > 0 && movies[0].poster_path
        ? `https://image.tmdb.org/t/p/w500${movies[0].poster_path}`
        : null;

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

            <div className="min-h-screen bg-[#0a0a0a] pt-20 sm:pt-24 pb-20 sm:pb-12 px-3 sm:px-4 relative safe-area-bottom">
                <div className="max-w-6xl mx-auto">
                    {/* Header */}
                    <div className="mb-8">
                        <Link
                            to={collection.user_profiles ? `/${collection.user_profiles.username}/collections` : '/'}
                            className="inline-flex items-center gap-2 text-white/50 hover:text-white mb-6 transition-colors"
                        >
                            <FaArrowLeft />
                            <span>Back to Collections</span>
                        </Link>

                        <div className="bg-[#1a1a1a] p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl border border-white/5">
                            {isEditing ? (
                                /* Edit Mode */
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs text-white/50 mb-2 block">Collection Name</label>
                                        <input
                                            type="text"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                                            placeholder="Collection name..."
                                        />
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
                                    <div className="flex items-center justify-between">
                                        <button
                                            onClick={() => setEditIsPublic(!editIsPublic)}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${editIsPublic ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/50'}`}
                                        >
                                            {editIsPublic ? <FaGlobe /> : <FaLock />}
                                            {editIsPublic ? 'Public' : 'Private'}
                                        </button>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setIsEditing(false)}
                                                className="px-4 py-2 text-white/50 hover:text-white"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleSaveEdit}
                                                disabled={saving || !editName.trim()}
                                                className="flex items-center gap-2 px-5 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
                                            >
                                                <FaSave /> {saving ? 'Saving...' : 'Save Changes'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* View Mode */
                                <div className="flex flex-col gap-4 sm:gap-6">
                                    <div className="flex items-start gap-4 sm:gap-6">
                                        {/* Poster Collage */}
                                        <PosterCollage movies={movies} imageURL={imageURL} size="large" />

                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                                                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white break-words">{collection.name}</h1>
                                                {collection.is_public ? (
                                                    <span className="px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs flex items-center gap-1">
                                                        <FaGlobe /> Public
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 rounded bg-white/10 text-white/60 text-xs flex items-center gap-1">
                                                        <FaLock /> Private
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-white/60 text-sm sm:text-base line-clamp-2 sm:line-clamp-none mb-2 sm:mb-3">{collection.description || 'No description'}</p>
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-white/40">
                                                <span>By @{collection.user_profiles?.username || 'user'}</span>
                                                <span className="hidden sm:inline">•</span>
                                                <span>{movies.length} items</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons - Full width on mobile */}
                                    <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
                                        {/* Share Button */}
                                        {collection.is_public && (
                                            <button
                                                onClick={() => setShowShareModal(true)}
                                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 bg-white/5 text-white/70 rounded-xl hover:bg-white/10 hover:text-white transition-all border border-white/10 text-sm sm:text-base"
                                            >
                                                <FaShare /> <span className="hidden sm:inline">Share</span>
                                            </button>
                                        )}

                                        {isOwnCollection && (
                                            <>
                                                <button
                                                    onClick={() => setIsEditing(true)}
                                                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 bg-white/5 text-white/70 rounded-xl hover:bg-white/10 hover:text-white transition-all text-sm sm:text-base"
                                                >
                                                    <FaEdit /> <span className="hidden sm:inline">Edit</span>
                                                </button>
                                                <button
                                                    onClick={() => setShowAddModal(true)}
                                                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all font-medium shadow-lg shadow-purple-500/25 text-sm sm:text-base"
                                                >
                                                    <FaPlus /> <span>Add</span>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Movies Grid */}
                    {movies.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
                            {movies.map((movie) => (
                                <div
                                    key={movie.id || movie.movie_id}
                                    className="group relative rounded-xl overflow-hidden bg-[#1a1a1a] border border-white/5 hover:border-purple-500/30 transition-all"
                                >
                                    <Link to={`/${movie.media_type || 'movie'}/${movie.movie_id}`}>
                                        <div className="aspect-[2/3] relative">
                                            {movie.poster_path ? (
                                                <img
                                                    src={`${imageURL}${movie.poster_path}`}
                                                    alt={movie.movie_title}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                                                    <span className="text-4xl">🎬</span>
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </Link>
                                    <div className="p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <Link to={`/${movie.media_type || 'movie'}/${movie.movie_id}`} className="flex-1 min-w-0">
                                                <h3 className="text-sm font-medium text-white truncate hover:text-purple-400 transition-colors">
                                                    {movie.movie_title}
                                                </h3>
                                                <p className="text-xs text-white/40">
                                                    {movie.added_at ? `Added ${new Date(movie.added_at).toLocaleDateString()}` : ''}
                                                </p>
                                            </Link>
                                            {isOwnCollection && (
                                                <button
                                                    onClick={() => handleRemove(movie.movie_id)}
                                                    disabled={removing === movie.movie_id}
                                                    className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Remove from collection"
                                                >
                                                    {removing === movie.movie_id ? (
                                                        <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <FaTrash className="text-xs" />
                                                    )}
                                                </button>
                                            )}
                                        </div>
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
        </>
    );
};

export default CollectionDetails;
