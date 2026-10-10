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
import { cacheGetJson, cacheSetJson } from '@/shared/cache.js';
import { CAREER_PATH_CACHE_TTL_SECONDS } from '@/config/constants.js';
import type { Tier } from '@/config/plans.js';
import { release, reserve } from '@/modules/quota/quota.service.js';

/**
 * One cached career path per offer. Invalidated by CorrectionService when the offer's
 * extracted data is corrected — the only event that changes the inputs.
 */
export function careerPathCacheKey(offerId: string): string {
    return `career-path:v1:${offerId}`;
}

export class CareerService {
    constructor(private fastify: FastifyInstance) { }

    /**
     * The career path for an offer. A cache hit is free; a miss costs one unit of the daily
     * career cap (task 4.3), given back if generation fails. Redis fails soft, so during an
     * outage every open is a miss and costs a unit.
     */
    async generatePath(offerId: string, userId: string, tier: Tier, selection: AiProviderSelection = {}) {
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

        const key = careerPathCacheKey(offerId);
        const hit = await cacheGetJson<unknown>(key);
        if (hit !== null) return hit;

        // Throws QuotaExceededError (429) before any AI call.
        const reservation = await reserve(db, { type: 'user', id: userId, tier }, 'career');

        // Task 7: industry and companyType are now extracted from the letter. These were
        // hardcoded to 'Technology' and 'Unknown', which is why every career path read as
        // generic regardless of the actual role — a teaching post got a tech trajectory.
        // Built per call so a development provider override is honoured. Falls through to
        // the configured default when the selection is empty, which is the normal case.
        let path: unknown;
        try {
            const ai = createAiProvider(selection, {
                userId: offer.userId,
                guestId: offer.guestId,
                offerId,
            });
            path = await ai.generateCareerPath({
                role: extracted.role,
                companyType: extracted.companyType || 'Unknown',
                industry: extracted.industry || 'Unknown',
            });
        } catch (error) {
            await release(db, reservation);
            throw error;
        }

        // The provider reports failure as `{ timeline: [], ..., error }` rather than throwing.
        // That is not a career path: give the unit back and don't cache it.
        if (!path || (typeof path === 'object' && 'error' in path && path.error)) {
            await release(db, reservation);
            return path;
        }

        await cacheSetJson(key, path, CAREER_PATH_CACHE_TTL_SECONDS);
        return path;
    }
}
