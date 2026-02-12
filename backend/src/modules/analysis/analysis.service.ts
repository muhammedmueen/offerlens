import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses, NewAnalysis } from '@/db/schema/analyses.js';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { AnalysisResult, ScoreBreakdown } from './analysis.types.js'; // Ensure correct import path
import { analysisQueue } from '@/queue/queues.js'; // Ensure correct import path
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

export class AnalysisService {
    constructor(private fastify: FastifyInstance) { }

    async getAnalysis(offerId: string): Promise<AnalysisResult | null> {
        const analysis = await db.query.analyses.findFirst({
            where: eq(analyses.offerId, offerId),
        });

        if (!analysis) return null;

        // Transform DB record to AnalysisResult type (if structure matches perfectly, cast)
        // DB stores jsonb, so it comes back as object.
        // We need to ensure types match.
        // The DB schema fields map 1:1 to AnalysisResult apart from `id`, `offerId`, `createdAt`.
        return {
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
