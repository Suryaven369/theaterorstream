import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSelector } from 'react-redux';
import {
    getProfileByUsername,
    getUserCollections,
    createUserCollection
} from '../lib/supabase';
import { FaFolder, FaPlus, FaLock, FaGlobe, FaChevronRight, FaArrowLeft, FaFolderOpen } from 'react-icons/fa';

// Helper to create URL-friendly slug
const createSlug = (text) => {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
};

// Mini Poster Collage for collection cards
const MiniPosterCollage = ({ movies, imageURL }) => {
    const posters = (movies || []).slice(0, 4);

    if (posters.length === 0) {
        return (
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-white/5">
                <FaFolder className="text-2xl text-purple-400" />
            </div>
        );
    }

    return (
        <div className="w-16 h-16 rounded-xl overflow-hidden grid grid-cols-2 gap-0.5 bg-black/30 border border-white/5">
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
    );
};

const CollectionsPage = () => {
    const navigate = useNavigate();
    const { username } = useParams();
    const { user, profile: currentUserProfile, loading: authLoading } = useAuth();
    const imageURL = useSelector((state) => state.movieData.imageURL);

    // Profile being viewed
    const [viewedProfile, setViewedProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    // Collections
    const [collections, setCollections] = useState([]);
    const [showCreateCollection, setShowCreateCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [isPublicCollection, setIsPublicCollection] = useState(false);
    const [creatingCollection, setCreatingCollection] = useState(false);
    const [success, setSuccess] = useState('');

    const isOwnProfile = !username || currentUserProfile?.username === username;

    useEffect(() => {
        loadData();
    }, [username, currentUserProfile, user]);

    const loadData = async () => {
        setLoading(true);
        let targetProfile = null;

        if (isOwnProfile) {
            targetProfile = currentUserProfile;
        } else {
            targetProfile = await getProfileByUsername(username);
        }

        setViewedProfile(targetProfile);

        if (targetProfile?.id) {
            const userCollections = await getUserCollections(targetProfile.id);
            if (isOwnProfile) {
                setCollections(userCollections);
            } else {
                setCollections(userCollections.filter(c => c.is_public));
            }
        }
        setLoading(false);
    };

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim() || !user?.id) return;

        setCreatingCollection(true);
        const result = await createUserCollection(user.id, newCollectionName.trim(), '', isPublicCollection);

        if (result.success) {
            setCollections(prev => [result.data, ...prev]);
            setNewCollectionName('');
            setIsPublicCollection(false);
            setShowCreateCollection(false);
            setSuccess('Collection created!');
            setTimeout(() => setSuccess(''), 3000);
        }
        setCreatingCollection(false);
    };

    if (authLoading || loading) {
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
        <div className="min-h-screen bg-[#0a0a0a] pt-20 sm:pt-24 pb-20 sm:pb-12 px-3 sm:px-4 safe-area-bottom">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        to={`/${viewedProfile.username}/profile`}
                        className="inline-flex items-center gap-2 text-white/50 hover:text-white mb-6 transition-colors"
                    >
                        <FaArrowLeft />
                        <span>Back to Profile</span>
                    </Link>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">Collections</h1>
                            <p className="text-sm sm:text-base text-white/50">
                                {isOwnProfile ? 'Manage your movie collections' : `Collections by @${viewedProfile.username}`}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Success message */}
                {success && (
                    <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm animate-fadeIn">
                        {success}
                    </div>
                )}

                {/* Create New Collection Button (Only for owner) */}
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
                                <div className="flex items-center justify-between">
                                    <button
                                        onClick={() => setIsPublicCollection(!isPublicCollection)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${isPublicCollection ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/50'}`}
                                    >
                                        {isPublicCollection ? <FaGlobe /> : <FaLock />}
                                        {isPublicCollection ? 'Public Collection' : 'Private Collection'}
                                    </button>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setShowCreateCollection(false)}
                                            className="px-4 py-2 text-sm text-white/50 hover:text-white transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleCreateCollection}
                                            disabled={!newCollectionName.trim() || creatingCollection}
                                            className="px-6 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors font-medium"
                                        >
                                            {creatingCollection ? 'Creating...' : 'Create Collection'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <button
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

                {/* Collections Grid */}
                {collections.length > 0 ? (
                    <div className="grid md:grid-cols-2 gap-4">
                        {collections.map((collection) => (
                            <Link
                                key={collection.id}
                                to={`/collection/${createSlug(collection.name)}`}
                                className="block p-5 rounded-2xl bg-[#1a1a1a] hover:bg-[#222] transition-all border border-white/5 hover:border-purple-500/30 group"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <MiniPosterCollage movies={collection.collection_movies} imageURL={imageURL} />
                                        <div>
                                            <h3 className="text-lg font-bold text-white group-hover:text-purple-400 transition-colors mb-1">
                                                {collection.name}
                                            </h3>
                                            <div className="flex items-center gap-3 text-xs text-white/40">
                                                <span className="bg-white/5 px-2 py-0.5 rounded">
                                                    {collection.collection_movies?.length || 0} movies
                                                </span>
                                                {collection.is_public ? (
                                                    <span className="flex items-center gap-1 text-green-400/70"><FaGlobe className="text-[10px]" /> Public</span>
                                                ) : (
                                                    <span className="flex items-center gap-1"><FaLock className="text-[10px]" /> Private</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                        <FaChevronRight className="text-white/40 group-hover:text-purple-400" />
                                    </div>
                                </div>
                            </Link>
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
        </div>
    );
};

export default CollectionsPage;
