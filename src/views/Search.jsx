import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { IoSearchOutline, IoClose } from "react-icons/io5";
import { FaFolderOpen, FaFilm } from "react-icons/fa";
import Card from "../components/Card";
import { searchProfiles, searchPublicCollections, collectionPublicPath } from "../lib/supabase";
import {
  searchContentFromEdge,
  searchPeopleFromEdge,
} from "../lib/contentEdgeApi";
import {
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} from "../lib/searchHistory";
import { SEARCH_GENRES, SEARCH_THEMES } from "../constants/searchCategories";
import { fetchPublicBrowseThemes } from "../lib/browseThemes";

const SEARCH_PAGE_SIZE = 30;

const TABS = [
  { id: "content", label: "Content" },
  { id: "collections", label: "Collections" },
  { id: "cast", label: "Cast & Crew" },
  { id: "users", label: "Users" },
];

const AVATARS = {
  avatar_1: { emoji: "🎬", bg: "from-red-500 to-pink-500" },
  avatar_2: { emoji: "🎭", bg: "from-purple-500 to-indigo-500" },
  avatar_3: { emoji: "🎪", bg: "from-yellow-500 to-orange-500" },
  avatar_4: { emoji: "🌟", bg: "from-amber-400 to-yellow-500" },
  avatar_5: { emoji: "🎯", bg: "from-green-500 to-emerald-500" },
  avatar_6: { emoji: "🦋", bg: "from-pink-400 to-purple-500" },
};

function ProfileRow({ profile }) {
  const avatar = AVATARS[profile.avatar_id] || AVATARS.avatar_1;
  return (
    <Link
      to={`/${profile.username}/profile`}
      className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
    >
      <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatar.bg} flex items-center justify-center text-xl shrink-0`}>
        {avatar.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white group-hover:text-[var(--primary)] truncate">
          {profile.display_name || profile.username}
        </p>
        <p className="text-sm text-white/40">@{profile.username}</p>
      </div>
    </Link>
  );
}

function CollectionRow({ collection }) {
  const owner = collection.owner?.username || null;
  return (
    <Link
      to={collectionPublicPath(collection, owner)}
      state={{
        ownerUsername: owner || undefined,
        from: {
          path: '/search',
          label: 'Search',
          crumbs: [{ path: '/search', label: 'Search' }],
        },
      }}
      className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
    >
      <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
        <FaFolderOpen className="text-[var(--primary)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white group-hover:text-[var(--primary)] truncate">{collection.name}</p>
        <p className="text-sm text-white/40 truncate">
          {collection.owner?.username ? `@${collection.owner.username}` : "Public list"}
          {collection.description ? ` · ${collection.description}` : ""}
        </p>
      </div>
    </Link>
  );
}

function CastRow({ person, onSelect }) {
  const photo = person.profile_path
    ? `https://image.tmdb.org/t/p/w92${person.profile_path}`
    : null;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(person.name)}
      className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/[0.04] transition-colors group text-left"
    >
      <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
        {photo ? (
          <img src={photo} alt="" className="w-full h-full object-cover" />
        ) : (
          <FaFilm className="text-white/30" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white group-hover:text-[var(--primary)] truncate">{person.name}</p>
        <p className="text-sm text-white/40 truncate">
          {person.role}
          {person.known_for_movie ? ` · ${person.known_for_movie}` : ""}
          <span className="text-white/25"> · see titles</span>
        </p>
      </div>
    </button>
  );
}

