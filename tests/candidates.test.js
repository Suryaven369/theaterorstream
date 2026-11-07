import { describe, it, expect } from 'vitest';
import { passesDealbreakers, topSharedKeywords } from '../api/_lib/reco/candidates.js';

const film = (over = {}) => ({
    tmdb_id: '1', genre_ids: [28, 53], original_language: 'en', runtime: 110,
    keywords: [{ id: 1, name: 'heist' }], custom_parent_guide: null, ...over,
});

describe('passesDealbreakers', () => {
    it('passes everything when there are no dealbreakers', () => {
        expect(passesDealbreakers(film({ genre_ids: [27] }), {})).toBe(true);
    });

    it('drops horror by genre', () => {
        expect(passesDealbreakers(film({ genre_ids: [27, 53] }), { dealbreakers: ['horror'] })).toBe(false);
        expect(passesDealbreakers(film(), { dealbreakers: ['horror'] })).toBe(true);
    });

    it('drops gore / sexual content / violence by keywords or parent guide', () => {
        expect(passesDealbreakers(film({ keywords: [{ id: 2, name: 'gore' }] }), { dealbreakers: ['gore'] })).toBe(false);
        expect(passesDealbreakers(film({ keywords: [{ id: 3, name: 'sex scene' }] }), { dealbreakers: ['sexual_content'] })).toBe(false);
        expect(passesDealbreakers(film({ custom_parent_guide: { nudity: 'moderate' } }), { dealbreakers: ['sexual_content'] })).toBe(false);
        expect(passesDealbreakers(film({ custom_parent_guide: { violence: 'severe' } }), { dealbreakers: ['violence'] })).toBe(false);
        expect(passesDealbreakers(film({ custom_parent_guide: { violence: 'mild' } }), { dealbreakers: ['violence'] })).toBe(true);
    });

    it('"no subtitles" keeps only the user’s languages', () => {
        const prefs = { dealbreakers: ['subtitles'], languages: ['en', 'hi'] };
        expect(passesDealbreakers(film({ original_language: 'ko' }), prefs)).toBe(false);
        expect(passesDealbreakers(film({ original_language: 'hi' }), prefs)).toBe(true);
    });

    it('enforces the runtime limit but never drops unknown runtimes', () => {
        expect(passesDealbreakers(film({ runtime: 170 }), { maxRuntime: 150 })).toBe(false);
        expect(passesDealbreakers(film({ runtime: 140 }), { maxRuntime: 150 })).toBe(true);
        expect(passesDealbreakers(film({ runtime: null }), { maxRuntime: 120 })).toBe(true);
    });

    it('does not match "gore" inside other words', () => {
        expect(passesDealbreakers(film({ keywords: [{ id: 9, name: 'gorge crossing' }] }), { dealbreakers: ['gore'] })).toBe(true);
    });
});

describe('topSharedKeywords', () => {
    it('prefers keywords shared by several loved films and skips trivia', () => {
        const kw = topSharedKeywords([
            [{ id: 1, name: 'heist' }, { id: 2, name: 'duringcreditsstinger' }, { id: 3, name: 'time travel' }],
            [{ id: 1, name: 'heist' }, { id: 3, name: 'time travel' }, { id: 4, name: 'paris' }],
            [{ id: 1, name: 'heist' }, { id: 5, name: 'dream' }, { id: 3, name: 'time travel' }],
        ]);
        expect(kw.map((k) => k.name)).toEqual(['heist', 'time travel']);
        expect(kw.some((k) => k.name === 'duringcreditsstinger')).toBe(false);
    });

    it('falls back to single-film keywords when few are shared', () => {
        const kw = topSharedKeywords([[{ id: 1, name: 'a' }], [{ id: 2, name: 'b' }]]);
        expect(kw.length).toBe(2);
    });
});
