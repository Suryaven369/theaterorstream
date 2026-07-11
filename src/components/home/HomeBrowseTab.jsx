import React from 'react';
import Card from '../Card';
import HomeRegionPicker from './HomeRegionPicker';
import HomeComingSoonSidebar from './HomeComingSoonSidebar';

const FALLBACK_REGION_ORDER = ['IN', 'US', 'GB', 'CA', 'AU'];

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

/**
 * My Feed tab — CMS movie sections + coming soon sidebar for a region.
 */
export default function HomeBrowseTab({
  selectedRegion,
  onRegionSelect,
  cmsSections,
  loadingSections,
}) {
  const visibleSections = cmsSections.filter((section) => {
    if (section.slug === 'coming-soon') return false;
    const key = `${section.slug || ''} ${section.name || ''} ${section.api_source || ''}`.toLowerCase();
    if (/airing.?today/.test(key) || section.api_source === 'airing_today') return false;
    const { movies } = getSectionMovies(section, selectedRegion.code);
    return movies.length > 0;
  });

  return (
    <>
      <section className="pt-6 pb-4 px-4 sm:px-8 md:pl-12 lg:pl-16">
        <div className="container mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1 sm:mb-2">
                Discover <span className="text-gradient">What to Watch</span>
              </h1>
              <p className="text-sm sm:text-base text-[var(--text-secondary)]">
                Movies & series in theaters and on streaming
              </p>
            </div>
            <HomeRegionPicker selectedRegion={selectedRegion} onSelect={onRegionSelect} />
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-8 md:pl-12 lg:pl-16 py-4">
        <div className="container mx-auto">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 sm:gap-8">
            <div className="xl:col-span-3 space-y-8 sm:space-y-12">
              {loadingSections && (
                <div className="space-y-8">
                  {[1, 2, 3].map((i) => (
                    <div key={i}>
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-lg bg-white/5 animate-pulse" />
                        <div className="w-32 h-6 rounded bg-white/5 animate-pulse" />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {[1, 2, 3, 4, 5].map((j) => (
                          <div key={j} className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
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
                      <div className="flex items-center gap-3 mb-6 group">
                        <div className="relative p-2 rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                          <span className="relative text-xl sm:text-2xl drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
                            {section.icon}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-yellow-200 group-hover:via-yellow-400 group-hover:to-orange-500 transition-all duration-300">
                            {section.name}
                          </h2>
                          {section.description && (
                            <span className="text-xs sm:text-sm text-white/40 font-medium tracking-wide">
                              {section.description}
                            </span>
                          )}
                          {isFallback && (
                            <span className="text-[11px] text-amber-400/80 mt-0.5">
                              Showing {usedRegion} titles (none for {selectedRegion.code} yet)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-4 px-1">
                        {regionMovies.slice(0, section.max_movies || 14).map((movie, index) => (
                          <div
                            key={`${movie.media_type || 'movie'}-${movie.tmdb_id}`}
                            className="transform hover:scale-105 transition-transform duration-300"
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
                <div className="text-center py-16 px-6">
                  <div className="text-5xl mb-4">{selectedRegion.flag}</div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    No content for {selectedRegion.name}
                  </h3>
                  <p className="text-white/50 text-sm max-w-md mx-auto">
                    There are no movie or series sections available for this region yet.
                    Fetch &amp; publish sections in Admin for this region.
                  </p>
                </div>
              )}
            </div>

            <HomeComingSoonSidebar cmsSections={cmsSections} selectedRegion={selectedRegion} />
          </div>
        </div>
      </section>
    </>
  );
}
