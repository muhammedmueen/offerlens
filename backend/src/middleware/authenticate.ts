import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '@/modules/auth/auth.service.js';

declare module 'fastify' {
    interface FastifyRequest {
        userId?: string;
        userEmail?: string;
        isAuthenticated: boolean;
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
        // Token invalid/expired — treat as guest
        // Don't throw; let routes decide if auth is required
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

    if (!request.isAuthenticated) {
        return reply.status(403).send({
            success: false,
            error: {
                code: 'GUEST_RESTRICTED',
                message: 'Create a free account to access this feature',
            },
        });
    }
};
