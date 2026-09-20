import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { assertOfferAccess } from '@/shared/access/offer-access.js';
import { AnalysisResult } from '@/modules/analysis/analysis.types.js';
import { createAiProvider, type AiProviderSelection } from '@/providers/ai/ai.factory.js';

export class CareerService {
    constructor(private fastify: FastifyInstance) { }

    async generatePath(offerId: string, userId: string, selection: AiProviderSelection = {}) {
        const offer = await db.query.offers.findFirst({ where: eq(offers.id, offerId) });
        if (!offer) throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
        assertOfferAccess(offer, { userId });
        if (offer.status !== 'COMPLETED') {
            throw new AppError(ERROR_CODES.OFFER_NOT_READY, 'Offer analysis must be completed first', 400);
        }

        const analysis = await db.query.analyses.findFirst({ where: eq(analyses.offerId, offerId) });
        if (!analysis) throw new AppError(ERROR_CODES.NOT_FOUND, 'Analysis not found', 404);

        const extracted = analysis.extractedData as AnalysisResult['extractedData'];

        if (!extracted.role) {
            throw new AppError(ERROR_CODES.INVALID_INPUT, 'Cannot generate career path: Role not identified in offer', 400);
        }

        // Task 7: industry and companyType are now extracted from the letter. These were
        // hardcoded to 'Technology' and 'Unknown', which is why every career path read as
        // generic regardless of the actual role — a teaching post got a tech trajectory.
        // Built per call so a development provider override is honoured. Falls through to
        // the configured default when the selection is empty, which is the normal case.
        const ai = createAiProvider(selection);

        const path = await ai.generateCareerPath({
            role: extracted.role,
            companyType: extracted.companyType || 'Unknown',
            industry: extracted.industry || 'Unknown',
        });

        return path;
    }
}
