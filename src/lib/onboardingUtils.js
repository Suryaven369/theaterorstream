/** Map quick onboarding reactions to 7-axis rating payloads */

const AXIS_KEYS = [
    'acting',
    'screenplay',
    'sound',
    'direction',
    'entertainment',
    'pacing',
    'cinematography',
];

export function quickReactionToRatings(reaction) {
    const scoreMap = {
        love: 9,
        like: 7,
        meh: 4,
    };
    const score = scoreMap[reaction];
    if (score == null) return null;

    return AXIS_KEYS.reduce((acc, key) => {
        acc[key] = score;
        return acc;
    }, {});
}

/** Build genre_weights jsonb from selected TMDB genre ids (equal weight 1.0) */
export function buildGenreWeights(genreIds) {
    const weights = {};
    genreIds.forEach((id) => {
        weights[String(id)] = 1;
    });
    return weights;
}

/** Build mood_preferences jsonb from selected mood ids */
export function buildMoodPreferences(moodIds) {
    const prefs = {};
    moodIds.forEach((id) => {
        prefs[id] = 1;
    });
    return prefs;
}

export function loadOnboardingDraft() {
    try {
        const raw = sessionStorage.getItem('tos-onboarding-draft');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function saveOnboardingDraft(draft) {
    try {
        sessionStorage.setItem('tos-onboarding-draft', JSON.stringify(draft));
    } catch {
        // ignore quota errors
    }
}

export function clearOnboardingDraft() {
    try {
        sessionStorage.removeItem('tos-onboarding-draft');
    } catch {
        // ignore
    }
}

export const DEFAULT_ONBOARDING_STATE = {
    step: 1,
    username: '',
    dateOfBirth: '',
    selectedAvatar: null,
    region: 'IN',
    streamingServices: [],
    genreIds: [],
    moodIds: [],
    seedRatings: {},
    familyModeEnabled: false,
    familyMaxCertification: null,
};
