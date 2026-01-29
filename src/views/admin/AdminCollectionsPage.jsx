import { useState, useEffect, useCallback } from "react";
import {
    getCollections,
    createCollection,
    deleteCollection,
    updateCollection
} from "../../lib/supabase";

const AdminCollectionsPage = () => {
    const [collections, setCollections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newCollection, setNewCollection] = useState({
        name: "",
        description: "",
        slug: "",
        is_public: true
    });
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    // Load collections
    const loadCollections = useCallback(async () => {
        setLoading(true);
        const data = await getCollections();
        setCollections(data || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadCollections();
    }, [loadCollections]);

    // Generate slug from name
    const generateSlug = (name) => {
        return name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    };

    // Handle name change - auto-generate slug
    const handleNameChange = (name) => {
        setNewCollection({
            ...newCollection,
            name,
            slug: generateSlug(name)
        });
    };

    // Create collection
    const handleCreate = async () => {
        if (!newCollection.name.trim() || !newCollection.slug.trim()) return;
        await createCollection({
            name: newCollection.name,
            description: newCollection.description,
            slug: newCollection.slug,
            is_public: newCollection.is_public,
            movie_ids: []
        });
        setNewCollection({ name: "", description: "", slug: "", is_public: true });
        await loadCollections();
    };

    // Delete collection
    const handleDelete = async (id) => {
        if (confirm("Delete this collection? This cannot be undone.")) {
            await deleteCollection(id);
            await loadCollections();
        }
    };

    // Start editing
    const startEdit = (collection) => {
        setEditingId(collection.id);
        setEditForm({
            name: collection.name,
            description: collection.description || "",
            slug: collection.slug,
            is_public: collection.is_public
        });
    };

    // Save edit
    const saveEdit = async (id) => {
        await updateCollection(id, editForm);
        setEditingId(null);
        await loadCollections();
    };

    return (
        <div className="p-6">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-white">🎬 Collections</h1>
                <p className="text-white/50 text-sm">Manage movie collections and playlists</p>
            </div>

            {/* Create New Collection */}
            <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-3">Create New Collection</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <input
                        type="text"
                        placeholder="Collection name"
                        value={newCollection.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        className="bg-black/30 rounded-lg px-4 py-2 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none"
                    />
                    <input
                        type="text"
                        placeholder="Slug (URL-friendly)"
                        value={newCollection.slug}
                        onChange={(e) => setNewCollection({ ...newCollection, slug: e.target.value })}
                        className="bg-black/30 rounded-lg px-4 py-2 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none"
                    />
                </div>
                <textarea
                    placeholder="Description (optional)"
                    value={newCollection.description}
                    onChange={(e) => setNewCollection({ ...newCollection, description: e.target.value })}
                    className="w-full bg-black/30 rounded-lg px-4 py-2 text-sm text-white border border-white/10 focus:border-orange-500/50 outline-none mb-3 resize-none"
                    rows={2}
                />
                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm text-white/60">
                        <input
                            type="checkbox"
                            checked={newCollection.is_public}
                            onChange={(e) => setNewCollection({ ...newCollection, is_public: e.target.checked })}
                            className="w-4 h-4 rounded"
                        />
                        Public collection
                    </label>
                    <button
                        onClick={handleCreate}
                        disabled={!newCollection.name.trim()}
                        className="px-6 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
                    >
                        + Create
                    </button>
                </div>
            </div>

            {/* Collections List */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-pulse text-white/40">Loading collections...</div>
                </div>
            ) : collections.length === 0 ? (
                <div className="text-center py-12 text-white/30">
                    No collections yet. Create one above!
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {collections.map((collection) => (
                        <div
                            key={collection.id}
                            className="bg-white/[0.03] rounded-xl border border-white/10 p-4"
                        >
                            {editingId === collection.id ? (
                                // Edit Mode
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                        className="w-full bg-black/30 rounded-lg px-3 py-2 text-sm text-white border border-white/10"
                                    />
                                    <input
                                        type="text"
                                        value={editForm.slug}
                                        onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                                        className="w-full bg-black/30 rounded-lg px-3 py-2 text-sm text-white border border-white/10"
                                    />
                                    <textarea
                                        value={editForm.description}
                                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                        className="w-full bg-black/30 rounded-lg px-3 py-2 text-sm text-white border border-white/10 resize-none"
                                        rows={2}
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => saveEdit(collection.id)}
                                            className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm"
                                        >
                                            Save
                                        </button>
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="flex-1 py-2 bg-white/10 text-white rounded-lg text-sm"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                // View Mode
                                <>
                                    <div className="flex items-start justify-between mb-2">
                                        <h3 className="text-white font-medium">{collection.name}</h3>
                                        <span className={`px-2 py-0.5 rounded text-[10px] ${collection.is_public
                                            ? "bg-green-500/20 text-green-400"
                                            : "bg-red-500/20 text-red-400"
                                            }`}>
                                            {collection.is_public ? "Public" : "Private"}
                                        </span>
                                    </div>
                                    <p className="text-white/40 text-xs mb-2">/{collection.slug}</p>
                                    {collection.description && (
                                        <p className="text-white/50 text-sm mb-3 line-clamp-2">{collection.description}</p>
                                    )}
                                    <div className="flex items-center justify-between">
                                        <span className="text-white/30 text-xs">
                                            {collection.movie_ids?.length || 0} movies
                                        </span>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => startEdit(collection)}
                                                className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded text-xs"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(collection.id)}
                                                className="px-3 py-1 bg-red-500/20 text-red-400 rounded text-xs"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AdminCollectionsPage;
