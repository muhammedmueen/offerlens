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
        const name = benefit.name.toLowerCase();
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
            const days = extractNumber(benefit.value || benefit.details || '');
            if (days && dailyRate) {
                return {
                    name: benefit.name,
                    category: 'pto',
                    monetaryValue: Math.round(days * dailyRate),
                    details: `${days} days × ${Math.round(dailyRate)}/day`,
                    isQuantifiable: true,
                };
            }
        }

        // Insurance / Health
        if (name.includes('insurance') || name.includes('health') || name.includes('medical')) {
            const amount = extractNumber(benefit.value || benefit.details || '');
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
            const amount = extractNumber(benefit.value || benefit.details || '');
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
            const amount = extractNumber(benefit.value || benefit.details || '');
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
        const amount = extractNumber(benefit.value || benefit.details || '');
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

function extractNumber(text: string): number | null {
    if (!text) return null;
    // Remove currency symbols and commas, extract first number
    const cleaned = text.replace(/[₹$€£,]/g, '');
    const match = cleaned.match(/[\d]+(?:\.[\d]+)?/);
    return match ? parseFloat(match[0]) : null;
}
