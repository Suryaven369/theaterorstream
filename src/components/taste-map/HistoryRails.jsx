import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { generateSlugWithId } from '../../lib/slugUtils';
import { posterUrl } from '../../lib/tasteMapHelpers';

const TABS = [
    { id: 'liked', label: 'Liked' },
    { id: 'rated', label: 'Rated' },
    { id: 'watched', label: 'Watched' },
    { id: 'disliked', label: 'Disliked' },
];

function PosterRail({ items, emptyLabel }) {
    if (!items?.length) {
        return <p className="py-5 text-[13px] text-white/40 sm:py-6 sm:text-sm">{emptyLabel}</p>;
    }

    return (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 scrollbar-hide sm:mx-0 sm:gap-2.5 sm:px-0">
            {items.slice(0, 24).map((m) => {
                const id = m.movie_id || m.tmdb_id;
                const title = m.movie_title || m.title || 'Movie';
                const img = posterUrl(m.poster_path, 'w154');
                const to = id ? `/movies/${generateSlugWithId(title, id)}` : '#';
                const rating = m._avgRating;
                return (
                    <Link
                        key={`${id}-${title}`}
                        to={to}
                        className="w-[64px] shrink-0 group sm:w-[84px]"
                        title={title}
                    >
                        <div className="aspect-[2/3] overflow-hidden rounded-md bg-white/5 ring-1 ring-white/10 sm:rounded-lg">
                            {img ? (
                                <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                                <div className="flex h-full items-center justify-center text-[10px] text-white/30">No art</div>
                            )}
                        </div>
                        <p className="mt-1 truncate text-[10px] text-white/70 group-hover:text-white sm:text-[11px]">{title}</p>
                        {rating != null && (
                            <p className="text-[10px] text-amber-400/90">★ {rating.toFixed(1)}</p>
                        )}
                    </Link>
                );
            })}
        </div>
    );
}

export default function HistoryRails({ liked = [], rated = [], watched = [], disliked = [] }) {
    const [tab, setTab] = useState('liked');

    const map = { liked, rated, watched, disliked };

    const empty = {
        liked: 'No liked movies yet — heart titles while browsing.',
        rated: 'No ratings yet — rate a few films to sharpen your map.',
        watched: 'No watched films logged yet.',
        disliked: 'No explicit dislikes yet.',
    };

    return (
        <section>
            <h2 className="mb-1.5 text-lg font-bold text-white sm:mb-2 sm:text-xl">Your movie history</h2>
            <p className="mb-3 text-[13px] text-white/45 sm:mb-4 sm:text-sm">
                Liked, rated, watched, and disliked — watched alone is not a like.
            </p>
            <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl border border-white/8 bg-white/[0.02] p-1 scrollbar-hide sm:mb-4">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={`min-h-[42px] flex-1 rounded-lg px-2.5 py-2 text-[13px] font-medium whitespace-nowrap transition-colors sm:min-h-[40px] sm:px-3 sm:text-sm ${
                            tab === t.id
                                ? 'bg-white/10 text-white'
                                : 'text-white/50 hover:text-white'
                        }`}
                    >
                        {t.label}
                        <span className="ml-1 text-white/35">{map[t.id]?.length || 0}</span>
                    </button>
                ))}
            </div>
            <PosterRail items={map[tab]} emptyLabel={empty[tab]} />
        </section>
    );
}
