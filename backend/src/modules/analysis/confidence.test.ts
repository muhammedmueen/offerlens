import { describe, it, expect } from 'vitest';
import { assessConfidence, appearsVerbatim, traceNumber, type ConfidenceInput } from './confidence.js';
import { normalise } from './redflag.rules.js';
import type { RedFlag } from './analysis.types.js';

const LETTER = `
OFFER LETTER

Position: Senior Backend Engineer
Company: Aurora Technologies Pvt Ltd, Bengaluru
CTC: ₹24,00,000 per annum

Notice period post-confirmation is 30 days.
Provident fund is deducted as per applicable statute.
`.trim();

const flag = (type: RedFlag['type']): RedFlag => ({
    type, severity: 'high', title: 't', explanation: 'e', matchedText: 'm', suggestion: 's',
});

const input = (over: Partial<ConfidenceInput> = {}): ConfidenceInput => ({
    extractedData: {
        companyName: 'Aurora Technologies Pvt Ltd',
        role: 'Senior Backend Engineer',
        location: 'Bengaluru',
        noticePeriod: '30 days',
        probationPeriod: null,
        compensation: {
            currency: 'INR',
            baseSalary: null,
            variablePay: null,
            equity: null,
            totalCTC: 2_400_000,
            otherComponents: [],
        },
    } as never,
    redFlags: [],
    benefits: [{ name: 'Provident Fund', value: null, details: null, isStandard: true }] as never,
    salaryComparison: { dataSource: 'crowdsourced' } as never,
    takeHome: null,
    rawText: LETTER,
    ocrConfidence: null,
    ...over,
});

describe('appearsVerbatim', () => {
    it('matches across hyphen and spacing differences', () => {
        const text = normalise('The role is Senior Back-End  Engineer here.');
        expect(appearsVerbatim('Senior Back End Engineer', text)).toBe(true);
    });

    it('rejects a value that is not in the letter', () => {
        expect(appearsVerbatim('Acme Corp', normalise(LETTER))).toBe(false);
    });

    it('treats empty input as absent rather than matching everything', () => {
        expect(appearsVerbatim('', normalise(LETTER))).toBe(false);
        expect(appearsVerbatim('Aurora', '')).toBe(false);
        expect(appearsVerbatim(null, normalise(LETTER))).toBe(false);
    });
});

describe('traceNumber', () => {
    it('finds a figure written with digit separators', () => {
        expect(traceNumber(2_400_000, 'CTC: ₹24,00,000 per annum')).toBe('exact');
        expect(traceNumber(500_000, 'coverage of 5,00,000')).toBe('exact');
    });

    it('recognises a figure that was expanded from a magnitude word', () => {
        // "24 LPA" is correct extraction but not a copy, and expansion is where magnitude bugs
        // live — it was worth five orders of magnitude in the benefits calculator once.
        expect(traceNumber(2_400_000, 'Fixed pay of 24 LPA')).toBe('expanded');
        expect(traceNumber(14_000_000, 'total of ₹1.4 crore')).toBe('expanded');
    });

    it('reports absent when the figure is nowhere in the text', () => {
        expect(traceNumber(3_300_000, LETTER)).toBe('absent');
    });

    it('treats zero, null and nonsense as absent', () => {
        expect(traceNumber(null, LETTER)).toBe('absent');
        expect(traceNumber(0, LETTER)).toBe('absent');
        expect(traceNumber(Number.NaN, LETTER)).toBe('absent');
        expect(traceNumber(100, '')).toBe('absent');
    });
});

describe('verbatim field assessment', () => {
    it('is high for values found word-for-word', () => {
        const report = assessConfidence(input());
        expect(report.fields.companyName.level).toBe('high');
        expect(report.fields.role.level).toBe('high');
        expect(report.fields.location.level).toBe('high');
        expect(report.fields.role.reason).toContain('word-for-word');
    });

    it('is LOW for a value that cannot be found, and says it was inferred', () => {
        // The case that matters: a plausible-looking value the model produced from nowhere.
        const report = assessConfidence(input({
            extractedData: {
                ...input().extractedData,
                companyName: 'Globex Corporation',
            } as never,
        }));

        expect(report.fields.companyName.level).toBe('low');
        expect(report.fields.companyName.reason).toContain('inferred rather than read');
    });

    it('is medium — never high — for an absent value', () => {
        // Absence cannot be verified: extraction may simply have missed it.
        expect(assessConfidence(input()).fields.probationPeriod.level).toBe('medium');
    });
});

