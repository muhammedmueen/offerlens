import { describe, it, expect } from 'vitest';
import {
    normaliseCompany, textMatches, companyMatches, numberMatches, scoreSet,
    annualiseBase, assertsBaseEqualsTotal, normaliseDuration, durationMatches,
    commonCaseIds,
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

describe('annualiseBase', () => {
    it('annualises a monthly base', () => {
        expect(annualiseBase({ amount: 45_000, period: 'monthly' })).toBe(540_000);
    });

    it('leaves an annual base alone', () => {
        expect(annualiseBase({ amount: 1_200_000, period: 'annual' })).toBe(1_200_000);
    });

    it('treats zero as "nothing extracted", not as zero pay', () => {
        // compensationSchema coerces an absent baseSalary to { amount: 0, period: 'annual' },
        // so a literal 0 is the schema's placeholder rather than a real figure.
        expect(annualiseBase({ amount: 0, period: 'annual' })).toBeNull();
    });

    it('survives missing and malformed input', () => {
        expect(annualiseBase(null)).toBeNull();
        expect(annualiseBase(undefined)).toBeNull();
        expect(annualiseBase({})).toBeNull();
        expect(annualiseBase({ amount: '1200000' })).toBeNull();
        expect(annualiseBase({ amount: Number.NaN, period: 'annual' })).toBeNull();
    });
});

describe('assertsBaseEqualsTotal', () => {
    it('flags base invented as equal to CTC when the letter states no basic', () => {
        // The live case: a ₹24,00,000 CTC letter with no basic came back base = 24,00,000.
        expect(assertsBaseEqualsTotal(null, 2_400_000, 2_400_000)).toBe(true);
    });

    it('does not flag a letter where base legitimately equals the total', () => {
        // "₹32 LPA fixed" is both the base and the whole package.
        expect(assertsBaseEqualsTotal(3_200_000, 3_200_000, 3_200_000)).toBe(false);
    });

    it('does not flag extraction that correctly declined to guess', () => {
        expect(assertsBaseEqualsTotal(null, 2_400_000, null)).toBe(false);
    });

    it('does not flag a base that differs from the total', () => {
        expect(assertsBaseEqualsTotal(null, 2_400_000, 1_000_000)).toBe(false);
    });
});

describe('durationMatches', () => {
    it('treats number words and digits as the same answer', () => {
        // The letters say "three months"; the ground truth says "3 months".
        expect(durationMatches('3 months', 'three months')).toBe(true);
        expect(durationMatches('6 months', 'six months')).toBe(true);
        expect(durationMatches('90 days', 'ninety days')).toBe(true);
    });

    it('collapses the "6 (six) months" duplication OCR and legal prose both produce', () => {
        expect(normaliseDuration('6 (six) months')).toBe('6 months');
        expect(durationMatches('6 months', '6 (six) months')).toBe(true);
    });

    it('does NOT equate different units', () => {
        // Whether a month is 30 days is not the scorer's call to make.
        expect(durationMatches('1 month', '30 days')).toBe(false);
        expect(durationMatches('60 days', '2 months')).toBe(false);
    });

    it('still distinguishes different durations', () => {
        expect(durationMatches('30 days', 'ninety days')).toBe(false);
        expect(durationMatches('3 months', 'six months')).toBe(false);
    });

    it('requires blank for an absent clause', () => {
        expect(durationMatches(null, null)).toBe(true);
        expect(durationMatches(null, '30 days')).toBe(false);
        expect(durationMatches('30 days', null)).toBe(false);
    });
});

describe('commonCaseIds', () => {
    interface Row { id: string; error: string | null }
    const ok = (id: string): Row => ({ id, error: null });
    const bad = (id: string): Row => ({ id, error: 'All AI models are currently busy.' });

    it('keeps only cases that succeeded in every pass', () => {
        // The real failure this exists for: a free-tier quota drains mid-run, so later
        // passes complete fewer cases. Averaging each pass over its own survivors made
        // pass 3's four easy cases read as a 92.6% high-water mark.
        const ids = commonCaseIds([
            [ok('a'), ok('b'), ok('c')],
            [ok('a'), bad('b'), ok('c')],
            [ok('a'), bad('b'), bad('c')],
        ]);
        expect([...ids]).toEqual(['a']);
    });

    it('returns everything when no pass errored', () => {
        const ids = commonCaseIds([[ok('a'), ok('b')], [ok('a'), ok('b')]]);
        expect([...ids].sort()).toEqual(['a', 'b']);
    });

    it('returns empty when a whole pass failed', () => {
        expect(commonCaseIds([[ok('a')], [bad('a')]]).size).toBe(0);
    });

    it('handles a single pass and no passes', () => {
        expect([...commonCaseIds([[ok('a'), bad('b')]])]).toEqual(['a']);
        expect(commonCaseIds([]).size).toBe(0);
    });

    it('does not credit a case missing from a later pass entirely', () => {
        // A pass cut short does not include the case at all, rather than including it with
        // an error. Absence must exclude it just the same.
        expect([...commonCaseIds([[ok('a'), ok('b')], [ok('a')]])]).toEqual(['a']);
    });
});
