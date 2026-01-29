import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    updateUserProfile,
    getUserFollowers,
    getUserFollowing,
    toggleFollow,
    isFollowing as checkIsFollowing,
    getUserWatchlist,
    getUserLikedMovies,
    getUserRatingsCount,
    getProfileByUsername,
    getUserCollections
} from '../lib/supabase';
import { FaUserPlus, FaUserCheck, FaBookmark, FaStar, FaHeart, FaFolder } from 'react-icons/fa';

// Avatar options
const AVATARS = {
    'avatar_1': { emoji: '🎬', bg: 'from-red-500 to-pink-500', name: 'Movie Buff' },
    'avatar_2': { emoji: '🎭', bg: 'from-purple-500 to-indigo-500', name: 'Drama Queen' },
    'avatar_3': { emoji: '🎪', bg: 'from-yellow-500 to-orange-500', name: 'Entertainer' },
    'avatar_4': { emoji: '🌟', bg: 'from-amber-400 to-yellow-500', name: 'Superstar' },
    'avatar_5': { emoji: '🎯', bg: 'from-green-500 to-emerald-500', name: 'Focused' },
    'avatar_6': { emoji: '🦋', bg: 'from-pink-400 to-purple-500', name: 'Dreamer' },
    'avatar_7': { emoji: '🌈', bg: 'from-cyan-500 to-blue-500', name: 'Colorful' },
    'avatar_8': { emoji: '🎸', bg: 'from-rose-500 to-red-600', name: 'Rockstar' },
    'avatar_9': { emoji: '🎮', bg: 'from-indigo-500 to-purple-600', name: 'Gamer' },
    'avatar_10': { emoji: '📚', bg: 'from-teal-500 to-green-500', name: 'Bookworm' },
    'avatar_11': { emoji: '🚀', bg: 'from-blue-500 to-cyan-500', name: 'Explorer' },
    'avatar_12': { emoji: '🎨', bg: 'from-fuchsia-500 to-pink-500', name: 'Artist' },
};