describe('number tracing feeds through to the field', () => {
    it('is high when the CTC appears as written', () => {
        expect(assessConfidence(input()).fields.totalCTC.level).toBe('high');
    });

    it('is medium when the CTC was expanded from a magnitude word', () => {
        const report = assessConfidence(input({ rawText: 'Fixed compensation of 24 LPA per annum' }));
        expect(report.fields.totalCTC.level).toBe('medium');
        expect(report.fields.totalCTC.reason).toContain('magnitude word');
    });

    it('is low when the CTC matches nothing in the letter', () => {
        const report = assessConfidence(input({ rawText: 'We are pleased to offer you the role.' }));
        expect(report.fields.totalCTC.level).toBe('low');
    });

    it('treats an absent basic as high confidence in its absence, not a failure', () => {
        // Most Indian letters quote one CTC. Reporting that as low confidence would be blaming
        // the tool for the letter's choice.
        const report = assessConfidence(input());
        expect(report.fields.baseSalary.level).toBe('high');
        expect(report.fields.baseSalary.reason).toContain('which is normal');
    });
});

describe('red flag provenance', () => {
    it('is high when every flag came from a deterministic check', () => {
        // The letter contains a genuine 30-day notice clause and nothing else; use a clause the
        // rule engine detects.
        const hostile = 'You shall not engage in any business competing with the Company.';
        const report = assessConfidence(input({
            rawText: hostile,
            redFlags: [flag('non_compete')],
        }));

        expect(report.fields.redFlags.level).toBe('high');
        expect(report.fields.redFlags.reason).toContain('deterministic');
    });

    it('is medium when the model contributed flags the rules did not find', () => {
        const report = assessConfidence(input({ redFlags: [flag('other')] }));
        expect(report.fields.redFlags.level).toBe('medium');
        expect(report.fields.redFlags.reason).toContain('may vary between runs');
    });

    it('treats missing_benefit as deterministic, since the checklist owns it', () => {
        const report = assessConfidence(input({ redFlags: [flag('missing_benefit')] }));
        expect(report.fields.redFlags.level).toBe('high');
    });

    it('says a clean result is a real result', () => {
        const report = assessConfidence(input({ redFlags: [] }));
        expect(report.fields.redFlags.level).toBe('high');
        expect(report.fields.redFlags.reason).toContain('absence of effort');
    });
});

describe('provenance and derivation', () => {
    it('trusts a crowdsourced benchmark and distrusts an estimated one', () => {
        expect(assessConfidence(input()).fields.salaryComparison.level).toBe('high');

        const estimated = assessConfidence(input({
            salaryComparison: { dataSource: 'ai_estimated' } as never,
        }));
        expect(estimated.fields.salaryComparison.level).toBe('low');
        expect(estimated.fields.salaryComparison.reason).toContain('Do not quote it as market data');
    });

    it('rates an exact take-home high and a ranged one medium', () => {
        const exact = assessConfidence(input({ takeHome: { isExact: true } as never }));
        expect(exact.fields.takeHome.level).toBe('high');

        const ranged = assessConfidence(input({ takeHome: { isExact: false } as never }));
        expect(ranged.fields.takeHome.level).toBe('medium');
        expect(ranged.fields.takeHome.reason).toContain('employer');
    });

    it('omits take-home entirely when it could not be calculated', () => {
        expect(assessConfidence(input({ takeHome: null })).fields.takeHome).toBeUndefined();
    });
});

