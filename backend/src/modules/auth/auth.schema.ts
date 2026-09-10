import { z } from 'zod';

/**
 * Offer IDs the client believes it created as a guest (ADR-001).
 *
 * Defence in depth for migration: the server still verifies every ID belongs to the
 * presenting guest cookie, so a forged list grants nothing. Capped to keep the
 * verification query bounded.
 */
const claimedOfferIds = z.array(z.string().uuid()).max(50).optional();

export const signupSchema = {
    body: z.object({
        email: z.string().email('Invalid email address'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        name: z.string().min(1).max(100).optional(),
        offerIds: claimedOfferIds,
    }),
};

export const loginSchema = {
    body: z.object({
        email: z.string().email('Invalid email address'),
        password: z.string().min(1, 'Password is required'),
    }),
};

export const googleAuthSchema = {
    body: z.object({
        idToken: z.string().optional(),
        accessToken: z.string().optional(),
        offerIds: claimedOfferIds,
    }).refine((data) => data.idToken || data.accessToken, {
        message: "Either idToken or accessToken is required",
        path: ["idToken"],
    }),
};

export const refreshTokenSchema = {
    body: z.object({
        refreshToken: z.string().min(1, 'Refresh token is required'),
    }),
};
