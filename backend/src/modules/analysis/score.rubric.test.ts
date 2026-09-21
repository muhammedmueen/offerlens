import { describe, it, expect } from 'vitest';
import {
    calculateScore, scoreRedFlags, scoreSalary, scoreBenefits, scoreGrowth, scoreTransparency,
    labelFor, COMPONENT_WEIGHTS, type ScoreInput,
} from './score.rubric.js';
import type { RedFlag } from './analysis.types.js';
import { checkBenefits } from '@/modules/benefits/benefits.checklist.js';

const flag = (severity: RedFlag['severity'], type: RedFlag['type'] = 'other'): RedFlag => ({
    type, severity, title: 't', explanation: 'e', matchedText: 'm', suggestion: 's',
});

const benefit = (name: string, details = '') => ({
    name, value: null, details: details || null, isStandard: true,
});

/** A complete, unremarkable offer, used as the baseline to vary one axis at a time. */
const baseInput = (over: Partial<ScoreInput> = {}): ScoreInput => ({
    redFlags: [],
    benefitsChecklist: checkBenefits([
        benefit('Provident Fund'), benefit('Medical Insurance', 'cover of 5,00,000'),
        benefit('Paid Leave', '22 days'),
    ]),
    extractedData: {
        compensation: {
            currency: 'INR',
            baseSalary: { amount: 1_200_000, period: 'annual' },
            variablePay: null,
            equity: null,
            totalCTC: 2_400_000,
            otherComponents: [{ name: 'HRA', amount: 480_000, details: null }],
        },
        noticePeriod: '60 days',
    } as never,
    benefits: [benefit('Medical Insurance', 'cover of 5,00,000')] as never,
    offerPercentile: 60,
    ...over,
});

describe('scoreRedFlags', () => {
    it('is perfect with no flags', () => {
        expect(scoreRedFlags([]).value).toBe(100);
    });

    it('leaves almost nothing after two high-severity clauses', () => {
        // Calibration is deliberate. A weighted average is forgiving — at 30% weight even a zero
        // here costs only 30 points — so a gentler curve let a letter with a 12-month non-compete
        // AND no-notice probation still land in "fair".
        expect(scoreRedFlags([flag('high'), flag('high')]).value).toBe(20);
        expect(scoreRedFlags([flag('high'), flag('high'), flag('high')]).value).toBe(0);
    });

    it('never goes below zero however many flags', () => {
        expect(scoreRedFlags(Array.from({ length: 20 }, () => flag('high'))).value).toBe(0);
    });

    it('describes the severity mix, so a score can be explained', () => {
        const note = scoreRedFlags([flag('high'), flag('medium'), flag('medium')]).note;
        expect(note).toContain('3 red flag');
        expect(note).toContain('1 high');
        expect(note).toContain('2 medium');
    });

    it('tolerates malformed flags from AI-derived data', () => {
        expect(() => scoreRedFlags([{} as never, null as never])).not.toThrow();
    });
});

describe('scoreSalary', () => {
    it('uses the percentile directly', () => {
        // A 0-100 market position needs no transformation to become a 0-100 sub-score.
        expect(scoreSalary(72).value).toBe(72);
    });

    it('returns null when there is no verified data, rather than a zero', () => {
        // The old formula moved the score up to 20 points on a percentile the model invented,
        // which is worse than not scoring salary at all — it looks like evidence.
        expect(scoreSalary(null).value).toBeNull();
        expect(scoreSalary(Number.NaN).value).toBeNull();
    });
});

describe('scoreBenefits', () => {
    it('is perfect when everything is present', () => {
        const checklist = checkBenefits([
            benefit('Provident Fund'), benefit('Medical Insurance'), benefit('Paid Leave'),
            benefit('Gratuity'), benefit('Group Term Life'), benefit('Learning budget'),
            benefit('Flexible working'),
        ]);
        expect(scoreBenefits(checklist).value).toBe(100);
    });

    it('is zero when nothing is present', () => {
        expect(scoreBenefits(checkBenefits([])).value).toBe(0);
    });

    it('weights the three essentials above the optional extras', () => {
        // All three core and no extras should beat all four extras and no core, because the core
        // ones are near-universal and their absence is a real gap.
        const coreOnly = scoreBenefits(checkBenefits([
            benefit('Provident Fund'), benefit('Medical Insurance'), benefit('Paid Leave'),
        ])).value;
        const extrasOnly = scoreBenefits(checkBenefits([
            benefit('Gratuity'), benefit('Term Life'), benefit('Learning'), benefit('Remote'),
        ])).value;

        expect(coreOnly).toBe(75);
        expect(extrasOnly).toBe(25);
        expect(coreOnly).toBeGreaterThan(extrasOnly);
    });
});