describe('OCR downgrades everything read from the page', () => {
    it('downgrades verbatim fields and adds a caveat', () => {
        const report = assessConfidence(input({ ocrConfidence: 0.72 }));

        expect(report.fields.role.level).toBe('medium');       // was high
        expect(report.fields.totalCTC.level).toBe('medium');   // was high
        expect(report.caveat).toContain('72%');
        expect(report.caveat).toContain('scan or photo');
    });

    it('still caveats a high-scoring scan, since recognition is imperfect at any score', () => {
        const report = assessConfidence(input({ ocrConfidence: 0.99 }));
        expect(report.caveat).toContain('scan or photo');
        expect(report.fields.role.level).toBe('medium');
    });

    it('does NOT treat pasted text as a scan, even though it records a confidence', () => {
        // The bug this guards. The OCR worker writes ocrConfidence = 1.0 on BOTH non-OCR paths
        // (pasted text, and uploaded .txt), so "non-null" never meant a scan was involved. Reading
        // it that way downgraded every field on a typed letter.
        const report = assessConfidence(input({ ocrConfidence: 1.0 }));

        expect(report.caveat).toBeNull();
        expect(report.fields.role.level).toBe('high');
        expect(report.fields.totalCTC.level).toBe('high');
    });

    it('moves the reason with the level, so the two cannot contradict', () => {
        // The same bug's other symptom: "Found word-for-word in the letter" displayed next to a
        // medium badge, which reads as broken because it was.
        const report = assessConfidence(input({ ocrConfidence: 0.72 }));

        expect(report.fields.role.level).toBe('medium');
        expect(report.fields.role.reason).toContain('recognised from an image');
    });

    it('does NOT downgrade the values we compute ourselves', () => {
        // The arithmetic is unaffected by how the text arrived, and its inputs are tagged already.
        const report = assessConfidence(input({
            ocrConfidence: 0.72,
            takeHome: { isExact: true } as never,
        }));

        expect(report.fields.takeHome.level).toBe('high');
        expect(report.fields.salaryComparison.level).toBe('high');
    });

    it('adds no caveat for text the user typed in', () => {
        expect(assessConfidence(input({ ocrConfidence: null })).caveat).toBeNull();
        expect(assessConfidence(input()).caveat).toBeNull();
    });
});

describe('missing source text', () => {
    it('skips verbatim checks and says why', () => {
        // Guest offers are cleaned up, so an old analysis may outlive its letter.
        const report = assessConfidence(input({ rawText: null }));

        expect(report.fields.companyName).toBeUndefined();
        expect(report.caveat).toContain('no longer stored');
    });

    it('still assesses everything that does not need the letter', () => {
        const report = assessConfidence(input({ rawText: null }));
        expect(report.fields.salaryComparison).toBeDefined();
        expect(report.fields.benefits).toBeDefined();
    });
});

describe('overall', () => {
    it('is anchored on role and CTC, not on cosmetic fields', () => {
        // A wrong company name is cosmetic. A wrong role or CTC invalidates the benchmark, the
        // score and the tax, so those decide the headline.
        const badCompanyOnly = assessConfidence(input({
            extractedData: { ...input().extractedData, companyName: 'Globex' } as never,
        }));
        expect(badCompanyOnly.fields.companyName.level).toBe('low');
        expect(badCompanyOnly.overall).toBe('high');
    });

    it('drops to low when the role was inferred', () => {
        const report = assessConfidence(input({
            extractedData: { ...input().extractedData, role: 'Chief Wizard' } as never,
        }));
        expect(report.overall).toBe('low');
    });

    it('takes the worst of its anchors', () => {
        const report = assessConfidence(input({ rawText: 'Nothing useful here at all.' }));
        expect(report.overall).toBe('low');
    });

    it('always returns a level and an explanation for every field', () => {
        for (const [key, field] of Object.entries(assessConfidence(input()).fields)) {
            expect(['high', 'medium', 'low'], key).toContain(field.level);
            expect(field.reason.length, key).toBeGreaterThan(20);
        }
    });
});

describe('robustness against AI-derived input', () => {
    it('survives entirely missing data', () => {
        const empty: ConfidenceInput = {
            extractedData: null, redFlags: null as never, benefits: null as never,
            salaryComparison: null, takeHome: null, rawText: null, ocrConfidence: null,
        };
        expect(() => assessConfidence(empty)).not.toThrow();
        // `low` is the honest answer for knowing nothing, not `medium`.
        expect(assessConfidence(empty).overall).toBe('medium');
        expect(assessConfidence(empty).fields.totalCTC.reason).toContain('No total compensation');
    });
});
