import { FastifyInstance, RouteShorthandOptions } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
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
 *
 * MUST stay wrapped in fastify-plugin. @fastify/rate-limit works through an `onRoute` hook, and
 * that hook only sees routes registered in the same Fastify context. Without `fp` this function
 * is its own encapsulated context, the hook never sees the `/api/v1` routes, and every limit is
 * silently dead (the state this app shipped in until the fix; see rate-limiter.test.ts).
 *
 * `dependencies` makes boot fail if the identity or Redis plugin is not registered first,
 * instead of quietly keying on IP or using a per-process store.
 */
export const registerRateLimiter = fp(
    async (fastify: FastifyInstance) => {
        await fastify.register(rateLimit, {
            global: true,
            max: RATE_LIMITS.global.max,
            timeWindow: RATE_LIMITS.global.window,
            redis: fastify.redis, // Shared instance, so limits hold across processes.
            keyGenerator: (req) => {
                // guestId is the signed guest cookie token (ADR-001): per-browser, not per-IP, so
                // users behind one NAT do not share a bucket. A request that arrived WITHOUT a
                // valid cookie was just handed a brand-new token, and keying on that would give
                // every cookie-less request (curl, a bot) a fresh bucket and bypass every limit,
                // so those fall back to the client IP.
                // ponytail: a client can still mint many cookies (each costs one IP-keyed request)
                // to get many guest buckets. Fine for the global limit; for authLogin the upgrade
                // path is a per-route IP/email keyGenerator. Behind a reverse proxy the IP
                // fallback needs Fastify `trustProxy`, else all cookie-less clients share the
                // proxy's IP bucket (cookie-bearing browsers are unaffected).
                // A signed-in user is keyed by account (set by the `authenticate` onRequest hook,
                // which runs before this route-level hook), so clearing cookies or switching
                // device does not reset their budget.
                if (req.userId) return `u:${req.userId}`;
                return req.guestId && !req.guestIsNew ? `g:${req.guestId}` : `ip:${req.ip}`;
            },
            errorResponseBuilder: rateLimitErrorResponse,
        });
    },
    { name: 'rate-limiter', dependencies: ['redis', 'guest-identity'] },
);

/**
 * Per-route limit, for use in a route's options.
 *
 * `RATE_LIMITS` defined 15 of these from the beginning and none were ever enforced, even the
 * ones wired through here: the limiter itself was not applied to the app (see
 * `registerRateLimiter`), so `authLogin: { max: 10, window: '15 minutes' }` was dead config
 * and login brute-force protection did not exist. Per-route buckets are separate from the
 * global one: a route with its own limit does NOT also count against the global 100/min.
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
