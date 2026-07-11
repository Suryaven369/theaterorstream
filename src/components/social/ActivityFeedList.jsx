import React from 'react';
import { Link } from 'react-router-dom';
import { FaEye, FaStar, FaTrophy, FaBullseye, FaFilm, FaListUl, FaPencilAlt, FaHeart } from 'react-icons/fa';
import { generateSlugWithId } from '../../lib/slugUtils';

// Mirrors the createSlug helper already duplicated in CollectionsPage.jsx / CollectionDetails.jsx /
// supabase.js — kept local rather than introducing a shared import across already-shipped pages.
function createListSlug(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}

function eventIcon(type) {
    switch (type) {
        case 'log': return FaEye;
        case 'rating': return FaStar;
        case 'badge': return FaTrophy;
        case 'decision_pick': return FaBullseye;
        case 'review': return FaStar;
        case 'list_created': return FaListUl;
        case 'blog_post': return FaPencilAlt;
        case 'like': return FaHeart;
        default: return FaFilm;
    }
}

function eventLabel(item) {
    switch (item.event_type) {
        case 'log': return 'logged';
        case 'rating': return 'rated';
        case 'badge': return 'earned a badge';
        case 'decision_pick': return 'picked tonight';
        case 'review': return 'reviewed';
        case 'list_created': return 'created a list';
        case 'blog_post': return 'wrote a blog';
        case 'like': return 'liked';
        default: return 'activity';
    }
}

function movieLink(item) {
    if (!item.target_tmdb_id || !item.target_movie_title) return null;
    const year = '';
    const slug = generateSlugWithId(item.target_movie_title, item.target_tmdb_id, year);
    return item.media_type === 'tv' ? `/tv/${slug}` : `/movies/${slug}`;
}

export default function ActivityFeedList({ items = [], showUser = false }) {
    if (!items.length) {
        return (
            <div className="text-center py-12 rounded-2xl bg-white/5 border border-white/5">
                <p className="text-white/40">No activity yet</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {items.map((item) => {
                const Icon = eventIcon(item.event_type);
                const url = movieLink(item);
                const username = item.profile?.username;

                return (
                    <div
                        key={item.id}
                        className="flex gap-4 p-4 rounded-xl bg-[#1a1a1a] border border-white/5 hover:border-orange-500/20 transition-colors"
                    >
                        <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 bg-orange-500/10 text-orange-400 border border-orange-500/20">
                            <Icon className="text-lg" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-sm leading-relaxed">
                                {showUser && username && (
                                    <Link to={`/${username}/profile`} className="font-semibold text-yellow-400 hover:underline mr-1">
                                        @{username}
                                    </Link>
                                )}
                                <span className="text-white/50">{eventLabel(item)} </span>
                                {item.event_type === 'badge' ? (
                                    <span className="font-semibold">
                                        {item.payload?.icon} {item.payload?.name}
                                    </span>
                                ) : item.event_type === 'review' ? (
                                    <span className="font-semibold">
                                        {item.payload?.title || item.target_movie_title}
                                    </span>
                                ) : item.event_type === 'list_created' ? (
                                    <Link
                                        to={`/collection/${createListSlug(item.payload?.name)}`}
                                        className="font-semibold hover:text-orange-400"
                                    >
                                        {item.payload?.name}
                                    </Link>
                                ) : item.event_type === 'blog_post' ? (
                                    <Link
                                        to={`/blog/${item.payload?.blog_id}`}
                                        className="font-semibold hover:text-orange-400"
                                    >
                                        {item.payload?.title}
                                    </Link>
                                ) : url ? (
                                    <Link to={url} className="font-semibold hover:text-orange-400">
                                        {item.target_movie_title}
                                    </Link>
                                ) : (
                                    <span className="font-semibold">{item.target_movie_title || 'a title'}</span>
                                )}
                            </p>
                            {item.event_type === 'rating' && item.payload?.overall != null && (
                                <p className="text-xs text-orange-400 mt-1">
                                    TOS avg {Number(item.payload.overall).toFixed(1)}/10
                                </p>
                            )}
                            {item.event_type === 'log' && item.payload?.rating != null && (
                                <p className="text-xs text-white/40 mt-1">
                                    Rated {item.payload.rating}/10
                                </p>
                            )}
                            {item.event_type === 'list_created' && item.payload?.description && (
                                <p className="text-xs text-white/40 mt-1 line-clamp-2">
                                    {item.payload.description}
                                </p>
                            )}
                            {item.event_type === 'blog_post' && item.payload?.excerpt && (
                                <p className="text-xs text-white/40 mt-1 line-clamp-2">
                                    {item.payload.excerpt}
                                </p>
                            )}
                            {(item.watched_in_theater || item.payload?.watched_in_theater) && (
                                <p className="text-xs text-amber-400/90 mt-1">
                                    🍿 Watched in theater
                                </p>
                            )}
                            <p className="text-[10px] text-white/30 mt-2 font-mono">
                                {new Date(item.created_at).toLocaleString()}
                            </p>
                        </div>
                        {item.target_poster_path && url && (
                            <Link to={url} className="shrink-0">
                                <img
                                    src={item.target_poster_path.startsWith('http')
                                        ? item.target_poster_path
                                        : `https://image.tmdb.org/t/p/w92${item.target_poster_path}`}
                                    alt=""
                                    className="w-11 h-16 object-cover rounded-lg border border-white/10"
                                />
                            </Link>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
