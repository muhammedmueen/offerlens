import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { eq } from 'drizzle-orm';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { assertOfferAccess } from '@/shared/access/offer-access.js';
import { AnalysisResult, Benefit } from '@/modules/analysis/analysis.types.js';
import { calculateBenefitValues } from './benefits.calculator.js';

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
        const baseSalary = compensation?.baseSalary?.amount || 0;
        const totalComp = baseSalary + (compensation?.variablePay?.amount || 0) + benefitsTotal;

        return {
            totalCompensation: totalComp,
            baseSalary,
            benefitsValue: benefitsTotal,
            breakdown,
            currency: compensation?.currency || 'INR',
        };
    }
}
