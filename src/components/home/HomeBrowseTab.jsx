import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../Card';
import HomeRegionPicker from './HomeRegionPicker';
import HomeComingSoonSidebar from './HomeComingSoonSidebar';
import HomeExploreBrowseSidebar from './HomeExploreBrowseSidebar';
import {
  ExploreCollectionsPanel,
  ExploreBoardsPanel,
  ExploreBlogsPanel,
} from './ExplorePanels';

const FALLBACK_REGION_ORDER = ['IN', 'US', 'GB', 'CA', 'AU'];
const VALID_PANELS = new Set(['feed', 'collections', 'boards', 'blogs']);

/** Classify a CMS row for My Feed filtering. */
function browseSectionKind(section) {
  const blob = `${section.slug || ''} ${section.name || ''} ${section.api_source || ''}`.toLowerCase();
  const api = String(section.api_source || '').toLowerCase();

  if (section.slug === 'coming-soon' || /coming|upcoming|soon/.test(blob)) return 'coming';
  if (/airing.?today/.test(blob) || api === 'airing_today') return 'skip';

  // OTT / streaming platform rows (Netflix, Hotstar, “Trending on OTTs”, etc.)
  if (/^provider_/.test(api)) return 'ott';
  if (
    /hotstar|netflix|prime|amazon|disney|hulu|hbo|\bmax\b|apple|paramount|peacock|jiocinema|sonyliv|zee5/.test(blob)
    || /trending on|on ott|\botts?\b|streaming/.test(blob)
  ) {
    return 'ott';
  }

  if (api === 'now_playing' || /theater|theatre|now.?play|cinema|in.?theater/.test(blob)) {
    return 'theater';
  }
  if (/editor|editors.?pick|curat(ed)?|staff.?pick|tos.?pick/.test(blob)) {
    return 'editors';
  }
  // Hot Right Now — avoid matching Hotstar (already handled as ott)
  if (/\bhot\b|right.?now|trend/.test(blob) || api === 'trending' || api === 'popular') {
    return 'hot';
  }
  return 'other';
}

/** My Feed keeps only these three rails. */
const ALLOWED_BROWSE_KINDS = new Set(['hot', 'theater', 'editors']);

/** Prefer selected region; if empty, use first region that has titles. */
function getSectionMovies(section, regionCode) {
  const byRegion = section.movies_by_region || {};
  const selected = byRegion[regionCode];
  let movies = Array.isArray(selected) && selected.length > 0 ? selected : null;
  let usedRegion = regionCode;
  let isFallback = false;

  if (!movies) {
    for (const code of FALLBACK_REGION_ORDER) {
      if (code === regionCode) continue;
      const list = byRegion[code];
      if (Array.isArray(list) && list.length > 0) {
        movies = list;
        usedRegion = code;
        isFallback = true;
        break;
      }
    }
  }

  if (!movies) {
    for (const [code, list] of Object.entries(byRegion)) {
      if (Array.isArray(list) && list.length > 0) {
        movies = list;
        usedRegion = code;
        isFallback = true;
        break;
      }
    }
  }

  if (!movies) {
    return { movies: [], usedRegion: regionCode, isFallback: false };
  }

  // In Theaters = theatrical movies only (strip any series left from older fetches)
  const blob = `${section.slug || ''} ${section.name || ''} ${section.api_source || ''}`.toLowerCase();
  const isTheater =
    section.api_source === 'now_playing'
    || section.api_source === 'on_the_air'
    || /theater|theatre|now.?play|cinema|in.?theater/.test(blob);

  if (isTheater) {
    movies = movies.filter((m) => (m.media_type || 'movie') !== 'tv');
  }

  return { movies, usedRegion, isFallback };
}

function panelFromSearch(searchParams) {
  const view = (searchParams.get('view') || 'feed').toLowerCase();
  return VALID_PANELS.has(view) ? view : 'feed';
}

/**
 * Explore tab — CMS movie rails + browse sidebar + coming soon.
 * Left nav switches Collections / Boards / Blogs in the main column (same page).
 */
