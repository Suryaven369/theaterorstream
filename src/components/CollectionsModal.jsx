import React, { useState, useEffect } from "react";
import { FaFolder, FaPlus, FaTimes, FaLock, FaGlobe } from "react-icons/fa";
import { getUserCollections, createUserCollection, addToCollection } from "../lib/supabase";
import { trackEvent, EVENT_TYPES } from "../lib/eventTracking";

// Reusable "Save to List" modal. Used by the movie detail action bar
// and the poster three-dots quick menu. (Separate from Movie Boards.)
const CollectionsModal = ({ isOpen, onClose, movieId, movieTitle, posterPath, mediaType, userId }) => {
    const [collections, setCollections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    const [saving, setSaving] = useState(null);

    useEffect(() => {
        if (isOpen && userId) {
            loadCollections();
        }
    }, [isOpen, userId]);

    const loadCollections = async () => {
        setLoading(true);
        const data = await getUserCollections(userId);
        setCollections(data);
        setLoading(false);
    };

    const handleCreate = async () => {
        if (!newName.trim()) return;
        const result = await createUserCollection(userId, newName.trim(), '', isPublic);
        if (result.success) {
            setNewName('');
            setCreating(false);
            loadCollections();
        }
    };

    const handleAddToCollection = async (collectionId) => {
        setSaving(collectionId);
        const result = await addToCollection(collectionId, movieId, movieTitle, posterPath, mediaType);
        if (result.success) {
            trackEvent(EVENT_TYPES.COLLECTION_ADDED, { tmdbId: movieId, metadata: { collection_id: collectionId } });
            setTimeout(() => {
                setSaving(null);
                onClose();
            }, 600);
        } else {
            console.error("Failed to add to collection:", result.error);
            alert(`Failed to add to list: ${result.error?.message || 'Unknown error'}`);
            setSaving(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-[#1a1a1a] rounded-2xl max-w-md w-full max-h-[80vh] overflow-hidden border border-white/10">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <FaFolder className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Save to List</h3>
                            <p className="text-xs text-white/40">{movieTitle}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white">
                        <FaTimes />
                    </button>
                </div>

                <div className="p-4 max-h-[60vh] overflow-y-auto">
                    {creating ? (
                        <div className="mb-4 p-4 rounded-xl bg-white/5 border border-white/10">
                            <input
                                type="text"
                                placeholder="List name..."
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 border border-white/10 focus:border-purple-500/50 focus:outline-none mb-3"
                                autoFocus
                            />
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={() => setIsPublic(!isPublic)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all ${isPublic ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/50'}`}
                                >
                                    {isPublic ? <FaGlobe /> : <FaLock />}
                                    {isPublic ? 'Public' : 'Private'}
                                </button>
                                <div className="flex gap-2">
                                    <button onClick={() => setCreating(false)} className="px-3 py-1.5 text-xs text-white/50 hover:text-white">
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={!newName.trim()}
                                        className="px-4 py-1.5 text-xs bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
                                    >
                                        Create
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setCreating(true)}
                            className="w-full mb-4 flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-dashed border-white/20 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-white/60 hover:text-white"
                        >
                            <FaPlus className="text-sm" />
                            <span className="text-sm">Create New List</span>
                        </button>
                    )}

                    {loading ? (
                        <div className="text-center py-8 text-white/40">Loading lists...</div>
                    ) : collections.length === 0 ? (
                        <div className="text-center py-8">
                            <FaFolder className="text-3xl text-white/20 mx-auto mb-2" />
                            <p className="text-white/40 text-sm">No lists yet. Create one above!</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {collections.map((collection) => (
                                <button
                                    key={collection.id}
                                    onClick={() => handleAddToCollection(collection.id)}
                                    disabled={saving === collection.id}
                                    className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all group disabled:opacity-60"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                                            {collection.is_public ? <FaGlobe className="text-xs text-purple-400" /> : <FaLock className="text-xs text-white/40" />}
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-white">{collection.name}</p>
                                            <p className="text-[10px] text-white/40">{collection.collection_movies?.length || 0} movies</p>
                                        </div>
                                    </div>
                                    <span className={`text-xs px-3 py-1 rounded-full transition-all ${saving === collection.id ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/40 group-hover:bg-purple-500/20 group-hover:text-purple-400'}`}>
                                        {saving === collection.id ? '✓ Saved' : 'Add'}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CollectionsModal;
