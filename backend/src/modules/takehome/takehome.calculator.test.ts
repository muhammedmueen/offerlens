import { describe, it, expect } from 'vitest';
import {
    slabTax, applyRebate87A, surchargeFor, calculateTax, calculateTakeHome, annualBasicFrom,
    STANDARD_DEDUCTION, EPF_WAGE_CEILING_MONTHLY, NEW_REGIME_SLABS,
} from './takehome.calculator.js';

/**
 * Expected values are worked by hand from the published FY 2026-27 new-regime slabs, not from
 * the implementation. A test that asserts whatever the code already does catches typos and
 * nothing else.
 */

describe('slabTax', () => {
    it('charges nothing inside the basic exemption', () => {
        expect(slabTax(400_000)).toBe(0);
        expect(slabTax(0)).toBe(0);
    });

    it('matches a hand-worked ₹12,00,000', () => {
        // 4-8L at 5% = 20,000; 8-12L at 10% = 40,000.
        expect(slabTax(1_200_000)).toBe(60_000);
    });

    it('matches a hand-worked ₹23,25,000', () => {
        // 20,000 + 40,000 + (4L @ 15%) 60,000 + (4L @ 20%) 80,000 + (3.25L @ 25%) 81,250.
        expect(slabTax(2_325_000)).toBe(281_250);
    });

    it('applies 30% only above ₹24,00,000', () => {
        // Everything up to 24L is 3,00,000; the next rupee is taxed at 30%.
        expect(slabTax(2_400_000)).toBe(300_000);
        expect(slabTax(2_500_000)).toBe(300_000 + 30_000);
    });

    it('is progressive, never a cliff', () => {
        // A rupee more of income must never mean more than a rupee more of slab tax.
        for (const boundary of [400_000, 800_000, 1_200_000, 1_600_000, 2_000_000, 2_400_000]) {
            const step = slabTax(boundary + 1) - slabTax(boundary);
            expect(step, `at ${boundary}`).toBeLessThanOrEqual(1);
        }
    });

    it('rejects nothing quietly — negative income is zero tax', () => {
        expect(slabTax(-50_000)).toBe(0);
    });
});

describe('applyRebate87A', () => {
    it('wipes out tax entirely at the threshold', () => {
        // The well-known result: ₹12.75L gross is tax-free, because the ₹75,000 standard
        // deduction brings taxable income to ₹12L and the rebate cancels the ₹60,000 due.
        expect(applyRebate87A(1_200_000, 60_000)).toBe(0);
    });

    it('applies marginal relief just above the threshold', () => {
        // Without relief, one rupee over ₹12L would cost ~₹60,000. Tax is instead capped at the
        // excess. This band is where a lot of Indian offers sit, so it is not an edge case.
        expect(applyRebate87A(1_205_000, 60_750)).toBe(5_000);
    });

    it('stops mattering once the tax is smaller than the excess', () => {
        expect(applyRebate87A(2_000_000, 300_000)).toBe(300_000);
    });
});

describe('surchargeFor', () => {
    it('charges nothing below ₹50,00,000', () => {
        expect(surchargeFor(4_999_999, 1_000_000)).toBe(0);
    });

    it('steps 10 / 15 / 25 percent', () => {
        expect(surchargeFor(6_000_000, 1_000_000)).toBe(100_000);
        expect(surchargeFor(15_000_000, 1_000_000)).toBe(150_000);
        expect(surchargeFor(25_000_000, 1_000_000)).toBe(250_000);
    });

    it('caps at 25%, since the new regime dropped the 37% band', () => {
        expect(surchargeFor(1_000_000_000, 1_000_000)).toBe(250_000);
    });
});

describe('calculateTax', () => {
    it('makes ₹12,75,000 tax-free', () => {
        const tax = calculateTax(1_275_000);
        expect(tax.taxableIncome).toBe(1_200_000);
        expect(tax.totalTax).toBe(0);
        expect(tax.effectiveRate).toBe(0);
    });

    it('matches a hand-worked ₹24,00,000', () => {
        // taxable 23,25,000 -> slab 2,81,250; no surcharge; cess 4% = 11,250.
        const tax = calculateTax(2_400_000);
        expect(tax.incomeTax).toBe(281_250);
        expect(tax.surcharge).toBe(0);
        expect(tax.cess).toBe(11_250);
        expect(tax.totalTax).toBe(292_500);
    });

    it('matches a hand-worked ₹60,00,000, with surcharge', () => {
        // taxable 59,25,000 -> slab 13,57,500; surcharge 10% = 1,35,750;
        // cess 4% of 14,93,250 = 59,730.
        const tax = calculateTax(6_000_000);
        expect(tax.incomeTax).toBe(1_357_500);
        expect(tax.surcharge).toBe(135_750);
        expect(tax.cess).toBe(59_730);
        expect(tax.totalTax).toBe(1_552_980);
    });

    it('never charges tax exceeding income', () => {
        for (const gross of [100_000, 500_000, 1_275_000, 2_400_000, 10_000_000, 250_000_000]) {
            expect(calculateTax(gross).totalTax, `at ${gross}`).toBeLessThan(gross);
        }
    });

    it('subtracts the standard deduction before the slabs', () => {
        expect(calculateTax(900_000).taxableIncome).toBe(900_000 - STANDARD_DEDUCTION);
    });
});

