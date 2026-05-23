/** Onboarding constants — OTT platforms, moods, regions, certifications */

export const ONBOARDING_DRAFT_KEY = 'tos-onboarding-draft';
/** @deprecated Use getVisibleSteps() from onboardingSteps.js */
export const ONBOARDING_TOTAL_STEPS = 31;

export const REGIONS = [
    { id: 'IN', label: 'India', flag: '🇮🇳' },
    { id: 'US', label: 'United States', flag: '🇺🇸' },
    { id: 'GB', label: 'United Kingdom', flag: '🇬🇧' },
];

export const STREAMING_SERVICES = {
    IN: [
        { id: 'netflix', label: 'Netflix', emoji: '🎬' },
        { id: 'prime', label: 'Prime Video', emoji: '📦' },
        { id: 'hotstar', label: 'Disney+ Hotstar', emoji: '⭐' },
        { id: 'jio_cinema', label: 'JioCinema', emoji: '📱' },
        { id: 'sonyliv', label: 'SonyLIV', emoji: '📺' },
        { id: 'zee5', label: 'Zee5', emoji: '🎭' },
        { id: 'apple_tv', label: 'Apple TV+', emoji: '🍎' },
        { id: 'youtube', label: 'YouTube Movies', emoji: '▶️' },
    ],
    US: [
        { id: 'netflix', label: 'Netflix', emoji: '🎬' },
        { id: 'prime', label: 'Prime Video', emoji: '📦' },
        { id: 'disney_plus', label: 'Disney+', emoji: '⭐' },
        { id: 'hulu', label: 'Hulu', emoji: '📺' },
        { id: 'max', label: 'Max', emoji: '🎞️' },
        { id: 'apple_tv', label: 'Apple TV+', emoji: '🍎' },
        { id: 'peacock', label: 'Peacock', emoji: '🦚' },
        { id: 'paramount', label: 'Paramount+', emoji: '⛰️' },
    ],
    GB: [
        { id: 'netflix', label: 'Netflix', emoji: '🎬' },
        { id: 'prime', label: 'Prime Video', emoji: '📦' },
        { id: 'disney_plus', label: 'Disney+', emoji: '⭐' },
        { id: 'apple_tv', label: 'Apple TV+', emoji: '🍎' },
        { id: 'now', label: 'NOW', emoji: '📡' },
        { id: 'bbc_iplayer', label: 'BBC iPlayer', emoji: '🇬🇧' },
    ],
};

export const MOOD_OPTIONS = [
    { id: 'cozy', label: 'Cozy', emoji: '🛋️', description: 'Comfort watches, feel-good' },
    { id: 'intense', label: 'Intense', emoji: '🔥', description: 'High stakes, edge-of-seat' },
    { id: 'funny', label: 'Funny', emoji: '😂', description: 'Comedy, light-hearted' },
    { id: 'mind_bending', label: 'Mind-bending', emoji: '🌀', description: 'Twists, sci-fi, puzzles' },
    { id: 'emotional', label: 'Emotional', emoji: '💔', description: 'Drama, heartfelt stories' },
    { id: 'action_packed', label: 'Action-packed', emoji: '💥', description: 'Thrills, stunts, adventure' },
    { id: 'thoughtful', label: 'Thoughtful', emoji: '🧠', description: 'Slow burn, artistic' },
    { id: 'family_friendly', label: 'Family-friendly', emoji: '👨‍👩‍👧', description: 'All ages, wholesome' },
];

export const CERTIFICATIONS = {
    IN: [
        { id: 'U', label: 'U — Universal', description: 'All ages' },
        { id: 'UA', label: 'UA — Parental guidance', description: 'Under 12 with guidance' },
        { id: 'A', label: 'A — Adults only', description: '18+' },
    ],
    US: [
        { id: 'G', label: 'G — General', description: 'All ages' },
        { id: 'PG', label: 'PG', description: 'Parental guidance' },
        { id: 'PG-13', label: 'PG-13', description: 'Teens and up' },
        { id: 'R', label: 'R — Restricted', description: '17+ with parent' },
    ],
    GB: [
        { id: 'U', label: 'U', description: 'Universal' },
        { id: 'PG', label: 'PG', description: 'Parental guidance' },
        { id: '12A', label: '12A', description: '12+ with adult' },
        { id: '15', label: '15', description: '15+' },
    ],
};

export const AVATARS = [
    { id: 'avatar_1', emoji: '🎬', name: 'Director', bg: 'from-purple-500 to-pink-500' },
    { id: 'avatar_2', emoji: '🎭', name: 'Drama', bg: 'from-blue-500 to-cyan-500' },
    { id: 'avatar_3', emoji: '🎪', name: 'Fun', bg: 'from-green-500 to-emerald-500' },
    { id: 'avatar_4', emoji: '🌟', name: 'Star', bg: 'from-yellow-500 to-orange-500' },
    { id: 'avatar_5', emoji: '🎯', name: 'Focus', bg: 'from-red-500 to-pink-500' },
    { id: 'avatar_6', emoji: '🦋', name: 'Discovery', bg: 'from-indigo-500 to-purple-500' },
    { id: 'avatar_7', emoji: '🌈', name: 'Colorful', bg: 'from-pink-500 to-rose-500' },
    { id: 'avatar_8', emoji: '🎸', name: 'Rock', bg: 'from-teal-500 to-cyan-500' },
    { id: 'avatar_9', emoji: '🎮', name: 'Gamer', bg: 'from-violet-500 to-purple-500' },
    { id: 'avatar_10', emoji: '📚', name: 'Scholar', bg: 'from-amber-500 to-orange-500' },
    { id: 'avatar_11', emoji: '🚀', name: 'Explorer', bg: 'from-sky-500 to-blue-500' },
    { id: 'avatar_12', emoji: '🎨', name: 'Creative', bg: 'from-rose-500 to-pink-500' },
];

export const SEED_MOVIE_COUNT = 8;
export const SWIPE_RATING_TARGET = 10;
export const MAX_GENRE_PICKS = 5;
export const MAX_MOOD_PICKS = 3;

export function getStreamingServicesForRegion(regionId) {
    return STREAMING_SERVICES[regionId] || STREAMING_SERVICES.IN;
}

export function getCertificationsForRegion(regionId) {
    return CERTIFICATIONS[regionId] || CERTIFICATIONS.IN;
}
