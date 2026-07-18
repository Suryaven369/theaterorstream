/** Browse chips shown on the Search → Content idle state. */

import { MOVIE_GENRES } from '../lib/contentApi';

export const SEARCH_GENRES = MOVIE_GENRES.map((g) => ({
  id: g.id,
  label: g.name,
}));

export function genreLabelById(genreId) {
  const match = SEARCH_GENRES.find((g) => g.id === Number(genreId));
  return match?.label || null;
}

/**
 * Theme chips — TMDB keyword IDs verified via /search/keyword.
 * Keep in sync with api/_lib/theme-browse-server.js THEME_CONFIG.
 * Prefer a single primary keyword for accuracy; avoid mixing unrelated IDs.
 */
export const SEARCH_THEMES = [
  { id: 'found-footage', label: 'Found Footage', keywordIds: [163053], keywordQueries: ['found footage'] },
  { id: 'dystopia', label: 'Dystopia', keywordIds: [4565], keywordQueries: ['dystopia'] },
  { id: 'disturbing', label: 'Disturbing', keywordIds: [361070], keywordQueries: ['disturbing'] },
  { id: 'anthology', label: 'Anthology', keywordIds: [9706], keywordQueries: ['anthology'] },
  { id: 'mind-bending', label: 'Mind-Bending', keywordIds: [362567], keywordQueries: ['mind-bending'] },
  { id: 'slow-burn', label: 'Slow Burn', keywordIds: [277551], keywordQueries: ['slow burn'] },
  { id: 'psychological', label: 'Psychological', keywordIds: [12565], keywordQueries: ['psychological thriller'] },
  { id: 'cyberpunk', label: 'Cyberpunk', keywordIds: [12190], keywordQueries: ['cyberpunk'] },
  { id: 'time-travel', label: 'Time Travel', keywordIds: [4379], keywordQueries: ['time travel'] },
  { id: 'heist', label: 'Heist', keywordIds: [10051], keywordQueries: ['heist'] },
  { id: 'coming-of-age', label: 'Coming of Age', keywordIds: [10683], keywordQueries: ['coming of age'] },
  { id: 'mockumentary', label: 'Mockumentary', keywordIds: [11800], keywordQueries: ['mockumentary'] },
  { id: 'neo-noir', label: 'Neo-Noir', keywordIds: [207268], keywordQueries: ['neo-noir'] },
  { id: 'body-horror', label: 'Body Horror', keywordIds: [283085], keywordQueries: ['body horror'] },
  { id: 'survival', label: 'Survival', keywordIds: [10349], keywordQueries: ['survival'] },
  { id: 'cult-classic', label: 'Cult Classic', keywordIds: [374649], keywordQueries: ['cult film'] },
  { id: 'based-on-true-story', label: 'Based on a True Story', keywordIds: [9672], keywordQueries: ['based on true story'] },
  { id: 'period-piece', label: 'Period Piece', keywordIds: [5776], keywordQueries: ['period drama'] },
  { id: 'superhero', label: 'Superhero', keywordIds: [9715], keywordQueries: ['superhero'] },
  { id: 'anime', label: 'Anime', genreIds: [16], originalLanguage: 'ja', keywordQueries: ['anime'] },
  { id: 'whodunit', label: 'Whodunit', keywordIds: [12570], keywordQueries: ['whodunit'] },
  { id: 'space-opera', label: 'Space Opera', keywordIds: [161176], keywordQueries: ['space opera'] },
];

/** Min votes for “popular” theme/genre discover results */
export const THEME_POPULAR_VOTE_COUNT = 100;

/** Curated OTT providers for browse-page filters (TMDB watch provider ids). */
export const OTT_PROVIDERS = [
  { id: 8, name: 'Netflix' },
  { id: 9, name: 'Amazon Prime Video' },
  { id: 337, name: 'Disney+' },
  { id: 122, name: 'Hotstar' },
  { id: 350, name: 'Apple TV+' },
  { id: 15, name: 'Hulu' },
  { id: 1899, name: 'Max' },
  { id: 531, name: 'Paramount+' },
  { id: 386, name: 'Peacock' },
  { id: 283, name: 'Crunchyroll' },
];

export const BROWSE_SORT_OPTIONS = [
  { id: 'popular', label: 'Most popular' },
  { id: 'newest', label: 'Newest' },
  { id: 'rating', label: 'Higher rated' },
];

export function themeLabelById(themeId) {
  return SEARCH_THEMES.find((t) => t.id === themeId)?.label || null;
}

export function getThemeConfig(themeId) {
  return SEARCH_THEMES.find((t) => t.id === themeId) || null;
}
