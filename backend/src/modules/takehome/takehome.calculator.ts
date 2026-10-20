/**
 * Deterministic Indian take-home calculator (Phase 2 task 9).
 *
 * Replaces a single number the language model guessed. The model was asked "what is the
 * monthly take-home" and answered plausibly — around 82% of gross, which is roughly right
 * for a 24 LPA offer and would be wrong by a lot at 8 LPA or 80 LPA, with nothing in the
 * output to say which. Tax is arithmetic. Arithmetic belongs in code.
 *
 * ── WHAT IT REFUSES TO DO ────────────────────────────────────────────────────
 * The hard constraint is that an offer letter quoting one CTC figure does not contain enough
 * information for an exact answer. Two gaps in particular:
 *
 *  1. Basic pay is usually not stated, and PF is 12% OF BASIC. No basic, no exact PF.
 *  2. Even when basic IS stated, whether the employer deducts PF on full basic or only up to
 *     the statutory wage ceiling is the employer's policy, and letters do not say.
 *
 * So this returns a RANGE for take-home rather than one number, and an explicit list of what
 * it assumed. A range that contains the truth is worth more than a point estimate that does
 * not, and the previous single figure gave no way to tell the difference.
 *
 *  3. CTC is not cash. It includes employer PF and a gratuity provision (never on the payslip)
 *     and often a variable component (not paid monthly). When basic is KNOWN the first two are
 *     removed before tax; when it is NOT, they cannot be, so the figure is an UPPER BOUND
 *     (`isUpperBound`), never presented as exact. Variable pay is taxed with the rest of the
 *     income but kept OUT of the monthly figure and reported separately.
 *
 * Everything here is pure and unit-tested. A tax calculator that is quietly wrong produces
 * confident numbers people make decisions on.
 */

/** Rules are versioned, because slabs change every budget and stored results outlive them. */
export const TAX_RULES_VERSION = 'FY2026-27';

/**
 * New-regime slabs for FY 2026-27 (AY 2027-28).
 *
 * Unchanged from FY 2025-26: the Finance Act 2025 seven-slab structure carries forward.
 * Sources (checked 19 Sep 2026):
 *   - https://www.incometaxindia.gov.in/
 *   - https://www.allindiaitr.com/indian-tax/income-tax-slabs
 *   - https://economictimes.indiatimes.com/wealth/tax/old-vs-new-tax-regime-for-fy-202627-which-income-tax-slab-can-work-better-for-you/new-tax-regime-income-tax-slabs-for-fy-2026-27/slideshow/127862196.cms
 *
 * Content was rephrased for compliance with licensing restrictions.
 *
 * `upTo: null` is the open-ended top slab.
 */
export const NEW_REGIME_SLABS: Array<{ upTo: number | null; rate: number }> = [
    { upTo: 400_000, rate: 0 },
    { upTo: 800_000, rate: 0.05 },
    { upTo: 1_200_000, rate: 0.10 },
    { upTo: 1_600_000, rate: 0.15 },
    { upTo: 2_000_000, rate: 0.20 },
    { upTo: 2_400_000, rate: 0.25 },
    { upTo: null, rate: 0.30 },
];

/** Salaried standard deduction under the new regime. */
export const STANDARD_DEDUCTION = 75_000;

/** Section 87A: wipes out tax entirely below the threshold, with marginal relief above it. */
export const REBATE_87A_MAX = 60_000;
export const REBATE_87A_INCOME_LIMIT = 1_200_000;

/** Health and education cess, charged on tax plus surcharge. */
export const CESS_RATE = 0.04;

/**
 * Surcharge on tax, by total income. New regime caps at 25% — the old regime's 37% band was
 * removed for taxpayers who opt in.
 */
export const SURCHARGE_BANDS: Array<{ above: number; rate: number }> = [
    { above: 20_000_000, rate: 0.25 },
    { above: 10_000_000, rate: 0.15 },
    { above: 5_000_000, rate: 0.10 },
];

export const EPF_EMPLOYEE_RATE = 0.12;

/** Gratuity provision as a share of basic: 15/26/12 = 4.8077%, rounded to the usual 4.81%. */
export const GRATUITY_RATE = 0.0481;

/**
 * Monthly wage ceiling for MANDATORY EPF coverage.
 *
 * Raised from ₹15,000 to ₹25,000 with effect from 17 September 2026, gazette-notified by the
 * Ministry of Labour and Employment under clause (89) of section 2 of the Code on Social
 * Security, 2020. Contribution above the ceiling became voluntary under EPF Scheme 2026.
 *
 * Sources (checked 19 Sep 2026):
 *   - https://www.thehindu.com/business/Economy/what-does-the-latest-revision-to-the-epfo-wage-ceiling-entail-explained/article71479414.ece
 *   - https://www.scconline.com/blog/post/2026/09/19/labour-ministry-notifies-25000-wage-ceiling-under-social-security-code/
 *   - https://www.financialexpress.com/money/wage-ceiling-for-mandatory-epfraised-to-rs-25000-4340648/
 *
 * This is two days old at the time of writing and worth re-checking: sources published before
 * 16 September still describe the ₹15,000 ceiling.
 */