const Search = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const reqId = useRef(0);

  const searchParams = new URLSearchParams(location.search);
  const urlQuery = (searchParams.get("q") || searchParams.get("query") || "").trim();

  const [query, setQuery] = useState(urlQuery);
  const [activeTab, setActiveTab] = useState("content");
  const [recent, setRecent] = useState(() => getRecentSearches());

  const [movieData, setMovieData] = useState([]);
  const [collections, setCollections] = useState([]);
  const [castCrew, setCastCrew] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [moviePage, setMoviePage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [resultTotal, setResultTotal] = useState(0);
  const [browseThemes, setBrowseThemes] = useState(SEARCH_THEMES);

  const canSearch = query.trim().length >= 2;
  const showRecent = !canSearch;

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPublicBrowseThemes().then((themes) => {
      if (!cancelled && themes?.length) setBrowseThemes(themes);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pushQuery = useCallback(
    (value) => {
      setQuery(value);
      const v = value.trim();
      if (v) {
        navigate(`/search?q=${encodeURIComponent(v)}`, { replace: true });
      } else {
        navigate("/search", { replace: true });
      }
    },
    [navigate],
  );

  // Live content search as the user types
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setMovieData([]);
      setCollections([]);
      setCastCrew([]);
      setProfiles([]);
      setLoading(false);
      return undefined;
    }

    const id = ++reqId.current;
    setLoading(true);
    setMoviePage(1);

    const timer = setTimeout(async () => {
      try {
        const contentRes = await searchContentFromEdge(q, { limit: 30 });
        if (id !== reqId.current) return;
        const rows = contentRes.data || [];
        setMovieData(rows);
        setResultTotal(Number(contentRes.total) || rows.length);
        setHasMore(rows.length >= 30);
      } catch (err) {
        console.error("Search failed:", err);
        if (id === reqId.current) setMovieData([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query, activeTab]);

  // Lazy-load secondary tabs only when opened
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || activeTab === "content") return undefined;

    let cancelled = false;
    setTabLoading(true);

    const timer = setTimeout(async () => {
      try {
        if (activeTab === "collections") {
          const data = await searchPublicCollections(q, 20);
          if (!cancelled) setCollections(data);
        } else if (activeTab === "users") {
          const data = await searchProfiles(q, 20);
          if (!cancelled) setProfiles(data);
        } else if (activeTab === "cast") {
          const data = await searchPeopleFromEdge(q, 24);
          if (!cancelled) setCastCrew(data);
        }
      } catch (err) {
        console.error("Tab search failed:", err);
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, activeTab]);

  const handleClose = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    addRecentSearch(q);
    setRecent(getRecentSearches());
  };

  const handleRecentClick = (term) => {
    pushQuery(term);
  };

  const handleRemoveRecent = (e, term) => {
    e.stopPropagation();
    setRecent(removeRecentSearch(term));
  };

  const handleClearHistory = () => {
    setRecent(clearRecentSearches());
  };

  const loadMoreMovies = async () => {
    if (loading || !hasMore || !canSearch) return;
    setLoading(true);
    const nextPage = moviePage + 1;
    const offset = (nextPage - 1) * SEARCH_PAGE_SIZE;
    try {
      const result = await searchContentFromEdge(query.trim(), {
        limit: SEARCH_PAGE_SIZE,
        offset,
      });
      const rows = result.data || [];
      setMovieData((prev) => {
        const merged = [...prev, ...rows];
        const total = Number(result.total) || resultTotal || merged.length;
        setResultTotal(total);
        setHasMore(merged.length < total || rows.length >= SEARCH_PAGE_SIZE);
        return merged;
      });
      setMoviePage(nextPage);
    } finally {
      setLoading(false);
    }
  };

  const showSpinner =
    (activeTab === "content" && loading && !movieData.length) ||
    (activeTab !== "content" && tabLoading &&
      ((activeTab === "collections" && !collections.length) ||
        (activeTab === "cast" && !castCrew.length) ||
        (activeTab === "users" && !profiles.length)));

  return (
    <div className="search-overlay fixed inset-0 z-[100] bg-[#0a0a0a]/[0.97] backdrop-blur-md flex flex-col overflow-hidden">
      <div className="shrink-0 border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-4">
          <div className="flex items-center justify-end mb-4 sm:hidden">
            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-white/60 hover:text-white rounded-lg hover:bg-white/5"
              aria-label="Close search"
            >
              <IoClose className="text-2xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="relative">
            <IoSearchOutline className="absolute left-5 top-1/2 -translate-y-1/2 text-white/35 text-xl pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => pushQuery(e.target.value)}
              placeholder="Search movies, shows, actors…"
              className="search-input-bar w-full bg-[#1a1a1a] border border-white/[0.08] rounded-2xl pl-14 pr-14 py-4 sm:py-5 text-base sm:text-lg text-white placeholder:text-white/35 focus:outline-none focus:border-white/20 transition-colors"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                onClick={() => pushQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 text-white/40 hover:text-white rounded-full hover:bg-white/10"
                aria-label="Clear"
              >
                <IoClose className="text-xl" />
              </button>
            )}
          </form>

          <div className="flex gap-6 sm:gap-8 mt-6 overflow-x-auto scrollbar-none border-b border-transparent">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`search-tab pb-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "search-tab-active text-white"
                    : "text-white/45 hover:text-white/70"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-28">
          {showRecent && (
            <>
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[11px] font-semibold tracking-[0.12em] text-white/40 uppercase">
                    Recent Searches
                  </h2>
                  {recent.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearHistory}
                      className="text-xs text-white/35 hover:text-white/60 transition-colors"
                    >
                      Clear history
                    </button>
                  )}
                </div>
                {recent.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {recent.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => handleRecentClick(term)}
                        className="search-recent-pill group inline-flex items-center gap-2 pl-4 pr-2 py-2 rounded-full bg-[#1a1a1a] border border-white/[0.08] text-sm text-white/80 hover:border-white/15 hover:text-white transition-colors"
                      >
                        <span>{term}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => handleRemoveRecent(e, term)}
                          onKeyDown={(e) => e.key === "Enter" && handleRemoveRecent(e, term)}
                          className="p-1 rounded-full text-white/30 hover:text-white hover:bg-white/10"
                          aria-label={`Remove ${term}`}
                        >
                          <IoClose className="text-sm" />
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-white/30 py-2">
                    Try a movie title, actor, or director — results appear as you type.
                  </p>
                )}
              </section>

              {activeTab === "content" && (
                <section className="mt-10">
                  <h2 className="text-[11px] font-semibold tracking-[0.12em] text-white/40 uppercase mb-4">
                    Categories
                  </h2>

                  <div className="mb-8">
                    <p className="text-xs text-white/35 mb-3">Genres</p>
                    <div className="flex flex-wrap gap-2">
                      {SEARCH_GENRES.map((genre) => (
                        <Link
                          key={genre.id}
                          to={`/browse/genre/${genre.id}`}
                          className="inline-flex items-center px-3.5 py-2 rounded-full bg-[#1a1a1a] border border-white/[0.08] text-sm text-white/80 hover:border-white/20 hover:text-white transition-colors"
                        >
                          {genre.label}
                        </Link>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-white/35 mb-3">Themes & styles</p>
                    <div className="flex flex-wrap gap-2">
                      {browseThemes.map((theme) => (
                        <Link
                          key={theme.id}
                          to={`/browse/theme/${theme.id}`}
                          className="inline-flex items-center px-3.5 py-2 rounded-full bg-[#1a1a1a] border border-white/[0.08] text-sm text-white/80 hover:border-white/20 hover:text-white transition-colors"
                        >
                          {theme.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </>
          )}

          {canSearch && (
            <>
              {showSpinner && (
                <div className="flex justify-center py-20">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              )}

              {activeTab === "content" && !showSpinner && (
                <section>
                  {movieData.length > 0 ? (
                    <>
                      <p className="text-xs text-white/35 mb-4 uppercase tracking-wider">
                        {resultTotal > movieData.length
                          ? `${movieData.length} of ${resultTotal} titles`
                          : `${movieData.length}${hasMore ? "+" : ""} titles`}
                        {loading ? " · updating…" : ""}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {movieData.map((item, index) => (
                          <Card
                            key={`${item.tmdb_id}-${index}`}
                            data={{
                              id: item.tmdb_id || item.id,
                              title: item.title || item.name,
                              poster_path: item.poster_path,
                              backdrop_path: item.backdrop_path,
                              media_type: item.media_type || "movie",
                              vote_average: item.vote_average,
                              release_date: item.release_date || item.first_air_date,
                              overview: item.overview,
                            }}
                            media_type={item.media_type || "movie"}
                            index={index}
                          />
                        ))}
                      </div>
                      {hasMore && (
                        <button
                          type="button"
                          onClick={loadMoreMovies}
                          disabled={loading}
                          className="mt-8 w-full py-3 rounded-xl border border-white/10 text-sm text-white/60 hover:text-white hover:border-white/20 transition-colors"
                        >
                          {loading ? "Loading…" : "Load more"}
                        </button>
                      )}
                    </>
                  ) : !loading ? (
                    <EmptyState
                      icon="📭"
                      title="No titles found"
                      subtitle="Try another spelling, or search an actor / director name."
                    />
                  ) : null}
                </section>
              )}

              {activeTab === "collections" && !showSpinner && (
                <section className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] overflow-hidden bg-[#111]/50">
                  {collections.length > 0 ? (
                    collections.map((c) => <CollectionRow key={c.id} collection={c} />)
                  ) : (
                    <EmptyState icon="📁" title="No public lists" subtitle="Collections must be public to appear here." />
                  )}
                </section>
              )}

              {activeTab === "cast" && !showSpinner && (
                <section className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] overflow-hidden bg-[#111]/50">
                  {castCrew.length > 0 ? (
                    castCrew.map((p) => (
                      <CastRow
                        key={p.id}
                        person={p}
                        onSelect={(name) => {
                          setActiveTab("content");
                          pushQuery(name);
                        }}
                      />
                    ))
                  ) : (
                    <EmptyState
                      icon="🎭"
                      title="No cast or crew found"
                      subtitle="Tip: open Content to see their movies and shows."
                    />
                  )}
                </section>
              )}

              {activeTab === "users" && !showSpinner && (
                <section className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] overflow-hidden bg-[#111]/50">
                  {profiles.length > 0 ? (
                    profiles.map((p) => <ProfileRow key={p.id} profile={p} />)
                  ) : (
                    <EmptyState icon="👤" title="No users found" subtitle="Try a different username." />
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleClose}
        className="hidden sm:flex fixed top-6 right-6 z-[101] items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 text-sm transition-colors"
      >
        <IoClose className="text-lg" />
        Close
      </button>
    </div>
  );
};

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="text-center py-16 px-4">
      <span className="text-4xl mb-4 block opacity-60">{icon}</span>
      <p className="text-white/70 font-medium">{title}</p>
      <p className="text-white/35 text-sm mt-2 max-w-sm mx-auto">{subtitle}</p>
    </div>
  );
}

export default Search;
