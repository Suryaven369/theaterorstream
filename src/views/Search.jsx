import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { IoSearchOutline, IoClose } from "react-icons/io5";
import { FaFolderOpen, FaFilm } from "react-icons/fa";
import Card from "../components/Card";
import { searchProfiles, searchPublicCollections, searchPublicBoards } from "../lib/supabase";
import { searchContentFromEdge, searchPeopleFromEdge } from "../lib/contentEdgeApi";
import {
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} from "../lib/searchHistory";
import { searchHashtags } from "../lib/hashtagApi";

const TABS = [
  { id: "content", label: "Content" },
  { id: "collections", label: "Collections" },
  { id: "boards", label: "Boards" },
  { id: "cast", label: "Cast & Crew" },
  { id: "users", label: "Users" },
  { id: "tags", label: "Hashtags" },
];

const AVATARS = {
  avatar_1: { emoji: "🎬", bg: "from-red-500 to-pink-500" },
  avatar_2: { emoji: "🎭", bg: "from-purple-500 to-indigo-500" },
  avatar_3: { emoji: "🎪", bg: "from-yellow-500 to-orange-500" },
  avatar_4: { emoji: "🌟", bg: "from-amber-400 to-yellow-500" },
  avatar_5: { emoji: "🎯", bg: "from-green-500 to-emerald-500" },
  avatar_6: { emoji: "🦋", bg: "from-pink-400 to-purple-500" },
};

function collectionSlug(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

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
  const slug = collectionSlug(collection.name);
  return (
    <Link
      to={`/collection/${slug}`}
      state={{
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

function BoardRow({ board }) {
  const username = board.owner?.username;
  const href = username ? `/${username}/boards/${board.slug}` : `/boards/${board.slug}`;
  return (
    <Link
      to={href}
      className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
    >
      <div className="w-12 h-12 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 text-lg">
        🎬
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white group-hover:text-amber-300 truncate">{board.title}</p>
        <p className="text-sm text-white/40 truncate">
          {username ? `@${username}` : "Public board"}
          {board.description ? ` · ${board.description}` : ""}
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
  const [boards, setBoards] = useState([]);
  const [castCrew, setCastCrew] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [hashtags, setHashtags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [moviePage, setMoviePage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const canSearch = query.trim().length >= 2 || query.trim().startsWith("#");
  const showRecent = !canSearch;
  const isHashtagQuery = query.trim().startsWith("#") || activeTab === "tags";

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    inputRef.current?.focus();
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

  // Live content / hashtag search as the user types
  useEffect(() => {
    const q = query.trim();
    if (q.startsWith("#") || activeTab === "tags") {
      const tagQ = q.replace(/^#/, "");
      const id = ++reqId.current;
      setLoading(true);
      const timer = setTimeout(async () => {
        try {
          const rows = await searchHashtags(tagQ, { limit: 24 });
          if (id !== reqId.current) return;
          setHashtags(rows);
          setMovieData([]);
        } catch {
          if (id === reqId.current) setHashtags([]);
        } finally {
          if (id === reqId.current) setLoading(false);
        }
      }, 120);
      return () => clearTimeout(timer);
    }

    if (q.length < 2) {
      setMovieData([]);
      setCollections([]);
      setBoards([]);
      setCastCrew([]);
      setProfiles([]);
      setHashtags([]);
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
        setMovieData(contentRes.data || []);
        setHasMore((contentRes.data?.length || 0) >= 30);
        const tagRows = await searchHashtags(q, { limit: 6 });
        if (id === reqId.current) setHashtags(tagRows);
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
    if (q.length < 2 || activeTab === "content" || activeTab === "tags") return undefined;

    let cancelled = false;
    setTabLoading(true);

    const timer = setTimeout(async () => {
      try {
        if (activeTab === "collections") {
          const data = await searchPublicCollections(q, 20);
          if (!cancelled) setCollections(data);
        } else if (activeTab === "boards") {
          const data = await searchPublicBoards(q, 20);
          if (!cancelled) setBoards(data);
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
    if (!canSearch || loading || !hasMore) return;
    setLoading(true);
    const nextPage = moviePage + 1;
    const offset = (nextPage - 1) * 30;
    const result = await searchContentFromEdge(query.trim(), { limit: 30, offset });
    setMovieData((prev) => [...prev, ...(result.data || [])]);
    setHasMore((result.data?.length || 0) >= 30);
    setMoviePage(nextPage);
    setLoading(false);
  };

  const showSpinner =
    ((activeTab === "content" || activeTab === "tags" || isHashtagQuery) && loading && !(isHashtagQuery || activeTab === "tags" ? hashtags.length : movieData.length)) ||
    (activeTab !== "content" && activeTab !== "tags" && tabLoading &&
      ((activeTab === "collections" && !collections.length) ||
        (activeTab === "boards" && !boards.length) ||
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
              placeholder="Search movies, #hashtags, actors…"
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
                <p className="text-sm text-white/30 py-8">
                  Try a movie title, actor, or director — results appear as you type.
                </p>
              )}
            </section>
          )}

          {canSearch && (
            <>
              {showSpinner && (
                <div className="flex justify-center py-20">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              )}

              {(isHashtagQuery || activeTab === "tags") && !showSpinner && (
                <section className="mb-8">
                  <p className="text-xs text-white/35 mb-4 uppercase tracking-wider">
                    Hashtags
                  </p>
                  <div className="space-y-2">
                    {hashtags.map((tag) => (
                      <Link
                        key={tag.id || tag.slug}
                        to={`/tag/${tag.slug}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#1a1a1a] border border-white/[0.08] hover:border-orange-500/40 transition-colors"
                      >
                        <span>
                          <span className="text-orange-400 font-semibold">#{tag.display_name}</span>
                          {tag.category && tag.category !== "general" && (
                            <span className="ml-2 text-[10px] uppercase text-white/30">{tag.category}</span>
                          )}
                        </span>
                        <span className="text-xs text-white/35">
                          {tag.posts_count || 0} posts
                        </span>
                      </Link>
                    ))}
                    {!hashtags.length && (
                      <p className="text-sm text-white/35 py-8">No matching hashtags. Try #SciFi or browse <Link to="/tags" className="text-orange-400">all tags</Link>.</p>
                    )}
                  </div>
                </section>
              )}

              {activeTab === "content" && !isHashtagQuery && !showSpinner && (
                <section>
                  {hashtags.length > 0 && (
                    <div className="mb-6">
                      <p className="text-xs text-white/35 mb-3 uppercase tracking-wider">Related hashtags</p>
                      <div className="flex flex-wrap gap-2">
                        {hashtags.map((tag) => (
                          <Link
                            key={tag.id || tag.slug}
                            to={`/tag/${tag.slug}`}
                            className="px-3 py-1.5 rounded-full text-sm bg-white/5 border border-white/10 text-orange-300 hover:border-orange-500/40"
                          >
                            #{tag.display_name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {movieData.length > 0 ? (
                    <>
                      <p className="text-xs text-white/35 mb-4 uppercase tracking-wider">
                        {movieData.length}+ titles
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

              {activeTab === "boards" && !showSpinner && (
                <section className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] overflow-hidden bg-[#111]/50">
                  {boards.length > 0 ? (
                    boards.map((b) => <BoardRow key={b.id} board={b} />)
                  ) : (
                    <EmptyState icon="🎬" title="No public boards" subtitle="Boards must be public to appear here." />
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
