import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProfileByUsername } from '../lib/supabase';
import { getUserBlogPosts } from '../lib/blogs';
import WriteBlogModal from '../components/social/WriteBlogModal';
import { FaPencilAlt, FaPlus, FaLock, FaGlobe, FaChevronRight, FaArrowLeft } from 'react-icons/fa';
import { stripMentionsToPlainText } from '../lib/movieMentions';

const BlogsPage = () => {
    const { username } = useParams();
    const { user, profile: currentUserProfile, loading: authLoading } = useAuth();

    const [viewedProfile, setViewedProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [blogs, setBlogs] = useState([]);
    const [showWriteModal, setShowWriteModal] = useState(false);
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
            const userBlogs = await getUserBlogPosts(targetProfile.id);
            setBlogs(isOwnProfile ? userBlogs : userBlogs.filter((b) => b.visibility === 'public'));
        }
        setLoading(false);
    };

    const handlePublished = (blog) => {
        setBlogs((prev) => [blog, ...prev]);
        setSuccess('Blog published!');
        setTimeout(() => setSuccess(''), 3000);
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
                        {isOwnProfile ? 'Your long-form posts' : `Blogs by @${viewedProfile.username}`}
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
                            onClick={() => setShowWriteModal(true)}
                            className="w-full flex items-center justify-center gap-3 p-8 rounded-2xl bg-[#1a1a1a] border border-dashed border-white/20 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group"
                        >
                            <div className="w-12 h-12 rounded-full bg-white/5 group-hover:bg-purple-500/20 flex items-center justify-center transition-colors">
                                <FaPlus className="text-white/50 group-hover:text-purple-400" />
                            </div>
                            <div className="text-left">
                                <h3 className="font-medium text-white group-hover:text-purple-400">Write a New Blog</h3>
                                <p className="text-sm text-white/40">Share something long-form with the community</p>
                            </div>
                        </button>
                    </div>
                )}

                {blogs.length > 0 ? (
                    <div className="space-y-3">
                        {blogs.map((blog) => (
                            <Link
                                key={blog.id}
                                to={`/blog/${blog.id}`}
                                className="block p-5 rounded-2xl bg-[#1a1a1a] hover:bg-[#222] transition-all border border-white/5 hover:border-purple-500/30 group"
                            >
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-white/5 shrink-0">
                                            {blog.cover_image ? (
                                                <img src={blog.cover_image} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <FaPencilAlt className="text-lg text-purple-400" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-lg font-bold text-white group-hover:text-purple-400 transition-colors truncate">
                                                {blog.title}
                                            </h3>
                                            <p className="text-xs text-white/40 truncate">{String(blog.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}</p>
                                            <div className="flex items-center gap-3 text-xs text-white/40 mt-1">
                                                <span>{new Date(blog.created_at).toLocaleDateString()}</span>
                                                {blog.visibility === 'public' ? (
                                                    <span className="flex items-center gap-1 text-green-400/70"><FaGlobe className="text-[10px]" /> Public</span>
                                                ) : (
                                                    <span className="flex items-center gap-1"><FaLock className="text-[10px]" /> Private</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <FaChevronRight className="text-white/40 group-hover:text-purple-400 shrink-0" />
                                </div>
                            </Link>
                        ))}
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
                    onClose={() => setShowWriteModal(false)}
                    onSuccess={handlePublished}
                />
            )}
        </div>
    );
};

export default BlogsPage;
