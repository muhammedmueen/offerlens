import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '@/modules/auth/auth.service.js';

declare module 'fastify' {
    interface FastifyRequest {
        userId?: string;
        userEmail?: string;
        isAuthenticated: boolean;
        // A Bearer token was present but failed verification (expired/invalid). Distinguishes
        // "bad credentials" (-> 401 so the client refreshes) from "no credentials" (true guest).
        // `authenticate` rejects it with 401 TOKEN_EXPIRED.
        tokenInvalid?: boolean;
    }
}

const authService = new AuthService();

// These authenticate from the request body (credentials or a refresh token) and never read the
// Bearer, so a stale header left in the browser must not block signing back in (B9).
// ponytail: matched by path. A new body-authenticated /auth route must be added here.
const BODY_AUTHENTICATED_ROUTE = /\/auth\/(login|signup|google|refresh|logout)$/;

const tokenExpired = (reply: FastifyReply) =>
    reply.status(401).send({
        success: false,
        error: {
            code: 'TOKEN_EXPIRED',
            message: 'Access token expired or invalid',
        },
    });

const readBearer = (request: FastifyRequest) => {
    request.isAuthenticated = false;
    request.tokenInvalid = false;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return;

    const token = authHeader.slice(7);
    if (!token) return;

    try {
        const payload = authService.verifyAccessToken(token);
        request.userId = payload.userId;
        request.userEmail = payload.email;
        request.isAuthenticated = true;
    } catch {
        // A Bearer token was present but invalid/expired. The root `authenticate` hook rejects
        // it; the guards below still report 401 when used on their own. A request with NO
        // token stays a true guest (ADR-001).
        request.tokenInvalid = true;
    }
};

/**
 * JWT authentication onRequest hook.
 * Extracts Bearer token, verifies it, sets request.userId and request.isAuthenticated.
 * A request with no token passes as a guest — routes decide how to handle guests vs users.
 * A present-but-invalid token gets 401 TOKEN_EXPIRED on every route except the
 * body-authenticated /auth routes.
 */
export const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    readBearer(request);
    // A Bearer that fails verification is never downgraded to a guest (FLOW-1/AUTH-2): 401 so the
    // client refreshes and retries. No Bearer at all stays a true guest (ADR-001).
    if (request.tokenInvalid && !BODY_AUTHENTICATED_ROUTE.test(request.routeOptions.url ?? '')) {
        return tokenExpired(reply);
    }
};

/**
 * Strict auth guard — use as preHandler for routes that REQUIRE authentication.
 * Returns 401 if no valid token.
 */
export const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    readBearer(request);

    if (!request.isAuthenticated) {
        return reply.status(401).send({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required. Please log in.',
            },
        });
    }
};

/**
 * Guest restriction guard — returns 403 for unauthenticated requests.
 * Use for premium features that require a registered account.
 */
export const requireRegistered = async (request: FastifyRequest, reply: FastifyReply) => {
    readBearer(request);

    if (request.isAuthenticated) return;

    // Present-but-invalid/expired token -> 401 so the client's refresh interceptor fires and
    // retries. No token at all -> 403 GUEST_RESTRICTED (a true guest hitting a members-only
    // feature). 403 must NOT trigger a refresh loop, so the distinction matters.
    if (request.tokenInvalid) {
        return tokenExpired(reply);
    }

    return reply.status(403).send({
        success: false,
        error: {
            code: 'GUEST_RESTRICTED',
            message: 'Create a free account to access this feature',
        },
    });
};
