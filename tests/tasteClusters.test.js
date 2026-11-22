import { describe, it, expect } from 'vitest';
import {
    buildTasteClusters, applyDislikesToClusters, clusterFit, clusterTopGenres,
    interleaveByCluster, familiarityTarget, familiarityFit, scoreCandidates,
} from '../api/_lib/reco/scoring.js';
import { buildTasteSignals } from '../api/_lib/reco/signals.js';

// Two clearly separate tastes in 3-D: "horror" near x, "rom-com" near y.
const horror = (i) => ({ id: `h${i}`, vector: [1, 0.05 * i, 0], weight: 1 });
const romcom = (i) => ({ id: `r${i}`, vector: [0.05 * i, 1, 0], weight: 1 });

describe('taste clusters', () => {
    it('splits two separate tastes into two clusters', () => {
        const items = [...[1, 2, 3, 4, 5, 6].map(horror), ...[1, 2, 3, 4, 5, 6].map(romcom)];
        const clusters = buildTasteClusters(items, { maxK: 4, minPerCluster: 6 });
        expect(clusters).toHaveLength(2);
        const sets = clusters.map((c) => c.members.map((id) => id[0]));
        expect(sets.every((s) => new Set(s).size === 1)).toBe(true);
        expect(clusters[0].weight + clusters[1].weight).toBeCloseTo(1);
    });

    it('uses one cluster when history is short', () => {
        const clusters = buildTasteClusters([1, 2, 3].map(horror), { minPerCluster: 6 });
        expect(clusters).toHaveLength(1);
    });

    it('is deterministic', () => {
        const items = [...[1, 2, 3, 4, 5, 6].map(horror), ...[1, 2, 3, 4, 5, 6].map(romcom)];
        expect(buildTasteClusters(items)).toEqual(buildTasteClusters(items));
    });

    it('scores a film by the cluster it fits best, not the average', () => {
        const items = [...[1, 2, 3, 4, 5, 6].map(horror), ...[1, 2, 3, 4, 5, 6].map(romcom)];
        const clusters = buildTasteClusters(items);
        const fit = clusterFit(clusters, [0, 1, 0]);
        expect(fit.cosine).toBeGreaterThan(0.9);
        expect(clusters[fit.cluster].members[0][0]).toBe('r');
    });

    it('pulls clusters away from dislikes', () => {
        const clusters = buildTasteClusters([1, 2, 3, 4, 5, 6].map(horror));
        const pulled = applyDislikesToClusters(clusters, [{ vector: [0, 0, 1], weight: 1 }]);
        expect(pulled[0].centroid[2]).toBeLessThan(0);
    });

    it('finds each cluster\'s defining genres, skipping Drama when others exist', () => {
        const clusters = [{ members: ['a', 'b'] }, { members: ['c'] }];
        const genres = new Map([['a', [27, 18, 53]], ['b', [27, 18]], ['c', [35, 10749]]]);
        expect(clusterTopGenres(clusters, genres)).toEqual([[27, 53], [35, 10749]]);
    });
});

describe('interleaveByCluster', () => {
    it('gives every cluster its share instead of letting the biggest take all slots', () => {
        const clusters = [{ weight: 0.75 }, { weight: 0.25 }];
        const scored = [
            ...Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, _cluster: 0, score: 1 - i * 0.01 })),
            ...Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, _cluster: 1, score: 0.5 - i * 0.01 })),
        ];
        const out = interleaveByCluster(scored, clusters, 8, { floor: 0.15 });
        expect(out).toHaveLength(8);
        expect(out.filter((x) => x._cluster === 1)).toHaveLength(2);
        // Within a cluster, best-scored first.
        expect(out.filter((x) => x._cluster === 0).map((x) => x.id)).toEqual(['a0', 'a1', 'a2', 'a3', 'a4', 'a5']);
    });

    it('passes a single cluster through unchanged', () => {
        const scored = [{ id: 1 }, { id: 2 }, { id: 3 }];
        expect(interleaveByCluster(scored, [{ weight: 1 }], 2)).toEqual([{ id: 1 }, { id: 2 }]);
    });
});

describe('familiarity', () => {
    it('targets the median fame of the user\'s films', () => {
        expect(familiarityTarget([10000, 9999, 10001, 10000, 10000])).toBeCloseTo(4, 1);
        expect(familiarityTarget([100, 200])).toBeNull();
    });

    it('fits best at the target and falls off either side', () => {
        expect(familiarityFit(10000, 4)).toBeCloseTo(1, 2);
        expect(familiarityFit(100, 4)).toBeLessThan(0.1);
        expect(familiarityFit(1000000, 4)).toBeLessThan(0.1);
        expect(familiarityFit(500, null)).toBe(0.5);
    });

    it('lifts films as well-known as the user\'s usual ones when weighted', () => {
        const candidates = [
            { tmdb_id: '1', vector: [1, 0], vote_average: 7, vote_count: 10000 },
            { tmdb_id: '2', vector: [1, 0], vote_average: 7, vote_count: 50 },
        ];
        const cfg = { weights: { similarity: 0.5, quality: 0.25, contextFit: 0, familiarity: 0.25 }, quality: { priorVotes: 0, priorMean: 6.6 }, context: { runtimeWeight: 0.6, moodWeight: 0.4, runtimeSlackMin: 10, runtimePenaltyPer30: 0.35, unknownRuntimeFit: 0.6, defaultMinutesByPattern: {}, defaultMinutes: 140 }, bonuses: { onYourServices: 0, freshRelease: 0 } };
        const ranked = scoreCandidates(candidates, [1, 0], {}, cfg, { familiarity: 4 });
        expect(ranked[0].tmdb_id).toBe('1');
    });
});

describe('taste signals', () => {
    const now = new Date('2026-11-22').getTime();
    const at = '2026-11-20';

    it('counts every watched film as a weaker positive', () => {
        const { loved } = buildTasteSignals([{ id: '1', at, watched: true }], now);
        expect(loved).toHaveLength(1);
        expect(loved[0].weight).toBeCloseTo(0.5, 1);
    });

    it('judges ratings on the user\'s own scale', () => {
        // Generous rater: 7 is their low, 9.5 their high.
        const films = [
            { id: 'low', at, watched: true, tosRating: 7 },
            { id: 'mid1', at, watched: true, tosRating: 8.8 },
            { id: 'mid2', at, watched: true, tosRating: 9 },
            { id: 'high', at, watched: true, tosRating: 9.5 },
        ];
        const { loved, disliked } = buildTasteSignals(films, now);
        expect(disliked.map((x) => x.id)).toContain('low');
        expect(loved[0].id).toBe('high');
    });

    it('treats likes as strong and dislikes as negatives', () => {
        const { loved, disliked } = buildTasteSignals([
            { id: 'liked', at, liked: true },
            { id: 'bad', at, watched: true, disliked: true },
        ], now);
        expect(loved[0]).toMatchObject({ id: 'liked' });
        expect(loved[0].weight).toBeGreaterThan(1);
        expect(disliked.map((x) => x.id)).toEqual(['bad']);
    });

    it('gives older history less weight, with a floor', () => {
        const { loved } = buildTasteSignals([
            { id: 'new', at: '2026-11-21', liked: true },
            { id: 'old', at: '2023-01-01', liked: true },
        ], now);
        const w = Object.fromEntries(loved.map((x) => [x.id, x.weight]));
        expect(w.new).toBeGreaterThan(w.old);
        expect(w.old).toBeGreaterThan(0.3);
    });
});
