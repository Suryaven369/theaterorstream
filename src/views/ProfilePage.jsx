import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useParams, useLocation, useSearchParams } from 'react-router-dom';
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
    getUserCollections,
    getUserWatchedMovies,
    getUserTasteProfile,
} from '../lib/supabase';
import {
    uploadAvatarImage,
    uploadBannerImage,
    computeReputation,
    reputationTier,
    blockUser,
    reportUser,
    canViewProfile,
} from '../lib/profileSystem';
import { getUserBadges, getUserActivityFeed, getUserMovieLogs } from '../lib/movieDiary';
import { getUserBlogPosts } from '../lib/blogs';
import FollowListModal from '../components/social/FollowListModal';
import { generateTasteSummary } from '../lib/tasteSummary';
import { getSocialReviewsForUser } from '../lib/socialReviews';
import { getFeedPostsByAuthor } from '../lib/socialFeedApi';
import { generateSlugWithId } from '../lib/slugUtils';
import { searchContentFromDb } from '../lib/contentApi';
import { searchPeople } from '../lib/peopleApi';
import { getUserTopHashtags, getUserFollowedHashtags } from '../lib/hashtagApi';
import { FaUserPlus, FaUserCheck, FaEllipsisH, FaSearch, FaTimes, FaCamera, FaStar, FaFlag, FaBan, FaShareAlt } from 'react-icons/fa';
import SeoHead from '../components/SeoHead';
import MovieMentionText from '../components/MovieMentionText';

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

const slugifyName = (s) => String(s || '').toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');

const activityVerb = (type) => ({
    log: 'Watched', watched: 'Watched', review: 'Reviewed', rating: 'Rated',
    rated: 'Rated', list_created: 'Created a list', watchlist: 'Added to watchlist',
    liked: 'Liked', follow: 'Followed',
}[type] || (type ? type.replace(/_/g, ' ') : 'Activity'));

