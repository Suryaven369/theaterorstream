import React, { useEffect, useState } from 'react';
import { searchHashtags } from '../lib/hashtagApi';

/**
 * Autocomplete dropdown when typing # in MentionEditor.
 */
export default function HashtagPicker({ query, onSelect, onClose }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const rows = await searchHashtags(query || '', { limit: 8 });
      if (!cancelled) {
        setResults(rows);
        setLoading(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const canCreate = query && /^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(query);
  const createSlug = (query || '').replace(/[^a-zA-Z0-9_]/g, '');

  return (
    <div
      onMouseDown={(e) => e.preventDefault()}
      className="absolute left-0 right-0 bottom-full mb-2 z-50 rounded-xl border border-white/10 bg-[#14181c] shadow-2xl overflow-hidden max-h-64 overflow-y-auto"
    >
      <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-white/40 border-b border-white/5">
        Hashtags
      </div>
      {loading && (
        <p className="px-3 py-3 text-sm text-white/40">Searching…</p>
      )}
      {!loading && results.map((tag) => (
        <button
          key={tag.id || tag.slug}
          type="button"
          onClick={() => onSelect(tag)}
          className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
        >
          <span className="min-w-0">
            <span className="text-orange-400 font-medium">#{tag.display_name}</span>
            {tag.category && tag.category !== 'general' && (
              <span className="ml-2 text-[10px] uppercase text-white/30">{tag.category}</span>
            )}
          </span>
          <span className="text-xs text-white/35 shrink-0">
            {tag.posts_count || 0} posts
          </span>
        </button>
      ))}
      {!loading && canCreate && !results.some((r) => r.slug === createSlug.toLowerCase()) && (
        <button
          type="button"
          onClick={() => onSelect({ slug: createSlug.toLowerCase(), display_name: query, category: 'general' })}
          className="w-full px-3 py-2.5 text-left hover:bg-white/5 border-t border-white/5 text-sm"
        >
          Create <span className="text-orange-400 font-medium">#{query}</span>
        </button>
      )}
      {!loading && !results.length && !canCreate && (
        <p className="px-3 py-3 text-sm text-white/40">Type to find or create a tag</p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="w-full px-3 py-2 text-xs text-white/40 hover:text-white/70 border-t border-white/5"
      >
        Close
      </button>
    </div>
  );
}
