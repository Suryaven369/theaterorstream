import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaHeart, FaPlay, FaStar, FaPen, FaExternalLinkAlt, FaUserFriends } from 'react-icons/fa';
import { getHomeFeed } from '../../lib/recommendationApi';
import { getRecentPublicCollections, collectionPublicPath } from '../../lib/supabase';
import { generateSlugWithId } from '../../lib/slugUtils';
import { useAuth } from '../../context/AuthContext';
import { CollectionCover } from './ExplorePanels';
import VideoPlay from '../VideoPlay';

const POSTER = 'https://image.tmdb.org/t/p/w342';

// Session cache so switching tabs doesn't reload the page.
let cache = null; // { key, at, data, lists }
const CACHE_MS = 5 * 60 * 1000;

function titlePath(mediaType, title, tmdbId, date) {
    const slug = generateSlugWithId(title || '', tmdbId, String(date || '').slice(0, 4));
    return `${mediaType === 'tv' ? '/tv' : '/movies'}/${slug}`;
}

function timeAgo(iso) {
    if (!iso) return '';
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${Math.max(mins, 1)}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SectionHeader({ title, subtitle, action }) {
    return (
        <div className="mb-3 flex items-end justify-between gap-3 border-b border-white/10 pb-2">
            <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70 sm:text-xs">{title}</h2>
                {subtitle && <p className="mt-0.5 text-[11px] text-white/40">{subtitle}</p>}
            </div>
            {action}
        </div>
    );
}

function Avatar({ user }) {
    if (user?.avatarUrl) {
        return <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover ring-2 ring-[var(--bg-primary)]" loading="lazy" />;
    }
    return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-green)]/80 text-[10px] font-bold uppercase text-[#14181c] ring-2 ring-[var(--bg-primary)]">
            {(user?.name || user?.username || '?').slice(0, 1)}
        </span>
    );
}

/** Letterboxd-style poster with the friend who watched it underneath. */
function FriendFilm({ item }) {
    const to = titlePath(item.mediaType, item.title, item.tmdbId);
    return (
        <div className="w-[96px] shrink-0 snap-start sm:w-auto">
            <Link to={to} className="group block" title={`${item.title} — watched by ${item.user.name}`}>
                <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-white/5 ring-1 ring-white/10 transition group-hover:ring-[var(--accent-green)]">
                    <img src={`${POSTER}${item.posterPath}`} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
                </div>
            </Link>
            <div className="mt-1.5 flex items-center gap-1.5">
                {item.user.username ? (
                    <Link to={`/${item.user.username}/profile`} className="shrink-0"><Avatar user={item.user} /></Link>
                ) : <Avatar user={item.user} />}
                <div className="flex min-w-0 items-center gap-1 text-[11px] text-white/55">
                    {item.rating != null && (
                        <span className="inline-flex items-center gap-0.5 text-[var(--accent-green)]">
                            <FaStar className="text-[9px]" />{Number(item.rating).toFixed(1).replace(/\.0$/, '')}
                        </span>
                    )}
                    {item.liked && <FaHeart className="text-[10px] text-orange-400" aria-label="Liked" />}
                    {item.reviewed && <FaPen className="text-[9px] text-white/50" aria-label="Reviewed" />}
                    {item.rating == null && !item.liked && !item.reviewed && (
                        <span className="truncate">{timeAgo(item.at)}</span>
                    )}
                </div>
            </div>
        </div>
    );
}