export const EPF_WAGE_CEILING_MONTHLY = 25_000;

export interface TakeHomeInput {
    /** Annual cost to company, in INR. */
    totalCtc: number | null;
    /** Annual basic pay, or null when the letter does not state it. */
    annualBasic: number | null;
    /** Annual variable pay included in the CTC, or null. Taxed, but kept out of the monthly figure. */
    annualVariable?: number | null;
}

export interface TaxBreakdown {
    /** Gross annual salary treated as taxable, before the standard deduction. */
    grossAnnual: number;
    taxableIncome: number;
    /** Slab tax after the 87A rebate, before surcharge and cess. */
    incomeTax: number;
    surcharge: number;
    cess: number;
    totalTax: number;
    /** Tax as a share of gross, which is the figure people actually compare. */
    effectiveRate: number;
}

export interface TakeHomeResult {
    regime: 'new';
    rulesVersion: string;
    tax: TaxBreakdown;
    /**
     * Annual employee PF, as a range.
     *
     * `statutoryMinimum` deducts 12% only up to the wage ceiling. `onFullBasic` deducts 12% of
     * all basic, which is common practice in Indian IT. Both are null when basic is unknown.
     * The gap is large — at ₹1,00,000 monthly basic it is about ₹9,000 a month of take-home —
     * which is exactly why this is not silently collapsed into one number.
     */
    employeePf: { statutoryMinimum: number | null; onFullBasic: number | null };
    /**
     * Monthly take-home, excluding variable pay. `high` assumes statutory-minimum PF, `low`
     * assumes PF on full basic. When `isUpperBound`, `high === low` and both are a CEILING.
     */
    netMonthly: { high: number; low: number };
    /** True only when basic is known AND both bounds coincide, i.e. there is a single answer. */
    isExact: boolean;
    /** True when basic is unknown: employer PF, gratuity and employee PF could not be deducted. */
    isUpperBound: boolean;
    /** The offer's CTC. `tax.grossAnnual` is now taxable salary after employer PF and gratuity. */
    ctcAnnual: number;
    /** Annual variable pay left out of `netMonthly`, or null. */
    variableAnnual: number | null;
    /** Employer PF counted inside the CTC, on the same two bases as `employeePf`. */
    employerPf: { statutoryMinimum: number | null; onFullBasic: number | null };
    /** Gratuity provision inside the CTC (4.81% of basic), or null when basic is unknown. */
    gratuity: number | null;
    /** Every approximation made, in plain language, for display. */
    assumptions: string[];
}

/** Slab tax before rebate, surcharge and cess. */
export function slabTax(taxableIncome: number): number {
    if (taxableIncome <= 0) return 0;

    let tax = 0;
    let lowerBound = 0;

    for (const slab of NEW_REGIME_SLABS) {
        const upper = slab.upTo ?? Number.POSITIVE_INFINITY;
        if (taxableIncome <= lowerBound) break;

        const amountInSlab = Math.min(taxableIncome, upper) - lowerBound;
        tax += amountInSlab * slab.rate;
        lowerBound = upper;
    }

    return tax;
}

/**
 * Section 87A rebate, including marginal relief.
 *
 * Below the threshold the rebate cancels the tax outright. Just above it, marginal relief caps
 * the tax at the amount by which income exceeds the threshold — without it, earning ₹1 more
 * than ₹12,00,000 would cost roughly ₹60,000 in tax, and the cliff would make every number
 * near the threshold wrong. This band is exactly where a lot of Indian offers sit, so it is not
 * an edge case.
 */
export function applyRebate87A(taxableIncome: number, tax: number): number {
    if (taxableIncome <= REBATE_87A_INCOME_LIMIT) {
        return Math.max(0, tax - REBATE_87A_MAX);
    }

    const excessOverLimit = taxableIncome - REBATE_87A_INCOME_LIMIT;
    return Math.min(tax, excessOverLimit);
}

export function surchargeFor(totalIncome: number, tax: number): number {
    // Bands are ordered highest-first, so the first match is the applicable rate.
    const band = SURCHARGE_BANDS.find((b) => totalIncome > b.above);
    return band ? tax * band.rate : 0;
}

/**
 * Surcharge with marginal relief at each threshold (MONEY-7).
 *
 * Without relief, crossing ₹50L / ₹1Cr / ₹2Cr of taxable income by ₹100 jumped the tax by
 * lakhs. Relief caps tax + surcharge at: tax at the threshold, plus the surcharge due AT the
 * threshold (the band-below rate), plus the income above the threshold.
 *
 * ponytail: 87A is ignored in `slabTax(band.above)` because it never applies above ₹12L.
 * `surchargeFor` is kept, unchanged, as the un-relieved building block and for its own tests.
 */
