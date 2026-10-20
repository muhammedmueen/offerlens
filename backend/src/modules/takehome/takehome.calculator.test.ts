import { describe, it, expect } from 'vitest';
import {
    slabTax, applyRebate87A, surchargeFor, surchargeWithRelief, calculateTax, calculateTakeHome,
    annualBasicFrom, annualVariableFrom, takeHomeKind, GRATUITY_RATE,
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

    it('leaves 87A marginal relief at ₹12L untouched', () => {
        // taxable 12,10,000: slab tax 61,500, excess over 12L is 10,000, so tax is capped at 10,000.
        const tax = calculateTax(1_285_000);
        expect(tax.incomeTax).toBe(10_000);
        expect(tax.surcharge).toBe(0);
        expect(tax.cess).toBe(400);
        expect(tax.totalTax).toBe(10_400);
    });
});

describe('surcharge marginal relief (MONEY-7)', () => {
    // Taxable-income thresholds. Slab tax AT each threshold, worked by hand:
    //   50L: 3,00,000 (to 24L) + 26L @ 30% = 7,80,000          -> 10,80,000
    //   1Cr: 3,00,000 + 76L @ 30% = 22,80,000                   -> 25,80,000
    //   2Cr: 3,00,000 + 1.76Cr @ 30% = 52,80,000                -> 55,80,000
    // The cap on tax + surcharge just over a threshold is slabTax(X) x (1 + surcharge rate below X)
    // + the income above X: 10,80,000 / 28,38,000 (x1.10) / 64,17,000 (x1.15).
    const cases = [
        { name: '₹50L', taxable: 5_000_000, atThreshold: 1_080_000 },
        { name: '₹1Cr', taxable: 10_000_000, atThreshold: 2_838_000 },
        { name: '₹2Cr', taxable: 20_000_000, atThreshold: 6_417_000 },
    ];

    for (const { name, taxable, atThreshold } of cases) {
        it(`caps tax + surcharge at ${name} + ₹1 and + ₹100`, () => {
            for (const extra of [1, 100]) {
                const tax = calculateTax(taxable + STANDARD_DEDUCTION + extra);
                // Rounded components may be off by one rupee in total.
                expect(Math.abs(tax.incomeTax + tax.surcharge - (atThreshold + extra)), `+${extra}`)
                    .toBeLessThanOrEqual(1);
            }
        });

        it(`never raises total tax by more than the extra income at ${name}`, () => {
            const at = calculateTax(taxable + STANDARD_DEDUCTION).totalTax;
            for (const extra of [1, 100, 1_000]) {
                const over = calculateTax(taxable + STANDARD_DEDUCTION + extra).totalTax;
                // 4% cess rides on top of the capped tax, so at most 1.04 per rupee, plus rounding.
                expect(over - at, `+${extra}`).toBeLessThanOrEqual(Math.ceil(extra * 1.04) + 1);
            }
        });
    }

    it('pins the +₹100 surcharges worked by hand', () => {
        expect(calculateTax(5_075_100).surcharge).toBe(70);
        expect(calculateTax(10_075_100).surcharge).toBe(258_070);
        expect(calculateTax(20_075_100).surcharge).toBe(837_070);
    });

    it('is unchanged well above a threshold, where the full rate is cheaper than the cap', () => {
        // Same hand-worked ₹60,00,000 case as above.
        const tax = calculateTax(6_000_000);
        expect(tax.surcharge).toBe(135_750);
        expect(tax.totalTax).toBe(1_552_980);
        // And the helper agrees with the un-relieved rate there.
        expect(surchargeWithRelief(5_925_000, 1_357_500)).toBe(surchargeFor(5_925_000, 1_357_500));
    });

    it('never charges more extra tax than the extra income plus cess, across every threshold', () => {
        // Monotonic net pay, up to the 4% cess: inside a marginal-relief band (87A at ₹12L as well as
        // the surcharge thresholds) tax + surcharge rises one-for-one with income and cess is then
        // charged on that, so a rupee more can cost at most ₹1.04. Before the fix the surcharge
        // cliff cost ₹1,12,354 for ₹100.
        let previous = calculateTax(1_000_000);
        for (let gross = 1_000_000 + 7_919; gross <= 30_000_000; gross += 7_919) {
            const current = calculateTax(gross);
            const step = gross - (previous.grossAnnual);
            expect(current.totalTax - previous.totalTax, `at ${gross}`)
                .toBeLessThanOrEqual(Math.ceil(step * 1.04) + 1);
            expect(current.totalTax, `at ${gross}`).toBeGreaterThanOrEqual(previous.totalTax);
            previous = current;
        }
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

    it('is an upper bound, with no PF numbers invented, when basic is unknown', () => {
        // The common case: the letter quotes one CTC figure and never breaks out basic.
        const result = calculateTakeHome({ totalCtc: 2_400_000, annualBasic: null })!;

        expect(result.employeePf).toEqual({ statutoryMinimum: null, onFullBasic: null });
        expect(result.employerPf).toEqual({ statutoryMinimum: null, onFullBasic: null });
        expect(result.gratuity).toBeNull();
        expect(result.isUpperBound).toBe(true);
        expect(result.isExact).toBe(false);
        expect(takeHomeKind(result)).toBe('upper');
        expect(result.ctcAnnual).toBe(2_400_000);
        // 24,00,000 - 2,92,500 tax = 21,07,500 a year.
        expect(result.netMonthly.high).toBe(Math.round(2_107_500 / 12));
        expect(result.netMonthly.low).toBe(result.netMonthly.high);
        const text = result.assumptions.join(' ');
        expect(text).toContain('PF is NOT included');
        expect(text).toContain('upper bound');
    });

    it('removes employer PF and gratuity before tax when basic is known (₹12L CTC, ₹6L basic)', () => {
        // Hand-worked. Statutory PF: 12% of the ₹25,000/month ceiling = ₹36,000/yr, so employer PF
        // 36,000 and employee PF 36,000. Gratuity 4.81% x 6,00,000 = 28,860.
        //   taxable salary 12,00,000 - 36,000 - 28,860 = 11,35,140; taxable 10,60,140 -> slab tax
        //   46,014, under the ₹60,000 rebate -> 0. Net 11,35,140 - 36,000 = 10,99,140 -> 91,595/mo.
        // Full-basic PF: 72,000 each. Salary 12,00,000 - 72,000 - 28,860 = 10,99,140; tax 0;
        //   net 10,99,140 - 72,000 = 10,27,140 -> 85,595/mo.
        const result = calculateTakeHome({ totalCtc: 1_200_000, annualBasic: 600_000 })!;

        expect(result.gratuity).toBe(28_860);
        expect(result.employerPf).toEqual({ statutoryMinimum: 36_000, onFullBasic: 72_000 });
        expect(result.employeePf).toEqual({ statutoryMinimum: 36_000, onFullBasic: 72_000 });
        expect(result.netMonthly).toEqual({ high: 91_595, low: 85_595 });
        expect(result.isExact).toBe(false);
        expect(result.isUpperBound).toBe(false);
        expect(takeHomeKind(result)).toBe('range');
        expect(result.tax.grossAnnual).toBe(1_135_140);
        expect(result.ctcAnnual).toBe(1_200_000);
        expect(result.variableAnnual).toBeNull();
    });

    it('computes gratuity as 4.81% of basic', () => {
        expect(GRATUITY_RATE).toBe(0.0481);
        expect(calculateTakeHome({ totalCtc: 5_000_000, annualBasic: 2_000_000 })!.gratuity).toBe(96_200);
    });

    it('gives one exact figure when basic sits under the ceiling', () => {
        // Basic ₹2,40,000/yr is ₹20,000/month, below the ₹25,000 ceiling, so the statutory and
        // full-basic calculations agree and there is no range to report.
        // PF 28,800 each side; gratuity 11,544; salary 6,00,000 - 28,800 - 11,544 = 5,59,656 (no
        // tax); net 5,59,656 - 28,800 = 5,30,856 -> 44,238/mo.
        const result = calculateTakeHome({ totalCtc: 600_000, annualBasic: 240_000 })!;

        expect(result.employeePf.statutoryMinimum).toBe(28_800);
        expect(result.employeePf.onFullBasic).toBe(28_800);
        expect(result.isExact).toBe(true);
        expect(takeHomeKind(result)).toBe('exact');
        expect(result.netMonthly).toEqual({ high: 44_238, low: 44_238 });
    });

    it('reports a wider PF range when basic is far above the ceiling (₹24L CTC, ₹12L basic)', () => {
        // Basic ₹1,00,000/month: statutory PF 36,000/yr, full-basic PF 1,44,000/yr. Gratuity 57,720.
        //   stat: salary 24,00,000 - 36,000 - 57,720 = 23,06,280; taxable 22,31,280; slab 2,57,820;
        //         + 4% cess = 2,68,133. Net 23,06,280 - 2,68,133 - 36,000 = 20,02,147 -> 1,66,846/mo.
        //   full: salary 21,98,280; tax 2,40,053; net 21,98,280 - 2,40,053 - 1,44,000 = 18,14,227
        //         -> 1,51,186/mo.
        const result = calculateTakeHome({ totalCtc: 2_400_000, annualBasic: 1_200_000 })!;

        expect(result.employeePf.statutoryMinimum).toBe(36_000);
        expect(result.employeePf.onFullBasic).toBe(144_000);
        expect(result.netMonthly).toEqual({ high: 166_846, low: 151_186 });
        expect(result.tax.totalTax).toBe(268_133);
        expect(result.isExact).toBe(false);
    });

    it('takes variable pay out of the monthly figure but keeps it in the tax', () => {
        // ₹24L CTC, ₹12L basic, ₹2.4L variable. Statutory scenario: salary 23,06,280, tax on the
        // WHOLE of it 2,68,133. Variable's tax is its share at the average rate (11.626%), so
        //   ((23,06,280 - 2,40,000) x (1 - 2,68,133/23,06,280) - 36,000) / 12 = 1,49,171.
        // Full-basic scenario: ((21,98,280 - 2,40,000) x (1 - 2,40,053/21,98,280) - 1,44,000) / 12 = 1,33,370.
        const withVariable = calculateTakeHome({ totalCtc: 2_400_000, annualBasic: 1_200_000, annualVariable: 240_000 })!;
        const without = calculateTakeHome({ totalCtc: 2_400_000, annualBasic: 1_200_000 })!;

        expect(withVariable.variableAnnual).toBe(240_000);
        expect(withVariable.netMonthly).toEqual({ high: 149_171, low: 133_370 });
        expect(withVariable.netMonthly.high).toBeLessThan(without.netMonthly.high);
        // Tax is on the whole income, so it is the same as with no variable split out.
        expect(withVariable.tax.totalTax).toBe(268_133);
        expect(withVariable.ctcAnnual).toBe(2_400_000);
        const text = withVariable.assumptions.join(' ');
        expect(text).toContain('variable pay');
        expect(text).toContain('₹2,40,000');
    });

    it('ignores an invalid variable amount', () => {
        const base = calculateTakeHome({ totalCtc: 2_400_000, annualBasic: 1_200_000 })!;
        for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 2_400_000, 3_000_000, null]) {
            const result = calculateTakeHome({ totalCtc: 2_400_000, annualBasic: 1_200_000, annualVariable: bad })!;
            expect(result.variableAnnual, `${bad}`).toBeNull();
            expect(result.netMonthly, `${bad}`).toEqual(base.netMonthly);
        }
    });

    it('treats a basic at or above the CTC as not stated', () => {
        const result = calculateTakeHome({ totalCtc: 1_200_000, annualBasic: 1_500_000 })!;
        expect(result.isUpperBound).toBe(true);
        expect(result.netMonthly.high).toBeGreaterThan(0);
    });

    it('always states its assumptions, including the regime and the CTC treatment', () => {
        const known = calculateTakeHome({ totalCtc: 2_400_000, annualBasic: 1_200_000 })!;
        const text = known.assumptions.join(' ');

        expect(known.assumptions.length).toBeGreaterThan(2);
        expect(text).toContain('New tax regime');
        expect(text).toContain('old regime');
        expect(text).toContain('Employer PF and a gratuity provision');
        expect(text).toContain('removed before tax');
        expect(text).toContain('professional tax');

        // Unknown basic: they are NOT removed, so the full CTC is treated as taxable salary.
        const unknown = calculateTakeHome({ totalCtc: 2_400_000, annualBasic: null })!;
        expect(unknown.assumptions.join(' ')).toContain('treated as taxable salary');
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

describe('annualVariableFrom', () => {
    it('reads a positive amount as annual', () => {
        expect(annualVariableFrom({ amount: 240_000 })).toBe(240_000);
    });

    it('treats absent, zero, negative and malformed as "no variable"', () => {
        expect(annualVariableFrom(null)).toBeNull();
        expect(annualVariableFrom(undefined)).toBeNull();
        expect(annualVariableFrom({ amount: null })).toBeNull();
        expect(annualVariableFrom({ amount: 0 })).toBeNull();
        expect(annualVariableFrom({ amount: -1 })).toBeNull();
        expect(annualVariableFrom({ amount: Number.NaN })).toBeNull();
    });
});

describe('takeHomeKind', () => {
    it('maps the flags to exact / range / upper', () => {
        expect(takeHomeKind({ isExact: true, isUpperBound: false })).toBe('exact');
        expect(takeHomeKind({ isExact: false, isUpperBound: false })).toBe('range');
        expect(takeHomeKind({ isExact: false, isUpperBound: true })).toBe('upper');
    });

    it('never calls an old stored row (no isUpperBound) exact', () => {
        expect(takeHomeKind({ isExact: true })).toBe('upper');
        expect(takeHomeKind({ isExact: false })).toBe('upper');
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
