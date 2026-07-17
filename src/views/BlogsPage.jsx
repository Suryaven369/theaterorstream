import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProfileByUsername } from '../lib/supabase';
import {
    getUserBlogPosts,
    getLatestBlogDraft,
    consolidateBlogDrafts,
    dedupeDraftsMatchingPublished,
    setBlogVisibility,
    deleteBlogPost,
} from '../lib/blogs';
import WriteBlogModal from '../components/social/WriteBlogModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { FaPencilAlt, FaPlus, FaArrowLeft, FaTrash } from 'react-icons/fa';

function VisibilityToggle({ isPublic, disabled, onChange }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={isPublic}
            disabled={disabled}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(!isPublic);
            }}
            className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-white/10 bg-black/30 p-0.5 text-[11px] font-semibold"
            title={isPublic ? 'Public — click to set Draft' : 'Draft — click to set Public'}
        >
            <span
                className={`px-2.5 py-1 rounded-full transition-colors ${
                    !isPublic ? 'bg-amber-400 text-[#14181c]' : 'text-white/45'
                }`}
            >
                Draft
            </span>
            <span
                className={`px-2.5 py-1 rounded-full transition-colors ${
                    isPublic ? 'bg-emerald-400 text-[#14181c]' : 'text-white/45'
                }`}
            >
                Public
            </span>
        </button>
    );
}

