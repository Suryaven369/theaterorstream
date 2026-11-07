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

/** Hard no's — titles that hit one are filtered out, not just ranked lower. */
export const DEALBREAKERS = [
    { id: 'subtitles', label: 'No subtitles', hint: 'Only films in languages I picked' },
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
    dealbreakers: z.array(z.enum(DEALBREAKERS.map((d) => d.id))).max(DEALBREAKERS.length)
        .default([]).transform((d) => [...new Set(d)]),
    pattern: z.enum(WATCH_PATTERNS.map((p) => p.id)),
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
        languages: [], maxRuntime: null, dealbreakers: [], pattern: null,
    };
}
