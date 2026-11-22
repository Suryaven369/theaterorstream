/** Shared helpers for CMS home sections (Explore rails + Feed's In Theaters row). */

const FALLBACK_REGION_ORDER = ['IN', 'US', 'GB', 'CA', 'AU'];

/** Classify a CMS row for My Feed filtering. */
export function browseSectionKind(section) {
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
  if (/\bhot\b|right.?now|trend/.test(blob) || api === 'trending' || api === 'trending_live' || api === 'popular') {
    return 'hot';
  }
  return 'other';
}

/** Prefer selected region; if empty, use first region that has titles. */
export function getSectionMovies(section, regionCode) {
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

/** The region's In Theaters titles (movies only), from the CMS rail. */
export function getInTheaters(sections, regionCode) {
  const section = (sections || []).find((s) => browseSectionKind(s) === 'theater');
  if (!section) return { section: null, movies: [], usedRegion: regionCode, isFallback: false };
  return { section, ...getSectionMovies(section, regionCode) };
}
