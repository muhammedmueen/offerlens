import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { AnalysisResult } from '@/modules/analysis/analysis.types.js';

export class CareerService {
    constructor(private fastify: FastifyInstance) { }

    async generatePath(offerId: string, userId: string) {
        const offer = await db.query.offers.findFirst({ where: eq(offers.id, offerId) });
        if (!offer) throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
        if (offer.userId !== userId) throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Not authorized', 403);
        if (offer.status !== 'COMPLETED') { // Corrected: offer.status check
            throw new AppError(ERROR_CODES.OFFER_NOT_READY, 'Offer analysis must be completed first', 400);
        }

        const analysis = await db.query.analyses.findFirst({ where: eq(analyses.offerId, offerId) });
        if (!analysis) throw new AppError(ERROR_CODES.NOT_FOUND, 'Analysis not found', 404);

        const extracted = analysis.extractedData as AnalysisResult['extractedData'];

        if (!extracted.role) {
            throw new AppError(ERROR_CODES.INVALID_INPUT, 'Cannot generate career path: Role not identified in offer', 400);
        }

        // Generate via AI
        const path = await this.fastify.ai.generateCareerPath({
            role: extracted.role,
            companyType: 'Unknown', // Could extract from company metadata if available
            industry: 'Technology', // Defaulting for MVP
        });

        return path;
    }
}
