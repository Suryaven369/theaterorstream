import { describe, it, expect } from 'vitest';
import {
    parseVector, normalize, cosine, weightedMean, buildUserVector,
    bayesianQuality, runtimeFit, moodFit, contextFit, scoreCandidates, mmrSelect,
} from '../api/_lib/reco/scoring.js';

describe('vectors', () => {
    it('parses pgvector text and arrays', () => {
        expect(parseVector('[1,2,3]')).toEqual([1, 2, 3]);
        expect(parseVector([0.5, '0.25'])).toEqual([0.5, 0.25]);
        expect(parseVector('')).toBeNull();
        expect(parseVector('[a,b]')).toBeNull();
    });

    it('cosine is 1 for same direction, 0 for orthogonal, -1 for opposite', () => {
        expect(cosine([1, 0], [2, 0])).toBeCloseTo(1);
        expect(cosine([1, 0], [0, 3])).toBeCloseTo(0);
        expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
    });

    it('weighted mean respects weights', () => {
        expect(weightedMean([{ vector: [0, 0], weight: 1 }, { vector: [4, 4], weight: 3 }])).toEqual([3, 3]);
    });

    it('user vector = normalize(mean(loved) − 0.5·mean(disliked))', () => {
        const v = buildUserVector([{ vector: [1, 0] }, { vector: [1, 0] }], [{ vector: [0, 1] }]);
        const expected = normalize([1, -0.5]);
        expect(v[0]).toBeCloseTo(expected[0]);
        expect(v[1]).toBeCloseTo(expected[1]);
        expect(Math.hypot(...v)).toBeCloseTo(1);
        expect(buildUserVector([], [{ vector: [1, 0] }])).toBeNull();
    });
});

describe('bayesianQuality', () => {
    it('a 10/10 with 3 votes does not beat an 8.5 with 20k votes', () => {
        expect(bayesianQuality(10, 3)).toBeLessThan(bayesianQuality(8.5, 20000));
    });
    it('with no votes it sits at the prior', () => {
        expect(bayesianQuality(0, 0)).toBeCloseTo(0.66);
    });
});

describe('context fit', () => {
    it('runtime: full fit within time, decays when longer, neutral when unknown', () => {
        expect(runtimeFit(110, 120)).toBe(1);
        expect(runtimeFit(125, 120)).toBe(1); // within slack
        expect(runtimeFit(190, 120)).toBeLessThan(0.5);
        expect(runtimeFit(null, 120)).toBe(0.6);
    });

    it('mood: matching genres beat clashing ones; family avoids horror', () => {
        const comedy = { genre_ids: [35] };
        const horror = { genre_ids: [27] };
        expect(moodFit(comedy, { mood: 'light' })).toBeGreaterThan(moodFit(horror, { mood: 'light' }));
        expect(moodFit(horror, { mood: 'any', company: 'family' })).toBeLessThan(moodFit(horror, { mood: 'any', company: 'solo' }));
    });

    it('uses the watching pattern when no time is given', () => {
        const long = { runtime: 165, genre_ids: [18] };
        expect(contextFit(long, { pattern: 'weekends' })).toBeGreaterThan(contextFit(long, { pattern: 'weeknights' }));
    });
});

describe('scoreCandidates', () => {
    const user = normalize([1, 0, 0]);
    const close = { tmdb_id: '1', vector: [0.95, 0.1, 0], vote_average: 7.5, vote_count: 5000, runtime: 110, genre_ids: [53] };
    const far = { tmdb_id: '2', vector: [0, 0, 1], vote_average: 7.5, vote_count: 5000, runtime: 110, genre_ids: [53] };

    it('ranks the more similar film first when quality and fit are equal', () => {
        const [first] = scoreCandidates([far, close], user, { minutes: 120, mood: 'thrilling' });
        expect(first.tmdb_id).toBe('1');
        expect(first.scores.similarity).toBe(1);
    });

    it('a low-vote "perfect" score cannot win on quality alone', () => {
        const hype = { ...far, tmdb_id: '3', vote_average: 10, vote_count: 2 };
        const ranked = scoreCandidates([hype, close], user, { minutes: 120 });
        expect(ranked[0].tmdb_id).toBe('1');
    });
});

describe('mmrSelect', () => {
    it('avoids near-duplicates among the picks', () => {
        const items = [
            { tmdb_id: 'a', score: 1.0, vector: [1, 0] },
            { tmdb_id: 'a2', score: 0.99, vector: [0.999, 0.01] }, // near-duplicate of a
            { tmdb_id: 'b', score: 0.9, vector: [0, 1] },
        ];
        const picks = mmrSelect(items, 2, { lambda: 0.6 });
        expect(picks.map((p) => p.tmdb_id)).toEqual(['a', 'b']);
    });

    it('returns k items (or all when fewer)', () => {
        expect(mmrSelect([{ tmdb_id: 'x', score: 1, vector: [1] }], 3)).toHaveLength(1);
    });
});