function TrailerCard({ trailer, onPlay }) {
    const [src, setSrc] = useState(trailer.thumbnail);
    return (
        <div className="w-[240px] shrink-0 snap-start sm:w-auto">
            <button
                type="button"
                onClick={() => onPlay(trailer)}
                className="group relative block aspect-video w-full overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10"
                aria-label={`Play ${trailer.title} trailer`}
            >
                {src && (
                    <img
                        src={src}
                        alt=""
                        loading="lazy"
                        onError={() => { if (trailer.thumbnailFallback && src !== trailer.thumbnailFallback) setSrc(trailer.thumbnailFallback); }}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                )}
                <span className="absolute inset-0 bg-black/25 transition group-hover:bg-black/10" />
                <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/30 backdrop-blur-sm transition group-hover:bg-[var(--accent-green)] group-hover:text-[#14181c]">
                    <FaPlay className="ml-0.5 text-sm" />
                </span>
            </button>
            <Link to={titlePath(trailer.mediaType, trailer.title, trailer.tmdbId, trailer.releaseDate)} className="mt-2 block">
                <h3 className="line-clamp-1 text-sm font-semibold text-white hover:text-[var(--accent-green)]">{trailer.title}</h3>
                <p className="line-clamp-1 text-[11px] text-white/40">{timeAgo(trailer.publishedAt)}</p>
            </Link>
        </div>
    );
}

/** A real article card: image, outlet, headline, the source's own brief, link out. */
function NewsCard({ article }) {
    return (
        <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] transition hover:border-white/25 active:bg-white/[0.05] sm:flex-col"
        >
            {/* Phones: thumbnail row like a news app. Larger screens: card. */}
            <div className="w-28 shrink-0 overflow-hidden bg-white/5 sm:aspect-[16/9] sm:w-full">
                <img src={article.image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-3.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-white/45">
                    {article.sourceLogo && <img src={article.sourceLogo} alt="" className="h-4 w-4 rounded-sm object-cover" loading="lazy" />}
                    <span className="font-semibold text-white/70">{article.source}</span>
                    <span>·</span>
                    <span>{timeAgo(article.publishedAt)}</span>
                </div>
                <h3 className="line-clamp-3 text-[14px] font-semibold leading-snug text-white group-hover:text-[var(--accent-green)] sm:line-clamp-2 sm:text-[15px]">
                    {article.title}
                </h3>
                <p className="mt-1.5 hidden text-[13px] leading-relaxed text-white/55 sm:line-clamp-3">{article.brief}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[12px] font-medium text-[var(--accent-green)] sm:pt-3">
                    Read on {article.source} <FaExternalLinkAlt className="text-[10px]" />
                </span>
            </div>
        </a>
    );
}

function ListCard({ list, imageURL }) {
    return (
        <Link
            to={collectionPublicPath(list, list.owner?.username)}
            state={{ ownerUsername: list.owner?.username || undefined }}
            className="group block"
        >
            <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-[#0e0e0e] ring-1 ring-white/10 transition group-hover:ring-[var(--accent-green)]">
                <CollectionCover collection={list} imageURL={imageURL} />
            </div>
            <h3 className="mt-2 line-clamp-1 text-sm font-semibold text-white group-hover:text-[var(--accent-green)]">{list.name}</h3>
            <p className="truncate text-[11px] text-white/40">
                {list.owner?.username ? `@${list.owner.username}` : 'Public list'} · {list.movie_count ?? list.collection_movies?.length ?? 0} films
            </p>
        </Link>
    );
}

const Row = ({ children, desktopCols }) => (
    // Swipe row on mobile; fixed grid on desktop (no endless scrolling).
    <div className={`-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1 scrollbar-hide sm:mx-0 sm:grid sm:overflow-visible sm:px-0 ${desktopCols}`}>
        {children}
    </div>
);

const Skeleton = ({ className, count }) => (
    <>{Array.from({ length: count }).map((_, i) => <div key={i} className={`shrink-0 animate-pulse rounded-lg bg-white/5 ${className}`} />)}</>
);

/**
 * Feed tab — a short Letterboxd-style home:
 * New from friends → New trailers → Latest news (3) → Latest lists (6).
 */
export default function HomeFeed() {
    const { user, isAuthenticated } = useAuth();
    const imageURL = useSelector((s) => s.movieData.imageURL);
    const key = user?.id || 'guest';
    const fresh = cache && cache.key === key && Date.now() - cache.at < CACHE_MS ? cache : null;

    const [data, setData] = useState(fresh?.data || null);
    const [lists, setLists] = useState(fresh?.lists || null);
    const [playing, setPlaying] = useState(null);

    useEffect(() => {
        if (fresh) return undefined;
        let alive = true;
        Promise.all([
            getHomeFeed(),
            getRecentPublicCollections(6).catch(() => []),
        ]).then(([feed, recentLists]) => {
            const safeLists = (recentLists || []).slice(0, 6);
            if (feed.ok) cache = { key, at: Date.now(), data: feed, lists: safeLists };
            if (!alive) return;
            setData(feed);
            setLists(safeLists);
        });
        return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const loading = !data;
    const friends = data?.friends || { mode: 'community', items: [] };
    const friendsTitle = friends.mode === 'friends' ? 'New from friends' : 'Popular with members';

    return (
        <div className="mx-auto max-w-5xl space-y-9 sm:space-y-12">
            {/* 1. New from friends */}
            <section>
                <SectionHeader
                    title={friendsTitle}
                    subtitle={friends.mode === 'friends' ? 'What the people you follow have been watching' : 'Recently watched by the community'}
                />
                <Row desktopCols="sm:grid-cols-6">
                    {loading
                        ? <Skeleton className="aspect-[2/3] w-[96px] sm:w-auto" count={6} />
                        : friends.items.slice(0, 6).map((item) => <FriendFilm key={`${item.tmdbId}-${item.user.username}`} item={item} />)}
                </Row>
                {!loading && !friends.items.length && (
                    <p className="py-6 text-center text-sm text-white/40">Nothing yet — log a film to get things started.</p>
                )}
                {!loading && friends.mode === 'community' && (
                    <p className="mt-3 inline-flex items-center gap-2 text-[12px] text-white/45">
                        <FaUserFriends className="text-white/35" />
                        {isAuthenticated
                            ? 'Follow other members to see what your friends are watching here.'
                            : <><Link to="/auth" className="text-[var(--accent-green)] hover:underline">Sign in</Link> and follow friends to see what they’re watching.</>}
                    </p>
                )}
            </section>

            {/* 2. New trailers */}
            {(loading || data.trailers?.length > 0) && (
                <section>
                    <SectionHeader title="New trailers" subtitle="Fresh picks and the most popular trailers this fortnight" />
                    <Row desktopCols="sm:grid-cols-2 lg:grid-cols-4">
                        {loading
                            ? <Skeleton className="aspect-video w-[240px] sm:w-auto" count={4} />
                            : data.trailers.map((t) => <TrailerCard key={t.youtubeKey} trailer={t} onPlay={setPlaying} />)}
                    </Row>
                </section>
            )}

            {/* 3. Latest news — 3 stories, opens the source */}
            {(loading || data.news?.length > 0) && (
                <section>
                    <SectionHeader title="Latest news" />
                    <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
                        {loading
                            ? <Skeleton className="h-72" count={3} />
                            : data.news.map((a) => <NewsCard key={a.id} article={a} />)}
                    </div>
                </section>
            )}

            {/* 4. Latest public lists */}
            {(lists === null || lists.length > 0) && (
                <section>
                    <SectionHeader
                        title="Latest lists"
                        action={<Link to="/?tab=explore&view=collections" className="text-[11px] font-medium uppercase tracking-wider text-white/45 hover:text-white">More</Link>}
                    />
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                        {lists === null
                            ? <Skeleton className="aspect-[16/10]" count={6} />
                            : lists.map((l) => <ListCard key={l.id} list={l} imageURL={imageURL} />)}
                    </div>
                </section>
            )}

            {playing && (
                <VideoPlay
                    data={{ videos: [{ key: playing.youtubeKey }] }}
                    close={() => setPlaying(null)}
                    media_type={playing.mediaType}
                />
            )}
        </div>
    );
}