describe('calculateTakeHome', () => {
    it('returns null rather than reporting ₹0 a month', () => {
        // A confident zero is worse than an absent figure: the UI would render it as fact.
        expect(calculateTakeHome({ totalCtc: null, annualBasic: null })).toBeNull();
        expect(calculateTakeHome({ totalCtc: 0, annualBasic: null })).toBeNull();
        expect(calculateTakeHome({ totalCtc: -100, annualBasic: null })).toBeNull();
        expect(calculateTakeHome({ totalCtc: Number.NaN, annualBasic: null })).toBeNull();
    });

    it('excludes PF and says so when basic is unknown', () => {
        // The common case: the letter quotes one CTC figure and never breaks out basic.
        const result = calculateTakeHome({ totalCtc: 2_400_000, annualBasic: null })!;

        expect(result.employeePf).toEqual({ statutoryMinimum: null, onFullBasic: null });
        expect(result.isExact).toBe(true);
        // 24,00,000 - 2,92,500 tax = 21,07,500 a year.
        expect(result.netMonthly.high).toBe(Math.round(2_107_500 / 12));
        expect(result.netMonthly.low).toBe(result.netMonthly.high);
        expect(result.assumptions.join(' ')).toContain('PF is NOT included');
    });

    it('reports a PF range when basic is high enough to exceed the ceiling', () => {
        // Basic ₹12L/yr is ₹1,00,000/month. Statutory PF is 12% of the ₹25,000 ceiling
        // (₹36,000/yr); on full basic it is ₹1,44,000/yr. That gap is ₹9,000 a month of
        // take-home, which is why it is not collapsed into one number.
        const result = calculateTakeHome({ totalCtc: 2_400_000, annualBasic: 1_200_000 })!;

        expect(result.employeePf.statutoryMinimum).toBe(36_000);
        expect(result.employeePf.onFullBasic).toBe(144_000);
        expect(result.isExact).toBe(false);
        expect(result.netMonthly.high).toBeGreaterThan(result.netMonthly.low);
        expect(result.netMonthly.high - result.netMonthly.low).toBe(9_000);
    });

    it('gives one exact figure when basic sits under the ceiling', () => {
        // Basic ₹2,40,000/yr is ₹20,000/month, below the ₹25,000 ceiling, so the statutory and
        // full-basic calculations agree and there is no range to report.
        const result = calculateTakeHome({ totalCtc: 600_000, annualBasic: 240_000 })!;

        expect(result.employeePf.statutoryMinimum).toBe(28_800);
        expect(result.employeePf.onFullBasic).toBe(28_800);
        expect(result.isExact).toBe(true);
        expect(result.netMonthly.high).toBe(result.netMonthly.low);
    });

    it('always states its assumptions, including the regime and the CTC treatment', () => {
        const result = calculateTakeHome({ totalCtc: 2_400_000, annualBasic: 1_200_000 })!;
        const text = result.assumptions.join(' ');

        expect(result.assumptions.length).toBeGreaterThan(2);
        expect(text).toContain('New tax regime');
        expect(text).toContain('old regime');
        // The one that makes the number an overestimate of tax, and so must be visible.
        expect(text).toContain('treated as taxable salary');
        expect(text).toContain('professional tax');
    });

    it('stamps the rules version, because slabs outlive stored results', () => {
        expect(calculateTakeHome({ totalCtc: 1_000_000, annualBasic: null })!.rulesVersion)
            .toBe('FY2026-27');
    });

    it('keeps take-home below gross at every scale', () => {
        for (const ctc of [300_000, 800_000, 1_275_000, 2_400_000, 6_000_000, 30_000_000]) {
            const result = calculateTakeHome({ totalCtc: ctc, annualBasic: ctc * 0.45 })!;
            expect(result.netMonthly.high, `at ${ctc}`).toBeLessThanOrEqual(ctc / 12);
            expect(result.netMonthly.low, `at ${ctc}`).toBeGreaterThan(0);
        }
    });
});

describe('annualBasicFrom', () => {
    it('annualises a monthly figure', () => {
        expect(annualBasicFrom({ amount: 50_000, period: 'monthly' })).toBe(600_000);
    });

    it('passes an annual figure through', () => {
        expect(annualBasicFrom({ amount: 600_000, period: 'annual' })).toBe(600_000);
    });

    it('treats absent, zero and malformed as "not stated"', () => {
        // Zero basic pay is not a thing. It means extraction found nothing.
        expect(annualBasicFrom(null)).toBeNull();
        expect(annualBasicFrom(undefined)).toBeNull();
        expect(annualBasicFrom({ amount: null, period: 'annual' })).toBeNull();
        expect(annualBasicFrom({ amount: 0, period: 'annual' })).toBeNull();
        expect(annualBasicFrom({ amount: Number.NaN, period: 'annual' })).toBeNull();
    });
});

describe('the slab table itself', () => {
    it('is ordered, gapless and open-ended at the top', () => {
        // A duplicated or out-of-order boundary would silently mis-tax one band.
        const bounds = NEW_REGIME_SLABS.map((s) => s.upTo);
        expect(bounds[bounds.length - 1]).toBeNull();

        const finite = bounds.slice(0, -1) as number[];
        expect([...finite].sort((a, b) => a - b)).toEqual(finite);
        expect(new Set(finite).size).toBe(finite.length);
    });

    it('has monotonically rising rates', () => {
        const rates = NEW_REGIME_SLABS.map((s) => s.rate);
        for (let i = 1; i < rates.length; i++) {
            expect(rates[i]).toBeGreaterThan(rates[i - 1]);
        }
    });

    it('pins the EPF ceiling notified on 17 September 2026', () => {
        // Raised from 15,000. Left as an explicit assertion so a future edit is deliberate.
        expect(EPF_WAGE_CEILING_MONTHLY).toBe(25_000);
    });
});
