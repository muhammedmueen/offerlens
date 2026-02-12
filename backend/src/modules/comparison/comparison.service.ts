import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { eq, inArray } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { AnalysisResult } from '@/modules/analysis/analysis.types.js';

interface ComparisonEntry {
    offerId: string;
    companyName: string | null;
    role: string | null;
    score: number;
    scoreLabel: string;
    baseSalary: number | null;
    totalCTC: number | null;
    currency: string;
    redFlagCount: number;
    benefitCount: number;
    offerPercentile: number;
}

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
            if (offer.userId !== userId) throw new AppError(ERROR_CODES.UNAUTHORIZED, `Not authorized to access offer ${id}`, 403);
            if (offer.status !== 'COMPLETED') {
                throw new AppError(ERROR_CODES.OFFER_NOT_READY, `Offer ${id} is not ready for comparison. Status: ${offer.status}`, 400);
            }
        }

        // Fetch all analyses
        const analysisRecords = await db.select()
            .from(analyses)
            .where(inArray(analyses.offerId, offerIds));

        // Build comparison matrix
        const entries: ComparisonEntry[] = offerIds.map(id => {
            const analysis = analysisRecords.find(a => a.offerId === id);
            if (!analysis) throw new AppError(ERROR_CODES.NOT_FOUND, `Analysis for offer ${id} not found`, 404);

            const extracted = analysis.extractedData as AnalysisResult['extractedData'];
            const salary = analysis.salaryComparison as AnalysisResult['salaryComparison'];
            const redFlags = analysis.redFlags as AnalysisResult['redFlags'];
            const benefits = analysis.benefits as AnalysisResult['benefits'];

            return {
                offerId: id,
                companyName: extracted.companyName,
                role: extracted.role,
                score: analysis.score,
                scoreLabel: analysis.scoreLabel,
                baseSalary: extracted.compensation?.baseSalary?.amount || null,
                totalCTC: extracted.compensation?.totalCTC || null,
                currency: extracted.compensation?.currency || 'INR',
                redFlagCount: redFlags?.length || 0,
                benefitCount: benefits?.length || 0,
                offerPercentile: salary?.offerPercentile || 0,
            };
        });

        // Generate recommendation
        const recommendation = this.generateRecommendation(entries);

        return {
            offers: entries,
            recommendation,
            comparedAt: new Date().toISOString(),
        };
    }

    private generateRecommendation(entries: ComparisonEntry[]) {
        // Simple deterministic recommendation based on score + percentile
        const sorted = [...entries].sort((a, b) => b.score - a.score);
        const best = sorted[0];
        const others = sorted.slice(1);

        const advantages: string[] = [];
        if (best.score > (others[0]?.score || 0) + 10) {
            advantages.push(`Significantly higher overall score (${best.score} vs ${others.map(o => o.score).join(', ')})`);
        }
        if (best.redFlagCount < Math.min(...others.map(o => o.redFlagCount))) {
            advantages.push('Fewer red flags');
        }
        if (best.offerPercentile > Math.max(...others.map(o => o.offerPercentile))) {
            advantages.push('Better market positioning');
        }

        return {
            recommendedOfferId: best.offerId,
            companyName: best.companyName,
            reason: `Highest overall score of ${best.score}/100`,
            advantages,
            caveat: 'This recommendation is based on quantitative analysis. Consider non-quantifiable factors like company culture, growth opportunities, and personal preferences.',
        };
    }
}
