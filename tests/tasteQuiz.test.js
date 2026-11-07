import { describe, it, expect } from 'vitest';
import {
    TasteQuizSchema,
    quizError,
    effectiveMaxRuntime,
    MIN_LOVED,
} from '../src/lib/tasteQuiz.js';
import { STARTER_MOVIES } from '../src/constants/starterMovies.js';

const valid = {
    lovedIds: [278, 155, 27205, 20453, 360814],
    dislikedIds: [597],
    platformIds: [8, 119],
    region: 'in',
    languages: ['en', 'hi'],
    maxRuntime: 150,
    dealbreakers: ['horror'],
    pattern: 'weeknights',
};

describe('TasteQuizSchema', () => {
    it('accepts a complete profile and normalises region', () => {
        const r = TasteQuizSchema.safeParse(valid);
        expect(r.success).toBe(true);
        expect(r.data.region).toBe('IN');
        expect(r.data.lovedIds).toHaveLength(5);
    });

    it(`requires at least ${MIN_LOVED} loved movies`, () => {
        const r = TasteQuizSchema.safeParse({ ...valid, lovedIds: [278, 155] });
        expect(r.success).toBe(false);
        expect(quizError(r)).toMatch(/at least 3/i);
    });

    it('dedupes ids before counting (3 copies of one film is not 3 films)', () => {
        const r = TasteQuizSchema.safeParse({ ...valid, lovedIds: [278, 278, 278] });
        expect(r.success).toBe(false);
    });

    it('rejects a film that is both loved and disliked', () => {
        const r = TasteQuizSchema.safeParse({ ...valid, dislikedIds: [278] });
        expect(r.success).toBe(false);
        expect(quizError(r)).toMatch(/both loved and disliked/i);
    });

    it('requires a watching pattern from the allowed list', () => {
        expect(TasteQuizSchema.safeParse({ ...valid, pattern: undefined }).success).toBe(false);
        expect(TasteQuizSchema.safeParse({ ...valid, pattern: 'binge' }).success).toBe(false);
    });

    it('rejects unknown languages, dealbreakers and runtime limits', () => {
        expect(TasteQuizSchema.safeParse({ ...valid, languages: ['xx'] }).success).toBe(false);
        expect(TasteQuizSchema.safeParse({ ...valid, dealbreakers: ['spiders'] }).success).toBe(false);
        expect(TasteQuizSchema.safeParse({ ...valid, maxRuntime: 95 }).success).toBe(false);
    });

    it('needs languages when "no subtitles" is a dealbreaker', () => {
        const r = TasteQuizSchema.safeParse({ ...valid, languages: [], dealbreakers: ['subtitles'] });
        expect(r.success).toBe(false);
    });

    it('rejects a bad region and non-numeric ids', () => {
        expect(TasteQuizSchema.safeParse({ ...valid, region: 'India' }).success).toBe(false);
        expect(TasteQuizSchema.safeParse({ ...valid, lovedIds: ['abc', 1, 2] }).success).toBe(false);
    });

    it('defaults optional fields', () => {
        const r = TasteQuizSchema.safeParse({ lovedIds: [1, 2, 3], region: 'US', pattern: 'casual' });
        expect(r.success).toBe(true);
        expect(r.data).toMatchObject({ dislikedIds: [], platformIds: [], languages: [], dealbreakers: [], maxRuntime: null });
    });
});

describe('effectiveMaxRuntime', () => {
    it('uses the explicit limit, else the long-movies dealbreaker, else none', () => {
        expect(effectiveMaxRuntime({ maxRuntime: 120, dealbreakers: ['long_movies'] })).toBe(120);
        expect(effectiveMaxRuntime({ maxRuntime: null, dealbreakers: ['long_movies'] })).toBe(150);
        expect(effectiveMaxRuntime({ maxRuntime: null, dealbreakers: [] })).toBeNull();
    });
});

describe('starter grid', () => {
    it('has ~30 unique films with posters, mixing English and Indian languages', () => {
        const ids = STARTER_MOVIES.map((m) => m.id);
        expect(STARTER_MOVIES.length).toBeGreaterThanOrEqual(28);
        expect(new Set(ids).size).toBe(ids.length);
        expect(STARTER_MOVIES.every((m) => m.poster && m.title && m.year)).toBe(true);
        const langs = new Set(STARTER_MOVIES.map((m) => m.lang));
        expect(langs.has('en') && langs.has('hi')).toBe(true);
    });
});
