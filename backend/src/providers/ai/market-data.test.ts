import { describe, it, expect } from 'vitest';
import { describeMarketData } from './gemini.ai.js';

const REAL = {
    dataSource: 'crowdsourced',
    marketRange: { p25: 2_000_000, p50: 2_400_000, p75: 2_900_000, p90: 3_400_000 },
    offerPercentile: 62,
    roleUsed: 'senior software engineer',
    locationUsed: 'bangalore',
    disclaimer: 'Based on 9 verified submissions for this role and city.',
};

const ESTIMATED = {
    dataSource: 'ai_estimated',
    marketRange: { p25: 1_800_000, p50: 2_300_000, p75: 2_800_000, p90: 3_300_000 },
    offerPercentile: 55,
    disclaimer: 'Estimated from general market knowledge.',
};

describe('describeMarketData — verified submissions', () => {
    it('permits citing the figures and includes the percentile', () => {
        const out = describeMarketData(REAL);
        expect(out).toContain('VERIFIED');
        expect(out).toContain('You MAY cite these figures');
        expect(out).toContain('62');
        expect(out).toContain('2400000');
    });

    it('names the role and city the benchmark came from', () => {
        const out = describeMarketData(REAL);
        expect(out).toContain('senior software engineer');
        expect(out).toContain('bangalore');
    });
});

describe('describeMarketData — AI estimate', () => {
    it('forbids presenting the numbers as market data', () => {
        // The point of task 6. This output becomes an email a candidate may send to an
        // employer, so a fabricated statistic in it is actively harmful.
        const out = describeMarketData(ESTIMATED);
        expect(out).toContain('AI ESTIMATE');
        expect(out).toContain('do NOT present these numbers as market data');
        expect(out).not.toContain('You MAY cite');
    });

    it('redirects to arguing from the offer itself', () => {
        expect(describeMarketData(ESTIMATED)).toMatch(/offer's own terms/);
    });
});

describe('describeMarketData — absent', () => {
    it('forbids citing benchmarks at all', () => {
        for (const empty of [null, undefined, {}, { dataSource: 'crowdsourced' }]) {
            const out = describeMarketData(empty);
            expect(out).toContain('NONE AVAILABLE');
            expect(out).toContain('Do not cite salary benchmarks');
        }
    });
});

describe('describeMarketData — provenance is never lost', () => {
    it('every branch states where the numbers came from', () => {
        // A branch that renders bare numbers with no provenance is the bug this guards.
        for (const input of [REAL, ESTIMATED, null]) {
            const out = describeMarketData(input);
            expect(out).toMatch(/VERIFIED|AI ESTIMATE|NONE AVAILABLE/);
        }
    });

    it('treats an unknown dataSource as unverified rather than trusted', () => {
        const out = describeMarketData({ ...REAL, dataSource: 'something_new' });
        expect(out).toContain('AI ESTIMATE');
        expect(out).not.toContain('You MAY cite');
    });
});
