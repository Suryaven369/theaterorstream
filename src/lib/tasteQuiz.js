/**
 * Taste quiz — shared contract between the onboarding UI and the API.
 * One schema validates in the browser (instant feedback) and on the server
 * (the source of truth), so the two can't drift apart.
 */
import { z } from 'zod';

export const MIN_LOVED = 3;
export const RECOMMENDED_LOVED = 5;
export const MAX_PICKS = 50;

/** How the user usually watches — drives "tonight" defaults (runtime, timing). */
export const WATCH_PATTERNS = [
    { id: 'casual', label: 'Casually, whenever', hint: 'No routine — a film when the mood strikes' },
    { id: 'weeknights', label: 'Weeknights after work', hint: 'Shorter, easier picks on school nights' },
    { id: 'weekends', label: 'Mostly weekends', hint: 'Room for longer, bigger films' },
    { id: 'theater', label: 'I love the theater', hint: 'Big-screen first, streaming for the rest' },
];

/**
 * Hard no's — titles that hit one are filtered out, not just ranked lower.
 * ('subtitles' is kept valid for older saved quizzes; languages are now
 * always strict, so it's no longer offered.)
 */
export const DEALBREAKERS = [
    { id: 'horror', label: 'No horror' },
    { id: 'violence', label: 'No excessive violence' },
    { id: 'gore', label: 'No gore' },
    { id: 'sexual_content', label: 'No explicit sex scenes' },
    { id: 'long_movies', label: 'Nothing over 2½ hours' },
];

export const RUNTIME_LIMITS = [
    { id: null, label: 'Any length' },
    { id: 120, label: 'Under 2 hours' },
    { id: 150, label: 'Under 2½ hours' },
];

export const QUIZ_LANGUAGES = [
    { id: 'en', label: 'English' },
    { id: 'hi', label: 'Hindi' },
    { id: 'ta', label: 'Tamil' },
    { id: 'te', label: 'Telugu' },
    { id: 'ml', label: 'Malayalam' },
    { id: 'kn', label: 'Kannada' },
    { id: 'bn', label: 'Bengali' },
    { id: 'mr', label: 'Marathi' },
    { id: 'ko', label: 'Korean' },
    { id: 'ja', label: 'Japanese' },
    { id: 'es', label: 'Spanish' },
    { id: 'fr', label: 'French' },
];

const DEALBREAKER_IDS = ['subtitles', ...DEALBREAKERS.map((d) => d.id)];

/** Genre chips (TMDB genre ids). */
export const QUIZ_GENRES = [
    { id: 28, label: 'Action' },
    { id: 18, label: 'Drama' },
    { id: 35, label: 'Comedy' },
    { id: 53, label: 'Thriller' },
    { id: 10749, label: 'Romance' },
    { id: 80, label: 'Crime' },
    { id: 9648, label: 'Mystery' },
    { id: 27, label: 'Horror' },
    { id: 878, label: 'Sci-Fi' },
    { id: 14, label: 'Fantasy' },
    { id: 12, label: 'Adventure' },
    { id: 10751, label: 'Family' },
    { id: 16, label: 'Animation' },
    { id: 99, label: 'Documentary' },
];

/** Usual vibe (mood ids match the engine's mood tags). */
export const QUIZ_MOODS = [
    { id: 'feel_good', label: 'Feel-good' },
    { id: 'action_packed', label: 'Action-packed' },
    { id: 'emotional', label: 'Emotional' },
    { id: 'suspenseful', label: 'Edge-of-seat' },
    { id: 'mind_bending', label: 'Mind-bending' },
    { id: 'dark', label: 'Dark & gritty' },
    { id: 'romantic', label: 'Romantic' },
    { id: 'family_friendly', label: 'Family-friendly' },
];

export const QUIZ_FORMATS = [
    { id: 'movies', label: 'Movies', hint: 'Films only' },
    { id: 'series', label: 'Web series', hint: 'Shows and series mostly' },
    { id: 'both', label: 'Both', hint: 'Whatever’s good' },
];

/** Decade starts (1980 = 80s and older). */
export const QUIZ_ERAS = [
    { id: 2020, label: 'Latest (2020s)' },
    { id: 2010, label: '2010s' },
    { id: 2000, label: '2000s' },
    { id: 1990, label: '90s' },
    { id: 1980, label: '80s & classics' },
];

export const QUIZ_COMPANY = [
    { id: 'solo', label: 'On my own' },
    { id: 'partner', label: 'With my partner' },
    { id: 'friends', label: 'With friends' },
    { id: 'family', label: 'With family' },
];

const tmdbId = z.coerce.number().int().positive().max(100000000);
const idList = z.array(tmdbId).max(MAX_PICKS).transform((ids) => [...new Set(ids)]);

/**
 * The stored profile:
 * { lovedIds, dislikedIds, platformIds, region, languages, maxRuntime, dealbreakers, pattern }
 */
export const TasteQuizSchema = z.object({
    lovedIds: idList.refine((ids) => ids.length >= MIN_LOVED, {
        message: `Pick at least ${MIN_LOVED} movies you loved`,
    }),
    dislikedIds: idList.default([]),
    platformIds: z.array(z.coerce.number().int().positive()).max(30).default([]),
    region: z.string().regex(/^[A-Za-z]{2}$/, 'Region must be a 2-letter country code').transform((r) => r.toUpperCase()),
    languages: z.array(z.enum(QUIZ_LANGUAGES.map((l) => l.id))).max(QUIZ_LANGUAGES.length).default([]),
    maxRuntime: z.union([z.literal(120), z.literal(150), z.null()]).default(null),
    dealbreakers: z.array(z.enum(DEALBREAKER_IDS)).max(DEALBREAKER_IDS.length)
        .default([]).transform((d) => [...new Set(d)]),
    pattern: z.enum(WATCH_PATTERNS.map((p) => p.id)),
    // Movies / series / both (older quizzes predate this → both).
    format: z.enum(QUIZ_FORMATS.map((f) => f.id)).default('both'),
    // Display info for the picked films (so editing later shows titles/posters).
    picks: z.array(z.object({
        id: tmdbId,
        title: z.string().max(200),
        poster: z.string().max(200).nullable().optional(),
        year: z.number().int().nullable().optional(),
    })).max(MAX_PICKS * 2).default([]),
}).superRefine((q, ctx) => {
    const overlap = q.lovedIds.filter((id) => q.dislikedIds.includes(id));
    if (overlap.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dislikedIds'], message: 'A movie can’t be both loved and disliked' });
    }
    if (q.dealbreakers.includes('subtitles') && !q.languages.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['languages'], message: 'Pick your languages so we know what needs no subtitles' });
    }
});

/** Effective runtime cap: explicit choice, else the "long movies" dealbreaker. */
export function effectiveMaxRuntime(quiz) {
    if (quiz?.maxRuntime) return quiz.maxRuntime;
    if (quiz?.dealbreakers?.includes('long_movies')) return 150;
    return null;
}

/** First human-readable error (for the UI), or null when valid. */
export function quizError(result) {
    if (result.success) return null;
    return result.error.issues[0]?.message || 'Please check your answers';
}

export function emptyQuiz(region = 'IN') {
    return {
        lovedIds: [], dislikedIds: [], platformIds: [], region,
        languages: [], maxRuntime: null, dealbreakers: [], pattern: null, format: null,
    };
}
