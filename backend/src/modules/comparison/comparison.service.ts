import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { inArray } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { assertOfferAccess } from '@/shared/access/offer-access.js';
import { AnalysisResult } from '@/modules/analysis/analysis.types.js';
import { annualBasicFrom, takeHomeKind, type TakeHomeResult } from '@/modules/takehome/takehome.calculator.js';
import type { ScoreComponent } from '@/modules/analysis/score.rubric.js';
import { buildComparison, type ComparisonEntry } from './comparison.matrix.js';

export class ComparisonService {
    constructor(private fastify: FastifyInstance) { }

    async compare(offerIds: string[], userId: string) {
        // Fetch all offers and verify ownership
        const offerRecords = await db.select()
            .from(offers)
            .where(inArray(offers.id, offerIds));

        // Validate all offers
        for (const id of offerIds) {
            const offer = offerRecords.find(o => o.id === id);
            if (!offer) throw new AppError(ERROR_CODES.NOT_FOUND, `Offer ${id} not found`, 404);
            assertOfferAccess(offer, { userId });
            if (offer.status !== 'COMPLETED') {
                throw new AppError(ERROR_CODES.OFFER_NOT_READY, `Offer ${id} is not ready for comparison. Status: ${offer.status}`, 400);
            }
        }

        // Fetch all analyses
        const analysisRecords = await db.select()
            .from(analyses)
            .where(inArray(analyses.offerId, offerIds));

        const entries: ComparisonEntry[] = offerIds.map(id => {
            const analysis = analysisRecords.find(a => a.offerId === id);
            if (!analysis) throw new AppError(ERROR_CODES.NOT_FOUND, `Analysis for offer ${id} not found`, 404);

            const extracted = analysis.extractedData as AnalysisResult['extractedData'];
            const redFlags = (analysis.redFlags ?? []) as AnalysisResult['redFlags'];
            const benefits = (analysis.benefits ?? []) as AnalysisResult['benefits'];
            const takeHome = analysis.takeHome as TakeHomeResult | null;

            // Per-component sub-scores, stored at analysis time by task 10. Null for rows
            // written before that migration, which the matrix handles by falling back to
            // stored totals with a caveat rather than inventing dimensions.
            const breakdown = analysis.scoreBreakdown as
                { components: ScoreComponent[]; note: string | null } | null;

            return {
                id,
                company: extracted?.companyName ?? null,
                role: extracted?.role ?? null,
                score: analysis.score,
                scoreLabel: analysis.scoreLabel,
                currency: extracted?.compensation?.currency || 'INR',
                totalCTC: extracted?.compensation?.totalCTC ?? null,
                // Annualised, not the raw amount. `baseSalary` carries a `period`, and the model
                // reports whichever the letter used — so one letter saying "₹1,20,000 per month"
                // and another saying "₹14,40,000 per annum" describe the same pay. Comparing the
                // raw amounts put those in the same column as a 12x difference. Observed on two
                // runs over the same letter, which reported it both ways.
                baseSalary: annualBasicFrom(extracted?.compensation?.baseSalary),
                redFlagCount: Array.isArray(redFlags) ? redFlags.length : 0,
                highSeverityCount: Array.isArray(redFlags)
                    ? redFlags.filter((f) => f?.severity === 'high').length
                    : 0,
                benefitCount: Array.isArray(benefits) ? benefits.length : 0,
                netMonthlyHigh: takeHome?.netMonthly?.high ?? null,
                netMonthlyLow: takeHome?.netMonthly?.low ?? null,
                // Old-shape rows (no `isUpperBound`) come out as 'upper', never 'exact'.
                takeHomeKind: takeHome?.netMonthly ? takeHomeKind(takeHome) : null,
                components: breakdown?.components ?? null,
            };
        });

        return buildComparison(entries);
    }
}
