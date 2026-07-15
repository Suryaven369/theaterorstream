import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getBlogPost, deleteBlogPost, toggleBlogLike } from '../lib/blogs';
import { FaArrowLeft, FaHeart, FaTrash, FaShareAlt } from 'react-icons/fa';
import ConfirmationModal from '../components/ConfirmationModal';
import SeoHead from '../components/SeoHead';
import DOMPurify from 'dompurify';

const stripHtml = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const BlogDetails = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { user } = useAuth();

    const [blog, setBlog] = useState(null);
    const [loading, setLoading] = useState(true);
    const [likes, setLikes] = useState(0);
    const [liked, setLiked] = useState(false);
    const [liking, setLiking] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [shareMsg, setShareMsg] = useState('');

    const handleShare = async () => {
        const url = `${window.location.origin}/blog/${blog.id}`;
        try {
            if (navigator.share) await navigator.share({ title: blog.title, url });
            else { await navigator.clipboard.writeText(url); setShareMsg('Link copied'); setTimeout(() => setShareMsg(''), 2000); }
        } catch { /* dismissed */ }
    };

    useEffect(() => {
        if (id) loadBlog();
    }, [id, user?.id]);

    const loadBlog = async () => {
        setLoading(true);
        const data = await getBlogPost(id);
        // Only public blogs are readable by others; owners can open their drafts
        if (data && data.visibility !== 'public' && data.user_id !== user?.id) {
            setBlog(null);
        } else {
            setBlog(data);
            setLikes(data?.likes_count || 0);
        }
        setLoading(false);
    };

    const isOwnBlog = user?.id && blog?.user_id === user.id;

    const handleLike = async () => {
        if (liking || !user?.id) return;
        setLiking(true);
        const res = await toggleBlogLike(user.id, blog.id);
        if (res.success) {
            setLiked(res.liked);
            setLikes((n) => (res.liked ? n + 1 : Math.max(0, n - 1)));
        }
        setLiking(false);
    };

    const handleDelete = async () => {
        setDeleting(true);
        const res = await deleteBlogPost(blog.id);
        setDeleting(false);
        if (res.success) {
            navigate(blog.user_profiles?.username ? `/${blog.user_profiles.username}/blogs` : '/');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!blog) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="text-center">
                    <span className="text-6xl mb-4 block">📄</span>
                    <h2 className="text-2xl font-bold text-white mb-2">Blog not found</h2>
                    <Link to="/" className="text-orange-400 hover:text-orange-300">Go back home</Link>
                </div>
            </div>
        );
    }

    if (blog.visibility !== 'public' && !isOwnBlog) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="text-center">
                    <span className="text-6xl mb-4 block">🔒</span>
                    <h2 className="text-2xl font-bold text-white mb-2">Private Blog</h2>
                    <Link to="/" className="text-orange-400 hover:text-orange-300">Go back home</Link>
                </div>
            </div>
        );
    }

    return (
        <>
            <SeoHead
                title={`${blog.title} | TheaterOrStream`}
                description={stripHtml(blog.content).slice(0, 160)}
                image={blog.cover_image || null}
                url={`${window.location.origin}/blog/${blog.id}`}
                type="article"
            />

            {/* Cover hero */}
            {blog.cover_image && (
                <div className="relative h-44 sm:h-64 w-full overflow-hidden">
                    <img src={blog.cover_image} alt="" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/30 to-transparent" />
                </div>
            )}

            <div className={`min-h-screen bg-[#0a0a0a] ${blog.cover_image ? '-mt-20 relative z-10' : 'pt-20 sm:pt-24'} pb-20 sm:pb-12 px-3 sm:px-4 safe-area-bottom`}>
                <div className="max-w-2xl mx-auto">
                    <Link
                        to={blog.user_profiles?.username ? `/${blog.user_profiles.username}/blogs` : '/'}
                        className="inline-flex items-center gap-2 text-white/50 hover:text-white mb-6 transition-colors"
                    >
                        <FaArrowLeft />
                        <span>Back to Blogs</span>
                    </Link>

                    <article className="bg-[#1a1a1a] p-6 sm:p-8 rounded-2xl border border-white/5">
                        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3 break-words">{blog.title}</h1>
                        <div className="flex items-center gap-3 text-sm text-white/40 mb-6">
                            {blog.user_profiles?.username && (
                                <Link to={`/${blog.user_profiles.username}/profile`} className="text-orange-400 hover:underline">
                                    @{blog.user_profiles.username}
                                </Link>
                            )}
                            <span>•</span>
                            <time>{new Date(blog.created_at).toLocaleDateString()}</time>
                        </div>
                        {/* Rich HTML content — sanitized to prevent stored XSS. */}
                        <div
                            className="rich-content text-white/80 text-base leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(blog.content || '') }}
                        />

                        <div className="flex items-center gap-4 mt-8 pt-4 border-t border-white/10">
                            <button
                                type="button"
                                onClick={handleLike}
                                disabled={liking || !user?.id}
                                className={`flex items-center gap-2 text-sm transition-colors ${liked ? 'text-rose-400' : 'text-white/50 hover:text-rose-400'}`}
                            >
                                <FaHeart />
                                {likes}
                            </button>
                            <button type="button" onClick={handleShare} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors">
                                <FaShareAlt /> {shareMsg || 'Share'}
                            </button>
                            {isOwnBlog && (
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="ml-auto flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                                >
                                    <FaTrash /> Delete
                                </button>
                            )}
                        </div>
                    </article>
                </div>
            </div>

            <ConfirmationModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="Delete Blog"
                message={`Are you sure you want to delete "${blog.title}"? This can't be undone.`}
                confirmText={deleting ? 'Deleting…' : 'Delete'}
            />
        </>
    );
};

export default BlogDetails;
