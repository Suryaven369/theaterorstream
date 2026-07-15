import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import SeoHead from '../components/SeoHead';
import { getMoviesByParentGuide } from '../lib/supabase';
import {
  PARENT_GUIDE_CATEGORIES,
  normalizeParentGuideLevel,
  parentGuideBrowsePath,
  parentGuideCategoryFromSlug,
} from '../lib/parentGuide';

const LEVEL_FILTERS = [
  { id: 'all', label: 'All levels' },
  { id: 'mild', label: 'Mild' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'severe', label: 'Severe' },
];

const PAGE_SIZE = 48;

export default function ParentGuideBrowsePage() {
  const { category: categorySlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const levelParam = normalizeParentGuideLevel(searchParams.get('level'));
  const level = levelParam && levelParam !== 'none' ? levelParam : null;

  const category = useMemo(
    () => parentGuideCategoryFromSlug(categorySlug),
    [categorySlug],
  );

  const [movies, setMovies] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [category?.key, level]);

  useEffect(() => {
    if (!category) {
      setMovies([]);
      setTotal(0);
      setLoading(false);
      return undefined;
    }

    let alive = true;
    setLoading(true);
    getMoviesByParentGuide(category.key, {
      level,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    })
      .then((res) => {
        if (!alive) return;
        setMovies(res.data || []);
        setTotal(res.total || 0);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [category, level, page]);

  const setLevelFilter = (next) => {
    const params = new URLSearchParams(searchParams);
    if (!next || next === 'all') params.delete('level');
    else params.set('level', next);
    setSearchParams(params, { replace: true });
  };

  if (!category) {
    const isHub = !categorySlug;
    return (
      <div className="min-h-screen bg-[#0a0a0a] pt-24 px-4 pb-24">
        <div className="max-w-5xl mx-auto py-10">
          <SeoHead
            title="Parent Guide | TheaterOrStream"
            description="Browse titles by violence, sex/nudity, profanity, and frightening content levels."
          />
          <h1 className="text-2xl font-bold text-white mb-2">Parent Guide</h1>
          <p className="text-sm text-white/50 mb-8">
            {isHub
              ? 'Pick a content advisory to see matching titles in the library.'
              : 'Unknown category. Choose one below.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.values(PARENT_GUIDE_CATEGORIES).map((c) => (
              <Link
                key={c.key}
                to={parentGuideBrowsePath(c.key)}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 hover:border-white/20 hover:bg-white/[0.06] transition-colors"
              >
                <p className="text-base font-semibold text-white">{c.label}</p>
                <p className="text-xs text-white/45 mt-1">{c.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const hasMore = page * PAGE_SIZE < total;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-20 sm:pt-24 pb-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <SeoHead
          title={`${category.label}${level ? ` · ${level}` : ''} | Parent Guide | TheaterOrStream`}
          description={category.description}
        />

        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">Parent Guide</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{category.label}</h1>
          <p className="text-sm text-white/50 mt-1">
            {category.description}
            {total > 0 ? ` · ${total} title${total === 1 ? '' : 's'}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {Object.values(PARENT_GUIDE_CATEGORIES).map((c) => {
            const active = c.key === category.key;
            return (
              <Link
                key={c.key}
                to={parentGuideBrowsePath(c.key, level)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-[var(--color-theater)] text-[#14181c]'
                    : 'bg-white/5 text-white/60 hover:text-white border border-white/10'
                }`}
              >
                {c.label}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {LEVEL_FILTERS.map((f) => {
            const active = f.id === 'all' ? !level : level === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setLevelFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? 'bg-white/15 text-white'
                    : 'text-white/45 hover:text-white/70'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : movies.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-white/10 bg-white/[0.02]">
            <p className="text-white/50 text-sm">
              No titles with {category.label.toLowerCase()}
              {level ? ` · ${level}` : ''} in the library yet.
            </p>
            <p className="text-white/30 text-xs mt-2">
              Parent guide levels come from admin edits or content analysis.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
              {movies.map((movie) => (
                <Card
                  key={`${movie.media_type}-${movie.tmdb_id}`}
                  data={movie}
                  media_type={movie.media_type}
                />
              ))}
            </div>

            {(hasMore || page > 1) && (
              <div className="flex justify-center gap-3 mt-10">
                {page > 1 && (
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70 hover:text-white"
                  >
                    Previous
                  </button>
                )}
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70 hover:text-white"
                  >
                    Load more
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
