import { describe, it, expect } from 'vitest';
import { describeMarketData } from './market-data.js';

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

const SURVEY = {
    dataSource: 'public_survey',
    marketRange: { p25: 1_800_000, p50: 2_300_000, p75: 2_900_000, p90: 3_500_000 },
    offerPercentile: 48,
    roleUsed: 'Backend Engineer',
    locationUsed: 'India (national)',
    disclaimer: 'Modelled from public surveys, not offers in your city. India-wide benchmark.',
};

describe('describeMarketData — public survey', () => {
    it('names the survey, permits citing it, and is never called VERIFIED', () => {
        const out = describeMarketData(SURVEY);
        expect(out).toContain('PUBLIC SURVEY');
        expect(out).toContain('Stack Overflow Developer Survey 2025');
        expect(out).toContain('You MAY cite');
        expect(out).toContain('Do NOT describe them as offers, submissions');
        expect(out).not.toMatch(/VERIFIED/i);
        expect(out).toContain('2300000');
        expect(out).toContain('48th percentile');
    });

    it('omits the percentile line when the percentile is null, never printing "?th"', () => {
        const out = describeMarketData({ ...SURVEY, offerPercentile: null });
        expect(out).not.toContain('percentile of survey respondents');
        expect(out).not.toContain('?th');
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
        for (const input of [REAL, ESTIMATED, SURVEY, null]) {
            const out = describeMarketData(input);
            expect(out).toMatch(/VERIFIED|AI ESTIMATE|PUBLIC SURVEY|NONE AVAILABLE/);
        }
    });

    it('treats an unknown dataSource as unverified rather than trusted', () => {
        const out = describeMarketData({ ...REAL, dataSource: 'something_new' });
        expect(out).toContain('AI ESTIMATE');
        expect(out).not.toContain('You MAY cite');
    });
});
