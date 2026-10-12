import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { config } from '@/config/index.js';
import { GUEST_COOKIE_NAME, GUEST_COOKIE_MAX_AGE_SECONDS } from '@/config/constants.js';

declare module 'fastify' {
    interface FastifyRequest {
        /**
         * Opaque server-issued guest token from the signed `ol_guest` cookie.
         *
         * This is NOT a `guests.id`. It is the value stored in `guests.fingerprint`.
         * Resolve it via `GuestService.findByToken()` when you need the row.
         *
         * Kept as the raw token because the rate limiter keys on it directly.
         */
        guestId?: string;
        /** True when this request carried no valid cookie and `guestId` was minted just now. */
        guestIsNew?: boolean;
    }
}

const GUEST_TOKEN_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isValidGuestToken(value: unknown): value is string {
    return typeof value === 'string' && GUEST_TOKEN_PATTERN.test(value);
}

/**
 * Decide the guest token for a request, given whatever survived cookie unsigning.
 *
 * Pure so the branch logic is testable without a Fastify instance.
 *
 * The shape check matters even though the signature already guarantees authenticity:
 * a cookie signed under a rotated secret, or left over from an older identity scheme,
 * should be replaced rather than adopted as an identity.
 */
export function resolveGuestToken(unsignedValue: string | null): {
    token: string;
    isNew: boolean;
} {
    if (isValidGuestToken(unsignedValue)) {
        return { token: unsignedValue, isNew: false };
    }
    return { token: crypto.randomUUID(), isNew: true };
}

export function guestCookieOptions() {
    return {
        signed: true,
        httpOnly: true,
        // ponytail: 'lax' covers same-site deployments, including different ports on
        // localhost and app./api. subdomains of one registrable domain. If the frontend
        // and backend ever land on genuinely different domains, this must become
        // sameSite: 'none' + secure: true, and CORS origin must stay explicit.
        sameSite: 'lax' as const,
        secure: config.NODE_ENV === 'production',
        path: '/',
        maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
    };
}

/**
 * Establishes guest identity from a signed httpOnly cookie (ADR-001).
 *
 * Replaces the previous `MD5(ip + userAgent)` scheme, which collapsed every visitor
 * behind a NAT into one identity — sharing the upload quota, counting feature-request
 * votes per network, and letting signup migrate a stranger's offers into a new account.
 *
 * Because identity is now server-issued and signed, the spoofing detector this file
 * used to carry is gone: there is nothing left for a client to forge.
 */
export const guestIdentifier = async (request: FastifyRequest, reply: FastifyReply) => {
    const rawCookie = request.cookies?.[GUEST_COOKIE_NAME];

    let unsigned: string | null = null;
    if (rawCookie) {
        const result = request.unsignCookie(rawCookie);
        if (result.valid && result.value) {
            unsigned = result.value;
        }
    }

    const { token, isNew } = resolveGuestToken(unsigned);

    if (isNew) {
        reply.setCookie(GUEST_COOKIE_NAME, token, guestCookieOptions());
    }

    request.guestId = token;
    request.guestIsNew = isNew;
};