const BlogsPage = () => {
    const { username } = useParams();
    const navigate = useNavigate();
    const { user, profile: currentUserProfile, loading: authLoading } = useAuth();

    const [viewedProfile, setViewedProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [blogs, setBlogs] = useState([]);
    const [showWriteModal, setShowWriteModal] = useState(false);
    const [editingBlog, setEditingBlog] = useState(null);
    const [togglingId, setTogglingId] = useState(null);
    const [blogToDelete, setBlogToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [success, setSuccess] = useState('');

    const isOwnProfile = !username || currentUserProfile?.username?.toLowerCase() === String(username).toLowerCase();

    useEffect(() => {
        loadData();
    }, [username, currentUserProfile, user]);

    const loadData = async () => {
        setLoading(true);
        const targetProfile = isOwnProfile ? currentUserProfile : await getProfileByUsername(username);
        setViewedProfile(targetProfile);

        if (targetProfile?.id) {
            if (isOwnProfile && user?.id) {
                await dedupeDraftsMatchingPublished(user.id);
                const latest = await getLatestBlogDraft(user.id);
                if (latest?.id) await consolidateBlogDrafts(user.id, latest.id);
            }
            const userBlogs = await getUserBlogPosts(targetProfile.id);
            setBlogs(isOwnProfile ? userBlogs : userBlogs.filter((b) => b.visibility === 'public'));
        }
        setLoading(false);
    };

    const handlePublished = (blog, meta = {}) => {
        setBlogs((prev) => {
            const without = prev.filter((b) => b.id !== blog.id && !(meta.published && b.visibility === 'draft'));
            return [blog, ...without];
        });
        setSuccess(meta.draft ? 'Draft saved' : 'Blog published!');
        setTimeout(() => setSuccess(''), 3000);
        loadData();
    };

    const openNew = () => {
        setEditingBlog(null);
        setShowWriteModal(true);
    };

    const openEditor = (blog) => {
        setEditingBlog(blog);
        setShowWriteModal(true);
    };

    const handleToggleVisibility = async (blog, makePublic) => {
        if (!isOwnProfile) return;
        const next = makePublic ? 'public' : 'draft';
        if (blog.visibility === next) return;

        // Publishing requires a real title + body
        if (makePublic) {
            const plain = String(blog.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (!blog.title?.trim() || blog.title === 'Untitled draft' || plain.length < 20) {
                setSuccess('Add a title and at least 20 characters before making it public.');
                setTimeout(() => setSuccess(''), 3500);
                openEditor(blog);
                return;
            }
        }

        setTogglingId(blog.id);
        // Optimistic UI
        setBlogs((prev) => prev.map((b) => (b.id === blog.id ? { ...b, visibility: next } : b)));
        const res = await setBlogVisibility(blog.id, next);
        setTogglingId(null);
        if (!res.success) {
            setBlogs((prev) => prev.map((b) => (b.id === blog.id ? { ...b, visibility: blog.visibility } : b)));
            setSuccess('Could not update visibility.');
            setTimeout(() => setSuccess(''), 3000);
            return;
        }
        setSuccess(makePublic ? 'Now public' : 'Moved to draft');
        setTimeout(() => setSuccess(''), 2500);
        // Drop any leftover draft twin of this published post
        if (makePublic && user?.id) {
            await dedupeDraftsMatchingPublished(user.id);
            await loadData();
        }
    };

    const handleDeleteBlog = async () => {
        if (!blogToDelete?.id || !isOwnProfile) return;
        setDeleting(true);
        const res = await deleteBlogPost(blogToDelete.id);
        setDeleting(false);
        if (!res.success) {
            setSuccess('Could not delete blog.');
            setTimeout(() => setSuccess(''), 3000);
            return;
        }
        setBlogs((prev) => prev.filter((b) => b.id !== blogToDelete.id));
        setBlogToDelete(null);
        setSuccess('Blog deleted');
        setTimeout(() => setSuccess(''), 2500);
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
                    <Link to="/" className="text-orange-400 hover:text-orange-300">Go back home</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] pt-20 sm:pt-24 pb-20 sm:pb-12 px-3 sm:px-4 safe-area-bottom">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <Link
                        to={`/${viewedProfile.username}/profile`}
                        className="inline-flex items-center gap-2 text-white/50 hover:text-white mb-6 transition-colors"
                    >
                        <FaArrowLeft />
                        <span>Back to Profile</span>
                    </Link>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">Blogs</h1>
                    <p className="text-sm sm:text-base text-white/50">
                        {isOwnProfile
                            ? 'One post each — toggle Draft or Public anytime'
                            : `Blogs by @${viewedProfile.username}`}
                    </p>
                </div>

                {success && (
                    <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm animate-fadeIn">
                        {success}
                    </div>
                )}

                {isOwnProfile && (
                    <div className="mb-8">
                        <button
                            type="button"
                            onClick={openNew}
                            className="w-full flex items-center justify-center gap-3 p-8 rounded-2xl bg-[#1a1a1a] border border-dashed border-white/20 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group"
                        >
                            <div className="w-12 h-12 rounded-full bg-white/5 group-hover:bg-purple-500/20 flex items-center justify-center transition-colors">
                                <FaPlus className="text-white/50 group-hover:text-purple-400" />
                            </div>
                            <div className="text-left">
                                <h3 className="font-medium text-white group-hover:text-purple-400">Write a New Blog</h3>
                                <p className="text-sm text-white/40">Autosaves as a draft — publish with the toggle</p>
                            </div>
                        </button>
                    </div>
                )}

                {blogs.length > 0 ? (
                    <div className="space-y-3">
                        {blogs.map((blog) => {
                            const isDraft = blog.visibility === 'draft';
                            const isPublic = blog.visibility === 'public';

                            return (
                                <div
                                    key={blog.id}
                                    className={`flex items-center gap-3 p-4 sm:p-5 rounded-2xl bg-[#1a1a1a] border transition-all group ${
                                        isDraft
                                            ? 'border-amber-500/25'
                                            : 'border-white/5 hover:border-purple-500/30'
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isOwnProfile) openEditor(blog);
                                            else {
                                                navigate(`/blog/${blog.id}`, {
                                                    state: viewedProfile?.username ? {
                                                        from: {
                                                            path: `/${viewedProfile.username}/blogs`,
                                                            label: 'Blogs',
                                                            crumbs: [
                                                                { path: `/${viewedProfile.username}/profile`, label: `@${viewedProfile.username}` },
                                                                { path: `/${viewedProfile.username}/blogs`, label: 'Blogs' },
                                                            ],
                                                        },
                                                    } : undefined,
                                                });
                                            }
                                        }}
                                        className="flex items-center gap-4 min-w-0 flex-1 text-left"
                                    >
                                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-white/5 shrink-0">
                                            {blog.cover_image ? (
                                                <img src={blog.cover_image} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <FaPencilAlt className="text-lg text-purple-400" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-purple-400 transition-colors truncate">
                                                {blog.title || 'Untitled draft'}
                                            </h3>
                                            <p className="text-xs text-white/40 truncate">
                                                {String(blog.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
                                            </p>
                                            <p className="text-[11px] text-white/35 mt-1">
                                                {new Date(blog.updated_at || blog.created_at).toLocaleDateString()}
                                                {!isPublic && !isDraft ? ' · Private' : ''}
                                            </p>
                                        </div>
                                    </button>

                                    {isOwnProfile ? (
                                        <div className="flex items-center gap-2 shrink-0">
                                            <VisibilityToggle
                                                isPublic={isPublic}
                                                disabled={togglingId === blog.id || deleting}
                                                onChange={(makePublic) => handleToggleVisibility(blog, makePublic)}
                                            />
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setBlogToDelete(blog);
                                                }}
                                                disabled={deleting}
                                                className="p-2 rounded-lg text-white/35 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                                title="Delete blog"
                                                aria-label="Delete blog"
                                            >
                                                <FaTrash className="text-sm" />
                                            </button>
                                        </div>
                                    ) : null}

                                    {!isOwnProfile && (
                                        <Link
                                            to={`/blog/${blog.id}`}
                                            state={viewedProfile?.username ? {
                                                from: {
                                                    path: `/${viewedProfile.username}/blogs`,
                                                    label: 'Blogs',
                                                    crumbs: [
                                                        { path: `/${viewedProfile.username}/profile`, label: `@${viewedProfile.username}` },
                                                        { path: `/${viewedProfile.username}/blogs`, label: 'Blogs' },
                                                    ],
                                                },
                                            } : undefined}
                                            className="text-white/40 hover:text-purple-400 text-sm shrink-0"
                                        >
                                            View
                                        </Link>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    !showWriteModal && (
                        <div className="text-center py-20 rounded-2xl bg-[#1a1a1a]/50 border border-white/5">
                            <span className="text-6xl mb-4 block opacity-50">✍️</span>
                            <h3 className="text-xl font-bold text-white mb-2">No Blogs</h3>
                            <p className="text-white/50">
                                {isOwnProfile
                                    ? "You haven't written any blogs yet."
                                    : `@${viewedProfile.username} hasn't published any blogs.`}
                            </p>
                        </div>
                    )
                )}
            </div>

            {showWriteModal && (
                <WriteBlogModal
                    userId={user?.id}
                    initialBlog={editingBlog}
                    onClose={() => {
                        setShowWriteModal(false);
                        setEditingBlog(null);
                        loadData();
                    }}
                    onSuccess={handlePublished}
                />
            )}

            <ConfirmationModal
                isOpen={!!blogToDelete}
                onClose={() => !deleting && setBlogToDelete(null)}
                onConfirm={handleDeleteBlog}
                title="Delete Blog"
                message={`Are you sure you want to delete "${blogToDelete?.title || 'Untitled draft'}"? This can't be undone.`}
                confirmText={deleting ? 'Deleting…' : 'Delete'}
            />
        </div>
    );
};

export default BlogsPage;