describe('scoreGrowth', () => {
    it('credits equity and a learning budget independently', () => {
        const withLearning = checkBenefits([benefit('Learning and certification budget')]);
        const without = checkBenefits([]);
        const equity = { compensation: { equity: { type: 'ESOP', quantity: 6000 } } } as never;

        expect(scoreGrowth(null, without).value).toBe(0);
        expect(scoreGrowth(null, withLearning).value).toBe(50);
        expect(scoreGrowth(equity, without).value).toBe(50);
        expect(scoreGrowth(equity, withLearning).value).toBe(100);
    });

    it('says plainly that an absence is less upside, not a bad offer', () => {
        expect(scoreGrowth(null, checkBenefits([])).note).toContain('less measurable upside');
    });
});

describe('scoreTransparency', () => {
    it('is perfect when the letter states everything', () => {
        const result = scoreTransparency(
            baseInput().extractedData,
            [benefit('Insurance', 'cover of 5,00,000')] as never,
            [],
        );
        expect(result.value).toBe(100);
        expect(result.note).toContain('Everything a clear offer should state');
    });

    it('penalises a lump-sum CTC with nothing broken out', () => {
        const opaque = {
            compensation: {
                baseSalary: null, totalCTC: 2_400_000, otherComponents: [],
            },
            noticePeriod: null,
        } as never;

        const result = scoreTransparency(opaque, [benefit('Insurance')] as never, []);
        expect(result.value).toBe(20);
        expect(result.note).toContain('basic pay is not broken out');
        expect(result.note).toContain('no notice period is stated');
    });

    it('counts a vague-compensation flag against transparency', () => {
        const withFlag = scoreTransparency(
            baseInput().extractedData,
            [benefit('Insurance', 'cover of 5,00,000')] as never,
            [flag('medium', 'vague_compensation')],
        );
        expect(withFlag.value).toBe(80);
        expect(withFlag.note).toContain('discretion');
    });

    it('phrases gaps without double negatives', () => {
        // A first pass derived the missing-item text from the signal label and produced
        // "Not stated: pay not left to discretion", which is unreadable.
        const withFlag = scoreTransparency(
            baseInput().extractedData,
            [benefit('Insurance', 'cover of 5,00,000')] as never,
            [flag('medium', 'vague_compensation')],
        );
        expect(withFlag.note).not.toContain('not left to');
        expect(withFlag.note).not.toContain('Not stated');
    });
});

