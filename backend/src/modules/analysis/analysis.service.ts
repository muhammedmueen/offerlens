import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { AnalysisResult, AnalysisResponse } from './analysis.types.js';

export class AnalysisService {
    constructor(private fastify: FastifyInstance) { }

    async getAnalysis(offerId: string): Promise<AnalysisResponse | null> {
        const analysis = await db.query.analyses.findFirst({
            where: eq(analyses.offerId, offerId),
        });

        if (!analysis) return null;

        // The results view also needs offer-level context: the guest expiry banner and
        // the low-OCR-confidence warning both live on the offer, not the analysis.
        const offer = await db.query.offers.findFirst({
            where: eq(offers.id, offerId),
        });

        return {
            // Score is computed by the worker after the AI returns, so it is not part of
            // AnalysisResult. It was previously stored and never returned.
            score: analysis.score,
            scoreLabel: analysis.scoreLabel,
            scoringMethod: analysis.scoringMethod,
            lowConfidence: analysis.lowConfidence,
            redFlagsDiscarded: analysis.redFlagsDiscarded,

            offerStatus: offer?.status ?? 'COMPLETED',
            expiresAt: offer?.expiresAt ?? null,
            ocrConfidence: offer?.ocrConfidence ?? null,

            extractedData: analysis.extractedData as AnalysisResult['extractedData'],
            redFlags: analysis.redFlags as AnalysisResult['redFlags'],
            salaryComparison: analysis.salaryComparison as AnalysisResult['salaryComparison'],
            negotiationSuggestions: analysis.negotiationSuggestions as AnalysisResult['negotiationSuggestions'],
            benefits: analysis.benefits as AnalysisResult['benefits'],
            takeHome: analysis.takeHome as AnalysisResult['takeHome'],
            metadata: analysis.aiMetadata as AnalysisResult['metadata'],
        };
    }
}
