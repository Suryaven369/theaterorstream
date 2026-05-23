/** Onboarding state, drafts, and taste payload builders */

import { ONBOARDING_DRAFT_KEY } from '../constants/onboarding';
import { RUNTIME_RANGES } from '../constants/tastePreferences';

const AXIS_KEYS = [
    'acting', 'screenplay', 'sound', 'direction',
    'entertainment', 'pacing', 'cinematography',
];

export function quickReactionToRatings(reaction) {
    const scoreMap = {
        masterpiece: 10,
        loved_it: 9,
        love: 9,
        like: 7,
        liked: 7,
        meh: 4,
        hated_it: 2,
        hate: 2,
    };
    const score = scoreMap[reaction];
    if (score == null) return null;

    return AXIS_KEYS.reduce((acc, key) => {
        acc[key] = score;
        return acc;
    }, {});
}

export function buildGenreWeights(genreIds) {
    const weights = {};
    genreIds.forEach((id) => { weights[String(id)] = 1; });
    return weights;
}

export function buildMoodPreferences(moodIds, vibeIds = []) {
    const prefs = {};
    moodIds.forEach((id) => { prefs[id] = 1; });
    vibeIds.forEach((id) => { prefs[`vibe_${id}`] = 1; });
    return prefs;
}

export function buildAxisPreferences(state) {
    const axis = {};
    if (state.pacingPref) axis.pacing_style = state.pacingPref;
    if (state.complexityPref) axis.complexity = state.complexityPref;
    if (state.soundtrackImportance) axis.soundtrack = state.soundtrackImportance;
    if (state.cinematographyPrefs?.length) axis.cinematography = state.cinematographyPrefs;
    return axis;
}

export function buildRuntimeRange(runtimePref) {
    if (!runtimePref || !RUNTIME_RANGES[runtimePref]) return null;
    const [low, high] = RUNTIME_RANGES[runtimePref];
    return `[${low},${high})`;
}

export function buildOnboardingStepData(state) {
    return {
        genres: state.genreIds,
        moods: state.moodIds,
        vibes: state.vibeIds,
        streaming: state.streamingServices,
        region: state.region,
        family_mode: state.familyModeEnabled,
        favorite_movies: state.favoriteMovieIds,
        swipe_reactions: state.swipeRatings,
        emotional_tastes: state.emotionalTastes,
        storytelling: state.storytellingPrefs,
        characters: state.characterPrefs,
        worlds: state.worldPrefs,
        pacing: state.pacingPref,
        endings: state.endingPrefs,
        complexity: state.complexityPref,
        watching_habit: state.watchingHabit,
        viewing_context: state.viewingContext,
        runtime: state.runtimePref,
        watch_frequency: state.watchFrequency,
        emotional_goals: state.emotionalGoals,
        deep_calibration: state.deepCalibrationEnabled,
        directors: state.directorPrefs,
        cinematography: state.cinematographyPrefs,
        soundtrack: state.soundtrackImportance,
        taste_identity: state.tasteIdentity,
    };
}

export function loadOnboardingDraft() {
    try {
        const raw = sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function saveOnboardingDraft(draft) {
    try {
        sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
    } catch {
        // ignore quota errors
    }
}

export function clearOnboardingDraft() {
    try {
        sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
    } catch {
        // ignore
    }
}

export const DEFAULT_ONBOARDING_STATE = {
    stepId: 'welcome',
    username: '',
    dateOfBirth: '',
    selectedAvatar: null,
    region: 'IN',
    streamingServices: [],
    genreIds: [],
    moodIds: [],
    vibeIds: [],
    favoriteMovieIds: [],
    swipeRatings: {},
    seedRatings: {},
    emotionalTastes: [],
    storytellingPrefs: [],
    characterPrefs: [],
    worldPrefs: [],
    pacingPref: null,
    endingPrefs: [],
    complexityPref: null,
    watchingHabit: null,
    viewingContext: [],
    runtimePref: null,
    watchFrequency: null,
    emotionalGoals: [],
    deepCalibrationEnabled: false,
    directorPrefs: [],
    cinematographyPrefs: [],
    soundtrackImportance: null,
    familyModeEnabled: false,
    familyMaxCertification: null,
    tasteIdentity: null,
};

export function toggleListItem(list, id, max) {
    if (list.includes(id)) return list.filter((x) => x !== id);
    if (max != null && list.length >= max) return list;
    return [...list, id];
}

export function mergeDraftWithDefaults(draft) {
    return { ...DEFAULT_ONBOARDING_STATE, ...draft };
}
