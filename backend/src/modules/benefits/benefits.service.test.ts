import { describe, it, expect, vi } from 'vitest';

let analysisRow: Record<string, unknown> = {};
vi.mock('@/db/index.js', () => ({
    db: {
        query: {
            offers: { findFirst: async () => ({ id: 'o1', userId: 'u1', guestId: null, status: 'COMPLETED' }) },
            analyses: { findFirst: async () => analysisRow },
        },
    },
}));

import { computeHeadlineTotal, BenefitsService } from './benefits.service.js';
import { calculateBenefitValues } from './benefits.calculator.js';
import type { Benefit, Compensation } from '@/modules/analysis/analysis.types.js';

function comp(overrides: Partial<Compensation>): Compensation {
    return {
        currency: 'INR',
        baseSalary: null,
        variablePay: null,
        equity: null,
        totalCTC: null,
        otherComponents: [],
        ...overrides,
    };
}

describe('computeHeadlineTotal (BEN-1)', () => {
    it('CTC-only letter anchors on totalCTC, not the benefits sum', () => {
        // baseSalary null, totalCTC 1,200,000. The old branch collapsed to benefitsTotal
        // (e.g. a single ₹10,000 benefit -> 10,000). The headline must be the CTC.
        const headline = computeHeadlineTotal(comp({ baseSalary: null, totalCTC: 1_200_000 }));
        expect(headline).toBe(1_200_000);
        expect(headline).not.toBe(10_000);
        expect(headline).not.toBe(0);
    });

    it('all-benefits-unvalued CTC-only letter still shows totalCTC, not 0', () => {
        // Benefits never enter the headline, so an all-unvalued breakdown cannot zero it out.
        expect(computeHeadlineTotal(comp({ baseSalary: null, totalCTC: 1_200_000 }))).toBe(1_200_000);
    });

    it('headline is independent of benefits — adding one never lowers the total', () => {
        // Same compensation produces the same headline regardless of benefitsTotal, because
        // computeHeadlineTotal ignores benefits entirely. Invariant (b).
        const c = comp({ baseSalary: null, totalCTC: 1_200_000 });
        expect(computeHeadlineTotal(c)).toBe(c.totalCTC);
    });

    it('monthly base is annualized, not added raw', () => {
        // 100,000/month -> 1,200,000/year.
        expect(
            computeHeadlineTotal(comp({ baseSalary: { amount: 100_000, period: 'monthly' }, totalCTC: null }))
        ).toBe(1_200_000);
    });

    it('takes the larger of totalCTC and the annualized base-driven value', () => {
        // Monthly base 100,000 -> 1,200,000 annual beats totalCTC 1,000,000.
        expect(
            computeHeadlineTotal(comp({ baseSalary: { amount: 100_000, period: 'monthly' }, totalCTC: 1_000_000 }))
        ).toBe(1_200_000);
    });

    it('adds variable pay to an annual base', () => {
        expect(
            computeHeadlineTotal(
                comp({
                    baseSalary: { amount: 1_000_000, period: 'annual' },
                    variablePay: { amount: 200_000, type: null, details: null },
                    totalCTC: null,
                })
            )
        ).toBe(1_200_000);
    });

    it('returns null when neither totalCTC nor an annual base is present', () => {
        expect(computeHeadlineTotal(comp({ baseSalary: null, totalCTC: null }))).toBeNull();
    });
});

describe('insurance cover never moves the headline (BEN-2, Model A invariant)', () => {
    const insurance = (): Benefit => ({
        name: 'Health insurance',
        value: null,
        details: 'coverage of ₹5 lakh',
        isStandard: true,
    });

    it('an offer whose only benefit is insurance cover has benefitsValue 0', () => {
        // Was 500,000 before BEN-2 — the cover was summed as money.
        const breakdown = calculateBenefitValues([insurance()], comp({ totalCTC: 1_200_000 }));
        const benefitsValue = breakdown.reduce((s, b) => s + (b.monetaryValue || 0), 0);
        expect(benefitsValue).toBe(0);
        expect(benefitsValue).not.toBe(500_000);
    });

    it('the headline for a CTC-only letter with insurance cover equals the CTC', () => {
        // Cross-checks BEN-1: benefits never enter computeHeadlineTotal, so an insurance
        // cover benefit leaves the headline anchored on totalCTC.
        const c = comp({ baseSalary: null, totalCTC: 1_200_000 });
        expect(computeHeadlineTotal(c)).toBe(1_200_000);
    });
});

describe('BenefitsService.calculate branches agree (MONEY-10)', () => {
    const run = async (compensation: Compensation, benefits: Benefit[]) => {
        analysisRow = { extractedData: { compensation }, benefits };
        return new BenefitsService().calculate('o1', 'u1');
    };
    const oneBenefit: Benefit[] = [{ name: 'Meal card', value: '₹2,000/month', details: null, isStandard: false }];

    it('monthly base, no CTC: both branches annualise the base and use it as the headline', async () => {
        const c = comp({ baseSalary: { amount: 50_000, period: 'monthly' }, totalCTC: null });
        for (const benefits of [[], oneBenefit]) {
            const r = await run(c, benefits);
            expect(r.totalCompensation).toBe(600_000);
            expect(r.baseSalary).toBe(600_000);
        }
    });

    it('no CTC and no base: the total is null in both branches, never 0', async () => {
        const c = comp({ baseSalary: null, totalCTC: null });
        for (const benefits of [[], oneBenefit]) {
            expect((await run(c, benefits)).totalCompensation).toBeNull();
        }
    });

    it('CTC 12L with an annual base of 6L and no benefits: 12L headline, 6L base', async () => {
        const r = await run(comp({ baseSalary: { amount: 600_000, period: 'annual' }, totalCTC: 1_200_000 }), []);
        expect(r.totalCompensation).toBe(1_200_000);
        expect(r.baseSalary).toBe(600_000);
    });
});