const timeAgoShort = (dateStr) => {
    if (!dateStr) return '';
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

// Profile tabs configuration
const PROFILE_TABS = [
    { id: 'profile', label: 'Profile', path: '' },
    { id: 'activity', label: 'Activity', path: '/activity' },
    { id: 'films', label: 'Films', path: '/watched' },
    { id: 'diary', label: 'Diary', path: '/diary' },
    { id: 'watchlist', label: 'Watchlist', path: '/watchlist' },
    { id: 'lists', label: 'Lists', path: '/collections' },
    { id: 'blogs', label: 'Blogs', path: '/blogs' },
];

const ProfilePage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { username } = useParams();
    const { user, profile: currentUserProfile, refreshProfile, isAuthenticated, loading: authLoading } = useAuth();

    // Profile being viewed
    const [viewedProfile, setViewedProfile] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(true);

    // Check if viewing own profile (case-insensitive username match)
    const isOwnProfile = !username || (
        !!currentUserProfile?.username
        && currentUserProfile.username.toLowerCase() === String(username).toLowerCase()
    );

    // Follow state
    const [followers, setFollowers] = useState([]);
    const [following, setFollowing] = useState([]);
    const [isFollowingUser, setIsFollowingUser] = useState(false);
    const [followModal, setFollowModal] = useState(null); // 'followers' | 'following' | null
    const [followLoading, setFollowLoading] = useState(false);

    // Stats
    const [watchlistCount, setWatchlistCount] = useState(0);
    const [ratingsCount, setRatingsCount] = useState(0);
    const [likedCount, setLikedCount] = useState(0);
    const [collectionsCount, setCollectionsCount] = useState(0);
    const [watchedCount, setWatchedCount] = useState(0);
    const [watchedThisYear, setWatchedThisYear] = useState(0);

    // Content data
    const [likedMovies, setLikedMovies] = useState([]);
    const [recentWatched, setRecentWatched] = useState([]);
    const [watchlistItems, setWatchlistItems] = useState([]);
    const [badges, setBadges] = useState([]);
    const [socialReviews, setSocialReviews] = useState([]);
    const [userPosts, setUserPosts] = useState([]);

    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');

    // Edit form state
    const [displayName, setDisplayName] = useState('');
    const [selectedAvatar, setSelectedAvatar] = useState('avatar_1');
    const [bio, setBio] = useState('');
    const [editFavoriteFilms, setEditFavoriteFilms] = useState([]);
    
    // Movie search for favorites
    const [movieSearchQuery, setMovieSearchQuery] = useState('');
    const [movieSearchResults, setMovieSearchResults] = useState([]);
    const [searchingMovies, setSearchingMovies] = useState(false);

    // Favorite films from profile
    const [favoriteFilms, setFavoriteFilms] = useState([]);

    // Taste profile (own profile only)
    const [tasteProfile, setTasteProfile] = useState(null);

    // Reputation
    const [reputation, setReputation] = useState(null);

    // Image upload (avatar + banner)
    const avatarFileRef = useRef(null);
    const bannerFileRef = useRef(null);
    const [editAvatarUrl, setEditAvatarUrl] = useState(null);   // uploaded image url (overrides emoji)
    const [editBannerUrl, setEditBannerUrl] = useState(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [uploadingBanner, setUploadingBanner] = useState(false);

    // Favorite shows + directors (edit)
    const [editFavoriteShows, setEditFavoriteShows] = useState([]);
    const [editFavoriteDirectors, setEditFavoriteDirectors] = useState([]);
    const [showSearchQuery, setShowSearchQuery] = useState('');
    const [showSearchResults, setShowSearchResults] = useState([]);
    const [directorSearchQuery, setDirectorSearchQuery] = useState('');
    const [directorSearchResults, setDirectorSearchResults] = useState([]);

    // Favorites from profile (display)
    const [favoriteShows, setFavoriteShows] = useState([]);
    const [favoriteDirectors, setFavoriteDirectors] = useState([]);
    const [favoriteTags, setFavoriteTags] = useState([]);
    const [followedTags, setFollowedTags] = useState([]);

    // Privacy / menu / moderation
    const [accessAllowed, setAccessAllowed] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const [reportOpen, setReportOpen] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [actionMsg, setActionMsg] = useState('');

    // In-page tabs (no navigation) — URL-synced via ?tab= so refresh/deeplink works.
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = PROFILE_TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'profile';
    const setActiveTab = (id) => setSearchParams(id === 'profile' ? {} : { tab: id }, { replace: false });

    // The viewed user's id + full data for the tabs (lazy-loaded).
    const [viewedUserId, setViewedUserId] = useState(null);
    const [allWatched, setAllWatched] = useState([]);
    const [allWatchlist, setAllWatchlist] = useState([]);
    const [allCollections, setAllCollections] = useState([]);
    const [tabData, setTabData] = useState({ activity: null, diary: null, blogs: null });
    const [tabLoading, setTabLoading] = useState(false);
    const [tabPage, setTabPage] = useState(1);

    // Reset to page 1 whenever the active tab changes.
    useEffect(() => { setTabPage(1); }, [activeTab]);

    // Load profile data
    useEffect(() => {
        const loadProfile = async () => {
            setLoadingProfile(true);

            let targetUserId = null;
            let targetProfile = null;

            if (isOwnProfile) {
                targetProfile = currentUserProfile;
                targetUserId = user?.id;
                setViewedProfile(currentUserProfile);
            } else {
                targetProfile = await getProfileByUsername(username);
                targetUserId = targetProfile?.id;
                setViewedProfile(targetProfile);

                if (targetUserId && user?.id) {
                    const following = await checkIsFollowing(user.id, targetUserId);
                    setIsFollowingUser(following);
                }
            }

            if (targetUserId) {
                const isOwner = user?.id === targetUserId;
                const currentYear = new Date().getFullYear();

                const [
                    watchlist,
                    ratingsCount,
                    likedMoviesData,
                    userCollections,
                    watchedMovies,
                    followersData,
                    followingData,
                    userBadges,
                    reviews,
                    postsRes,
                ] = await Promise.all([
                    getUserWatchlist(targetUserId),
                    getUserRatingsCount(targetUserId),
                    getUserLikedMovies(targetUserId),
                    getUserCollections(targetUserId),
                    getUserWatchedMovies(targetUserId),
                    getUserFollowers(targetUserId),
                    getUserFollowing(targetUserId),
                    getUserBadges(targetUserId),
                    getSocialReviewsForUser(targetUserId, 5),
                    getFeedPostsByAuthor(targetUserId, { limit: 8, viewerId: user?.id || null }),
                ]);

                setViewedUserId(targetUserId);
                setTabData({ activity: null, diary: null, blogs: null });
                setWatchlistCount(watchlist.length);
                setWatchlistItems(watchlist.slice(0, 5));
                setAllWatchlist(watchlist);
                setAllWatched(watchedMovies);
                setRatingsCount(ratingsCount);
                setLikedCount(likedMoviesData.length);
                setLikedMovies(likedMoviesData);

                // Load favorites from profile (films, shows, directors)
                setFavoriteFilms((targetProfile?.favorite_films || []).slice(0, 4));
                setFavoriteShows((targetProfile?.favorite_shows || []).slice(0, 4));
                setFavoriteDirectors((targetProfile?.favorite_directors || []).slice(0, 6));

                // Favorite / followed hashtags (taste profile signal)
                Promise.all([
                    getUserTopHashtags(targetUserId, { limit: 10 }),
                    getUserFollowedHashtags(targetUserId, { limit: 10 }),
                ]).then(([top, followed]) => {
                    setFavoriteTags(top || []);
                    setFollowedTags(followed || []);
                });

                // Privacy gate (followers-only / private profiles)
                const allowed = await canViewProfile(user?.id, targetProfile, { isFollowing: isOwner ? true : undefined });
                setAccessAllowed(isOwner || allowed);

                // Reputation — cache it when viewing your own profile.
                computeReputation(targetUserId, { cache: isOwner }).then(setReputation);

                const visibleCollections = isOwner
                    ? userCollections
                    : userCollections.filter(c => c.is_public);
                setCollectionsCount(visibleCollections.length);
                setAllCollections(visibleCollections);

                setFollowers(followersData);
                setFollowing(followingData);

                setWatchedCount(watchedMovies.length);
                setRecentWatched(watchedMovies.slice(0, 8));

                const thisYearWatched = watchedMovies.filter(m => {
                    const watchedDate = new Date(m.watched_at);
                    return watchedDate.getFullYear() === currentYear;
                });
                setWatchedThisYear(thisYearWatched.length);

                setBadges(userBadges);
                setSocialReviews(reviews);
                setUserPosts(postsRes?.items || []);
            }

            setLoadingProfile(false);
        };

        if (!authLoading) {
            loadProfile();
        }
    }, [username, currentUserProfile, user, authLoading, isOwnProfile]);

    useEffect(() => {
        if (!isOwnProfile || !user?.id) return;

        let cancelled = false;
        (async () => {
            const taste = await getUserTasteProfile(user.id);
            if (cancelled) return;
            setTasteProfile(taste);
        })();

        return () => { cancelled = true; };
    }, [isOwnProfile, user?.id, isEditing]);

    // Lazy-load the heavier tabs (activity / diary / blogs) the first time they're opened.
    useEffect(() => {
        if (!viewedUserId) return;
        if (!['activity', 'diary', 'blogs'].includes(activeTab)) return;
        if (tabData[activeTab] != null) return;

        let cancelled = false;
        setTabLoading(true);
        const loader =
            activeTab === 'activity' ? getUserActivityFeed(viewedUserId, 200)
            : activeTab === 'diary' ? getUserMovieLogs(viewedUserId, { limit: 200 })
            : getUserBlogPosts(viewedUserId);
        Promise.resolve(loader)
            .then((data) => { if (!cancelled) setTabData((p) => ({ ...p, [activeTab]: data || [] })); })
            .catch(() => { if (!cancelled) setTabData((p) => ({ ...p, [activeTab]: [] })); })
            .finally(() => { if (!cancelled) setTabLoading(false); });
        return () => { cancelled = true; };
    }, [activeTab, viewedUserId, tabData]);

    // Initialize edit form
    useEffect(() => {
        const profile = isOwnProfile ? currentUserProfile : viewedProfile;
        if (profile) {
            setDisplayName(profile.display_name || '');
            setSelectedAvatar(profile.avatar_id || 'avatar_1');
            setBio(profile.bio || '');
            setEditFavoriteFilms(profile.favorite_films || []);
            setEditFavoriteShows(profile.favorite_shows || []);
            setEditFavoriteDirectors(profile.favorite_directors || []);
            setEditAvatarUrl(profile.avatar_url || null);
            setEditBannerUrl(profile.profile_header_url || null);
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
            if (result.following) {
                setFollowers(prev => [...prev, { follower_id: user.id }]);
            } else {
                setFollowers(prev => prev.filter(f => f.follower_id !== user.id));
            }
        }
        setFollowLoading(false);
    };

    // Search movies for favorites
    const handleMovieSearch = async (query) => {
        setMovieSearchQuery(query);
        if (query.length < 2) {
            setMovieSearchResults([]);
            return;
        }
        setSearchingMovies(true);
        try {
            const results = await searchContentFromDb(query, { mediaType: 'movie', limit: 10 });
            setMovieSearchResults(results.data || []);
        } catch (err) {
            console.error('Movie search error:', err);
            setMovieSearchResults([]);
        }
        setSearchingMovies(false);
    };

    const addFavoriteFromSearch = (movie) => {
        if (editFavoriteFilms.length >= 4) return;
        if (editFavoriteFilms.some(f => f.movie_id === movie.tmdb_id)) return;
        
        setEditFavoriteFilms(prev => [...prev, {
            movie_id: movie.tmdb_id,
            title: movie.title,
            poster_path: movie.poster_path
        }]);
        setMovieSearchQuery('');
        setMovieSearchResults([]);
    };

    // ---- Image uploads -------------------------------------------------------
    const handleAvatarFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !user?.id) return;
        setUploadingAvatar(true);
        const r = await uploadAvatarImage(file, user.id);
        setUploadingAvatar(false);
        if (r.ok) setEditAvatarUrl(r.url);
        else setActionMsg(r.error || 'Upload failed');
        e.target.value = '';
    };

    const handleBannerFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !user?.id) return;
        setUploadingBanner(true);
        const r = await uploadBannerImage(file, user.id);
        setUploadingBanner(false);
        if (r.ok) setEditBannerUrl(r.url);
        else setActionMsg(r.error || 'Upload failed');
        e.target.value = '';
    };

    // ---- Favorite shows + directors search ----------------------------------
    const handleShowSearch = async (q) => {
        setShowSearchQuery(q);
        if (q.length < 2) return setShowSearchResults([]);
        const res = await searchContentFromDb(q, { mediaType: 'tv', limit: 10 });
        setShowSearchResults(res.data || []);
    };
    const addFavoriteShow = (show) => {
        if (editFavoriteShows.length >= 4 || editFavoriteShows.some((s) => s.movie_id === show.tmdb_id)) return;
        setEditFavoriteShows((p) => [...p, { movie_id: show.tmdb_id, title: show.title || show.name, poster_path: show.poster_path }]);
        setShowSearchQuery(''); setShowSearchResults([]);
    };

    const handleDirectorSearch = async (q) => {
        setDirectorSearchQuery(q);
        if (q.length < 2) return setDirectorSearchResults([]);
        setDirectorSearchResults(await searchPeople(q, { limit: 8, dept: 'Directing' }));
    };
    const addFavoriteDirector = (person) => {
        if (editFavoriteDirectors.length >= 6 || editFavoriteDirectors.some((d) => d.id === person.id)) return;
        setEditFavoriteDirectors((p) => [...p, { id: person.id, name: person.name, profile_path: person.profile_path }]);
        setDirectorSearchQuery(''); setDirectorSearchResults([]);
    };

    // ---- Moderation ----------------------------------------------------------
    const handleBlock = async () => {
        if (!user?.id || !viewedProfile?.id) return;
        await blockUser(user.id, viewedProfile.id);
        setMenuOpen(false);
        setActionMsg('User blocked');
        setTimeout(() => navigate('/'), 800);
    };
    const handleReport = async () => {
        if (!user?.id || !viewedProfile?.id || !reportReason) return;
        await reportUser(user.id, viewedProfile.id, reportReason, '', { username: viewedProfile.username });
        setReportOpen(false); setReportReason('');
        setActionMsg('Report submitted. Thank you.');
        setTimeout(() => setActionMsg(''), 2500);
    };
    const handleShare = async () => {
        const url = `${window.location.origin}/${profileUsername}/profile`;
        try { await navigator.clipboard.writeText(url); setActionMsg('Profile link copied'); }
        catch { setActionMsg(url); }
        setMenuOpen(false);
        setTimeout(() => setActionMsg(''), 2000);
    };

    const handleSave = async () => {
        if (!user?.id) return;

        setSaving(true);
        const result = await updateUserProfile(user.id, {
            display_name: displayName,
            avatar_id: selectedAvatar,
            avatar_url: editAvatarUrl || null,
            profile_header_url: editBannerUrl || null,
            bio: bio.trim() || null,
            favorite_films: editFavoriteFilms.slice(0, 4),
            favorite_shows: editFavoriteShows.slice(0, 4),
            favorite_directors: editFavoriteDirectors.slice(0, 6),
        });

        if (result.success) {
            await refreshProfile();
            setSuccess('Profile updated successfully!');
            setIsEditing(false);
            setMovieSearchQuery('');
            setMovieSearchResults([]);
            setTimeout(() => setSuccess(''), 3000);
        }
        setSaving(false);
    };

    const getCurrentAvatar = () => {
        const profile = isOwnProfile ? currentUserProfile : viewedProfile;
        const avatarId = isEditing ? selectedAvatar : (profile?.avatar_id || 'avatar_1');
        return AVATARS[avatarId] || AVATARS['avatar_1'];
    };

    // ---- In-page tab content (rendered under the profile header) ------------
    const emptyTab = (msg) => <p className="text-sm text-white/40 py-12 text-center">{msg}</p>;

    const posterGrid = (items, { to, img, title }) => (
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2.5">
            {items.map((it, i) => (
                <Link key={it.id || it.movie_id || i} to={to(it)} title={title(it)} className="group">
                    <div className="aspect-[2/3] rounded-lg overflow-hidden bg-white/5 border border-white/10 group-hover:border-[var(--accent-green)]/50 transition-colors">
                        {img(it) ? <img src={img(it)} alt={title(it)} loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/20">🎬</div>}
                    </div>
                    <p className="mt-1 text-xs text-white/55 line-clamp-1 group-hover:text-white">{title(it)}</p>
                </Link>
            ))}
        </div>
    );

    const TAB_PAGE_SIZE = { films: 24, watchlist: 24, lists: 12, activity: 15, diary: 15, blogs: 10 };
    const pageSlice = (arr) => {
        const size = TAB_PAGE_SIZE[activeTab] || 20;
        return arr.slice((tabPage - 1) * size, tabPage * size);
    };
    const Pager = ({ total }) => {
        const size = TAB_PAGE_SIZE[activeTab] || 20;
        const pages = Math.ceil(total / size);
        if (pages <= 1) return null;
        const start = Math.max(1, Math.min(tabPage - 2, pages - 4));
        const end = Math.min(pages, start + 4);
        const nums = [];
        for (let i = start; i <= end; i++) nums.push(i);
        const go = (p) => { setTabPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); };
        const btn = 'min-w-[34px] h-[34px] px-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed';
        return (
            <div className="flex items-center justify-center gap-1.5 mt-6">
                <button disabled={tabPage <= 1} onClick={() => go(tabPage - 1)} className={`${btn} bg-white/5 text-white/70 hover:bg-white/10`}>‹</button>
                {start > 1 && <span className="text-white/30 px-1">…</span>}
                {nums.map((n) => (
                    <button key={n} onClick={() => go(n)} className={`${btn} ${n === tabPage ? 'bg-[var(--accent-green)] text-[#14181c]' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>{n}</button>
                ))}
                {end < pages && <span className="text-white/30 px-1">…</span>}
                <button disabled={tabPage >= pages} onClick={() => go(tabPage + 1)} className={`${btn} bg-white/5 text-white/70 hover:bg-white/10`}>›</button>
            </div>
        );
    };

    const renderTabContent = () => {
        if (tabLoading && ['activity', 'diary', 'blogs'].includes(activeTab) && tabData[activeTab] == null) {
            return <div className="py-16 flex justify-center"><div className="animate-spin w-7 h-7 border-2 border-[var(--accent-green)] border-t-transparent rounded-full" /></div>;
        }
        switch (activeTab) {
            case 'films':
                return allWatched.length ? (
                    <>
                        {posterGrid(pageSlice(allWatched), { to: (m) => `/movies/${generateSlugWithId(m.movie_title, m.movie_id)}`, img: (m) => m.poster_path ? `https://image.tmdb.org/t/p/w185${m.poster_path}` : null, title: (m) => m.movie_title })}
                        <Pager total={allWatched.length} />
                    </>
                ) : emptyTab('No films logged yet.');
            case 'watchlist':
                return allWatchlist.length ? (
                    <>
                        {posterGrid(pageSlice(allWatchlist), { to: (m) => `/movies/${generateSlugWithId(m.movie_title, m.movie_id)}`, img: (m) => m.poster_path ? `https://image.tmdb.org/t/p/w185${m.poster_path}` : null, title: (m) => m.movie_title })}
                        <Pager total={allWatchlist.length} />
                    </>
                ) : emptyTab('Watchlist is empty.');
            case 'lists':
                return allCollections.length ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {pageSlice(allCollections).map((c) => (
                            <Link key={c.id} to={`/collection/${slugifyName(c.name)}`} className="flex items-center gap-3 p-3 rounded-xl bg-[#1a1d1f] border border-white/5 hover:border-white/15 transition-colors">
                                <div className="flex -space-x-3 shrink-0">
                                    {((c.collection_movies || []).slice(0, 3)).map((m, i) => (
                                        <div key={i} className="w-10 h-14 rounded overflow-hidden bg-white/10 border-2 border-[#1a1d1f]">
                                            {m.poster_path && <img src={`https://image.tmdb.org/t/p/w92${m.poster_path}`} alt="" className="w-full h-full object-cover" />}
                                        </div>
                                    ))}
                                    {(!c.collection_movies || c.collection_movies.length === 0) && <div className="w-10 h-14 rounded bg-white/5 flex items-center justify-center text-white/20">🎬</div>}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-white truncate">{c.name}</p>
                                    <p className="text-xs text-white/40">{(c.collection_movies || []).length} films · {c.is_public ? 'Public' : 'Private'}</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                    <Pager total={allCollections.length} />
                  </>
                ) : emptyTab('No lists yet.');
            case 'activity': {
                const items = tabData.activity || [];
                return items.length ? (
                  <>
                    <div className="space-y-2">
                        {pageSlice(items).map((a) => (
                            <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#1a1d1f] border border-white/5">
                                {a.target_poster_path
                                    ? <img src={`https://image.tmdb.org/t/p/w92${a.target_poster_path}`} alt="" className="w-10 h-14 rounded object-cover shrink-0" />
                                    : <div className="w-10 h-14 rounded bg-white/5 flex items-center justify-center text-white/20 shrink-0">🎬</div>}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white/85"><span className="text-white/45">{activityVerb(a.event_type)}</span> {a.target_movie_title || ''}</p>
                                    <p className="text-[11px] text-white/35">{timeAgoShort(a.created_at)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Pager total={items.length} />
                  </>
                ) : emptyTab('No activity yet.');
            }
            case 'diary': {
                const logs = tabData.diary || [];
                return logs.length ? (
                  <>
                    <div className="space-y-2">
                        {pageSlice(logs).map((log) => (
                            <Link key={log.id} to={`/movies/${generateSlugWithId(log.movie_title, log.tmdb_id)}`} className="flex gap-3 p-3 rounded-xl bg-[#1a1d1f] border border-white/5 hover:border-white/15 transition-colors">
                                {log.poster_path
                                    ? <img src={log.poster_path.startsWith('http') ? log.poster_path : `https://image.tmdb.org/t/p/w92${log.poster_path}`} alt="" className="w-10 h-14 rounded object-cover shrink-0" />
                                    : <div className="w-10 h-14 rounded bg-white/5 flex items-center justify-center text-white/20 shrink-0">🎬</div>}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white truncate">{log.movie_title}{log.rating != null && <span className="text-yellow-400 text-xs ml-2">★ {log.rating}/10</span>}</p>
                                    <p className="text-[11px] text-white/35">{timeAgoShort(log.watched_date || log.created_at)}</p>
                                    {log.review_text && <p className="text-xs text-white/55 mt-1 line-clamp-2">{log.review_text}</p>}
                                </div>
                            </Link>
                        ))}
                    </div>
                    <Pager total={logs.length} />
                  </>
                ) : emptyTab('No diary entries yet.');
            }
            case 'blogs': {
                const blogs = tabData.blogs || [];
                return blogs.length ? (
                  <>
                    <div className="space-y-2">
                        {pageSlice(blogs).map((b) => (
                            <Link key={b.id} to={`/blog/${b.id}`} className="block p-4 rounded-xl bg-[#1a1d1f] border border-white/5 hover:border-white/15 transition-colors">
                                <p className="text-sm font-semibold text-white">{b.title}</p>
                                {b.created_at && <p className="text-[11px] text-white/40 mt-1">{new Date(b.created_at).toLocaleDateString()}</p>}
                            </Link>
                        ))}
                    </div>
                    <Pager total={blogs.length} />
                  </>
                ) : emptyTab(isOwnProfile ? 'No blogs yet — write your first!' : 'No blogs yet.');
            }
            default:
                return null;
        }
    };

    const displayProfile = isOwnProfile ? currentUserProfile : viewedProfile;
    const profileUsername = displayProfile?.username || username;
    const profileShareUrl = profileUsername
        ? `${window.location.origin}/${profileUsername}/profile`
        : (typeof window !== 'undefined' ? window.location.href : '');

    // Banner + real-avatar image (uploaded or OAuth photo), falling back to emoji.
    const bannerUrl = isEditing ? editBannerUrl : displayProfile?.profile_header_url;
    const avatarImageUrl = isEditing ? editAvatarUrl : displayProfile?.avatar_url;
    const watchHours = Math.round((displayProfile?.total_watch_time_minutes || 0) / 60);
    const repTier = reputation ? reputationTier(reputation.score) : null;

    if (authLoading || loadingProfile) {
        return (
            <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-[var(--accent-green)] border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!displayProfile && !isOwnProfile) {
        return (
            <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
                <div className="text-center">
                    <span className="text-6xl mb-4 block">🔍</span>
                    <h2 className="text-2xl font-bold text-white mb-2">User not found</h2>
                    <p className="text-white/50 mb-6">The user @{username} doesn't exist</p>
                    <Link to="/" className="text-[var(--accent-green)] hover:underline">
                        Go back home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pt-20">
            {displayProfile && (
                <SeoHead
                    title={`${displayProfile.display_name || displayProfile.username} (@${displayProfile.username}) | TheaterOrStream`}
                    description={
                        (displayProfile.bio || '').trim().slice(0, 160)
                        || `Film taste, lists, and diary from @${displayProfile.username} on TheaterOrStream.`
                    }
                    image={displayProfile.avatar_url || bannerUrl || null}
                    url={profileShareUrl}
                    type="profile"
                />
            )}

            {/* Success message */}
            {success && (
                <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-sm animate-fadeIn">
                    {success}
                </div>
            )}

            {/* ============================================ */}
            {/* PROFILE HEADER - Letterboxd Style */}
            {/* ============================================ */}
            {/* Banner */}
            <div className="relative h-32 sm:h-48 w-full overflow-hidden bg-gradient-to-br from-[#1a1d1f] to-[#0f1214]">
                {bannerUrl && (
                    <img src={bannerUrl} alt="" className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#1a1d1f] to-transparent" />
            </div>

            <div className="bg-[#1a1d1f] border-b border-white/5">
                <div className="max-w-6xl mx-auto px-4 pb-8">
                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 -mt-12 sm:-mt-14">
                        {/* Avatar (uploaded/OAuth image, else emoji) — z-20 so it sits
                            above the banner's gradient overlay where it overlaps up. */}
                        {avatarImageUrl ? (
                            <img
                                src={avatarImageUrl}
                                alt={displayProfile?.display_name || 'avatar'}
                                className="relative z-20 w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-[#14181c] shadow-lg shrink-0 bg-[#14181c]"
                            />
                        ) : (
                            <div className={`relative z-20 w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br ${getCurrentAvatar().bg} flex items-center justify-center text-4xl sm:text-5xl border-4 border-[#14181c] shadow-lg shrink-0`}>
                                {getCurrentAvatar().emoji}
                            </div>
                        )}

                        {/* Name + Actions */}
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-3 mb-1">
                                <h1 className="text-xl sm:text-2xl font-bold text-white uppercase tracking-wide">
                                    {displayProfile?.display_name || displayProfile?.username || username || 'User'}
                                </h1>

                                {isOwnProfile ? (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide rounded bg-[var(--accent-green)] text-[#14181c] hover:bg-[#00e054] transition-colors"
                                    >
                                        Edit Profile
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleFollow}
                                        disabled={followLoading}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide rounded transition-colors ${isFollowingUser
                                            ? 'bg-white/10 text-white hover:bg-red-500/20 hover:text-red-400'
                                            : 'bg-[var(--accent-green)] text-[#14181c] hover:bg-[#00e054]'
                                            }`}
                                    >
                                        {followLoading ? (
                                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        ) : isFollowingUser ? (
                                            <>
                                                <FaUserCheck className="text-xs" />
                                                Following
                                            </>
                                        ) : (
                                            <>
                                                <FaUserPlus className="text-xs" />
                                                Follow
                                            </>
                                        )}
                                    </button>
                                )}

                                <div className="relative">
                                    <button
                                        onClick={() => setMenuOpen((o) => !o)}
                                        className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                                    >
                                        <FaEllipsisH />
                                    </button>
                                    {menuOpen && (
                                        <>
                                            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                                            <div className="absolute right-0 mt-1 w-44 rounded-xl bg-[#1c1f22] border border-white/10 shadow-2xl overflow-hidden z-40">
                                                <button onClick={handleShare} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-white/80 hover:bg-white/10">
                                                    <FaShareAlt className="text-xs" /> Share profile
                                                </button>
                                                {isOwnProfile && (
                                                    <Link to="/settings" onClick={() => setMenuOpen(false)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-white/80 hover:bg-white/10">
                                                        <FaUserCheck className="text-xs" /> Settings
                                                    </Link>
                                                )}
                                                {!isOwnProfile && (
                                                    <>
                                                        <button onClick={() => { setMenuOpen(false); setReportOpen(true); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-amber-400 hover:bg-white/10">
                                                            <FaFlag className="text-xs" /> Report
                                                        </button>
                                                        <button onClick={handleBlock} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-white/10">
                                                            <FaBan className="text-xs" /> Block
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                {displayProfile?.username && (
                                    <p className="text-sm text-white/50">@{displayProfile.username}</p>
                                )}
                                {repTier && (
                                    <span
                                        title={`Reputation ${reputation.score}`}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                        style={{ backgroundColor: `${repTier.color}20`, color: repTier.color }}
                                    >
                                        {repTier.icon} {repTier.name} · {reputation.score}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Stats Row - Letterboxd Style */}
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-2 sm:gap-x-6 text-center">
                            <button type="button" onClick={() => setActiveTab('films')} className="group text-center">
                                <p className="text-xl sm:text-2xl font-bold text-white group-hover:text-[var(--accent-green)] transition-colors">{watchedCount}</p>
                                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-white/40">Films</p>
                            </button>
                            <div>
                                <p className="text-xl sm:text-2xl font-bold text-white">{watchedThisYear}</p>
                                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-white/40">This Year</p>
                            </div>
                            {watchHours > 0 && (
                                <div>
                                    <p className="text-xl sm:text-2xl font-bold text-white">{watchHours}</p>
                                    <p className="text-[10px] sm:text-xs uppercase tracking-wider text-white/40">Hours</p>
                                </div>
                            )}
                            <button type="button" onClick={() => setActiveTab('lists')} className="group text-center">
                                <p className="text-xl sm:text-2xl font-bold text-white group-hover:text-[var(--accent-green)] transition-colors">{collectionsCount}</p>
                                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-white/40">Lists</p>
                            </button>
                            <button type="button" onClick={() => setFollowModal('following')} className="group text-center">
                                <p className="text-xl sm:text-2xl font-bold text-white group-hover:text-[var(--accent-green)] transition-colors">{following.length}</p>
                                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-white/40">Following</p>
                            </button>
                            <button type="button" onClick={() => setFollowModal('followers')} className="group text-center">
                                <p className="text-xl sm:text-2xl font-bold text-white group-hover:text-[var(--accent-green)] transition-colors">{followers.length}</p>
                                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-white/40">Followers</p>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ============================================ */}
            {/* TAB NAVIGATION */}
            {/* ============================================ */}
            <div className="bg-[#14181c] border-b border-white/5 sticky top-[72px] z-30">
                <div className="max-w-6xl mx-auto px-4">
                    <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide -mb-px">
                        {PROFILE_TABS.map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${isActive
                                        ? 'border-[var(--accent-green)] text-white'
                                        : 'border-transparent text-white/50 hover:text-white hover:border-white/20'
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {/* ============================================ */}
            {/* MAIN CONTENT AREA */}
            {/* ============================================ */}
            <div className="max-w-6xl mx-auto px-4 py-8">
                {(!accessAllowed && !isOwnProfile) ? (
                    <div className="py-20 text-center">
                        <span className="text-5xl block mb-4">🔒</span>
                        <h2 className="text-xl font-bold text-white mb-1">This profile is private</h2>
                        <p className="text-sm text-white/50">
                            {displayProfile?.profile_visibility === 'followers'
                                ? `Follow @${profileUsername} to see their profile.`
                                : `@${profileUsername} keeps their profile private.`}
                        </p>
                    </div>
                ) : isEditing ? (
                    /* Edit Form - 2 Column Layout */
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                        {/* LEFT: Profile Info */}
                        <div className="bg-[#1a1d1f] rounded-xl p-6 border border-white/5">
                            <h2 className="text-lg font-semibold text-white mb-6">Edit Profile</h2>

                            <div className="space-y-5">
                                {/* Banner upload */}
                                <div>
                                    <label className="text-xs text-white/50 uppercase tracking-wide mb-2 block">Banner</label>
                                    <div
                                        onClick={() => bannerFileRef.current?.click()}
                                        className="relative h-28 rounded-lg overflow-hidden border border-white/10 bg-gradient-to-br from-[#14181c] to-[#0f1214] cursor-pointer group"
                                    >
                                        {editBannerUrl && <img src={editBannerUrl} alt="" className="w-full h-full object-cover" />}
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="flex items-center gap-2 text-sm text-white"><FaCamera /> {uploadingBanner ? 'Uploading…' : 'Change banner'}</span>
                                        </div>
                                        {editBannerUrl && (
                                            <button type="button" onClick={(e) => { e.stopPropagation(); setEditBannerUrl(null); }} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                                                <FaTimes className="text-[10px]" />
                                            </button>
                                        )}
                                    </div>
                                    <input ref={bannerFileRef} type="file" accept="image/*" onChange={handleBannerFile} className="hidden" />
                                </div>

                                {/* Avatar photo upload */}
                                <div>
                                    <label className="text-xs text-white/50 uppercase tracking-wide mb-2 block">Profile Photo</label>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => avatarFileRef.current?.click()}
                                            className="relative w-16 h-16 rounded-full overflow-hidden border border-white/10 bg-[#14181c] shrink-0 group"
                                        >
                                            {editAvatarUrl ? (
                                                <img src={editAvatarUrl} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className={`w-full h-full bg-gradient-to-br ${getCurrentAvatar().bg} flex items-center justify-center text-2xl`}>{getCurrentAvatar().emoji}</div>
                                            )}
                                            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white"><FaCamera /></span>
                                        </button>
                                        <div className="text-xs text-white/50">
                                            {uploadingAvatar ? 'Uploading…' : 'Upload a photo'}
                                            {editAvatarUrl && (
                                                <button type="button" onClick={() => setEditAvatarUrl(null)} className="block mt-1 text-white/40 hover:text-white underline">Use an emoji avatar instead</button>
                                            )}
                                        </div>
                                    </div>
                                    <input ref={avatarFileRef} type="file" accept="image/*" onChange={handleAvatarFile} className="hidden" />
                                </div>

                                {/* Display Name */}
                                <div>
                                    <label className="text-xs text-white/50 uppercase tracking-wide mb-2 block">Display Name</label>
                                    <input
                                        type="text"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        placeholder="Your display name"
                                        className="w-full bg-[#14181c] border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[var(--accent-green)]/50"
                                    />
                                </div>

                                {/* Bio */}
                                <div>
                                    <label className="text-xs text-white/50 uppercase tracking-wide mb-2 block">Bio</label>
                                    <textarea
                                        value={bio}
                                        onChange={(e) => setBio(e.target.value)}
                                        placeholder="Tell the community about your taste…"
                                        rows={3}
                                        maxLength={280}
                                        className="w-full bg-[#14181c] border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[var(--accent-green)]/50 resize-none"
                                    />
                                    <p className="text-xs text-white/30 mt-1 text-right">{bio.length}/280</p>
                                </div>

                                {/* Avatar Selection */}
                                <div>
                                    <label className="text-xs text-white/50 uppercase tracking-wide mb-3 block">Choose Avatar</label>
                                    <div className="grid grid-cols-6 gap-2 sm:gap-3">
                                        {Object.entries(AVATARS).map(([id, avatar]) => (
                                            <button
                                                key={id}
                                                onClick={() => setSelectedAvatar(id)}
                                                className={`w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br ${avatar.bg} flex items-center justify-center text-lg sm:text-2xl transition-all ${selectedAvatar === id
                                                    ? 'ring-2 ring-[var(--accent-green)] ring-offset-2 ring-offset-[#1a1d1f] scale-110'
                                                    : 'hover:scale-105 opacity-60 hover:opacity-100'
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
                                        onClick={() => {
                                            setIsEditing(false);
                                            setMovieSearchQuery('');
                                            setMovieSearchResults([]);
                                        }}
                                        className="flex-1 py-3 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="flex-1 py-3 rounded-lg bg-[var(--accent-green)] text-[#14181c] font-semibold hover:bg-[#00e054] disabled:opacity-50 transition-colors"
                                    >
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: Favorites */}
                        <div className="space-y-6">
                        <div className="bg-[#1a1d1f] rounded-xl p-6 border border-white/5">
                            <h3 className="text-sm font-semibold text-white mb-4">
                                Favorite Films ({editFavoriteFilms.length}/4)
                            </h3>
                            
                            {/* Selected favorites grid */}
                            <div className="grid grid-cols-4 gap-2 mb-4">
                                {[0, 1, 2, 3].map((idx) => {
                                    const film = editFavoriteFilms[idx];
                                    return film ? (
                                        <div key={idx} className="relative group">
                                            <div className="aspect-[2/3] rounded overflow-hidden bg-white/5 border border-[var(--accent-green)]/50">
                                                {film.poster_path ? (
                                                    <img
                                                        src={`https://image.tmdb.org/t/p/w154${film.poster_path}`}
                                                        alt={film.title}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">🎬</div>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setEditFavoriteFilms(prev => prev.filter((_, i) => i !== idx))}
                                                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center shadow-md transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                                            >
                                                <FaTimes className="text-[10px]" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div key={idx} className="aspect-[2/3] rounded border-2 border-dashed border-white/10 flex items-center justify-center">
                                            <span className="text-white/20 text-lg">+</span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Search input */}
                            {editFavoriteFilms.length < 4 && (
                                <div className="relative">
                                    <div className="relative">
                                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm" />
                                        <input
                                            type="text"
                                            value={movieSearchQuery}
                                            onChange={(e) => handleMovieSearch(e.target.value)}
                                            placeholder="Search movies..."
                                            className="w-full bg-[#14181c] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[var(--accent-green)]/50"
                                        />
                                        {searchingMovies && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Search results dropdown */}
                                    {movieSearchResults.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1d1f] border border-white/10 rounded-lg shadow-xl z-10 max-h-64 overflow-y-auto">
                                            {movieSearchResults.map((movie) => (
                                                <button
                                                    key={movie.tmdb_id}
                                                    type="button"
                                                    onClick={() => addFavoriteFromSearch(movie)}
                                                    disabled={editFavoriteFilms.some(f => f.movie_id === movie.tmdb_id)}
                                                    className="flex items-center gap-3 w-full p-2.5 hover:bg-white/5 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    <div className="w-10 h-14 rounded overflow-hidden bg-white/5 shrink-0">
                                                        {movie.poster_path ? (
                                                            <img
                                                                src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                                                                alt={movie.title}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">🎬</div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-white truncate">{movie.title}</p>
                                                        {movie.release_date && (
                                                            <p className="text-xs text-white/40">{new Date(movie.release_date).getFullYear()}</p>
                                                        )}
                                                    </div>
                                                    {editFavoriteFilms.some(f => f.movie_id === movie.tmdb_id) && (
                                                        <span className="text-xs text-[var(--accent-green)]">Added</span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {editFavoriteFilms.length >= 4 && (
                                <p className="text-xs text-white/40 text-center">Remove a film to add another</p>
                            )}
                        </div>

                        {/* Favorite Shows */}
                        <div className="bg-[#1a1d1f] rounded-xl p-6 border border-white/5">
                            <h3 className="text-sm font-semibold text-white mb-4">Favorite Shows ({editFavoriteShows.length}/4)</h3>
                            <div className="grid grid-cols-4 gap-2 mb-4">
                                {[0, 1, 2, 3].map((idx) => {
                                    const show = editFavoriteShows[idx];
                                    return show ? (
                                        <div key={idx} className="relative group">
                                            <div className="aspect-[2/3] rounded overflow-hidden bg-white/5 border border-[var(--accent-green)]/50">
                                                {show.poster_path ? <img src={`https://image.tmdb.org/t/p/w154${show.poster_path}`} alt={show.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/20">📺</div>}
                                            </div>
                                            <button type="button" onClick={() => setEditFavoriteShows((p) => p.filter((_, i) => i !== idx))} className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md sm:opacity-0 sm:group-hover:opacity-100"><FaTimes className="text-[10px]" /></button>
                                        </div>
                                    ) : (
                                        <div key={idx} className="aspect-[2/3] rounded border-2 border-dashed border-white/10 flex items-center justify-center"><span className="text-white/20 text-lg">+</span></div>
                                    );
                                })}
                            </div>
                            {editFavoriteShows.length < 4 && (
                                <div className="relative">
                                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm" />
                                    <input type="text" value={showSearchQuery} onChange={(e) => handleShowSearch(e.target.value)} placeholder="Search shows..." className="w-full bg-[#14181c] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[var(--accent-green)]/50" />
                                    {showSearchResults.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1d1f] border border-white/10 rounded-lg shadow-xl z-10 max-h-64 overflow-y-auto">
                                            {showSearchResults.map((show) => (
                                                <button key={show.tmdb_id} type="button" onClick={() => addFavoriteShow(show)} className="flex items-center gap-3 w-full p-2.5 hover:bg-white/5 text-left">
                                                    <div className="w-10 h-14 rounded overflow-hidden bg-white/5 shrink-0">{show.poster_path ? <img src={`https://image.tmdb.org/t/p/w92${show.poster_path}`} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/20">📺</div>}</div>
                                                    <div className="flex-1 min-w-0"><p className="text-sm text-white truncate">{show.title || show.name}</p></div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Favorite Directors */}
                        <div className="bg-[#1a1d1f] rounded-xl p-6 border border-white/5">
                            <h3 className="text-sm font-semibold text-white mb-4">Favorite Directors ({editFavoriteDirectors.length}/6)</h3>
                            {editFavoriteDirectors.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {editFavoriteDirectors.map((d) => (
                                        <div key={d.id} className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full bg-white/5 border border-white/10">
                                            <div className="w-6 h-6 rounded-full overflow-hidden bg-white/10 shrink-0">{d.profile_path ? <img src={`https://image.tmdb.org/t/p/w92${d.profile_path}`} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-white/40">🎬</div>}</div>
                                            <span className="text-xs text-white/80">{d.name}</span>
                                            <button type="button" onClick={() => setEditFavoriteDirectors((p) => p.filter((x) => x.id !== d.id))} className="text-white/30 hover:text-red-400"><FaTimes className="text-[10px]" /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {editFavoriteDirectors.length < 6 && (
                                <div className="relative">
                                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm" />
                                    <input type="text" value={directorSearchQuery} onChange={(e) => handleDirectorSearch(e.target.value)} placeholder="Search directors..." className="w-full bg-[#14181c] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[var(--accent-green)]/50" />
                                    {directorSearchResults.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1d1f] border border-white/10 rounded-lg shadow-xl z-10 max-h-64 overflow-y-auto">
                                            {directorSearchResults.map((person) => (
                                                <button key={person.id} type="button" onClick={() => addFavoriteDirector(person)} className="flex items-center gap-3 w-full p-2.5 hover:bg-white/5 text-left">
                                                    <div className="w-9 h-9 rounded-full overflow-hidden bg-white/5 shrink-0">{person.profile_path ? <img src={`https://image.tmdb.org/t/p/w92${person.profile_path}`} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">🎬</div>}</div>
                                                    <div className="flex-1 min-w-0"><p className="text-sm text-white truncate">{person.name}</p>{person.known_for?.length > 0 && <p className="text-[11px] text-white/40 truncate">{person.known_for.join(', ')}</p>}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        </div>
                    </div>
                ) : activeTab !== 'profile' ? (
                    /* In-page tab content (Activity / Films / Diary / Watchlist / Lists / Blogs) */
                    <div>{renderTabContent()}</div>
                ) : (
                    /* Profile Content */
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
                        {/* LEFT: Main Content */}
                        <div className="space-y-8">
                            {/* Taste Identity & Achievements Row */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Taste Identity Card */}
                                {(() => {
                                    const tasteSummary = generateTasteSummary(tasteProfile, displayProfile);
                                    const tasteText = tasteSummary
                                        || (isOwnProfile
                                            ? 'Building a unique taste profile — rate more films to sharpen picks.'
                                            : null);
                                    if (!tasteText) return null;
                                    return (
                                    <section className="p-5 rounded-xl bg-[#1a1d1f] border border-white/5">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-lg">🎯</span>
                                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-green)]">Taste Identity</h3>
                                        </div>
                                        <p className="text-sm text-white/80 leading-relaxed">
                                            {tasteText}
                                        </p>
                                    </section>
                                    );
                                })()}

                                {/* Achievements Card */}
                                <section className="p-5 rounded-xl bg-[#1a1d1f] border border-white/5">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">🏆</span>
                                            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">
                                                Achievements ({badges.length})
                                            </h3>
                                        </div>
                                        <Link to={`/${profileUsername}/achievements`} className="text-xs text-white/40 hover:text-[var(--primary)] uppercase tracking-wide">
                                            View all
                                        </Link>
                                    </div>
                                    {badges.length > 0 ? (
                                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                            {badges.slice(0, 6).map((b) => (
                                                <div
                                                    key={b.id}
                                                    title={b.description}
                                                    className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/10 text-center hover:border-white/20 transition-colors"
                                                >
                                                    <span className="text-xl">{b.icon}</span>
                                                    <span className="text-[9px] text-white/60 mt-1 line-clamp-1">{b.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-white/40">No badges yet — watch movies to unlock!</p>
                                    )}
                                </section>
                            </div>

                            {/* Recent Posts */}
                            {userPosts.length > 0 && (
                                <section>
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">Recent Posts</h2>
                                        <button type="button" onClick={() => setActiveTab('activity')} className="text-xs text-white/40 hover:text-[var(--accent-green)] uppercase tracking-wide">
                                            All
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        {userPosts.slice(0, 5).map((post) => (
                                            <Link
                                                key={post.id}
                                                to={`/post/${post.id}`}
                                                className="block p-4 rounded-xl bg-[#1a1d1f] border border-white/5 hover:border-white/15 transition-colors"
                                            >
                                                <div className="text-sm text-white/85 leading-relaxed line-clamp-4">
                                                    <MovieMentionText content={post.content} />
                                                </div>
                                                {post.movieTitle && (
                                                    <p className="mt-2 text-xs text-white/40">🎬 {post.movieTitle}</p>
                                                )}
                                                <p className="mt-2 text-[11px] text-white/30">
                                                    {post.time}
                                                    {post.likes > 0 ? ` · ${post.likes} likes` : ''}
                                                </p>
                                            </Link>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Recent Activity */}
                            <section>
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">Recent Activity</h2>
                                    <button type="button" onClick={() => setActiveTab('activity')} className="text-xs text-white/40 hover:text-[var(--accent-green)] uppercase tracking-wide">
                                        All
                                    </button>
                                </div>
                                {recentWatched.length > 0 ? (
                                    <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                                        {recentWatched.slice(0, 8).map((movie) => (
                                            <Link
                                                key={movie.id}
                                                to={`/movies/${generateSlugWithId(movie.movie_title, movie.movie_id)}`}
                                                className="group"
                                                title={movie.movie_title}
                                            >
                                                <div className="aspect-[2/3] rounded overflow-hidden bg-white/5 border border-white/10 group-hover:border-[var(--accent-green)]/50 transition-colors">
                                                    {movie.poster_path ? (
                                                        <img
                                                            src={`https://image.tmdb.org/t/p/w154${movie.poster_path}`}
                                                            alt={movie.movie_title}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                                                            🎬
                                                        </div>
                                                    )}
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-white/40">No recent activity.</p>
                                )}
                            </section>

                            {/* Recent Reviews */}
                            <section>
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-4">Recent Reviews</h2>
                                {socialReviews.length > 0 ? (
                                    <div className="space-y-3">
                                        {socialReviews.map((review) => (
                                            <article key={review.id} className="flex gap-3 p-3 rounded-xl bg-[#1a1d1f] border border-white/5">
                                                <Link
                                                    to={`/movies/${generateSlugWithId(review.movie_title, review.tmdb_id)}`}
                                                    className="w-12 h-[72px] rounded overflow-hidden bg-white/5 shrink-0"
                                                >
                                                    {review.poster_path ? (
                                                        <img src={`https://image.tmdb.org/t/p/w92${review.poster_path}`} alt={review.movie_title} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">🎬</div>
                                                    )}
                                                </Link>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <p className="text-sm font-medium text-white truncate">{review.movie_title}</p>
                                                        {review.rating != null && (
                                                            <span className="flex items-center gap-0.5 text-[11px] text-yellow-400 shrink-0">
                                                                <FaStar className="text-[9px]" />{Number(review.rating).toFixed(1)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {review.title && <p className="text-sm text-white/90 font-medium line-clamp-1">{review.title}</p>}
                                                    <p className="text-xs text-white/50 line-clamp-2 mt-0.5">{review.content}</p>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-white/40">No reviews yet.</p>
                                )}
                            </section>
                        </div>

                        {/* RIGHT: Sidebar */}
                        <div className="space-y-6">
                            {/* Favorite Films */}
                            <section>
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Favorite Films</h3>
                                {favoriteFilms.length > 0 ? (
                                    <div className="grid grid-cols-4 gap-1.5">
                                        {favoriteFilms.slice(0, 4).map((film, idx) => (
                                            <Link
                                                key={film.movie_id || idx}
                                                to={`/movies/${generateSlugWithId(film.title, film.movie_id)}`}
                                                className="group"
                                                title={film.title}
                                            >
                                                <div className="aspect-[2/3] rounded overflow-hidden bg-white/5 border border-white/10 group-hover:border-[var(--accent-green)]/50 transition-colors">
                                                    {film.poster_path ? (
                                                        <img
                                                            src={`https://image.tmdb.org/t/p/w154${film.poster_path}`}
                                                            alt={film.title}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                                                            🎬
                                                        </div>
                                                    )}
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-white/40">No favorite films yet.</p>
                                )}
                            </section>

                            {/* Favorite Shows */}
                            {favoriteShows.length > 0 && (
                                <section>
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Favorite Shows</h3>
                                    <div className="grid grid-cols-4 gap-1.5">
                                        {favoriteShows.slice(0, 4).map((show, idx) => (
                                            <Link key={show.movie_id || idx} to={`/tv/${generateSlugWithId(show.title, show.movie_id)}`} className="group" title={show.title}>
                                                <div className="aspect-[2/3] rounded overflow-hidden bg-white/5 border border-white/10 group-hover:border-[var(--accent-green)]/50 transition-colors">
                                                    {show.poster_path ? (
                                                        <img src={`https://image.tmdb.org/t/p/w154${show.poster_path}`} alt={show.title} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">📺</div>
                                                    )}
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Favorite Directors */}
                            {favoriteDirectors.length > 0 && (
                                <section>
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Favorite Directors</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {favoriteDirectors.map((d) => (
                                            <div key={d.id} className="flex items-center gap-2 pr-3 pl-1 py-1 rounded-full bg-white/5 border border-white/10">
                                                <div className="w-7 h-7 rounded-full overflow-hidden bg-white/10 shrink-0">
                                                    {d.profile_path ? (
                                                        <img src={`https://image.tmdb.org/t/p/w92${d.profile_path}`} alt={d.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-[10px] text-white/40">🎬</div>
                                                    )}
                                                </div>
                                                <span className="text-xs text-white/80">{d.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Favorite Tags — most-used + followed */}
                            {(favoriteTags.length > 0 || followedTags.length > 0) && (
                                <section>
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Favorite Tags</h3>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(favoriteTags.length ? favoriteTags : followedTags).map((tag) => (
                                            <Link
                                                key={tag.id || tag.slug}
                                                to={`/tag/${tag.slug}`}
                                                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/[0.04] border border-white/10 text-orange-300/90 hover:border-orange-500/40 transition-colors"
                                            >
                                                #{tag.display_name}
                                            </Link>
                                        ))}
                                    </div>
                                    {favoriteTags.length > 0 && followedTags.length > 0 && (
                                        <div className="mt-2.5">
                                            <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5">Following</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {followedTags.slice(0, 8).map((tag) => (
                                                    <Link
                                                        key={`f-${tag.id || tag.slug}`}
                                                        to={`/tag/${tag.slug}`}
                                                        className="px-2 py-0.5 rounded-md text-[11px] bg-white/[0.03] border border-white/10 text-white/55 hover:text-orange-300 transition-colors"
                                                    >
                                                        #{tag.display_name}
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </section>
                            )}

                            {/* Bio */}
                            {displayProfile?.bio && (
                                <section>
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Bio</h3>
                                    <p className="text-sm text-white/80 leading-relaxed">{displayProfile.bio}</p>
                                </section>
                            )}

                            {/* Interested In (Watchlist) */}
                            <section>
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Interested In</h3>
                                {watchlistItems.length > 0 ? (
                                    <div className="space-y-2">
                                        {watchlistItems.slice(0, 3).map((item) => (
                                            <Link
                                                key={item.id}
                                                to={`/movies/${generateSlugWithId(item.movie_title, item.movie_id)}`}
                                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group"
                                            >
                                                <div className="w-10 h-14 rounded overflow-hidden bg-white/5 shrink-0">
                                                    {item.poster_path ? (
                                                        <img
                                                            src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                                                            alt={item.movie_title}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">🎬</div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-white truncate group-hover:text-[var(--accent-green)] transition-colors">{item.movie_title}</p>
                                                </div>
                                            </Link>
                                        ))}
                                        {watchlistItems.length > 3 && (
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('watchlist')}
                                                className="block w-full text-xs text-center text-white/40 hover:text-[var(--accent-green)] py-2"
                                            >
                                                View all {watchlistCount} →
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-sm text-white/40">No upcoming content</p>
                                )}
                            </section>

                            {/* Account Info (own profile only) */}
                            {isOwnProfile && (
                                <section className="pt-4 border-t border-white/5">
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-white/40">Member since</span>
                                            <span className="text-white/70">
                                                {displayProfile?.created_at
                                                    ? new Date(displayProfile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                                                    : 'Recently'
                                                }
                                            </span>
                                        </div>
                                    </div>
                                </section>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {followModal && viewedProfile?.id && (
                <FollowListModal
                    userId={viewedProfile.id}
                    mode={followModal}
                    title={followModal === 'followers' ? 'Followers' : 'Following'}
                    onClose={() => setFollowModal(null)}
                />
            )}

            {/* Action toast (copied link, blocked, reported, upload errors) */}
            {actionMsg && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-[#1c1f22] border border-white/10 text-white text-sm shadow-2xl animate-fadeIn">
                    {actionMsg}
                </div>
            )}

            {/* Report modal */}
            {reportOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setReportOpen(false)}>
                    <div className="bg-[#1a1a1a] rounded-2xl max-w-sm w-full border border-white/10 p-5" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white mb-1">Report @{profileUsername}</h3>
                        <p className="text-xs text-white/40 mb-4">Reports are reviewed by moderators.</p>
                        <div className="space-y-2 mb-4">
                            {['Spam', 'Harassment', 'Inappropriate content', 'Impersonation', 'Other'].map((r) => (
                                <button key={r} onClick={() => setReportReason(r)} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${reportReason === r ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)]' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}>
                                    {r}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setReportOpen(false)} className="flex-1 py-2.5 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 text-sm">Cancel</button>
                            <button onClick={handleReport} disabled={!reportReason} className="flex-1 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium disabled:opacity-50">Submit report</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfilePage;
