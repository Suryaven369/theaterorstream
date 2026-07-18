import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { IoArrowBack, IoCheckmark } from "react-icons/io5";
import Card from "../components/Card";
import SeoHead from "../components/SeoHead";
import { getExploreContentFromEdge } from "../lib/contentEdgeApi";
import {
  BROWSE_SORT_OPTIONS,
  OTT_PROVIDERS,
  SEARCH_THEMES,
  genreLabelById,
} from "../constants/searchCategories";
import { fetchPublicBrowseThemes } from "../lib/browseThemes";

const PAGE_SIZE = 30;

const MEDIA_OPTIONS = [
  { id: "all", label: "All" },
  { id: "movie", label: "Movies" },
  { id: "tv", label: "Series" },
];

const selectClass =
  "appearance-none bg-[#1a1a1a] border border-white/[0.1] text-white/85 text-sm rounded-lg px-3 py-2 pr-8 hover:border-white/20 focus:outline-none focus:border-white/30 cursor-pointer";

function FilterSelect({ value, onChange, children, "aria-label": ariaLabel }) {
  return (
    <div className="relative inline-flex">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        className={selectClass}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/35 text-[10px] leading-none">
        ▲▼
      </span>
    </div>
  );
}

export default function CategoryBrowsePage() {
  const { kind, id } = useParams();
  const navigate = useNavigate();

  const isGenre = kind === "genre";
  const isTheme = kind === "theme";
  const genreId = isGenre ? Number(id) : null;
  const themeId = isTheme ? id : null;

  const [browseThemes, setBrowseThemes] = useState(SEARCH_THEMES);
  const [themesReady, setThemesReady] = useState(!isTheme);

  const [mediaType, setMediaType] = useState("all");
  const [sort, setSort] = useState("popular");
  const [providerId, setProviderId] = useState("");
  const [familyFriendly, setFamilyFriendly] = useState(false);

  const themeMeta = isTheme
    ? browseThemes.find((t) => t.id === themeId) || null
    : null;

  const valid =
    (isGenre && Number.isFinite(genreId) && genreId > 0 && genreLabelById(genreId)) ||
    (isTheme && themesReady && Boolean(themeMeta));

  const title = isGenre
    ? genreLabelById(genreId)
    : themeMeta?.label || null;

  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  const filterKey = useMemo(
    () => `${mediaType}|${sort}|${providerId}|${familyFriendly ? 1 : 0}`,
    [mediaType, sort, providerId, familyFriendly],
  );

  const buildOpts = (offset, type) => ({
    mediaType: type,
    category: "popular",
    browse: true,
    sort,
    providerId: providerId || undefined,
    familyFriendly: familyFriendly || undefined,
    ...(isGenre ? { genreId } : { theme: themeId }),
    limit: PAGE_SIZE,
    offset,
  });

  const fetchBrowse = async (offset = 0) => {
    if (mediaType === "all") {
      const [movies, series] = await Promise.all([
        getExploreContentFromEdge(buildOpts(offset, "movie")),
        getExploreContentFromEdge(buildOpts(offset, "tv")),
      ]);
      const movieRows = movies.data || [];
      const tvRows = series.data || [];
      const merged = [];
      const max = Math.max(movieRows.length, tvRows.length);
      for (let i = 0; i < max; i += 1) {
        if (movieRows[i]) merged.push(movieRows[i]);
        if (tvRows[i]) merged.push(tvRows[i]);
      }
      const rows = merged.slice(0, PAGE_SIZE);
      const totalCount =
        (Number(movies.total) || 0) + (Number(series.total) || 0);
      return { data: rows, total: totalCount || rows.length };
    }
    return getExploreContentFromEdge(buildOpts(offset, mediaType));
  };

  useEffect(() => {
    if (!isTheme) {
      setThemesReady(true);
      return undefined;
    }
    let cancelled = false;
    setThemesReady(false);
    fetchPublicBrowseThemes().then((themes) => {
      if (cancelled) return;
      if (themes?.length) setBrowseThemes(themes);
      setThemesReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isTheme, themeId]);

  useEffect(() => {
    if (!valid) return undefined;

    let cancelled = false;
    setLoading(true);
    setData([]);
    setPage(1);
    setHasMore(true);
    setTotal(0);

    (async () => {
      try {
        const result = await fetchBrowse(0);
        if (cancelled) return;
        const rows = result.data || [];
        const totalCount = Number(result.total) || rows.length;
        setData(rows);
        setTotal(totalCount);
        setHasMore(rows.length > 0 && (totalCount > rows.length || rows.length >= PAGE_SIZE));
      } catch (err) {
        console.error("Category browse failed:", err);
        if (!cancelled) {
          setData([]);
          setTotal(0);
          setHasMore(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchBrowse uses latest filters via filterKey
  }, [kind, id, valid, isGenre, genreId, themeId, filterKey]);

  const loadMore = async () => {
    if (loading || !hasMore || !valid) return;
    setLoading(true);
    const nextPage = page + 1;
    try {
      const result = await fetchBrowse((nextPage - 1) * PAGE_SIZE);
      const rows = result.data || [];
      const totalCount = Number(result.total) || total;
      setData((prev) => {
        const merged = [...prev, ...rows];
        setHasMore(merged.length < totalCount || rows.length >= PAGE_SIZE);
        return merged;
      });
      setTotal(totalCount);
      setPage(nextPage);
    } catch (err) {
      console.error("Category load more failed:", err);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  if (isTheme && !themesReady) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex justify-center items-center pt-20">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] pt-24 px-4 pb-24">
        <div className="max-w-3xl mx-auto text-center py-20">
          <h1 className="text-2xl font-bold text-white mb-3">Category not found</h1>
          <p className="text-white/50 mb-6">That genre or theme doesn’t exist.</p>
          <Link to="/search" className="text-orange-400 hover:underline">
            Back to search
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24">
      <SeoHead
        title={`${title} Movies | TheaterOrStream`}
        description={`Browse ${title} movies and shows on TheaterOrStream.`}
      />

      <section className="relative pt-20 sm:pt-28 pb-4 sm:pb-6 px-3 sm:px-6">
        <div className="container mx-auto">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate("/search");
            }}
            className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white mb-5 transition-colors"
          >
            <IoArrowBack />
            Back
          </button>

          <p className="text-[11px] font-semibold tracking-[0.12em] text-white/40 uppercase mb-2">
            {isGenre ? "Genre" : "Theme"}
          </p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6">
            <span className="text-gradient">{title}</span>
          </h1>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="inline-flex rounded-lg border border-white/[0.08] bg-[#141414] p-0.5">
              {MEDIA_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMediaType(opt.id)}
                  className={`px-3 sm:px-4 py-1.5 rounded-md text-sm transition-colors ${
                    mediaType === opt.id
                      ? "bg-[#2a2a2a] text-white"
                      : "text-white/50 hover:text-white/80"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setFamilyFriendly((v) => !v)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                familyFriendly
                  ? "border-sky-400/60 text-sky-300 bg-sky-400/10"
                  : "border-white/[0.1] text-white/55 hover:border-white/25 hover:text-white/80"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border ${
                  familyFriendly
                    ? "border-sky-400 bg-sky-400 text-black"
                    : "border-white/30"
                }`}
              >
                {familyFriendly ? <IoCheckmark className="text-xs" /> : null}
              </span>
              Family Friendly
            </button>

            <FilterSelect
              aria-label="Sort by"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              {BROWSE_SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              aria-label="OTT channel"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
            >
              <option value="">OTT Channel</option>
              {OTT_PROVIDERS.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </FilterSelect>
          </div>
        </div>
      </section>

      <section className="px-3 sm:px-6 py-6 sm:py-8 border-t border-white/[0.06]">
        <div className="container mx-auto">
          <p className="text-xs text-white/35 mb-5 uppercase tracking-wider">
            {loading && !data.length
              ? "Loading…"
              : total > data.length
                ? `${data.length} of ${total} titles`
                : `${data.length}${hasMore ? "+" : ""} titles`}
          </p>

          {loading && !data.length && (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {data.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-4 md:gap-6">
              {data.map((item, index) => (
                <Card
                  key={`${item.media_type || "movie"}-${item.tmdb_id || item.id}-${index}`}
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
          )}

          {!loading && !data.length && (
            <div className="text-center py-20">
              <h3 className="text-xl font-bold text-white mb-2">No {title} titles found</h3>
              <p className="text-white/45 mb-4">Try different filters or another category from Search.</p>
              <Link to="/search" className="text-orange-400 hover:underline text-sm">
                Back to search
              </Link>
            </div>
          )}

          {hasMore && data.length > 0 && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="mt-10 w-full max-w-md mx-auto block py-3 rounded-xl border border-white/10 text-sm text-white/60 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50"
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
