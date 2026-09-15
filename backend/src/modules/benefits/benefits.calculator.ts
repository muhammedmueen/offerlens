import { Benefit, Compensation } from '@/modules/analysis/analysis.types.js';

export interface BenefitBreakdown {
    name: string;
    category: 'pto' | 'insurance' | 'equity' | 'retirement' | 'other';
    monetaryValue: number | null;
    details: string;
    isQuantifiable: boolean;
}

const WORKING_DAYS_PER_YEAR = 260;

export function calculateBenefitValues(
    benefits: Benefit[],
    compensation: Compensation | null,
    overrides?: Record<string, number>
): BenefitBreakdown[] {
    const dailyRate = compensation?.baseSalary
        ? compensation.baseSalary.amount / (compensation.baseSalary.period === 'monthly' ? 22 : WORKING_DAYS_PER_YEAR)
        : 0;

    return benefits.map((benefit): BenefitBreakdown => {
        // Defensive: this is fed AI-derived data. A non-string name threw a 500 here.
        const name = String(benefit?.name ?? '').toLowerCase();
        const overrideValue = overrides?.[benefit.name];

        if (overrideValue !== undefined) {
            return {
                name: benefit.name,
                category: categorize(name),
                monetaryValue: overrideValue,
                details: `User-provided value: ${overrideValue}`,
                isQuantifiable: true,
            };
        }

        // PTO / Leave
        if (name.includes('pto') || name.includes('leave') || name.includes('vacation') || name.includes('holiday')) {
            const days = extractCount(benefit.value || benefit.details || '');

            if (days && dailyRate) {
                return {
                    name: benefit.name,
                    category: 'pto',
                    monetaryValue: Math.round(days * dailyRate),
                    details: `${days} days × ₹${Math.round(dailyRate)}/day`,
                    isQuantifiable: true,
                };
            }

            // Return here rather than falling through. Previously, when base salary was
            // unknown (dailyRate 0) this dropped to the generic branch below, which read
            // the day count as a rupee amount — "18 days of paid leave" became ₹18 and
            // was summed into totalCompensation.
            return {
                name: benefit.name,
                category: 'pto',
                monetaryValue: null,
                details: days
                    ? `${days} days — not valued, base salary unknown`
                    : 'Leave mentioned but the number of days could not be read',
                isQuantifiable: false,
            };
        }

        // Insurance / Health
        if (name.includes('insurance') || name.includes('health') || name.includes('medical')) {
            const amount = extractMoney(benefit.value || benefit.details || '');
            if (amount) {
                return {
                    name: benefit.name,
                    category: 'insurance',
                    monetaryValue: amount,
                    details: `Annual premium: ${amount}`,
                    isQuantifiable: true,
                };
            }
            // Default insurance estimate if no amount given
            return {
                name: benefit.name,
                category: 'insurance',
                monetaryValue: null,
                details: 'Coverage mentioned but value not quantifiable from offer text',
                isQuantifiable: false,
            };
        }

        // Equity / RSU / ESOP
        if (name.includes('equity') || name.includes('rsu') || name.includes('esop') || name.includes('stock')) {
            const amount = extractMoney(benefit.value || benefit.details || '');
            if (amount) {
                return {
                    name: benefit.name,
                    category: 'equity',
                    monetaryValue: amount,
                    details: `Equity value: ${amount}`,
                    isQuantifiable: true,
                };
            }
            return {
                name: benefit.name,
                category: 'equity',
                monetaryValue: null,
                details: 'Mentioned but not quantifiable — missing vesting schedule or strike price',
                isQuantifiable: false,
            };
        }

        // Retirement / PF / 401k
        if (name.includes('provident') || name.includes('pf') || name.includes('retirement') || name.includes('401k')) {
            const amount = extractMoney(benefit.value || benefit.details || '');
            if (amount) {
                return {
                    name: benefit.name,
                    category: 'retirement',
                    monetaryValue: amount,
                    details: `Annual contribution: ${amount}`,
                    isQuantifiable: true,
                };
            }
        }

        // Generic fallback
        const amount = extractMoney(benefit.value || benefit.details || '');
        return {
            name: benefit.name,
            category: 'other',
            monetaryValue: amount || null,
            details: benefit.details || benefit.value || 'No monetary value extractable',
            isQuantifiable: amount !== null,
        };
    });
}

function categorize(name: string): BenefitBreakdown['category'] {
    if (name.includes('pto') || name.includes('leave') || name.includes('vacation')) return 'pto';
    if (name.includes('insurance') || name.includes('health') || name.includes('medical')) return 'insurance';
    if (name.includes('equity') || name.includes('rsu') || name.includes('esop') || name.includes('stock')) return 'equity';
    if (name.includes('provident') || name.includes('pf') || name.includes('retirement') || name.includes('401k')) return 'retirement';
    return 'other';
}

/**
 * Indian magnitude suffixes. Order matters: check longer words before their prefixes so
 * "crore" isn't matched as "cr" with "ore" left over.
 */
const MAGNITUDES: Array<[pattern: RegExp, multiplier: number]> = [
    [/\bcrores?\b/i, 10_000_000],
    [/\blakhs?\b/i, 100_000],
    [/\blacs?\b/i, 100_000],
    [/\bcr\b\.?/i, 10_000_000],
    [/\blpa\b/i, 100_000],
    [/(\d)\s*l\b/i, 100_000],   // "2.5L" / "18 L"
    [/(\d)\s*k\b/i, 1_000],     // "25k"
];

/**
 * Extract a monetary amount from free text, honouring Indian magnitude words.
 *
 * The previous version stripped currency symbols and took the first number with no unit
 * handling, so "₹5 lakh" became 5 and "10 LPA" became 10 — wrong by five orders of
 * magnitude, and it fed straight into `totalCompensation`.
 *
 * Digit-grouped forms ("5,00,000" and "500,000") already worked because commas are
 * stripped, and both still do.
 */
export function extractMoney(text: string): number | null {
    if (!text) return null;

    const cleaned = text.replace(/[₹$€£,]/g, '');
    const match = cleaned.match(/\d+(?:\.\d+)?/);
    if (!match) return null;

    const base = parseFloat(match[0]);
    if (!Number.isFinite(base)) return null;

    for (const [pattern, multiplier] of MAGNITUDES) {
        if (pattern.test(cleaned)) return Math.round(base * multiplier);
    }

    return base;
}

/**
 * Extract a plain count (days, months) with no magnitude scaling.
 *
 * Kept separate from `extractMoney` on purpose: "18 days" must never be multiplied, and
 * "18 L" must never be read as a day count.
 */
export function extractCount(text: string): number | null {
    if (!text) return null;
    const match = text.match(/\d+(?:\.\d+)?/);
    if (!match) return null;
    const value = parseFloat(match[0]);
    return Number.isFinite(value) ? value : null;
}
