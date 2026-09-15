import { describe, it, expect } from 'vitest';
import {
    normaliseCompany, textMatches, companyMatches, numberMatches, scoreSet,
} from './score.js';

describe('companyMatches', () => {
    it('ignores legal-form suffixes', () => {
        expect(companyMatches('Zenthara Technologies Private Limited', 'Zenthara Technologies Pvt Ltd')).toBe(true);
        expect(companyMatches('Northgate Analytics, Inc.', 'Northgate Analytics')).toBe(true);
        expect(companyMatches('Lumenward B.V.', 'Lumenward')).toBe(true);
    });

    it('does not conflate different companies', () => {
        expect(companyMatches('Zenthara Technologies', 'Vireo Systems')).toBe(false);
    });

    it('treats an expected-absent company as matched only when nothing was returned', () => {
        expect(companyMatches(null, null)).toBe(true);
        expect(companyMatches(null, '')).toBe(true);
        // Inventing a company where the letter names none is a failure, not a pass.
        expect(companyMatches(null, 'Acme Corp')).toBe(false);
    });

    it('strips suffixes without eating the name', () => {
        expect(normaliseCompany('Brightloom Studio LLP')).toBe('brightloom studio');
    });
});

describe('textMatches', () => {
    it('is case and punctuation insensitive', () => {
        expect(textMatches('Senior Software Engineer', 'senior software engineer')).toBe(true);
        expect(textMatches('Vice President, Engineering', 'Vice President Engineering')).toBe(true);
    });

    it('accepts extra qualifiers on either side', () => {
        expect(textMatches('Bengaluru', 'Bengaluru, Karnataka')).toBe(true);
        expect(textMatches('Austin, Texas', 'Austin')).toBe(true);
    });

    it('rejects a different answer', () => {
        expect(textMatches('Bengaluru', 'Pune')).toBe(false);
    });

    it('requires blank for an expected-absent field', () => {
        expect(textMatches(null, null)).toBe(true);
        expect(textMatches(null, 'Mumbai')).toBe(false);
    });
});

describe('numberMatches', () => {
    it('allows small component-accounting differences', () => {
        expect(numberMatches(2400000, 2400000)).toBe(true);
        expect(numberMatches(2400000, 2420000)).toBe(true); // within 2%
    });

    it('fails a magnitude error', () => {
        // The exact bug class this eval must catch: unit-blind parsing.
        expect(numberMatches(500000, 5)).toBe(false);
        expect(numberMatches(14000000, 1.4)).toBe(false);
        expect(numberMatches(3200000, 32)).toBe(false);
    });

    it('fails a plausible-but-wrong figure', () => {
        expect(numberMatches(2400000, 1200000)).toBe(false); // basic, not CTC
    });

    it('handles absent expectations and bad types', () => {
        expect(numberMatches(null, null)).toBe(true);
        expect(numberMatches(null, 100)).toBe(false);
        expect(numberMatches(100, 'lots')).toBe(false);
        expect(numberMatches(100, NaN)).toBe(false);
    });
});

describe('scoreSet', () => {
    it('scores a perfect set as 1', () => {
        const s = scoreSet(['health insurance', 'provident fund'], ['Provident Fund', 'Health Insurance']);
        expect(s.recall).toBe(1);
        expect(s.precision).toBe(1);
        expect(s.f1).toBe(1);
    });

    it('separates missed from invented', () => {
        const s = scoreSet(['non_compete', 'bond'], ['non_compete', 'clawback']);
        expect(s.missed).toEqual(['bond']);
        expect(s.spurious).toEqual(['clawback']);
        expect(s.recall).toBeCloseTo(0.5);
        expect(s.precision).toBeCloseTo(0.5);
    });

    it('accepts objects with a name field, as benefits are returned', () => {
        const s = scoreSet(['health insurance'], [{ name: 'Group Health Insurance' }]);
        expect(s.recall).toBe(1);
    });

    it('gives full marks for correctly returning nothing', () => {
        expect(scoreSet([], []).f1).toBe(1);
    });

    it('penalises inventing items when none were expected', () => {
        // Hallucinated red flags must cost something, or the score rewards noise.
        const s = scoreSet([], ['non_compete']);
        expect(s.precision).toBe(0);
        expect(s.f1).toBe(0);
    });

    it('does not double-count one answer against two expectations', () => {
        const s = scoreSet(['leave', 'paid leave'], ['paid leave']);
        expect(s.matched.length).toBe(1);
    });

    it('survives a non-array actual', () => {
        expect(scoreSet(['x'], null).recall).toBe(0);
        expect(scoreSet(['x'], { a: 1 }).recall).toBe(0);
    });
});