const ProfilePage = () => {
    const navigate = useNavigate();
    const { username } = useParams();
    const { user, profile: currentUserProfile, refreshProfile, isAuthenticated, loading: authLoading } = useAuth();

    // Profile being viewed
    const [viewedProfile, setViewedProfile] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(true);

    // Check if viewing own profile
    const isOwnProfile = !username || currentUserProfile?.username === username;

    // Follow state
    const [followers, setFollowers] = useState([]);
    const [following, setFollowing] = useState([]);
    const [isFollowingUser, setIsFollowingUser] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);

    // Stats
    const [watchlistCount, setWatchlistCount] = useState(0);
    const [ratingsCount, setRatingsCount] = useState(0);
    const [likedCount, setLikedCount] = useState(0);
    const [collectionsCount, setCollectionsCount] = useState(0);

    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');

    // Edit form state
    const [displayName, setDisplayName] = useState('');
    const [selectedAvatar, setSelectedAvatar] = useState('avatar_1');

    // Load profile data
    useEffect(() => {
        const loadProfile = async () => {
            setLoadingProfile(true);

            if (isOwnProfile) {
                // Viewing own profile
                setViewedProfile(currentUserProfile);
                if (user?.id) {
                    // Load own stats
                    const [watchlist, ratingsCount, likedMovies, userCollections] = await Promise.all([
                        getUserWatchlist(user.id),
                        getUserRatingsCount(user.id),
                        getUserLikedMovies(user.id),
                        getUserCollections(user.id)
                    ]);
                    setWatchlistCount(watchlist.length);
                    setRatingsCount(ratingsCount);
                    setLikedCount(likedMovies.length);
                    setCollectionsCount(userCollections.length);

                    // Load followers/following
                    const [followersData, followingData] = await Promise.all([
                        getUserFollowers(user.id),
                        getUserFollowing(user.id)
                    ]);
                    setFollowers(followersData);
                    setFollowing(followingData);
                }
            } else {
                // Viewing someone else's profile
                const profileData = await getProfileByUsername(username);
                setViewedProfile(profileData);

                if (profileData?.id) {
                    // Load their stats
                    const [watchlist, ratingsCount, likedMovies, userCollections] = await Promise.all([
                        getUserWatchlist(profileData.id),
                        getUserRatingsCount(profileData.id),
                        getUserLikedMovies(profileData.id),
                        getUserCollections(profileData.id)
                    ]);
                    setWatchlistCount(watchlist.length);
                    setRatingsCount(ratingsCount);
                    setLikedCount(likedMovies.length);

                    // Filter public collections count
                    const publicCollections = userCollections.filter(c => c.is_public);
                    setCollectionsCount(publicCollections.length);

                    // Load followers/following
                    const [followersData, followingData] = await Promise.all([
                        getUserFollowers(profileData.id),
                        getUserFollowing(profileData.id)
                    ]);
                    setFollowers(followersData);
                    setFollowing(followingData);

                    // Check if current user follows this profile
                    if (user?.id) {
                        const following = await checkIsFollowing(user.id, profileData.id);
                        setIsFollowingUser(following);
                    }
                }
            }

            setLoadingProfile(false);
        };

        if (!authLoading) {
            loadProfile();
        }
    }, [username, currentUserProfile, user, authLoading, isOwnProfile]);

    // Initialize edit form
    useEffect(() => {
        const profile = isOwnProfile ? currentUserProfile : viewedProfile;
        if (profile) {
            setDisplayName(profile.display_name || '');
            setSelectedAvatar(profile.avatar_id || 'avatar_1');
        }
    }, [currentUserProfile, viewedProfile, isOwnProfile]);

    // Redirect if not authenticated and viewing own profile
    useEffect(() => {
        if (!authLoading && !isAuthenticated && isOwnProfile && !username) {
            navigate('/auth');
        }
    }, [isAuthenticated, authLoading, isOwnProfile, navigate, username]);

    const handleFollow = async () => {
        if (!isAuthenticated) {
            sessionStorage.setItem('authMessage', 'Please sign up or login to follow users');
            navigate('/auth');
            return;
        }

        if (!viewedProfile?.id || !user?.id) return;

        setFollowLoading(true);
        const result = await toggleFollow(user.id, viewedProfile.id);
        if (result.success) {
            setIsFollowingUser(result.following);
            // Update follower count
            if (result.following) {
                setFollowers(prev => [...prev, { follower_id: user.id }]);
            } else {
                setFollowers(prev => prev.filter(f => f.follower_id !== user.id));
            }
        }
        setFollowLoading(false);
    };

    const handleSave = async () => {
        if (!user?.id) return;

        setSaving(true);
        const result = await updateUserProfile(user.id, {
            display_name: displayName,
            avatar_id: selectedAvatar,
        });

        if (result.success) {
            await refreshProfile();
            setSuccess('Profile updated successfully!');
            setIsEditing(false);
            setTimeout(() => setSuccess(''), 3000);
        }
        setSaving(false);
    };

    const getCurrentAvatar = () => {
        const profile = isOwnProfile ? currentUserProfile : viewedProfile;
        const avatarId = isEditing ? selectedAvatar : (profile?.avatar_id || 'avatar_1');
        return AVATARS[avatarId] || AVATARS['avatar_1'];
    };

    const displayProfile = isOwnProfile ? currentUserProfile : viewedProfile;

    if (authLoading || loadingProfile) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!displayProfile && !isOwnProfile) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="text-center">
                    <span className="text-6xl mb-4 block">🔍</span>
                    <h2 className="text-2xl font-bold text-white mb-2">User not found</h2>
                    <p className="text-white/50 mb-6">The user @{username} doesn't exist</p>
                    <Link to="/" className="text-orange-400 hover:text-orange-300">
                        Go back home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] pt-24 pb-12 px-4">
            <div className="max-w-2xl mx-auto">
                {/* Back button */}
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-white/50 hover:text-white mb-8 transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Home
                </Link>

                {/* Success message */}
                {success && (
                    <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm animate-fadeIn">
                        {success}
                    </div>
                )}

                {/* Profile Card */}
                <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden">
                    {/* Header with gradient */}
                    <div className={`h-32 bg-gradient-to-br ${getCurrentAvatar().bg} relative`}>
                        <div className="absolute inset-0 bg-black/20" />
                    </div>

                    {/* Avatar and Follow Button row */}
                    <div className="px-6 -mt-16 relative z-10 flex items-end justify-between">
                        <div className={`w-32 h-32 rounded-2xl bg-gradient-to-br ${getCurrentAvatar().bg} flex items-center justify-center text-5xl border-4 border-[#1a1a1a] shadow-xl`}>
                            {getCurrentAvatar().emoji}
                        </div>

                        {/* Follow Button (only show if not own profile) */}
                        {!isOwnProfile && (
                            <button
                                onClick={handleFollow}
                                disabled={followLoading}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${isFollowingUser
                                    ? 'bg-white/10 text-white hover:bg-red-500/20 hover:text-red-400'
                                    : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
                                    }`}
                            >
                                {followLoading ? (
                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : isFollowingUser ? (
                                    <>
                                        <FaUserCheck />
                                        Following
                                    </>
                                ) : (
                                    <>
                                        <FaUserPlus />
                                        Follow
                                    </>
                                )}
                            </button>
                        )}
                    </div>

                    {/* Profile Info */}
                    <div className="p-6 pt-4">
                        {isEditing && isOwnProfile ? (
                            <div className="space-y-6 animate-fadeIn">
                                {/* Display Name Input */}
                                <div>
                                    <label className="text-xs text-white/50 mb-2 block">Display Name</label>
                                    <input
                                        type="text"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        placeholder="Your display name"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-orange-500/50"
                                    />
                                </div>

                                {/* Avatar Selection */}
                                <div>
                                    <label className="text-xs text-white/50 mb-3 block">Choose Avatar</label>
                                    <div className="grid grid-cols-6 gap-3">
                                        {Object.entries(AVATARS).map(([id, avatar]) => (
                                            <button
                                                key={id}
                                                onClick={() => setSelectedAvatar(id)}
                                                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${avatar.bg} flex items-center justify-center text-2xl transition-all ${selectedAvatar === id
                                                    ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1a1a1a] scale-110'
                                                    : 'hover:scale-105 opacity-70 hover:opacity-100'
                                                    }`}
                                            >
                                                {avatar.emoji}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Buttons */}
                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={() => setIsEditing(false)}
                                        className="flex-1 py-3 rounded-xl bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="flex-1 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium hover:from-orange-600 hover:to-red-600 disabled:opacity-50 transition-all"
                                    >
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="animate-fadeIn">
                                {/* Name and username */}
                                <div className="mb-6">
                                    <h1 className="text-2xl font-bold text-white mb-1">
                                        {displayProfile?.display_name || 'User'}
                                    </h1>
                                    {displayProfile?.username && (
                                        <p className="text-white/50">@{displayProfile.username}</p>
                                    )}
                                </div>

                                {/* Followers/Following */}
                                <div className="flex gap-6 mb-8">
                                    <button className="group">
                                        <span className="text-lg font-bold text-white group-hover:text-purple-400 transition-colors">
                                            {followers.length}
                                        </span>
                                        <span className="text-sm text-white/40 ml-1.5">Followers</span>
                                    </button>
                                    <button className="group">
                                        <span className="text-lg font-bold text-white group-hover:text-purple-400 transition-colors">
                                            {following.length}
                                        </span>
                                        <span className="text-sm text-white/40 ml-1.5">Following</span>
                                    </button>
                                </div>

                                {/* Stats Grid */}
                                <div className="grid grid-cols-2 gap-4 mb-6 animate-fadeIn">
                                    <Link
                                        to={`/${displayProfile?.username}/watchlist`}
                                        className="bg-white/5 rounded-xl p-4 text-center hover:bg-white/10 transition-colors group"
                                    >
                                        <FaBookmark className="text-yellow-400 mx-auto mb-2 text-xl group-hover:scale-110 transition-transform" />
                                        <p className="text-2xl font-bold text-white">{watchlistCount}</p>
                                        <p className="text-xs text-white/40">Watchlist</p>
                                    </Link>

                                    <Link
                                        to={`/${displayProfile?.username}/collections`}
                                        className="bg-white/5 rounded-xl p-4 text-center hover:bg-white/10 transition-colors group"
                                    >
                                        <FaFolder className="text-purple-400 mx-auto mb-2 text-xl group-hover:scale-110 transition-transform" />
                                        <p className="text-2xl font-bold text-white">{collectionsCount}</p>
                                        <p className="text-xs text-white/40">Collections</p>
                                    </Link>

                                    <div className="bg-white/5 rounded-xl p-4 text-center">
                                        <FaStar className="text-orange-400 mx-auto mb-2 text-xl" />
                                        <p className="text-2xl font-bold text-white">{ratingsCount}</p>
                                        <p className="text-xs text-white/40">Ratings</p>
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-4 text-center">
                                        <FaHeart className="text-red-400 mx-auto mb-2 text-xl" />
                                        <p className="text-2xl font-bold text-white">{likedCount}</p>
                                        <p className="text-xs text-white/40">Liked</p>
                                    </div>
                                </div>

                                {/* Account Info (Moved here) */}
                                {isOwnProfile && (
                                    <div className="col-span-3 bg-white/5 rounded-xl p-4 mt-2">
                                        <h3 className="text-sm font-medium text-white/70 mb-3">Account</h3>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-white/40">Email</span>
                                                <span className="text-white">{user?.email || 'Not available'}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-white/40">Member since</span>
                                                <span className="text-white">
                                                    {displayProfile?.created_at
                                                        ? new Date(displayProfile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                                                        : 'Recently'
                                                    }
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Edit Button (only own profile - Moved) */}
                                {isOwnProfile && (
                                    <div className="mt-8 pt-6 border-t border-white/10">
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="w-full py-3 rounded-xl bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                                        >
                                            Edit Profile
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
