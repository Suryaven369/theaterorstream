/** Movie-mood atmosphere presets for luxury share cards (html2canvas-safe gradients only) */

const GENRE_MOOD_RULES = [
    { mood: 'stage', match: /music|musical|concert|biography|biopic|dance/i },
    { mood: 'noir', match: /horror|thriller|mystery|crime/i },
    { mood: 'cosmos', match: /science fiction|sci-fi|fantasy|adventure/i },
    { mood: 'romance', match: /romance|melodrama|family/i },
    { mood: 'pulse', match: /action|war|sport/i },
];

const TITLE_MOOD_HINTS = [
    { mood: 'stage', match: /michael|whitney|elvis|bohemian|rocketman|musical/i },
];

export function resolveShareCardMood(genres = [], title = '') {
    const genreText = genres
        .map((g) => (typeof g === 'string' ? g : g?.name || ''))
        .join(' ');

    for (const rule of TITLE_MOOD_HINTS) {
        if (rule.match.test(title || '')) return rule.mood;
    }
    for (const rule of GENRE_MOOD_RULES) {
        if (rule.match.test(genreText)) return rule.mood;
    }
    return 'cinema';
}

export function pickPrimaryGenreLabel(genres = [], mediaType = 'movie') {
    const first = genres?.[0];
    const name = typeof first === 'string' ? first : first?.name;
    if (name) return name.toUpperCase();
    return mediaType === 'tv' ? 'SERIES' : 'DRAMA';
}

