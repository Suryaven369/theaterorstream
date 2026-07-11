/** Taste preference + mood discovery options for the Watch page and the
 *  Settings → Taste Preferences editor. Mirrors the server constants in
 *  api/_lib/taste-preferences-server.js and api/_lib/recommendation-server.js. */

export const TASTE_GENRES = [
    { id: 28, label: 'Action', emoji: '💥' },
    { id: 53, label: 'Thriller', emoji: '🔪' },
    { id: 878, label: 'Sci-Fi', emoji: '🚀' },
    { id: 27, label: 'Horror', emoji: '👻' },
    { id: 10749, label: 'Romance', emoji: '💕' },
    { id: 9648, label: 'Mystery', emoji: '🕵️' },
    { id: 35, label: 'Comedy', emoji: '😂' },
    { id: 14, label: 'Fantasy', emoji: '🐉' },
    { id: 80, label: 'Crime', emoji: '🚔' },
    { id: 99, label: 'Documentary', emoji: '🎥' },
];

export const TASTE_MOODS = [
    { id: 'mind_bending', label: 'Mind Bending', emoji: '🌀' },
    { id: 'feel_good', label: 'Feel Good', emoji: '☀️' },
    { id: 'emotional', label: 'Emotional', emoji: '💔' },
    { id: 'dark', label: 'Dark', emoji: '🌑' },
    { id: 'suspenseful', label: 'Suspenseful', emoji: '😰' },
    { id: 'action_packed', label: 'Action Packed', emoji: '⚡' },
    { id: 'family_friendly', label: 'Family Friendly', emoji: '👨‍👩‍👧' },
    { id: 'romantic', label: 'Romantic', emoji: '🌹' },
];

export const TASTE_LANGUAGES = [
    { id: 'en', label: 'English' },
    { id: 'hi', label: 'Hindi' },
    { id: 'ko', label: 'Korean' },
    { id: 'ja', label: 'Japanese' },
    { id: 'es', label: 'Spanish' },
    { id: 'fr', label: 'French' },
    { id: 'other', label: 'Others' },
];

export const TASTE_ERAS = [
    { id: 1980, label: '1980s' },
    { id: 1990, label: '1990s' },
    { id: 2000, label: '2000s' },
    { id: 2010, label: '2010s' },
    { id: 2020, label: '2020s' },
];

// Mood discovery rows on the Watch page (ids match server MOOD_CONFIG).
export const DISCOVERY_MOODS = [
    { id: 'mind_bending', label: 'Mind Bending', emoji: '🌀', accent: '#8b5cf6' },
    { id: 'dark_thriller', label: 'Dark Thriller', emoji: '🌑', accent: '#ef4444' },
    { id: 'feel_good', label: 'Feel Good', emoji: '☀️', accent: '#f5c518' },
    { id: 'emotional', label: 'Emotional', emoji: '💔', accent: '#ec4899' },
    { id: 'date_night', label: 'Date Night', emoji: '🌹', accent: '#f43f5e' },
    { id: 'action_packed', label: 'Action Packed', emoji: '⚡', accent: '#f97316' },
    { id: 'family_night', label: 'Family Night', emoji: '👨‍👩‍👧', accent: '#22c55e' },
    { id: 'crime_mystery', label: 'Crime Mystery', emoji: '🕵️', accent: '#3b82f6' },
    { id: 'horror_night', label: 'Horror Night', emoji: '👻', accent: '#6366f1' },
];

export const GENRE_NAME_BY_ID = Object.fromEntries(
    TASTE_GENRES.map((g) => [g.id, g.label]),
);
