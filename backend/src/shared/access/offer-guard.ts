import type { FastifyRequest } from 'fastify';
import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { eq } from 'drizzle-orm';
import { GuestService } from '@/modules/guest/guest.service.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import {
    assertOfferAccess,
    canAccessOffer,
    type AccessibleOffer,
} from './offer-access.js';

const guestService = new GuestService();

/**
 * Request-aware wrapper around the pure `canAccessOffer` decision (ADR-001).
 *
 * `request.guestId` holds the opaque cookie token, not a `guests.id`, so the guest
 * branch needs a lookup. That lookup is skipped entirely when the requester is
 * already the registered owner — which is the common case for every route gated
 * behind `requireRegistered`.
 */
export async function assertRequestCanAccessOffer(
    offer: AccessibleOffer,
    request: FastifyRequest,
): Promise<void> {
    if (canAccessOffer(offer, { userId: request.userId })) {
        return;
    }

    const guest = request.guestId
        ? await guestService.findByToken(request.guestId)
        : null;

    assertOfferAccess(offer, {
        userId: request.userId,
        guestId: guest?.id ?? null,
    });
}

/**
 * Load an offer and authorize it in one step.
 *
 * Both the missing-offer and the not-yours cases raise the same 404 so the endpoint
 * cannot be used to probe which offer IDs exist.
 */
export async function loadAuthorizedOffer(offerId: string, request: FastifyRequest) {
    const offer = await db.query.offers.findFirst({
        where: eq(offers.id, offerId),
    });

    if (!offer) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
    }

    await assertRequestCanAccessOffer(offer, request);

    return offer;
}