export default function HomeBrowseTab({
  selectedRegion,
  onRegionSelect,
  cmsSections,
  loadingSections,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activePanel, setActivePanel] = useState(() => panelFromSearch(searchParams));

  useEffect(() => {
    setActivePanel(panelFromSearch(searchParams));
  }, [searchParams]);

  const handleSelectPanel = useCallback(
    (id) => {
      if (!VALID_PANELS.has(id)) return;
      setActivePanel(id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!next.get('tab') || next.get('tab') === 'my-feed') {
            next.set('tab', 'explore');
          }
          if (id === 'feed') next.delete('view');
          else next.set('view', id);
          return next;
        },
        { replace: true },
      );
      if (typeof window !== 'undefined' && window.scrollY > 120) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [setSearchParams],
  );

  const visibleSections = cmsSections.filter((section) => {
    const kind = browseSectionKind(section);
    if (!ALLOWED_BROWSE_KINDS.has(kind)) return false;
    const { movies } = getSectionMovies(section, selectedRegion.code);
    return movies.length > 0;
  });

  const panelCopy = {
    feed: {
      title: (
        <>
          Explore <span className="text-gradient">What to Watch</span>
        </>
      ),
      subtitle: 'Hot titles, theaters, and editor picks',
    },
    collections: {
      title: 'Collections',
      subtitle: 'Browse public lists without leaving Explore',
    },
    boards: {
      title: 'Boards',
      subtitle: 'Discover cinematic boards in one place',
    },
    blogs: {
      title: 'Blogs',
      subtitle: 'Long-form posts from the community',
    },
  };
  const header = panelCopy[activePanel] || panelCopy.feed;

  return (
    <>
      <section className="pt-4 sm:pt-6 pb-2 sm:pb-4 px-3 sm:px-6 md:px-6 lg:pl-6 xl:pl-8">
        <div className="container mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-white mb-0.5 sm:mb-2 leading-tight">
                {header.title}
              </h1>
              <p className="text-xs sm:text-base text-[var(--text-secondary)] line-clamp-2">
                {header.subtitle}
              </p>
            </div>
            {activePanel === 'feed' && (
              <div className="shrink-0 self-start sm:self-auto">
                <HomeRegionPicker selectedRegion={selectedRegion} onSelect={onRegionSelect} />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="px-3 sm:px-6 md:px-6 lg:pl-6 xl:pl-8 py-2 sm:py-4 pb-24 lg:pb-8">
        <div className="container mx-auto">
          <HomeExploreBrowseSidebar
            placement="mobile"
            activePanel={activePanel}
            onSelect={handleSelectPanel}
          />

          <div className="flex gap-4 sm:gap-5 lg:gap-6 xl:gap-8 items-start">
            <HomeExploreBrowseSidebar
              placement="rail"
              activePanel={activePanel}
              onSelect={handleSelectPanel}
            />

            <div className="flex-1 min-w-0 space-y-7 sm:space-y-10 lg:space-y-12">
              {activePanel === 'collections' && <ExploreCollectionsPanel />}
              {activePanel === 'boards' && <ExploreBoardsPanel />}
              {activePanel === 'blogs' && <ExploreBlogsPanel />}

              {activePanel === 'feed' && (
                <>
                  <HomeComingSoonSidebar
                    placement="strip"
                    cmsSections={cmsSections}
                    selectedRegion={selectedRegion}
                  />

                  {loadingSections && (
                    <div className="space-y-7 sm:space-y-8">
                      {[1, 2, 3].map((i) => (
                        <div key={i}>
                          <div className="flex items-center gap-3 mb-4 sm:mb-6">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-white/5 animate-pulse" />
                            <div className="w-28 sm:w-32 h-5 sm:h-6 rounded bg-white/5 animate-pulse" />
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-x-3.5 gap-y-5 sm:gap-x-5 sm:gap-y-6 md:gap-x-6 md:gap-y-7 justify-items-center">
                            {[1, 2, 3, 4, 5].map((j) => (
                              <div key={j} className="w-full max-w-[7.25rem] sm:max-w-[8rem] md:max-w-[8.75rem] xl:max-w-[9.25rem] aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!loadingSections &&
                    visibleSections.map((section) => {
                      const { movies: regionMovies, isFallback, usedRegion } = getSectionMovies(
                        section,
                        selectedRegion.code,
                      );
                      return (
                        <div key={section.id}>
                          <div className="flex items-center gap-2.5 sm:gap-3 mb-4 sm:mb-6 group">
                            <div className="relative p-1.5 sm:p-2 rounded-xl bg-white/5 border border-white/10 overflow-hidden shrink-0">
                              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                              <span className="relative text-lg sm:text-2xl drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
                                {section.icon}
                              </span>
                            </div>
                            <div className="flex flex-col min-w-0">
                              <h2 className="text-lg sm:text-2xl md:text-3xl font-bold tracking-tight text-white truncate">
                                {section.name}
                              </h2>
                              {section.description && (
                                <span className="text-[11px] sm:text-sm text-white/40 font-medium tracking-wide line-clamp-1">
                                  {section.description}
                                </span>
                              )}
                              {isFallback && (
                                <span className="text-[10px] sm:text-[11px] text-amber-400/80 mt-0.5">
                                  Showing {usedRegion} titles (none for {selectedRegion.code} yet)
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-x-3.5 gap-y-5 sm:gap-x-5 sm:gap-y-6 md:gap-x-6 md:gap-y-7 justify-items-center">
                            {regionMovies.slice(0, section.max_movies || 14).map((movie, index) => (
                              <div
                                key={`${movie.media_type || 'movie'}-${movie.tmdb_id}`}
                                className="w-full max-w-[7.25rem] sm:max-w-[8rem] md:max-w-[8.75rem] xl:max-w-[9.25rem] sm:transform sm:hover:scale-105 sm:transition-transform sm:duration-300"
                              >
                                <Card
                                  data={{
                                    id: movie.tmdb_id,
                                    title: movie.title,
                                    poster_path: movie.poster_path,
                                    backdrop_path: movie.backdrop_path,
                                    media_type: movie.media_type,
                                    vote_average: movie.vote_average,
                                    release_date: movie.release_date,
                                    overview: movie.overview,
                                    genres: movie.genres,
                                    runtime: movie.runtime,
                                    tos_rating: movie.tos_rating,
                                  }}
                                  media_type={movie.media_type || 'movie'}
                                  index={index}
                                  compact={true}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                  {!loadingSections && visibleSections.length === 0 && (
                    <div className="text-center py-12 sm:py-16 px-4 sm:px-6">
                      <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">{selectedRegion.flag}</div>
                      <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">
                        No content for {selectedRegion.name}
                      </h3>
                      <p className="text-white/50 text-sm max-w-md mx-auto">
                        There are no movie or series sections available for this region yet.
                        Fetch &amp; publish sections in Admin for this region.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {activePanel === 'feed' && (
              <HomeComingSoonSidebar
                placement="rail"
                cmsSections={cmsSections}
                selectedRegion={selectedRegion}
              />
            )}
          </div>
        </div>
      </section>
    </>
  );
}
