import { describe, it, expect } from 'vitest';
import {
    blendQuality, bigScreenScore, confidenceLabel, decideVerdict, buildVerdict,
} from '../api/_lib/reco/tos-verdict.js';

const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

describe('blendQuality (Bayesian)', () => {
    it('a few early 10/10 votes cannot push a film to the top', () => {
        const { quality } = blendQuality({ tmdbAvg: 10, tmdbVotes: 4 });
        expect(quality).toBeLessThan(6.7);
    });
    it('lots of votes dominate the prior', () => {
        expect(blendQuality({ tmdbAvg: 8.4, tmdbVotes: 30000 }).quality).toBeGreaterThan(8.3);
    });
    it('our users and critics move the score', () => {
        const base = blendQuality({ tmdbAvg: 7, tmdbVotes: 300 }).quality;
        expect(blendQuality({ tmdbAvg: 7, tmdbVotes: 300, communityAvg: 9.5, communityCount: 20 }).quality).toBeGreaterThan(base);
        expect(blendQuality({ tmdbAvg: 7, tmdbVotes: 300, criticScore10: 4 }).quality).toBeLessThan(base);
    });
});

describe('bigScreenScore', () => {
    it('spectacle beats dialogue-driven', () => {
        const scifi = bigScreenScore({ genre_ids: [878, 12, 28], keywords: [{ name: 'space' }], runtime: 166 });
        const romcom = bigScreenScore({ genre_ids: [35, 10749], runtime: 98 });
        expect(scifi).toBeGreaterThan(0.75);
        expect(romcom).toBeLessThan(0.3);
    });
});

describe('confidence', () => {
    it('labels thin evidence as early reviews', () => {
        expect(confidenceLabel(40)).toBe('early reviews');
        expect(confidenceLabel(800)).toBe('moderate');
        expect(confidenceLabel(20000)).toBe('high');
    });
});

describe('decideVerdict', () => {
    const base = { quality: 7.6, bigScreen: 0.8, personalFit: null, confidence: 'high', releaseDate: daysAgo(10), streamingNow: false };

    it('in theaters + good + spectacle → Theater', () => {
        expect(decideVerdict(base).verdict).toBe('Theater');
    });
    it('in theaters but intimate → Wait for OTT', () => {
        expect(decideVerdict({ ...base, bigScreen: 0.25 }).verdict).toBe('Wait for OTT');
    });
    it('a must-see film earns the theater with less spectacle', () => {
        expect(decideVerdict({ ...base, quality: 8.2, bigScreen: 0.4 }).verdict).toBe('Theater');
    });
    it('weak reviews → Skip', () => {
        expect(decideVerdict({ ...base, quality: 5.2 }).verdict).toBe('Skip');
    });
    it('old or already streaming → Wait for OTT, never Theater', () => {
        expect(decideVerdict({ ...base, releaseDate: daysAgo(400) }).verdict).toBe('Wait for OTT');
        expect(decideVerdict({ ...base, streamingNow: true }).verdict).toBe('Wait for OTT');
    });
    it('poor personal fit downgrades a marginal theater call', () => {
        expect(decideVerdict({ ...base, quality: 7.1, personalFit: 0.25 }).verdict).toBe('Wait for OTT');
    });
    it('mentions early reviews when confidence is low', () => {
        expect(decideVerdict({ ...base, confidence: 'early reviews' }).reason).toMatch(/early reviews/);
    });
});

describe('buildVerdict', () => {
    it('returns the full shape', () => {
        const v = buildVerdict({
            movie: { vote_average: 7.9, vote_count: 9000, genre_ids: [28, 878], runtime: 150, release_date: daysAgo(5) },
            community: { avg: 8.5, count: 12 },
            aiOverall: 8,
            personalFit: 0.8,
        });
        expect(v).toMatchObject({ verdict: 'Theater', confidence: 'high' });
        expect(v.qualityScore).toBeGreaterThan(7.5);
        expect(v.bigScreenScore).toBeGreaterThan(0.6);
        expect(v.personalFit).toBe(0.8);
        expect(typeof v.reason).toBe('string');
    });
});