describe('calculateScore — weighting', () => {
    it('gives 100 when every component is perfect', () => {
        const perfect = calculateScore(baseInput({
            offerPercentile: 100,
            benefitsChecklist: checkBenefits([
                benefit('Provident Fund'), benefit('Medical Insurance'), benefit('Paid Leave'),
                benefit('Gratuity'), benefit('Term Life'), benefit('Learning'), benefit('Remote'),
            ]),
            extractedData: {
                ...baseInput().extractedData,
                compensation: {
                    ...baseInput().extractedData!.compensation,
                    equity: { type: 'RSU', quantity: 100 },
                },
            } as never,
        }));

        expect(perfect.score).toBe(100);
        expect(perfect.label).toBe('excellent');
    });

    it('gives 0 when every component is worst-case', () => {
        // A genuine worst case needs `vague_compensation` among the flags. Without it, the
        // transparency signal "pay not left to discretion" legitimately passes and the total
        // floors at 2 rather than 0 — which is the rubric being right, not generous.
        const worst = calculateScore({
            redFlags: [flag('high', 'vague_compensation'), flag('high'), flag('high')],
            benefitsChecklist: checkBenefits([]),
            extractedData: {
                compensation: { baseSalary: null, totalCTC: null, otherComponents: [] },
                noticePeriod: null,
            } as never,
            benefits: [] as never,
            offerPercentile: 0,
        });

        expect(worst.score).toBe(0);
        expect(worst.label).toBe('poor');
    });

    it('does not reach 0 on a bad offer that is at least candid', () => {
        // Guards the distinction the transparency component exists to make: an offer can be
        // hostile and still honest about it, and that is not the same as hostile and evasive.
        const hostileButClear = calculateScore({
            redFlags: [flag('high'), flag('high'), flag('high')],
            benefitsChecklist: checkBenefits([]),
            extractedData: {
                compensation: { baseSalary: null, totalCTC: null, otherComponents: [] },
                noticePeriod: null,
            } as never,
            benefits: [] as never,
            offerPercentile: 0,
        });

        expect(hostileButClear.score).toBeGreaterThan(0);
        expect(hostileButClear.score).toBeLessThan(10);
    });

    it('applies the agreed 30/30/20/10/10 weights', () => {
        expect(COMPONENT_WEIGHTS).toEqual({
            redFlags: 30, salary: 30, benefits: 20, growth: 10, transparency: 10,
        });
        expect(Object.values(COMPONENT_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    });

    it('is the exact weighted mean of its components', () => {
        // The score must be reconstructible from what is displayed, or it is not auditable.
        const result = calculateScore(baseInput());
        const expected = result.components
            .filter((c) => c.value !== null)
            .reduce((sum, c) => sum + c.value! * COMPONENT_WEIGHTS[c.key], 0) / 100;

        expect(result.score).toBe(Math.round(expected));
    });

    it('explains every component, scored or not', () => {
        for (const component of calculateScore(baseInput()).components) {
            expect(component.note.length, component.key).toBeGreaterThan(10);
        }
    });
});

describe('calculateScore — redistribution', () => {
    it('spreads the salary weight when there are no verified submissions', () => {
        const result = calculateScore(baseInput({ offerPercentile: null }));

        const salary = result.components.find((c) => c.key === 'salary')!;
        expect(salary.value).toBeNull();
        expect(salary.weight).toBe(0);

        // 30 points spread over the remaining 70 scales each by 100/70.
        expect(result.components.find((c) => c.key === 'redFlags')!.weight).toBe(43);
        expect(result.components.find((c) => c.key === 'benefits')!.weight).toBe(29);
        expect(result.components.find((c) => c.key === 'growth')!.weight).toBe(14);

        const applied = result.components.reduce((sum, c) => sum + c.weight, 0);
        expect(applied).toBeGreaterThanOrEqual(99);
        expect(applied).toBeLessThanOrEqual(101);
    });

    it('marks the method fallback and carries the roadmap note', () => {
        const result = calculateScore(baseInput({ offerPercentile: null }));
        expect(result.method).toBe('fallback');
        expect(result.note).toContain('Score based on limited market data');
    });

    it('marks the method standard and no note when everything scored', () => {
        const result = calculateScore(baseInput({ offerPercentile: 60 }));
        expect(result.method).toBe('standard');
        expect(result.note).toBeNull();
    });

    it('does not let an absent component drag the score down', () => {
        // The point of redistribution: a gap in OUR data must not read as a defect in the offer.
        const withSalary = calculateScore(baseInput({ offerPercentile: 50 }));
        const withoutSalary = calculateScore(baseInput({ offerPercentile: null }));

        // A perfectly average salary and no salary data should land close together, not 15 apart.
        expect(Math.abs(withSalary.score - withoutSalary.score)).toBeLessThan(15);
    });
});

describe('labelFor', () => {
    it('maps the documented bands', () => {
        expect(labelFor(95)).toBe('excellent');
        expect(labelFor(90)).toBe('excellent');
        expect(labelFor(75)).toBe('good');
        expect(labelFor(60)).toBe('fair');
        expect(labelFor(40)).toBe('weak');
        expect(labelFor(39)).toBe('poor');
        expect(labelFor(0)).toBe('poor');
    });
});

describe('the interim formula it replaces', () => {
    it('no longer starts a featureless offer at "good"', () => {
        // The old formula began at 70 and nudged, so a letter with nothing wrong and nothing good
        // scored "good" by default. A bare offer should not.
        const bare = calculateScore({
            redFlags: [],
            benefitsChecklist: checkBenefits([]),
            extractedData: {
                compensation: { baseSalary: null, totalCTC: 500_000, otherComponents: [] },
                noticePeriod: null,
            } as never,
            benefits: [] as never,
            offerPercentile: null,
        });

        // No flags is genuinely good, so this is not zero — but nothing else is present.
        expect(bare.score).toBeLessThan(60);
        expect(['weak', 'poor', 'fair']).toContain(bare.label);
    });
});
