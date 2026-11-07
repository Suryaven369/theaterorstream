/**
 * "Tonight" — the 3 taps (mood, time, company). Shared by the UI and the
 * server scorer (api/_lib/reco/config.js) so labels and logic stay in sync.
 * fits / clashes / dilutes / prefer / avoid are TMDB genre ids. `dilutes` =
 * genres that weaken a mood (a Drama that's also a Crime thriller isn't "moving").
 */
export const TONIGHT_MOODS = {
    light: { label: 'Light & fun', emoji: '😄', fits: [35, 10751, 16, 10749, 12], clashes: [27, 10752], dilutes: [53, 80, 9648] },
    thrilling: { label: 'Edge-of-seat', emoji: '😬', fits: [53, 28, 80, 9648], clashes: [10751, 16], dilutes: [10749, 35] },
    emotional: { label: 'Something moving', emoji: '🥹', fits: [18, 10749, 36], clashes: [27], dilutes: [53, 80, 9648, 28] },
    mind_bending: { label: 'Mind-bending', emoji: '🌀', fits: [878, 9648, 14], clashes: [10751], dilutes: [10749] },
    dark: { label: 'Dark & intense', emoji: '🌑', fits: [27, 80, 53, 10752], clashes: [10751, 16, 35], dilutes: [10749] },
    any: { label: 'Surprise me', emoji: '🎲', fits: [], clashes: [], dilutes: [] },
};

export const TONIGHT_TIMES = [
    { id: 95, label: 'Under 1½ hrs' },
    { id: 125, label: 'About 2 hrs' },
    { id: 160, label: '2½ hrs' },
    { id: 240, label: 'No rush' },
];

export const TONIGHT_COMPANY = {
    solo: { label: 'Just me', emoji: '🙋', avoid: [], prefer: [] },
    partner: { label: 'With a partner', emoji: '💑', avoid: [27], prefer: [10749, 35] },
    friends: { label: 'With friends', emoji: '🍿', avoid: [], prefer: [35, 28, 27] },
    family: { label: 'With family', emoji: '👨‍👩‍👧', avoid: [27, 53, 80, 10752], prefer: [10751, 16, 12] },
};
