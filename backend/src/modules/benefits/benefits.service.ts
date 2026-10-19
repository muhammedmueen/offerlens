import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { eq } from 'drizzle-orm';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { assertOfferAccess } from '@/shared/access/offer-access.js';
import { AnalysisResult, Benefit, Compensation } from '@/modules/analysis/analysis.types.js';
import { calculateBenefitValues } from './benefits.calculator.js';

/** Annualize a base salary stated monthly or annually. Null amount -> null (not 0). */
function annualizeBase(compensation: Compensation | null | undefined): number | null {
    const base = compensation?.baseSalary;
    if (!base || base.amount == null) return null;
    return base.period === 'monthly' ? base.amount * 12 : base.amount;
}

/**
 * The headline total-compensation figure for the with-benefits branch.
 *
 * Anchors on totalCTC and never falls below it. For CTC-only letters (baseSalary null)
 * this returns totalCTC; when an annual base is present it also considers base + variable
 * pay and takes the larger. Returns null only when neither totalCTC nor an annual base is
 * available, matching the no-benefits branch.
 *
 * ponytail: benefits are NOT summed into the headline. The extraction schema (Benefit:
 * name/value/details/isStandard) cannot tell an on-top-of-CTC perk from one already baked
 * into totalCTC, so adding them risks double-counting and would let the total drop below
 * totalCTC. Upgrade path: a per-benefit `partOfCTC` flag, after which genuinely additive
 * benefits can be added here.
 */
export function computeHeadlineTotal(compensation: Compensation | null | undefined): number | null {
    const totalCTC = compensation?.totalCTC ?? null;
    const annualizedBase = annualizeBase(compensation);
    const variablePay = compensation?.variablePay?.amount || 0;
    const baseDriven = annualizedBase != null ? annualizedBase + variablePay : null;

    if (totalCTC == null && baseDriven == null) return null;
    return Math.max(totalCTC ?? 0, baseDriven ?? 0);
}

export class BenefitsService {
    async calculate(offerId: string, userId: string, overrides?: Record<string, number>) {
        const offer = await db.query.offers.findFirst({ where: eq(offers.id, offerId) });
        if (!offer) throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
        assertOfferAccess(offer, { userId });
        if (offer.status !== 'COMPLETED') {
            throw new AppError(ERROR_CODES.OFFER_NOT_READY, 'Offer analysis must be completed first', 400);
        }

        const analysis = await db.query.analyses.findFirst({ where: eq(analyses.offerId, offerId) });
        if (!analysis) throw new AppError(ERROR_CODES.NOT_FOUND, 'Analysis not found', 404);

        const extractedData = analysis.extractedData as AnalysisResult['extractedData'];
        const benefits = analysis.benefits as Benefit[];
        const compensation = extractedData.compensation;

        if (!benefits || benefits.length === 0) {
            return {
                totalCompensation: compensation?.totalCTC || null,
                baseSalary: compensation?.baseSalary?.amount || null,
                benefitsValue: null,
                breakdown: [],
                message: 'No benefits data found in your offer. Your total comp equals your base CTC.',
            };
        }

        const breakdown = calculateBenefitValues(benefits, compensation, overrides);

        const benefitsTotal = breakdown.reduce((sum, b) => sum + (b.monetaryValue || 0), 0);

        return {
            totalCompensation: computeHeadlineTotal(compensation),
            baseSalary: annualizeBase(compensation),
            benefitsValue: benefitsTotal,
            breakdown,
            currency: compensation?.currency || 'INR',
        };
    }
}
