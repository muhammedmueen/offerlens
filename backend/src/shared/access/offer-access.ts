import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

/**
 * Who is asking. Both fields are resolved identities:
 *  - `userId` comes from a verified JWT
 *  - `guestId` is a `guests.id` UUID, NOT the raw cookie token
 *
 * Resolve the token to a guest row before calling (see `GuestService.findByToken`).
 */
export interface OfferActor {
    userId?: string | null;
    guestId?: string | null;
}

/** The subset of an offer row needed to make an access decision. */
export interface AccessibleOffer {
    userId: string | null;
    guestId: string | null;
}

/**
 * Single source of truth for "may this actor touch this offer?".
 *
 * Replaces five hand-rolled `offer.userId !== userId` checks that were duplicated
 * across the negotiation, benefits, comparison, correction, and career services —
 * and that were missing entirely from the offer read/delete/report routes.
 */
export function canAccessOffer(offer: AccessibleOffer, actor: OfferActor): boolean {
    // Registered owner.
    if (offer.userId && actor.userId && offer.userId === actor.userId) {
        return true;
    }

    // Guest owner — deliberately only while the offer is still unclaimed.
    //
    // `migrateGuestOffers` sets `userId` but leaves `guestId` populated, so without
    // the `!offer.userId` condition a guest identity would retain access to an offer
    // after it had been migrated into someone's account.
    if (!offer.userId && offer.guestId && actor.guestId && offer.guestId === actor.guestId) {
        return true;
    }

    return false;
}

/**
 * Throws if the actor may not access the offer.
 *
 * Deliberately raises 404, not 403: a 403 on an existing offer confirms that the ID
 * is real, which turns the endpoint into an enumeration oracle. The previous per-service
 * checks returned 403 — this is an intentional behaviour change.
 */
export function assertOfferAccess(offer: AccessibleOffer, actor: OfferActor): void {
    if (!canAccessOffer(offer, actor)) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
    }
}
