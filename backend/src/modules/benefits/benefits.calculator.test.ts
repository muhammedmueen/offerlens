import { describe, it, expect } from 'vitest';
import { extractMoney, extractCount, calculateBenefitValues } from './benefits.calculator.js';
import type { Benefit, Compensation } from '@/modules/analysis/analysis.types.js';

describe('extractMoney', () => {
    it('handles Indian magnitude words', () => {
        // The reported bug: these all collapsed to their leading digits.
        expect(extractMoney('₹5 lakh')).toBe(500_000);
        expect(extractMoney('5 Lakhs')).toBe(500_000);
        expect(extractMoney('2.5L')).toBe(250_000);
        expect(extractMoney('10 LPA')).toBe(1_000_000);
        expect(extractMoney('1.2 crore')).toBe(12_000_000);
        expect(extractMoney('2 Cr')).toBe(20_000_000);
        expect(extractMoney('25k')).toBe(25_000);
    });

    it('still handles digit-grouped amounts', () => {
        expect(extractMoney('₹5,00,000')).toBe(500_000);   // Indian grouping
        expect(extractMoney('$500,000')).toBe(500_000);     // Western grouping
        expect(extractMoney('coverage of INR 5,00,000')).toBe(500_000);
    });

    it('returns a bare number when no unit is present', () => {
        expect(extractMoney('1800000')).toBe(1_800_000);
    });

    it('returns null when there is no number', () => {
        expect(extractMoney('')).toBeNull();
        expect(extractMoney('provided as per policy')).toBeNull();
    });
});

describe('extractCount', () => {
    it('never applies a magnitude multiplier', () => {
        // "18 days" must not become 1,800,000 just because a unit-aware parser saw a
        // letter it recognised.
        expect(extractCount('18 days of paid leave annually')).toBe(18);
        expect(extractCount('24 days')).toBe(24);
        expect(extractCount('6 months')).toBe(6);
    });
});

const comp = (base: number | null): Compensation => ({
    currency: 'INR',
    // `null` needs no cast now that Compensation.baseSalary is genuinely nullable. It used to
    // be `as never`, which is the shape of a type lying about the data.
    baseSalary: base === null ? null : { amount: base, period: 'annual' },
    variablePay: null,
    equity: null,
    totalCTC: base,
    otherComponents: [],
});

const benefit = (name: string, details: string): Benefit => ({
    name, value: null, details, isStandard: true,
});

describe('calculateBenefitValues', () => {
    it('values PTO against the daily rate when base salary is known', () => {
        const [row] = calculateBenefitValues(
            [benefit('Paid Leave', '18 days of paid leave annually')],
            comp(1_200_000),
        );
        expect(row.category).toBe('pto');
        expect(row.isQuantifiable).toBe(true);
        // 1,200,000 / 260 working days ≈ 4,615/day × 18 ≈ 83,077
        expect(row.monetaryValue).toBeGreaterThan(70_000);
        expect(row.monetaryValue).toBeLessThan(95_000);
    });

    it('does NOT treat leave days as rupees when base salary is unknown', () => {
        // The exact live failure: totalCompensation came out as 500018 on a ₹24,00,000
        // offer because "18 days" was added as ₹18.
        const [row] = calculateBenefitValues(
            [benefit('Paid Leave', '18 days of paid leave annually')],
            null,
        );
        expect(row.category).toBe('pto');
        expect(row.monetaryValue).toBeNull();
        expect(row.isQuantifiable).toBe(false);
        expect(row.monetaryValue).not.toBe(18);
    });

    it('values insurance in rupees, with magnitude words honoured', () => {
        const [row] = calculateBenefitValues(
            [benefit('Group Health Insurance', 'coverage of ₹5 lakh')],
            comp(1_200_000),
        );
        expect(row.category).toBe('insurance');
        expect(row.monetaryValue).toBe(500_000);
    });

    it('marks equity unquantifiable when no amount is given', () => {
        const [row] = calculateBenefitValues(
            [benefit('ESOP', 'stock options subject to board approval')],
            comp(1_200_000),
        );
        expect(row.category).toBe('equity');
        expect(row.monetaryValue).toBeNull();
        expect(row.isQuantifiable).toBe(false);
    });

    it('keeps unvalued PF under retirement rather than relabelling it other', () => {
        // Seen live: "Provident Fund" with no amount fell through the retirement branch
        // (no return on the unquantifiable path) into the generic fallback, which set
        // category 'other'. Every Indian offer letter lists PF, so this misfired always.
        const [row] = calculateBenefitValues(
            [benefit('Provident Fund', 'Provident fund is deducted and contributed as per applicable statute.')],
            comp(2_400_000),
        );
        expect(row.category).toBe('retirement');
        expect(row.monetaryValue).toBeNull();
        expect(row.isQuantifiable).toBe(false);
    });

    it('still values PF when the offer states an amount', () => {
        const [row] = calculateBenefitValues(
            [benefit('Provident Fund', 'employer contribution of ₹21,600 per annum')],
            comp(2_400_000),
        );
        expect(row.category).toBe('retirement');
        expect(row.monetaryValue).toBe(21_600);
        expect(row.isQuantifiable).toBe(true);
    });

    it('honours a user override ahead of any parsing', () => {
        const [row] = calculateBenefitValues(
            [benefit('Paid Leave', '18 days')],
            null,
            { 'Paid Leave': 90_000 },
        );
        expect(row.monetaryValue).toBe(90_000);
        expect(row.isQuantifiable).toBe(true);
    });

    it('survives a non-string benefit name', () => {
        // AI-derived data reached name.toLowerCase() and threw an intermittent 500.
        const rows = calculateBenefitValues(
            [{ name: undefined as never, value: null, details: '18 days', isStandard: true }],
            null,
        );
        expect(rows).toHaveLength(1);
    });
});
