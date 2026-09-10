import { describe, it, expect } from 'vitest';
import { canAccessOffer, assertOfferAccess } from './offer-access.js';
import { AppError } from '@/shared/errors/app-error.js';

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const GUEST_A = 'cccccccc-0000-0000-0000-000000000003';
const GUEST_B = 'dddddddd-0000-0000-0000-000000000004';

describe('canAccessOffer', () => {
    it('allows the registered owner', () => {
        expect(canAccessOffer({ userId: USER_A, guestId: null }, { userId: USER_A })).toBe(true);
    });

    it('denies a different registered user', () => {
        // This is the DELETE /offers/:id bug: requireRegistered proved authentication
        // but never ownership, so any logged-in user could delete any offer.
        expect(canAccessOffer({ userId: USER_A, guestId: null }, { userId: USER_B })).toBe(false);
    });

    it('allows the owning guest on an unclaimed offer', () => {
        expect(canAccessOffer({ userId: null, guestId: GUEST_A }, { guestId: GUEST_A })).toBe(true);
    });

    it('denies a different guest', () => {
        expect(canAccessOffer({ userId: null, guestId: GUEST_A }, { guestId: GUEST_B })).toBe(false);
    });

    it('denies an anonymous caller with no identity at all', () => {
        // GET /offers/:id used to have no auth whatsoever and returned rawText.
        expect(canAccessOffer({ userId: USER_A, guestId: null }, {})).toBe(false);
        expect(canAccessOffer({ userId: null, guestId: GUEST_A }, {})).toBe(false);
    });

    it('denies the original guest once the offer has been migrated to a user', () => {
        // migrateGuestOffers sets userId but leaves guestId populated. Without the
        // !offer.userId condition this would wrongly stay accessible.
        expect(
            canAccessOffer({ userId: USER_A, guestId: GUEST_A }, { guestId: GUEST_A }),
        ).toBe(false);
    });

    it('still allows the new owner after migration', () => {
        expect(
            canAccessOffer({ userId: USER_A, guestId: GUEST_A }, { userId: USER_A }),
        ).toBe(true);
    });

    it('denies an orphaned offer with no owner of either kind', () => {
        expect(canAccessOffer({ userId: null, guestId: null }, { userId: USER_A })).toBe(false);
        expect(canAccessOffer({ userId: null, guestId: null }, { guestId: GUEST_A })).toBe(false);
    });

    it('does not treat empty-string identities as a match', () => {
        expect(canAccessOffer({ userId: '', guestId: '' }, { userId: '', guestId: '' })).toBe(false);
    });

    it('ignores a guest match when the actor is a different registered user', () => {
        // Actor carries both identities: logged in as B, but browser still holds guest A's
        // cookie. The offer belongs to guest A and is unclaimed, so guest access applies.
        expect(
            canAccessOffer({ userId: null, guestId: GUEST_A }, { userId: USER_B, guestId: GUEST_A }),
        ).toBe(true);
        // ...but a user-owned offer is not reachable via a stale guest cookie.
        expect(
            canAccessOffer({ userId: USER_A, guestId: null }, { userId: USER_B, guestId: GUEST_A }),
        ).toBe(false);
    });
});

describe('assertOfferAccess', () => {
    it('returns silently when access is allowed', () => {
        expect(() => assertOfferAccess({ userId: USER_A, guestId: null }, { userId: USER_A }))
            .not.toThrow();
    });

    it('throws 404 rather than 403 so the endpoint is not an enumeration oracle', () => {
        try {
            assertOfferAccess({ userId: USER_A, guestId: null }, { userId: USER_B });
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(AppError);
            expect((err as AppError).statusCode).toBe(404);
        }
    });
});
