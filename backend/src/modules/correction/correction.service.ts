import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { corrections } from '@/db/schema/corrections.js';
import { eq, and } from 'drizzle-orm';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { assertOfferAccess } from '@/shared/access/offer-access.js';

interface CorrectionInput {
    field: string;
    correctedValue: unknown;
}

export class CorrectionService {
    async applyCorrections(offerId: string, userId: string, items: CorrectionInput[]) {
        // Verify offer ownership
        const offer = await db.query.offers.findFirst({ where: eq(offers.id, offerId) });
        if (!offer) throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
        assertOfferAccess(offer, { userId });
        if (offer.status !== 'COMPLETED') {
            throw new AppError(ERROR_CODES.OFFER_NOT_READY, 'Offer analysis must be completed before submitting corrections', 400);
        }

        // Get analysis to check original values
        const analysis = await db.query.analyses.findFirst({ where: eq(analyses.offerId, offerId) });
        if (!analysis) throw new AppError(ERROR_CODES.NOT_FOUND, 'Analysis not found', 404);

        let changedCount = 0;

        for (const item of items) {
            // Get original value by traversing the field path
            const originalValue = this.getNestedValue(analysis, item.field);

            // Check if correction is actually different
            if (JSON.stringify(originalValue) === JSON.stringify(item.correctedValue)) {
                continue;
            }

            await db.insert(corrections).values({
                offerId,
                userId,
                field: item.field,
                originalValue: originalValue ?? null,
                correctedValue: item.correctedValue ?? null,
            });

            changedCount++;
        }

        return {
            changed: changedCount > 0,
            correctionsApplied: changedCount,
            totalSubmitted: items.length,
        };
    }

    async getCorrections(offerId: string, userId: string) {
        const offer = await db.query.offers.findFirst({ where: eq(offers.id, offerId) });
        if (!offer) throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
        assertOfferAccess(offer, { userId });

        const result = await db.query.corrections.findMany({
            where: eq(corrections.offerId, offerId),
            orderBy: (c, { desc }) => [desc(c.createdAt)],
        });

        return result;
    }

    private getNestedValue(obj: any, path: string): unknown {
        const parts = path.split('.');
        let current = obj;

        for (const part of parts) {
            // Handle array indexing like redFlags[0]
            const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
            if (arrayMatch) {
                current = current?.[arrayMatch[1]]?.[parseInt(arrayMatch[2])];
            } else {
                current = current?.[part];
            }
            if (current === undefined) return undefined;
        }

        return current;
    }
}
