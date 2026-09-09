import { TASTE_ERAS, TASTE_GENRES, TASTE_LANGUAGES, TASTE_MOODS } from './discoveryTaste';

/** How long after signup we still auto-open the questionnaire. */
export const TASTE_ONBOARDING_NEW_ACCOUNT_MS = 3 * 24 * 60 * 60 * 1000;

export const TASTE_WATCH_STYLES = [
    { id: 'theater', label: 'In a theater', hint: 'Big screen, opening weekend energy' },
    { id: 'stream', label: 'At home / streaming', hint: 'Couch, pause, your own time' },
    { id: 'both', label: 'Both, depends on the film', hint: 'Theater for events, stream for the rest' },
];

export const TASTE_COMPANY = [
    { id: 'solo', label: 'By myself' },
    { id: 'partner', label: 'With a partner' },
    { id: 'friends', label: 'With friends' },
    { id: 'family', label: 'With family' },
];

export const TASTE_QUESTIONNAIRE_STEPS = [
    {
        id: 'genres',
        question: 'What kinds of stories pull you in?',
        hint: 'Pick as many as you want. Categories only — no titles.',
        multi: true,
        options: TASTE_GENRES,
        getKey: (o) => o.id,
        getLabel: (o) => o.label,
        getEmoji: (o) => o.emoji,
    },
    {
        id: 'moods',
        question: 'What do you want a movie night to feel like?',
        hint: 'The vibe you chase more often than not.',
        multi: true,
        options: TASTE_MOODS,
        getKey: (o) => o.id,
        getLabel: (o) => o.label,
        getEmoji: (o) => o.emoji,
    },
    {
        id: 'languages',
        question: 'Which languages do you usually watch in?',
        hint: 'Include dubbed or subtitled — whatever you actually watch.',
        multi: true,
        options: TASTE_LANGUAGES,
        getKey: (o) => o.id,
        getLabel: (o) => o.label,
        getEmoji: () => null,
    },
    {
        id: 'eras',
        question: 'Which eras feel like home for you?',
        hint: 'When the movies you enjoy most tend to come from.',
        multi: true,
        options: TASTE_ERAS,
        getKey: (o) => o.id,
        getLabel: (o) => o.label,
        getEmoji: () => null,
    },
    {
        id: 'watchStyle',
        question: 'Where do you prefer to watch?',
        hint: 'Theater or stream — pick what fits you.',
        multi: false,
        options: TASTE_WATCH_STYLES,
        getKey: (o) => o.id,
        getLabel: (o) => o.label,
        getEmoji: () => null,
        getHint: (o) => o.hint,
    },
    {
        id: 'company',
        question: 'Who are you usually watching with?',
        hint: 'Helps us tilt picks toward solo nights, dates, or family.',
        multi: true,
        options: TASTE_COMPANY,
        getKey: (o) => o.id,
        getLabel: (o) => o.label,
        getEmoji: () => null,
    },
];
