import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SeoHead from '../components/SeoHead';
import Loader from '../components/Loader';
import { getHashtagAnalytics, getHashtagsByCategory } from '../lib/hashtagApi';

const CATEGORIES = [
  { id: 'today', label: 'Trending Today' },
  { id: 'week', label: 'This Week' },
  { id: 'rising', label: 'Rising' },
  { id: 'most_followed', label: 'Most Followed' },
  { id: 'genre', label: 'Genres' },
  { id: 'mood', label: 'Moods' },
  { id: 'director', label: 'Directors' },
  { id: 'actor', label: 'Actors' },
  { id: 'franchise', label: 'Franchises' },
  { id: 'studio', label: 'Studios' },
  { id: 'event', label: 'Events' },
];

function TagChip({ tag, meta }) {
  return (
    <Link
      to={`/tag/${tag.slug}`}
      className="group flex flex-col gap-0.5 rounded-xl border border-white/[0.08] bg-[#121212] px-3.5 py-3 hover:border-orange-500/40 hover:bg-[#161616] transition-colors"
    >
      <span className="text-orange-400 font-semibold text-sm group-hover:text-orange-300">
        #{tag.display_name}
      </span>
      <span className="text-[11px] text-white/40">
        {meta || `${tag.posts_count || 0} posts · ${tag.followers_count || 0} followers`}
      </span>
    </Link>
  );
}

function chipMeta(tag, category) {
  if (category === 'today' && tag.window_posts != null) {
    return `${tag.window_posts} today · ${tag.followers_count || 0} followers`;
  }
  if (category === 'rising' && tag.weekly_growth != null) {
    return `+${tag.weekly_growth} this week`;
  }
  if (category === 'most_followed') {
    return `${tag.followers_count || 0} followers · ${tag.posts_count || 0} posts`;
  }
  return null;
}

export default function TagsDiscoverPage() {
  const [category, setCategory] = useState('today');
  const [analytics, setAnalytics] = useState(null);
  const [categoryTags, setCategoryTags] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const bundle = await getHashtagAnalytics(16);
      if (!cancelled) {
        setAnalytics(bundle);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const analyticsKeys = ['today', 'week', 'rising', 'most_followed'];
    if (analyticsKeys.includes(category)) {
      setCategoryTags([]);
      if (analytics) setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const rows = await getHashtagsByCategory(category, { limit: 48 });
      if (!cancelled) {
        setCategoryTags(rows);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [category, analytics]);

  const analyticsKeys = ['today', 'week', 'rising', 'most_followed'];
  const tags = analyticsKeys.includes(category)
    ? (analytics?.[category] || [])
    : categoryTags;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-20 sm:pt-24 pb-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <SeoHead
          title="Hashtags | TheaterOrStream"
          description="Trending, rising, and most-followed cinema hashtags."
        />

        <header className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Hashtags</h1>
          <p className="mt-1.5 text-white/50 text-sm max-w-xl">
            Discover what’s buzzing — follow tags to personalize your Home feed.
          </p>
        </header>

        <div className="flex gap-2 overflow-x-auto pb-3 mb-5 scrollbar-thin">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === c.id
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading && !tags.length ? (
          <div className="py-16 flex justify-center"><Loader /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {tags.map((tag) => (
              <TagChip
                key={tag.id || tag.slug}
                tag={tag}
                meta={chipMeta(tag, category)}
              />
            ))}
            {!tags.length && (
              <p className="text-white/40 col-span-full text-sm">
                Nothing here yet — post with #tags or follow some to grow the charts.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
