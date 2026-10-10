import { FastifyInstance, RouteShorthandOptions } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { RATE_LIMITS } from '@/config/constants.js';

/**
 * The error the plugin throws on a 429. `retryAfterSeconds` lets the error handler set a
 * Retry-After header if the plugin's own did not survive. Exported for the error-handler test.
 */
export function rateLimitErrorResponse(_req: unknown, context: { after: string; ttl: number }) {
    return {
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Try again in ${context.after}.`,
        retryAfterSeconds: Math.max(1, Math.ceil(context.ttl / 1000)),
    };
}

/**
 * Global limiter. Registered once; per-route limits are layered on top via `routeLimit`.
 */
export const registerRateLimiter = async (fastify: FastifyInstance) => {
    await fastify.register(rateLimit, {
        global: true,
        max: RATE_LIMITS.global.max,
        timeWindow: RATE_LIMITS.global.window,
        redis: fastify.redis, // Shared instance, so limits hold across processes.
        keyGenerator: (req) => {
            // guestId is the signed guest cookie token (ADR-001), so this is per-browser
            // rather than per-IP. Falls back to IP if the cookie hook has not run.
            return (req as any).guestId || req.ip;
        },
        errorResponseBuilder: rateLimitErrorResponse,
    });
};

/**
 * Per-route limit, for use in a route's options.
 *
 * `RATE_LIMITS` has defined 15 of these since the beginning and exactly one — `global` —
 * was ever registered. So `authLogin: { max: 10, window: '15 minutes' }` was dead config
 * and login brute-force protection was whatever the 100/min global allowed.
 *
 * v1 commit `ab9702f` commented these out with the message "temporarily disable rate
 * limiting to allow unrestricted access during development/testing". No incident, so
 * re-enabling carries no known regression risk (ADR-003).
 *
 *   fastify.post('/login', { ...routeLimit('authLogin'), schema, handler })
 *
 * Per-route config inherits the global keyGenerator and error builder.
 */
export function routeLimit(name: keyof typeof RATE_LIMITS): RouteShorthandOptions {
    const limit = RATE_LIMITS[name];
    return {
        config: {
            rateLimit: {
                max: limit.max,
                timeWindow: limit.window,
            },
        },
    };
}
