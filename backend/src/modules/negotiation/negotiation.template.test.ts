import { describe, it, expect } from 'vitest';
import { hasNegotiableDetail, buildNegotiationTemplate } from './negotiation.template.js';
import type { AnalysisResult } from '@/modules/analysis/analysis.types.js';

const extracted = (over: Record<string, unknown> = {}) => ({
    companyName: 'Halcyon Labs',
    role: 'Product Designer',
    compensation: {
        currency: 'INR',
        baseSalary: null,
        totalCTC: 1_500_000,
        variablePay: null,
        equity: null,
        otherComponents: [],
    },
    ...over,
}) as unknown as AnalysisResult['extractedData'];

describe('hasNegotiableDetail', () => {
    it('accepts a CTC-only letter', () => {
        // THE REGRESSION. Task 9 made baseSalary nullable so a single-figure letter stops
        // reporting CTC as basic. 6 of the 17 corpus letters look exactly like this, and the old
        // gate sent every one of them a fill-in-the-blanks email.
        expect(hasNegotiableDetail(extracted())).toBe(true);
    });

    it('accepts a letter that states basic but no CTC', () => {
        expect(hasNegotiableDetail(extracted({
            compensation: { currency: 'INR', baseSalary: { amount: 900_000, period: 'annual' }, totalCTC: null },
        }))).toBe(true);
    });

    it('rejects a letter with no company name', () => {
        expect(hasNegotiableDetail(extracted({ companyName: null }))).toBe(false);
    });

    it('rejects a letter with no usable figure', () => {
        expect(hasNegotiableDetail(extracted({
            compensation: { currency: 'INR', baseSalary: null, totalCTC: null },
        }))).toBe(false);
    });

    it('treats zero and non-finite amounts as absent', () => {
        // baseSalary is an object, so a truthiness test would pass on { amount: 0 }. That is the
        // shape the old coercion produced — `.transform(v => v ?? 0)` — before task 9.
        for (const amount of [0, NaN, Infinity, null, undefined, '900000']) {
            expect(hasNegotiableDetail(extracted({
                compensation: { currency: 'INR', baseSalary: { amount, period: 'annual' }, totalCTC: null },
            })), String(amount)).toBe(false);
        }
    });

    it('rejects a missing extraction outright', () => {
        expect(hasNegotiableDetail(null)).toBe(false);
        expect(hasNegotiableDetail(undefined)).toBe(false);
    });
});

describe('buildNegotiationTemplate', () => {
    it('fills in what is known', () => {
        const { subject, body } = buildNegotiationTemplate({
            companyName: 'Halcyon Labs',
            role: 'Product Designer',
            totalCtc: 1_500_000,
            currency: 'INR',
            focusAreas: ['salary'],
        });

        expect(subject).toContain('Product Designer');
        expect(subject).toContain('Halcyon Labs');
        expect(body).toContain('Halcyon Labs');
        expect(body).toContain('Product Designer');
        // Indian grouping, not 1,500,000.
        expect(body).toContain('₹15,00,000');
        expect(body).not.toContain('[COMPANY NAME]');
        expect(body).not.toContain('[POSITION]');
    });

    it('leaves brackets only where the candidate has to decide', () => {
        const { body } = buildNegotiationTemplate({
            companyName: 'Halcyon Labs', role: 'Product Designer', totalCtc: 1_500_000,
        });

        // A target figure is a decision, not a fact we can extract.
        expect(body).toContain('[YOUR TARGET FIGURE]');
        expect(body).toContain('[HIRING MANAGER NAME]');
        expect(body).toContain('[YOUR NAME]');
    });

    it('falls back to brackets when nothing is known', () => {
        const { subject, body } = buildNegotiationTemplate({});

        expect(subject).toBe('Re: Offer Letter Discussion — [YOUR NAME]');
        expect(body).toContain('[COMPANY NAME]');
        expect(body).toContain('[POSITION]');
        expect(body).toContain('[OFFERED SALARY]');
    });

    it('names a non-rupee currency instead of guessing a symbol', () => {
        const { body } = buildNegotiationTemplate({ totalCtc: 120_000, currency: 'USD' });
        expect(body).toContain('USD 120,000');
        expect(body).not.toContain('$');
    });

    it('writes one numbered point per focus area', () => {
        const { body } = buildNegotiationTemplate({
            focusAreas: ['salary', 'joining_bonus', 'pto'], totalCtc: 1_500_000,
        });

        // NEG-5: a CTC-only letter labels the figure as CTC, never as "base salary".
        expect(body).toContain('1. Total compensation');
        expect(body).toContain('current CTC: ₹15,00,000');
        expect(body).not.toContain('1. Base salary');
        expect(body).toMatch(/2\. A one-time joining bonus/);
        expect(body).toMatch(/3\. Paid leave/);
    });

    it('defaults to salary when no focus area was ticked', () => {
        // Nothing-known fallback keeps the "Base salary" label with the bracket placeholder.
        expect(buildNegotiationTemplate({}).body).toContain('1. Base salary');
    });

    it('anchors to base salary when it was extracted, not to a placeholder (NEG-9)', () => {
        const { body } = buildNegotiationTemplate({
            baseSalary: { amount: 900_000, period: 'annual' }, totalCtc: null,
        });
        expect(body).toContain('current base: ₹9,00,000');
        expect(body).not.toContain('[OFFERED SALARY]');
    });

    it('annualises a monthly base when anchoring (reuses annualBasicFrom)', () => {
        const { body } = buildNegotiationTemplate({
            baseSalary: { amount: 75_000, period: 'monthly' }, totalCtc: null,
        });
        // 75,000 * 12 = 900,000 → ₹9,00,000.
        expect(body).toContain('current base: ₹9,00,000');
    });

    it('does not leak prototype keys through a focus area (NEG-8)', () => {
        const { body } = buildNegotiationTemplate({ focusAreas: ['constructor'] });
        expect(body).not.toContain('native code');
        expect(body).not.toContain('function Object');
        expect(body).toContain('[WHAT YOU WOULD LIKE CHANGED]');
    });

    it('passes an unknown focus area through rather than dropping it', () => {
        // The frontend owns the checkbox list. A new value there must not silently produce a
        // shorter email than the user asked for.
        const { body } = buildNegotiationTemplate({ focusAreas: ['relocation_support'] });
        expect(body).toContain('relocation support');
    });

    it('varies the opening with tone', () => {
        const opener = (tone?: string) => buildNegotiationTemplate({ tone }).body;

        expect(opener('assertive')).toContain('I would like to discuss');
        expect(opener('friendly')).toContain('would love to discuss');
        expect(opener('professional')).toContain('respectfully discuss');
        // Unknown tone must not produce "undefined the compensation package".
        expect(opener('sarcastic')).toContain('respectfully discuss');
        expect(opener(undefined)).toContain('respectfully discuss');
    });
});
