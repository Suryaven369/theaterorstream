import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaFolderOpen, FaBookOpen } from 'react-icons/fa';
import { getRecentPublicCollections, exploreBoards, boardPath, itemImageUrl, getCollectionBySlug } from '../../lib/supabase';
import { getRecentPublicBlogs } from '../../lib/blogs';
import { useAuth } from '../../context/AuthContext';
import { prefetchCollectionPage } from '../../lib/pageSessionCache';

function collectionSlug(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function posterSrc(_imageURL, path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) {
    return path.replace(/\/t\/p\/(?:w\d+|original)\//, '/t/p/w185/');
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `https://image.tmdb.org/t/p/w185${normalized}`;
}

function CollectionCover({ collection, imageURL }) {
  if (collection.cover_image) {
    return (
      <img
        src={collection.cover_image}
        alt=""
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        loading="lazy"
        decoding="async"
      />
    );
  }

  const posters = (collection.collection_movies || [])
    .filter((m) => m.poster_path)
    .slice(0, 4);

  if (posters.length === 0) {
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-black flex items-center justify-center">
        <FaFolderOpen className="text-3xl text-white/25" />
      </div>
    );
  }

  if (posters.length === 1) {
    return (
      <img
        src={posterSrc(imageURL, posters[0].poster_path)}
        alt=""
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <div className="absolute inset-0 grid grid-cols-2 gap-0 bg-black">
      {posters.map((movie, i) => (
        <img
          key={movie.movie_id || i}
          src={posterSrc(imageURL, movie.poster_path)}
          alt=""
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          decoding="async"
        />
      ))}
      {Array.from({ length: Math.max(0, 4 - posters.length) }).map((_, i) => (
        <div key={`empty-${i}`} className="bg-zinc-900" />
      ))}
    </div>
  );
}

function PanelShell({ children, loading, skeleton = 'cards' }) {
  if (loading) {
    if (skeleton === 'blogs') {
      return (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-[4.5rem] rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-2.5 sm:gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="aspect-[16/11] rounded-xl sm:rounded-2xl bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }
  return <div>{children}</div>;
}

const COLLECTION_CATEGORY_TABS = [
  { id: 'all', label: 'All' },
  { id: 'franchise', label: 'Franchise' },
  { id: 'list', label: 'Lists' },
];

export function ExploreCollectionsPanel() {
  const imageURL = useSelector((s) => s.movieData.imageURL);
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRecentPublicCollections(40, { category }).then((data) => {
      if (!cancelled) {
        setRows(data || []);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [category]);

  const prefetchRow = (c) => {
    const slug = c.slug || collectionSlug(c.name);
    if (!slug) return;
    prefetchCollectionPage(slug, user?.id || null, () =>
      getCollectionBySlug(slug, user?.id || null),
    );
  };

  return (
    <PanelShell loading={false}>
      <div className="flex gap-1.5 sm:gap-2 mb-4 sm:mb-5 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {COLLECTION_CATEGORY_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setCategory(t.id)}
            className={`shrink-0 px-3 py-2 sm:py-1.5 rounded-full text-xs transition-colors min-h-[36px] ${
              category === t.id
                ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)] border border-[var(--accent-green)]/35'
                : 'bg-white/5 text-white/50 border border-white/10 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-[4/3] rounded-xl sm:rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-white/40 py-12 text-center">
          {category === 'franchise'
            ? 'No approved franchise collections yet.'
            : category === 'list'
              ? 'No community lists yet.'
              : 'No public collections yet.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4">
          {rows.map((c) => (
            <Link
              key={c.id}
              to={`/collection/${c.slug || collectionSlug(c.name)}`}
              state={{
                from: {
                  path: '/?tab=explore&view=collections',
                  label: 'Collections',
                  crumbs: [
                    { path: '/?tab=explore', label: 'Explore' },
                    { path: '/?tab=explore&view=collections', label: 'Collections' },
                  ],
                },
              }}
              onMouseEnter={() => prefetchRow(c)}
              onFocus={() => prefetchRow(c)}
              className="group relative block overflow-hidden rounded-xl sm:rounded-2xl bg-[#0e0e0e] transition-all"
            >
              <div className="relative aspect-[4/3] sm:aspect-[16/11] overflow-hidden">
                <CollectionCover collection={c} imageURL={imageURL} />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                {c.category === 'franchise' && (
                  <span className="absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/90 text-black">
                    Franchise
                  </span>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-3.5">
                  <h3 className="text-sm sm:text-base font-semibold text-white line-clamp-2 group-hover:text-[var(--primary)] transition-colors">
                    {c.name}
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-white/50 mt-0.5 sm:mt-1 truncate">
                    {c.owner?.username ? `@${c.owner.username}` : 'Public list'}
                    {' · '}
                    {c.movie_count ?? c.collection_movies?.length ?? 0} titles
                  </p>
                  {c.description && (
                    <p className="hidden sm:block text-[11px] text-white/35 mt-1 line-clamp-1">{c.description}</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PanelShell>
  );
}

export function ExploreBoardsPanel() {
  const imageURL = useSelector((s) => s.movieData.imageURL);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('trending');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    exploreBoards({ sort, limit: 36 }).then((data) => {
      if (!cancelled) {
        setRows(data || []);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [sort]);

  return (
    <PanelShell loading={false}>
      <div className="flex gap-1.5 sm:gap-2 mb-4 sm:mb-5 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {[
          { id: 'trending', label: 'Trending' },
          { id: 'newest', label: 'Newest' },
          { id: 'updated', label: 'Updated' },
          { id: 'followed', label: 'Most followed' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSort(t.id)}
            className={`shrink-0 px-3 py-2 sm:py-1.5 rounded-full text-xs transition-colors min-h-[36px] ${
              sort === t.id
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-white/5 text-white/50 border border-white/10 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-2.5 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-[16/10] rounded-xl sm:rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-white/40 py-12 text-center">No public boards yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-2.5 sm:gap-4">
          {rows.map((board) => {
            const username = board.user_profiles?.username;
            const href = boardPath(board, username);
            const posters = (board.board_items || []).filter((i) => i.image_path).slice(0, 4);
            return (
              <Link
                key={board.id}
                to={href}
                state={{
                  from: {
                    path: '/?tab=explore&view=boards',
                    label: 'Boards',
                    crumbs: [
                      { path: '/?tab=explore', label: 'Explore' },
                      { path: '/?tab=explore&view=boards', label: 'Boards' },
                    ],
                  },
                }}
                className="group relative block overflow-hidden rounded-xl sm:rounded-2xl border border-white/[0.06] bg-[#0e0e0e] hover:border-amber-500/30 transition-all"
              >
                <div className="relative aspect-[4/3] sm:aspect-[16/10] overflow-hidden">
                  {board.cover_image || board.banner_image ? (
                    <img
                      src={board.cover_image || board.banner_image}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      loading="lazy"
                    />
                  ) : posters.length ? (
                    <div className="absolute inset-0 grid grid-cols-2 gap-px bg-black">
                      {posters.map((item, i) => (
                        <img
                          key={i}
                          src={itemImageUrl(imageURL, item)}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-black" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-3">
                    <h3 className="text-sm sm:text-base font-semibold text-white line-clamp-2 group-hover:text-amber-100">
                      {board.title}
                    </h3>
                    <p className="text-[10px] sm:text-[11px] text-white/45 mt-0.5 truncate">
                      {username ? `@${username}` : 'Board'} · {board.items_count || 0} titles
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PanelShell>
  );
}

export function ExploreBlogsPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getRecentPublicBlogs(30).then((data) => {
      if (!cancelled) {
        setRows(data || []);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <PanelShell loading={loading} skeleton="blogs">
      {rows.length === 0 ? (
        <p className="text-sm text-white/40 py-12 text-center">No public blogs yet.</p>
      ) : (
        <ul className="space-y-2 sm:space-y-2.5">
          {rows.map((b) => (
            <li key={b.id}>
              <Link
                to={`/blog/${b.id}`}
                state={{
                  from: {
                    path: '/?tab=explore&view=blogs',
                    label: 'Blogs',
                    crumbs: [
                      { path: '/?tab=explore', label: 'Explore' },
                      { path: '/?tab=explore&view=blogs', label: 'Blogs' },
                    ],
                  },
                }}
                className="flex gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl border border-white/[0.06] bg-[#141414]/60 hover:border-white/15 transition-colors group min-h-[64px]"
              >
                {b.cover_image ? (
                  <img
                    src={b.cover_image}
                    alt=""
                    className="w-16 h-12 sm:w-20 sm:h-14 rounded-lg object-cover shrink-0 bg-black"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-16 h-12 sm:w-20 sm:h-14 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    <FaBookOpen className="text-white/30 text-sm" />
                  </div>
                )}
                <div className="min-w-0 flex-1 self-center">
                  <p className="text-sm font-semibold text-white group-hover:text-[var(--accent-green)] line-clamp-2">
                    {b.title}
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-white/40 mt-1 truncate">
                    {b.user_profiles?.username ? `@${b.user_profiles.username}` : 'Author'}
                    {b.created_at
                      ? ` · ${new Date(b.created_at).toLocaleDateString()}`
                      : ''}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}
