import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FaFolderOpen } from 'react-icons/fa';
import { getRecentPublicCollections, getCollectionBySlug, collectionPublicPath } from '../../lib/supabase';
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

export function CollectionCover({ collection, imageURL }) {
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
    const owner = c.owner?.username || null;
    if (!slug) return;
    prefetchCollectionPage(
      slug,
      user?.id || null,
      () => getCollectionBySlug(slug, user?.id || null, { ownerUsername: owner }),
      owner,
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
              to={collectionPublicPath(c, c.owner?.username)}
              state={{
                ownerUsername: c.owner?.username || undefined,
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
