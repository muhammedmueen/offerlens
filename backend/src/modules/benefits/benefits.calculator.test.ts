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
        expect(extractMoney('$500,000', 'USD')).toBe(500_000);     // Western grouping, offer in USD
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

    it('treats an insurance cover figure as coverage, not money (BEN-2, Model A)', () => {
        // Was the BEN-2 bug: "coverage of ₹5 lakh" became a ₹500,000 monetaryValue and was
        // summed into benefitsValue. A sum-assured cover is coverage, not pay.
        const [row] = calculateBenefitValues(
            [benefit('Group Health Insurance', 'coverage of ₹5 lakh')],
            comp(1_200_000),
        );
        expect(row.category).toBe('insurance');
        expect(row.monetaryValue).toBeNull();
        expect(row.isQuantifiable).toBe(false);
        // The cover amount is reported as descriptive detail, with no misleading premium label.
        expect(row.details).toMatch(/5,?00,?000/);
        expect(row.details).not.toMatch(/Annual premium/i);
    });

    it('does not sum an insurance cover into benefitsValue (BEN-2)', () => {
        const breakdown = calculateBenefitValues(
            [benefit('Health insurance', '₹5,00,000')],
            comp(1_200_000),
        );
        const benefitsValue = breakdown.reduce((s, b) => s + (b.monetaryValue || 0), 0);
        expect(benefitsValue).toBe(0);
        expect(benefitsValue).not.toBe(500_000);
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

describe('extractMoney — MONEY-3 reproduced rows', () => {
    it.each([
        ['2,000 RSUs worth $40k', null],                       // units + foreign amount, no rupee figure
        ['1000 options vesting over 4 years', null],           // option count, year count
        ['12% of basic', null],                                // a percentage
        ['Rs2,200 per month', 26_400],                         // x12
        ['15 days hotel stay plus Rs50k', 50_000],             // currency-marked beats bare day count
        ['Retention bonus after 2 years: 1 lakh', 100_000],    // magnitude binds to "1", not "2"
    ])('%s -> %s', (text, expected) => {
        expect(extractMoney(text)).toBe(expected);
    });

    it('multiplies by 12 for every per-month spelling', () => {
        for (const t of ['Rs 2,000 per month', '₹2000/month', '₹2000 monthly', 'Rs 2000 pm', 'Rs 2000 p.m.']) {
            expect(extractMoney(t), t).toBe(24_000);
        }
        expect(extractMoney('Rs 24,000 per annum')).toBe(24_000);
    });

    it('binds a magnitude only to the number beside it', () => {
        expect(extractMoney('3 installments of 2 lakh')).toBe(200_000);   // lakh is not applied to the 3

        expect(extractMoney('25kg')).toBeNull();
    });

    it('prefers a currency-marked number over a bare one', () => {
        expect(extractMoney('10 tickets, ₹5,000')).toBe(5_000);
    });

    it('never converts a foreign currency', () => {
        expect(extractMoney('$40k')).toBeNull();
        expect(extractMoney('$40k', 'USD')).toBe(40_000);
        expect(extractMoney('$40k or ₹2 lakh')).toBe(200_000);
    });
});

describe('calculateBenefitValues — MONEY-3 / BEN-5', () => {
    const CTC = 1_200_000;
    const withValue = (name: string, value: string): Benefit => ({ name, value, details: null, isStandard: true });

    it('the reproduced rows no longer inflate the benefits sum past the CTC', () => {
        const rows = calculateBenefitValues([
            withValue('Equity', '2,000 RSUs worth $40k'),
            withValue('ESOP', '1000 options vesting over 4 years'),
            withValue('Provident Fund', '12% of basic'),
            withValue('Meal card', 'Rs2,200 per month'),
            withValue('Relocation', '15 days hotel stay plus Rs50k'),
            withValue('Retention bonus', 'Retention bonus after 2 years: 1 lakh'),
        ], comp(CTC));
        expect(rows.map((r) => r.monetaryValue)).toEqual([null, null, null, 26_400, 50_000, 100_000]);
        expect(rows.map((r) => r.isQuantifiable)).toEqual([false, false, false, true, true, true]);
        expect(rows.reduce((s, r) => s + (r.monetaryValue || 0), 0)).toBeLessThanOrEqual(CTC);
    });

    it('formats detail strings en-IN', () => {
        const [eq, pf, ov] = calculateBenefitValues(
            [withValue('Equity', '₹20 lakh'), withValue('Provident Fund', '₹2,16,000'), benefit('Bonus', '')],
            comp(CTC * 10),
            { Bonus: 1234567 },
        );
        expect(eq.details).toBe('Equity value: 20,00,000');
        expect(pf.details).toBe('Annual contribution: 2,16,000');
        expect(ov.details).toBe('User-provided value: 12,34,567');
    });

    it('over-CTC guard: drops the largest extracted amounts until the sum fits', () => {
        const rows = calculateBenefitValues(
            [withValue('Joining bonus', '₹50 lakh'), withValue('Meal card', '₹26,400'), withValue('Gift', '₹1 lakh')],
            comp(CTC),
        );
        expect(rows[0].monetaryValue).toBeNull();
        expect(rows[0].isQuantifiable).toBe(false);
        expect(rows[0].details).toMatch(/does not fit within the total CTC of 12,00,000/);
        expect(rows[1].monetaryValue).toBe(26_400);
        expect(rows[2].monetaryValue).toBe(100_000);
    });

    it('over-CTC guard budgets for user overrides and does not blame the offer for them', () => {
        // Override alone exceeds the CTC: extracted rows are left alone (the user's call).
        const big = calculateBenefitValues(
            [withValue('Bonus', '₹1'), withValue('Meal card', '₹26,400')], comp(CTC), { Bonus: 5_000_000 },
        );
        expect(big[1].monetaryValue).toBe(26_400);

        // Override uses most of the CTC: the extracted row no longer fits what is left.
        const rows = calculateBenefitValues(
            [withValue('Bonus', '₹1'), withValue('Meal card', '₹26,400')], comp(CTC), { Bonus: 1_190_000 },
        );
        expect(rows[0].monetaryValue).toBe(1_190_000);
        expect(rows[1].monetaryValue).toBeNull();
        expect(rows[1].details).toMatch(/after your own values/);
    });

    it('over-CTC guard never touches user overrides, and is skipped without a CTC', () => {
        const [row] = calculateBenefitValues([withValue('Bonus', '₹1')], comp(CTC), { Bonus: 5_000_000 });
        expect(row.monetaryValue).toBe(5_000_000);

        const [noCtc] = calculateBenefitValues([withValue('Bonus', '₹50 lakh')], { ...comp(null), totalCTC: null });
        expect(noCtc.monetaryValue).toBe(5_000_000);
    });

    it('uses the offer currency: a USD offer values a $ amount', () => {
        const [row] = calculateBenefitValues(
            [withValue('Learning budget', '$5,000')],
            { ...comp(null), currency: 'USD', totalCTC: 150_000 },
        );
        expect(row.monetaryValue).toBe(5_000);
    });

    it('a per-row override targets one of two same-named benefits', () => {
        const rows = calculateBenefitValues(
            [benefit('Allowance', 'x'), benefit('Allowance', 'y')],
            comp(CTC),
            { '#1': 7_000 },
        );
        expect(rows.map((r) => r.monetaryValue)).toEqual([null, 7_000]);
    });

    it('matches categories on whole words', () => {
        const cat = (name: string) => calculateBenefitValues([benefit(name, '')], comp(CTC))[0].category;
        expect(cat('Health club membership')).toBe('other');
        expect(cat('Laptop allowance')).toBe('other');
        expect(cat('Stockholm relocation')).toBe('other');
        expect(cat('Health Insurance')).toBe('insurance');
        expect(cat('Group Mediclaim')).toBe('insurance');
        expect(cat('PTO')).toBe('pto');
        expect(cat('Employer PF')).toBe('retirement');
        expect(cat('ESOPs')).toBe('equity');
        expect(cat('Stock options')).toBe('equity');
    });
});