export function surchargeWithRelief(taxableIncome: number, incomeTax: number): number {
    const i = SURCHARGE_BANDS.findIndex((b) => taxableIncome > b.above); // highest-first
    if (i < 0) return 0;

    const band = SURCHARGE_BANDS[i];
    const rateBelow = SURCHARGE_BANDS[i + 1]?.rate ?? 0;
    const cap = slabTax(band.above) * (1 + rateBelow) + (taxableIncome - band.above);

    // cap - incomeTax is never negative: slab tax rises at most 30p per rupee above the threshold.
    return Math.min(incomeTax * band.rate, cap - incomeTax);
}

/**
 * Annual income tax on a gross salary, under the new regime.
 *
 * Exported separately from `calculateTakeHome` so the tax arithmetic can be tested against
 * published worked examples without the PF and CTC approximations in the way.
 */
export function calculateTax(grossAnnual: number): TaxBreakdown {
    const taxableIncome = Math.max(0, grossAnnual - STANDARD_DEDUCTION);

    const beforeRebate = slabTax(taxableIncome);
    const incomeTax = applyRebate87A(taxableIncome, beforeRebate);
    const surcharge = surchargeWithRelief(taxableIncome, incomeTax);
    const cess = (incomeTax + surcharge) * CESS_RATE;
    const totalTax = Math.round(incomeTax + surcharge + cess);

    return {
        grossAnnual: Math.round(grossAnnual),
        taxableIncome: Math.round(taxableIncome),
        incomeTax: Math.round(incomeTax),
        surcharge: Math.round(surcharge),
        cess: Math.round(cess),
        totalTax,
        effectiveRate: grossAnnual > 0 ? totalTax / grossAnnual : 0,
    };
}

export type TakeHomeKind = 'exact' | 'range' | 'upper';

/**
 * How to present a stored or fresh take-home result: one figure, a low-high range, or "up to".
 *
 * ponytail: a stored OLD-shape row has no `isUpperBound`. Every old figure also omitted employer
 * PF / gratuity / variable (MONEY-1), so it overstates even when basic was known. Safest minimal
 * choice: a missing flag means 'upper' ("up to"), never 'exact'. No backfill of stored rows.
 */
export function takeHomeKind(t: { isExact: boolean; isUpperBound?: boolean }): TakeHomeKind {
    if (typeof t.isUpperBound !== 'boolean' || t.isUpperBound) return 'upper';
    return t.isExact ? 'exact' : 'range';
}

const inr = (n: number): string => n.toLocaleString('en-IN');

/**
 * Take-home from an offer's compensation, or null when there is not enough to work with.
 *
 * Returns null on a missing or non-positive CTC rather than reporting zero tax on zero income,
 * which would render as a confident "₹0 per month".
 *
 * Per scenario (statutory-minimum PF = `high`, PF on full basic = `low`), with C = CTC, V = annual
 * variable, B = basic:
 *   G       = C - employerPf - gratuity           (neither is salary income; both sit in the CTC)
 *   tax     = calculateTax(G)                     (on fixed + variable together)
 *   monthly = ((G - V) * (1 - tax / G) - employeePf) / 12
 * i.e. variable's tax is its share at the AVERAGE rate, and it is excluded from the monthly cash.
 * With B unknown the PF and gratuity terms are 0, so the result is an upper bound.
 */
