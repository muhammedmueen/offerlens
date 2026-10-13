import { createHash } from 'node:crypto';
import { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { Redis } from 'ioredis';
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
                // to get many guest buckets. Fine for the global limit. POST /auth/login is now
                // also capped per IP (30/15min) and per email (10/15min) by `createLoginGuard`, so
                // cookie minting buys at most 30 login attempts per IP per 15 minutes. What remains:
                // (a) many IPs can still try 10 passwords per email per 15 minutes each account,
                // (b) /auth/google is covered only by the per-cookie bucket (no email in its body),
                // (c) the email hash is plain sha256 (upgrade: HMAC with a server secret).
                // PRE-DEPLOY: `trustProxy` is unset. Behind a reverse proxy or load balancer every
                // client shares one IP, so the cookie-less fallback here shares one bucket AND the
                // login IP limit (which ignores cookies) becomes a site-wide cap of 30 logins per
                // 15 minutes for ALL users. Set `trustProxy` in `buildApp()` before deploying.
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

/** sha256 of the trimmed, lower-cased email. The raw address never enters a Redis key or a log. */
export function loginEmailKey(email: string): string {
    return `login-email:${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}`;
}

/** Counts login attempts per key inside a fixed window. */
export interface LoginCounter {
    /** Count this attempt. `ttlMs` is the time left in the window, which started at the first attempt. */
    hit(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
    clear(key: string): Promise<void>;
}

/**
 * Atomic INCR + PEXPIRE NX + PTTL. NX sets the TTL only when the key has none, so the window is
 * fixed from the first attempt and more attempts cannot extend it (needs Redis 7; docker-compose
 * pins redis:7). Any failed step throws, so a Redis fault is a 500, not an open gate (same
 * fail-closed stance as the plugin's `skipOnError: false`).
 */
export function redisLoginCounter(redis: Redis): LoginCounter {
    return {
        async hit(key, windowMs) {
            const res = await redis.multi().incr(key).pexpire(key, windowMs, 'NX').pttl(key).exec();
            if (!res || res.length !== 3 || res.some(([err]) => err)) throw new Error('login counter: Redis MULTI failed');
            const count = Number(res[0][1]);
            const pttl = Number(res[2][1]);
            return { count, ttlMs: pttl > 0 ? pttl : windowMs };
        },
        async clear(key) {
            await redis.del(key);
        },
    };
}

/**
 * Same contract for when Redis is stubbed `null` (tests only; production always has the client,
 * the plugin declares `dependencies: ['redis']`).
 * ponytail: per-process and never swept, so it is only fit for tests. `now` is injectable for them.
 */
export function memoryLoginCounter(now: () => number = Date.now): LoginCounter {
    const entries = new Map<string, { count: number; expiresAt: number }>();
    return {
        async hit(key, windowMs) {
            let e = entries.get(key);
            if (!e || e.expiresAt <= now()) {
                e = { count: 0, expiresAt: now() + windowMs };
                entries.set(key, e);
            }
            e.count += 1;
            return { count: e.count, ttlMs: e.expiresAt - now() };
        },
        async clear(key) {
            entries.delete(key);
        },
    };
}

/**
 * Extra limits for POST /auth/login only, beside the per-cookie `authLogin` bucket (which stays).
 *
 * Why not the plugin's route config: a route has one `config.rateLimit` (the cookie bucket), a
 * second `fastify.rateLimit()` preHandler silently never runs (all handlers from one plugin share
 * a `rateLimitRan` flag the onRequest limiter has already set), and the plugin's key generator
 * runs at onRequest, before the body is parsed. So `check` is a preHandler (body parsed and
 * validated, `body.email` is an email string) that calls `fastify.createRateLimit` for the IP and
 * keeps its own counter for the email.
 *
 *   per IP     30 / 15 min, keyed on `req.ip` alone, whatever the cookie. Plugin store; its Redis
 *              key reads `fastify-rate-limit-undefinedundefined-login-ip:<ip>` (the plugin builds
 *              the prefix from route info this call does not have; harmless and unique).
 *   per email  10 / 15 min, keyed on the sha256 of the normalised address, whatever the cookie or
 *              IP. Stored directly as `login-email:<64 hex>` (no plugin prefix), so a cleanup must
 *              scan `fastify-rate-limit-*` AND `login-email:*`.
 *
 * The email counter increments BEFORE the password is checked (parallel guesses cannot all slip
 * through a read-then-increment) and `clear` deletes it after a successful login, so it holds the
 * attempts since the last success, i.e. the plan's "failed attempts". It does not look at the
 * account: an unregistered address counts, locks and answers exactly like a registered one, and
 * the 429 carries no address, hash or hint. Accepted: while locked, even the right password gets
 * 429 (anyone can lock another person's login by failing against their email); the lock is only
 * on this route, never on the account, Google login or a token. A request stopped by an earlier
 * check spends none of the later ones. /auth/google has no email, so only `authLogin` applies there.
 *
 * Both are created on first use, so registering the routes without the limiter plugin (the route
 * contract test) still works.
 */
export function createLoginGuard(fastify: FastifyInstance) {
    let ipLimit: ReturnType<FastifyInstance['createRateLimit']> | undefined;
    let counter: LoginCounter | undefined;
    const emailStore = () => (counter ??= fastify.redis ? redisLoginCounter(fastify.redis) : memoryLoginCounter());

    function reject(reply: FastifyReply, max: number, ttlMs: number): never {
        const seconds = Math.max(1, Math.ceil(ttlMs / 1000));
        reply.header('x-ratelimit-limit', max).header('x-ratelimit-remaining', 0)
            .header('x-ratelimit-reset', seconds).header('retry-after', seconds);
        throw rateLimitErrorResponse(null, { after: RATE_LIMITS.authLoginEmail.window, ttl: ttlMs });
    }

    return {
        async check(req: FastifyRequest, reply: FastifyReply) {
            ipLimit ??= fastify.createRateLimit({
                max: RATE_LIMITS.authLoginIp.max,
                timeWindow: RATE_LIMITS.authLoginIp.window,
                keyGenerator: (r) => `login-ip:${r.ip}`,
            });
            const ip = await ipLimit(req);
            if (!ip.isAllowed && ip.isExceeded) reject(reply, ip.max, ip.ttl);

            const email = (req.body as { email?: unknown } | undefined)?.email;
            if (typeof email !== 'string') return;
            const { count, ttlMs } = await emailStore().hit(loginEmailKey(email), RATE_LIMITS.authLoginEmail.windowMs);
            if (count > RATE_LIMITS.authLoginEmail.max) reject(reply, RATE_LIMITS.authLoginEmail.max, ttlMs);
        },
        /** After a successful login: forget the attempts for that address. A failure only logs (no address). */
        async clear(email: string) {
            try {
                await emailStore().clear(loginEmailKey(email));
            } catch (err) {
                fastify.log.warn({ err }, 'login attempt counter not cleared; it expires on its own');
            }
        },
    };
}
