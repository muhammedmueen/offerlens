import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { errorHandler } from './error-handler.js';
import { registerRateLimiter, routeLimit } from './rate-limiter.js';
import guestIdentityPlugin from '@/plugins/guest-identity.js';
import { GUEST_COOKIE_NAME, RATE_LIMITS } from '@/config/constants.js';

/**
 * Regression test for the inert rate limiter.
 *
 * `registerRateLimiter` used to be a plain (encapsulated) plugin, so @fastify/rate-limit's
 * onRoute hook only ever saw routes registered INSIDE it, i.e. none. Every limit was dead
 * config: no x-ratelimit-* headers, no 429s. The routes below are registered in a sibling
 * `/api/v1` context exactly as app.ts does, which is what exposes the bug.
 *
 * Redis is stubbed with `null`, which makes @fastify/rate-limit use its in-memory store.
 * The stub keeps the name 'redis' so the real plugin's `dependencies` check still runs.
 */
const redisStub = fp(async (f) => { f.decorate('redis', null as never); }, { name: 'redis' });

async function buildTestApp() {
    const app = Fastify({ logger: false });
    app.setErrorHandler(errorHandler);
    // Same order as app.ts: identity first, then limiter, then routes in a sibling context.
    await app.register(redisStub);
    await app.register(guestIdentityPlugin);
    await app.register(registerRateLimiter);
    // Stand-in for `authenticate` (app.ts adds it at the root after the limiter, as here).
    app.addHook('onRequest', async (req) => {
        const u = req.headers['x-test-user'];
        if (typeof u === 'string') req.userId = u;
    });
    await app.register(async (api) => {
        api.get('/plain', async () => ({ ok: true }));
        api.get('/tight', { config: { rateLimit: { max: 2, timeWindow: '1 minute' } } }, async () => ({ ok: true }));
        api.get('/login-like', { ...routeLimit('authLogin') }, async () => ({ ok: true }));
    }, { prefix: '/api/v1' });
    await app.ready();
    return app;
}

let app: Awaited<ReturnType<typeof buildTestApp>>;
afterEach(async () => { await app?.close(); });

/** Cookie header for the guest cookie a response issued. */
function guestCookie(res: { cookies: Array<{ name: string; value: string }> }) {
    const c = res.cookies.find((x) => x.name === GUEST_COOKIE_NAME);
    return c ? `${c.name}=${c.value}` : undefined;
}

describe('rate limiter is applied to real routes', () => {
    it('sends x-ratelimit-* headers on an ordinary route with the global limit', async () => {
        app = await buildTestApp();
        const res = await app.inject({ method: 'GET', url: '/api/v1/plain' });
        expect(res.statusCode).toBe(200);
        expect(res.headers['x-ratelimit-limit']).toBe(String(RATE_LIMITS.global.max));
        expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    });

    it('honours a per-route limit and answers 429 in the standard error shape', async () => {
        app = await buildTestApp();
        const first = await app.inject({ method: 'GET', url: '/api/v1/tight' });
        const cookie = guestCookie(first)!;
        // `first` was keyed by IP (no cookie yet); the next calls are keyed by the guest.
        const headers = { cookie };
        expect((await app.inject({ method: 'GET', url: '/api/v1/tight', headers })).statusCode).toBe(200);
        expect((await app.inject({ method: 'GET', url: '/api/v1/tight', headers })).statusCode).toBe(200);
        const res = await app.inject({ method: 'GET', url: '/api/v1/tight', headers });

        expect(res.statusCode).toBe(429);
        expect(res.headers['x-ratelimit-limit']).toBe('2');
        expect(res.headers['x-ratelimit-remaining']).toBe('0');
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
        expect(res.json()).toMatchObject({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED' } });
        expect(typeof res.json().error.message).toBe('string');
    });

    it('applies routeLimit() config (authLogin) to a route in a sibling context', async () => {
        app = await buildTestApp();
        const res = await app.inject({ method: 'GET', url: '/api/v1/login-like' });
        expect(res.headers['x-ratelimit-limit']).toBe(String(RATE_LIMITS.authLogin.max));
    });
});

describe('rate limiter key generator', () => {
    it('gives each guest cookie its own bucket and shares one bucket per cookie', async () => {
        app = await buildTestApp();
        const jarA = guestCookie(await app.inject({ method: 'GET', url: '/api/v1/plain' }))!;
        const jarB = guestCookie(await app.inject({ method: 'GET', url: '/api/v1/plain' }))!;
        expect(jarA).not.toEqual(jarB);

        const hit = (cookie: string) => app.inject({ method: 'GET', url: '/api/v1/tight', headers: { cookie } });
        expect((await hit(jarA)).statusCode).toBe(200);
        expect((await hit(jarA)).statusCode).toBe(200);
        expect((await hit(jarA)).statusCode).toBe(429); // A's bucket is spent...
        expect((await hit(jarB)).statusCode).toBe(200); // ...B's is untouched
    });

    it('keys a signed-in user by account, whatever cookie they present', async () => {
        app = await buildTestApp();
        const jarA = guestCookie(await app.inject({ method: 'GET', url: '/api/v1/plain' }))!;
        const jarB = guestCookie(await app.inject({ method: 'GET', url: '/api/v1/plain' }))!;
        const hit = (cookie: string, user: string) =>
            app.inject({ method: 'GET', url: '/api/v1/tight', headers: { cookie, 'x-test-user': user } });
        expect((await hit(jarA, 'user-1')).statusCode).toBe(200);
        expect((await hit(jarB, 'user-1')).statusCode).toBe(200);
        expect((await hit(jarA, 'user-1')).statusCode).toBe(429); // same account, other browser: one budget
        expect((await hit(jarA, 'user-2')).statusCode).toBe(200); // a different account is unaffected
    });

    it('does not let a cookie-less client dodge the limit by getting a fresh guest id per request', async () => {
        app = await buildTestApp();
        // No cookie sent, so every response issues a NEW guest token. Keyed by guest token this
        // would never trip; it must fall back to the client IP.
        const codes: number[] = [];
        for (let i = 0; i < 4; i++) codes.push((await app.inject({ method: 'GET', url: '/api/v1/tight' })).statusCode);
        expect(codes).toEqual([200, 200, 429, 429]);
    });
});