export function calculateTakeHome(input: TakeHomeInput): TakeHomeResult | null {
    const { totalCtc } = input;
    if (!totalCtc || totalCtc <= 0 || !Number.isFinite(totalCtc)) return null;

    // ponytail: basic at or above the CTC is a misextraction; treat it as "not stated" rather
    // than compute a negative taxable salary.
    const annualBasic = typeof input.annualBasic === 'number' && Number.isFinite(input.annualBasic)
        && input.annualBasic > 0 && input.annualBasic < totalCtc
        ? input.annualBasic
        : null;
    // ponytail: likewise a bonus at or above the CTC (which is documented to include it) is ignored.
    const variable = typeof input.annualVariable === 'number' && Number.isFinite(input.annualVariable)
        && input.annualVariable > 0 && input.annualVariable < totalCtc
        ? input.annualVariable
        : null;
    const basicKnown = annualBasic !== null;

    let statutoryPf: number | null = null;
    let fullBasicPf: number | null = null;
    let gratuity: number | null = null;

    if (annualBasic !== null) {
        const monthlyBasic = annualBasic / 12;
        const cappedMonthly = Math.min(monthlyBasic, EPF_WAGE_CEILING_MONTHLY);

        statutoryPf = Math.round(cappedMonthly * EPF_EMPLOYEE_RATE * 12);
        fullBasicPf = Math.round(monthlyBasic * EPF_EMPLOYEE_RATE * 12);
        gratuity = Math.round(annualBasic * GRATUITY_RATE);
    }

    // ponytail: employer PF is assumed equal to employee PF on the same basis (both 12%).
    const scenario = (pf: number | null) => {
        const employerPf = pf ?? 0;
        const taxableSalary = totalCtc - employerPf - (gratuity ?? 0);
        const tax = calculateTax(taxableSalary);
        const variableShare = Math.min(variable ?? 0, taxableSalary);
        const fixedNet = (taxableSalary - variableShare) * (1 - tax.totalTax / taxableSalary) - (pf ?? 0);
        return { tax, monthlyRaw: Math.max(0, fixedNet) / 12 };
    };

    const high = scenario(statutoryPf);
    const low = scenario(fullBasicPf);

    const assumptions: string[] = [
        'New tax regime, which is the default and better for most salaried taxpayers. '
        + 'The old regime can win with large HRA, home-loan interest or 80C claims — that needs '
        + 'your investment details, which an offer letter does not contain.',
    ];

    if (basicKnown) {
        assumptions.push(
            'Employer PF and a gratuity provision (4.81% of basic) are part of your CTC but are '
            + 'not paid to you or taxed as salary, so they are removed before tax.',
        );
    } else {
        assumptions.push(
            'Your full CTC is treated as taxable salary because basic pay is not stated. CTC '
            + 'usually includes employer PF and a gratuity provision, which are not taxed as '
            + 'salary and never reach your payslip, so tax and take-home are both overstated.',
        );
    }

    if (variable !== null) {
        assumptions.push(
            `Up to ₹${inr(variable)} a year of variable pay is taxed with the rest of your income `
            + 'but shown separately, not in the monthly figure. It is treated as annual and '
            + 'included in your CTC; its tax is assumed to be in proportion to your average tax rate.',
        );
    }

    if (statutoryPf !== null && fullBasicPf !== null) {
        if (statutoryPf === fullBasicPf) {
            assumptions.push(`Employee PF of 12% of basic pay (₹${inr(statutoryPf)} a year).`);
        } else {
            assumptions.push(
                'PF is shown as a range. 12% of basic is mandatory only up to the '
                + `₹${inr(EPF_WAGE_CEILING_MONTHLY)}/month wage ceiling raised on `
                + '17 September 2026; above that it is voluntary. Many employers still deduct on '
                + 'full basic, which lowers take-home — your payslip will show which applies.',
            );
        }
    } else {
        assumptions.push(
            'Employee PF is NOT included: it is 12% of basic pay, and this letter does not state '
            + 'basic separately from the total. Employer PF and gratuity are not removed either. '
            + 'The monthly figure is an upper bound — your actual take-home will be lower by those '
            + 'deductions, depending on your basic-pay split.',
        );
    }

    assumptions.push(
        'Excludes professional tax, which is state-specific and at most ₹2,500 a year.',
    );

    return {
        regime: 'new',
        rulesVersion: TAX_RULES_VERSION,
        // ponytail: the tax tile shows the statutory-PF scenario; the full-basic scenario differs
        // only by the tax on the extra PF gap.
        tax: high.tax,
        employeePf: { statutoryMinimum: statutoryPf, onFullBasic: fullBasicPf },
        employerPf: { statutoryMinimum: statutoryPf, onFullBasic: fullBasicPf },
        gratuity,
        netMonthly: {
            high: Math.round(high.monthlyRaw),
            low: Math.round(low.monthlyRaw),
        },
        isExact: basicKnown && high.monthlyRaw === low.monthlyRaw,
        isUpperBound: !basicKnown,
        ctcAnnual: Math.round(totalCtc),
        variableAnnual: variable !== null ? Math.round(variable) : null,
        assumptions,
    };
}

/**
 * Annual variable pay from the extracted compensation, or null when absent or not positive.
 *
 * ponytail: `variablePay` carries no period field (its schema text is "maximum variable or
 * bonus amount"), so it is read as annual, as `benefits.service` already does.
 */
export function annualVariableFrom(
    variablePay: { amount?: number | null } | null | undefined,
): number | null {
    const amount = variablePay?.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
    return amount;
}
/**
 * Annual basic from the extracted compensation, normalised to a yearly figure.
 *
 * Returns null for absent, zero or non-finite values — all of which mean "not stated" rather
 * than "zero basic pay".
 */
export function annualBasicFrom(
    baseSalary: { amount: number | null; period: 'monthly' | 'annual' } | null | undefined,
): number | null {
    const amount = baseSalary?.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
    return baseSalary!.period === 'monthly' ? amount * 12 : amount;
}
