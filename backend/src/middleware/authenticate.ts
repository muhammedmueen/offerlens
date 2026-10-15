import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '@/modules/auth/auth.service.js';

declare module 'fastify' {
    interface FastifyRequest {
        userId?: string;
        userEmail?: string;
        isAuthenticated: boolean;
        // A Bearer token was present but failed verification (expired/invalid). Distinguishes
        // "bad credentials" (-> 401 so the client refreshes) from "no credentials" (true guest).
        tokenInvalid?: boolean;
    }
}

const authService = new AuthService();

/**
 * JWT authentication preHandler hook.
 * Extracts Bearer token, verifies it, sets request.userId and request.isAuthenticated.
 * Does NOT reject unauthenticated requests — routes decide how to handle guests vs users.
 */
export const authenticate = async (request: FastifyRequest, _reply: FastifyReply) => {
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
        // A Bearer token was present but invalid/expired. Flag it so requireRegistered can
        // return 401 (which the frontend interceptor refreshes) rather than 403 GUEST_RESTRICTED.
        // Still don't throw: a request with NO token stays a true guest (ADR-001).
        request.tokenInvalid = true;
    }
};

/**
 * Strict auth guard — use as preHandler for routes that REQUIRE authentication.
 * Returns 401 if no valid token.
 */
export const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);

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
    await authenticate(request, reply);

    if (request.isAuthenticated) return;

    // Present-but-invalid/expired token -> 401 so the client's refresh interceptor fires and
    // retries. No token at all -> 403 GUEST_RESTRICTED (a true guest hitting a members-only
    // feature). 403 must NOT trigger a refresh loop, so the distinction matters.
    if (request.tokenInvalid) {
        return reply.status(401).send({
            success: false,
            error: {
                code: 'TOKEN_EXPIRED',
                message: 'Access token expired or invalid',
            },
        });
    }

    return reply.status(403).send({
        success: false,
        error: {
            code: 'GUEST_RESTRICTED',
            message: 'Create a free account to access this feature',
        },
    });
};