/** Layer definitions per mood — warm gold default for stage/musical */
export const MOOD_LAYERS = {
    stage: {
        base: 'linear-gradient(152deg, #0c0a08 0%, #050403 45%, #0a0705 100%)',
        glowA: 'radial-gradient(ellipse 90% 70% at 82% 18%, rgba(251, 191, 36, 0.38) 0%, rgba(234, 179, 8, 0.12) 40%, transparent 68%)',
        glowB: 'radial-gradient(ellipse 75% 55% at 12% 88%, rgba(251, 146, 60, 0.28) 0%, transparent 62%)',
        glowC: 'radial-gradient(ellipse 60% 45% at 35% 55%, rgba(255, 215, 120, 0.08) 0%, transparent 70%)',
        scoreBloom: 'radial-gradient(ellipse, rgba(251, 191, 36, 0.32) 0%, rgba(180, 83, 9, 0.1) 55%, transparent 78%)',
        posterBloom: 'radial-gradient(circle, rgba(251, 191, 36, 0.22) 0%, rgba(234, 179, 8, 0.1) 50%, transparent 72%)',
        posterUnderGlow: 'rgba(251, 191, 36, 0.15)',
        scoreTextGlow: 'rgba(251, 191, 36, 0.35)',
        accent: 'rgba(251, 191, 36, 0.75)',
    },
    noir: {
        base: 'linear-gradient(160deg, #050608 0%, #020203 50%, #080a10 100%)',
        glowA: 'radial-gradient(ellipse 85% 65% at 10% 12%, rgba(34, 211, 238, 0.22) 0%, transparent 65%)',
        glowB: 'radial-gradient(ellipse 70% 50% at 90% 90%, rgba(30, 58, 138, 0.25) 0%, transparent 60%)',
        glowC: 'radial-gradient(ellipse 50% 40% at 50% 50%, rgba(255,255,255,0.03) 0%, transparent 70%)',
        scoreBloom: 'radial-gradient(ellipse, rgba(148, 163, 184, 0.2) 0%, transparent 75%)',
        posterBloom: 'radial-gradient(circle, rgba(34, 211, 238, 0.14) 0%, transparent 70%)',
        posterUnderGlow: 'rgba(34, 211, 238, 0.12)',
        scoreTextGlow: 'rgba(186, 230, 253, 0.28)',
        accent: 'rgba(186, 230, 253, 0.7)',
    },
    cosmos: {
        base: 'linear-gradient(155deg, #040608 0%, #020204 48%, #060810 100%)',
        glowA: 'radial-gradient(ellipse 90% 70% at 15% 20%, rgba(34, 211, 238, 0.3) 0%, transparent 68%)',
        glowB: 'radial-gradient(ellipse 80% 55% at 85% 85%, rgba(59, 130, 246, 0.18) 0%, transparent 65%)',
        glowC: 'radial-gradient(ellipse 55% 40% at 60% 40%, rgba(6, 182, 212, 0.06) 0%, transparent 70%)',
        scoreBloom: 'radial-gradient(ellipse, rgba(34, 211, 238, 0.22) 0%, transparent 75%)',
        posterBloom: 'radial-gradient(circle, rgba(34, 211, 238, 0.18) 0%, rgba(59, 130, 246, 0.08) 50%, transparent 72%)',
        posterUnderGlow: 'rgba(34, 211, 238, 0.14)',
        scoreTextGlow: 'rgba(103, 232, 249, 0.3)',
        accent: 'rgba(103, 232, 249, 0.75)',
    },
    romance: {
        base: 'linear-gradient(150deg, #0a0708 0%, #030303 50%, #0a0605 100%)',
        glowA: 'radial-gradient(ellipse 85% 60% at 75% 15%, rgba(251, 146, 60, 0.2) 0%, transparent 65%)',
        glowB: 'radial-gradient(ellipse 70% 55% at 20% 85%, rgba(244, 114, 182, 0.12) 0%, transparent 60%)',
        glowC: 'radial-gradient(ellipse 50% 45% at 50% 50%, rgba(255,255,255,0.04) 0%, transparent 70%)',
        scoreBloom: 'radial-gradient(ellipse, rgba(251, 146, 60, 0.2) 0%, transparent 75%)',
        posterBloom: 'radial-gradient(circle, rgba(251, 146, 60, 0.14) 0%, transparent 70%)',
        posterUnderGlow: 'rgba(244, 114, 182, 0.12)',
        scoreTextGlow: 'rgba(251, 146, 60, 0.28)',
        accent: 'rgba(251, 191, 36, 0.72)',
    },
    pulse: {
        base: 'linear-gradient(155deg, #0a0605 0%, #030303 45%, #0c0806 100%)',
        glowA: 'radial-gradient(ellipse 85% 65% at 88% 22%, rgba(234, 88, 12, 0.28) 0%, transparent 65%)',
        glowB: 'radial-gradient(ellipse 75% 50% at 10% 80%, rgba(251, 146, 60, 0.2) 0%, transparent 62%)',
        glowC: 'radial-gradient(ellipse 50% 40% at 45% 45%, rgba(255,255,255,0.03) 0%, transparent 70%)',
        scoreBloom: 'radial-gradient(ellipse, rgba(234, 88, 12, 0.26) 0%, transparent 75%)',
        posterBloom: 'radial-gradient(circle, rgba(234, 88, 12, 0.16) 0%, transparent 70%)',
        posterUnderGlow: 'rgba(234, 88, 12, 0.14)',
        scoreTextGlow: 'rgba(251, 146, 60, 0.32)',
        accent: 'rgba(251, 146, 60, 0.78)',
    },
    cinema: {
        base: 'linear-gradient(155deg, #0a0c10 0%, #020202 48%, #080604 100%)',
        glowA: 'radial-gradient(ellipse 90% 65% at 12% 15%, rgba(34, 211, 238, 0.24) 0%, transparent 65%)',
        glowB: 'radial-gradient(ellipse 80% 55% at 88% 88%, rgba(251, 146, 60, 0.22) 0%, transparent 62%)',
        glowC: 'radial-gradient(ellipse 55% 45% at 55% 48%, rgba(255,255,255,0.035) 0%, transparent 70%)',
        scoreBloom: 'radial-gradient(ellipse, rgba(251, 191, 36, 0.24) 0%, rgba(34, 211, 238, 0.08) 55%, transparent 78%)',
        posterBloom: 'radial-gradient(circle, rgba(34, 211, 238, 0.14) 0%, rgba(251, 146, 60, 0.1) 48%, transparent 72%)',
        posterUnderGlow: 'rgba(251, 191, 36, 0.12)',
        scoreTextGlow: 'rgba(251, 191, 36, 0.32)',
        accent: 'rgba(251, 191, 36, 0.74)',
    },
};

export function getMoodLayers(mood) {
    return MOOD_LAYERS[mood] || MOOD_LAYERS.cinema;
}
