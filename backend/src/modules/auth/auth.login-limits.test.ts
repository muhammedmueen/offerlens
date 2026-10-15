import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { errorHandler } from '@/middleware/error-handler.js';
import {
    registerRateLimiter, loginEmailKey, createLoginGuard, memoryLoginCounter, redisLoginCounter,
} from '@/middleware/rate-limiter.js';
import guestIdentityPlugin from '@/plugins/guest-identity.js';
import { GUEST_COOKIE_NAME, RATE_LIMITS } from '@/config/constants.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

/**
 * Task 5.8: POST /auth/login is limited per cookie (existing), per IP (30/15min) and per email
 * (10/15min, any cookie or IP). Same setup as rate-limiter.test.ts: Redis stubbed `null`, so the
 * plugin and the email counter both use in-memory stores; AuthService is mocked.
 *
 * Cookie rule: the `authLogin` cookie bucket keys on the guest cookie only when the request
 * carries an already-issued one; without one it falls back to `ip:` (10 per 15 min). So every
 * login below mints a fresh cookie first (a GET to /ping) and uses it exactly once, with a
 * per-test `remoteAddress`. "A different cookie" always means that.
 */
const { login, googleAuth } = vi.hoisted(() => ({ login: vi.fn(), googleAuth: vi.fn() }));
vi.mock('./auth.service.js', () => ({
    AuthService: class {
        login = login;
        googleAuth = googleAuth;
        signup = vi.fn();
        migrateGuestOffers = vi.fn();
        refreshAccessToken = vi.fn();
        logout = vi.fn();
    },
}));

const { authRoutes } = await import('./auth.routes.js');

const ACCOUNTS: Record<string, string> = { 'real@example.com': 'right', 'other@example.com': 'right' };
const ok = { user: { id: 'u1' }, tokens: {} };
const redisStub = fp(async (f) => { f.decorate('redis', null as never); }, { name: 'redis' });

async function buildApp(logStream?: { write(s: string): void }) {
    const app = Fastify({ logger: logStream ? { level: 'info', stream: logStream } : false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.setErrorHandler(errorHandler);
    await app.register(redisStub);
    await app.register(guestIdentityPlugin);
    await app.register(registerRateLimiter);
    await app.register(async (api) => {
        api.get('/ping', async () => ({ ok: true }));
        await api.register(authRoutes, { prefix: '/auth' });
    }, { prefix: '/api/v1' });
    await app.ready();
    return app;
}

let app: Awaited<ReturnType<typeof buildApp>>;
afterEach(async () => { await app?.close(); });

async function mintCookie(ip: string) {
    const res = await app.inject({ method: 'GET', url: '/api/v1/ping', remoteAddress: ip });
    const c = res.cookies.find((x) => x.name === GUEST_COOKIE_NAME)!;
    return `${c.name}=${c.value}`;
}

/** One login with its own freshly minted cookie (or none), from `ip`. */
async function attempt(email: string, password: string, ip: string, opts: { cookie?: string | false } = {}) {
    const cookie = opts.cookie === false ? undefined : (opts.cookie ?? await mintCookie(ip));
    return app.inject({
        method: 'POST', url: '/api/v1/auth/login', remoteAddress: ip,
        headers: cookie ? { cookie } : {}, payload: { email, password },
    });
}

function setup() {
    login.mockReset();
    googleAuth.mockReset();
    login.mockImplementation(async ({ email, password }: { email: string; password: string }) => {
        if (ACCOUNTS[email.toLowerCase()] === password) return ok;
        throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password', 401);
    });
    googleAuth.mockResolvedValue(ok);
}

/** n wrong attempts on `email`, each from its own cookie and IP; returns the status codes. */
async function failMany(email: string, n: number) {
    const codes: number[] = [];
    for (let i = 0; i < n; i++) codes.push((await attempt(email, 'wrong', `10.1.${i}.1`)).statusCode);
    return codes;
}

describe('POST /auth/login per-email limit', () => {
    it('trips on the 11th attempt whatever the cookie or IP, in the standard 429 shape, and the cookie bucket is not what fired', async () => {
        setup(); app = await buildApp();
        const codes = await failMany('real@example.com', 10);
        expect(codes).toEqual(Array(10).fill(401));

        const res = await attempt('real@example.com', 'wrong', '10.2.0.1');
        expect(res.statusCode).toBe(429);
        expect(res.headers['x-ratelimit-limit']).toBe(String(RATE_LIMITS.authLoginEmail.max));
        expect(res.headers['x-ratelimit-remaining']).toBe('0');
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
        expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(900);
        expect(res.json()).toMatchObject({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED' } });

        // Discrimination: each cookie above was used once, so its own bucket is nearly empty.
        // A different email from a new cookie and IP is still a plain 401, not a 429.
        expect((await attempt('other@example.com', 'wrong', '10.2.0.2')).statusCode).toBe(401);
    });

    it('behaves identically for an existing and a non-existent account (no enumeration)', async () => {
        setup(); app = await buildApp();
        const run = async (email: string) => {
            const seen: Array<{ status: number; body: unknown; headers: string[] }> = [];
            for (let i = 0; i < 11; i++) {
                const r = await attempt(email, 'wrong', `10.3.${i}.${email.length}`);
                seen.push({
                    status: r.statusCode,
                    body: r.json(),
                    headers: Object.keys(r.headers).filter((h) => h.startsWith('x-ratelimit') || h === 'retry-after').sort(),
                });
            }
            return seen;
        };
        const real = await run('real@example.com');
        const ghost = await run('nobody-here@example.com');
        // The 401 body is identical too; the 429 is identical down to its header names.
        expect(ghost.map((s) => s.status)).toEqual(real.map((s) => s.status));
        expect(ghost[10].status).toBe(429);
        expect(ghost.map((s) => s.body)).toEqual(real.map((s) => s.body));
        expect(ghost.map((s) => s.headers)).toEqual(real.map((s) => s.headers));
    });

    it('shares one bucket across case and whitespace variants of an address', async () => {
        setup(); app = await buildApp();
        expect(loginEmailKey(' A@X.com ')).toBe(loginEmailKey('a@x.com'));
        for (let i = 0; i < 5; i++) await attempt('A@Example.com', 'wrong', `10.4.${i}.1`);
        for (let i = 5; i < 10; i++) await attempt('a@example.com', 'wrong', `10.4.${i}.1`);
        expect((await attempt('A@EXAMPLE.COM', 'wrong', '10.4.99.1')).statusCode).toBe(429);
    });

    it('lets another email, cookie and IP log in after one address is locked (and keeps the locked one locked, even with the right password)', async () => {
        setup(); app = await buildApp();
        await failMany('real@example.com', 10);
        expect((await attempt('real@example.com', 'wrong', '10.5.0.1')).statusCode).toBe(429);
        expect((await attempt('real@example.com', 'right', '10.5.0.2')).statusCode).toBe(429); // accepted trade-off
        expect((await attempt('other@example.com', 'right', '10.5.0.3')).statusCode).toBe(200);
    });

    it('a successful login clears the counter, so it counts failed attempts since the last success', async () => {
        setup(); app = await buildApp();
        expect(await failMany('real@example.com', 9)).toEqual(Array(9).fill(401));
        expect((await attempt('real@example.com', 'right', '10.6.0.1')).statusCode).toBe(200);
        // A full 10 more failures are allowed; only the 11th is stopped.
        expect(await failMany('real@example.com', 10)).toEqual(Array(10).fill(401));
        expect((await attempt('real@example.com', 'wrong', '10.6.1.1')).statusCode).toBe(429);
    });

    it('parallel guesses cannot slip past the limit', async () => {
        setup(); app = await buildApp();
        const cookies = await Promise.all(Array.from({ length: 15 }, (_, i) => mintCookie(`10.7.${i}.1`)));
        const results = await Promise.all(
            cookies.map((cookie, i) => attempt('real@example.com', 'wrong', `10.7.${i}.1`, { cookie })),
        );
        const codes = results.map((r) => r.statusCode);
        expect(codes.filter((c) => c === 401)).toHaveLength(10);
        expect(codes.filter((c) => c === 429)).toHaveLength(5);
    });

    it('is not spent by an invalid body (400 never reaches the guard)', async () => {
        setup(); app = await buildApp();
        for (let i = 0; i < 35; i++) {
            const r = await attempt('not-an-email', 'x', '10.8.0.1');
            expect(r.statusCode).toBe(400);
        }
        // 35 bad posts from one IP spent neither the IP (30) nor any email counter.
        expect((await attempt('real@example.com', 'wrong', '10.8.0.1')).statusCode).toBe(401);
    });
});

describe('POST /auth/login per-IP limit', () => {
    it('trips on the 31st attempt from one IP (30 different emails, a cookie each) while another IP still logs in', async () => {
        setup(); app = await buildApp();
        for (let i = 0; i < 30; i++) {
            expect((await attempt(`user${i}@example.com`, 'wrong', '10.9.0.1')).statusCode).toBe(401);
        }
        const res = await attempt('user30@example.com', 'wrong', '10.9.0.1');
        expect(res.statusCode).toBe(429);
        expect(res.headers['x-ratelimit-limit']).toBe(String(RATE_LIMITS.authLoginIp.max));
        expect(res.headers['x-ratelimit-remaining']).toBe('0');
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
        expect(res.json()).toMatchObject({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED' } });

        expect((await attempt('real@example.com', 'right', '10.9.0.2')).statusCode).toBe(200);
    });

    it('does not take the cookie bucket away: one cookie reused for 10 attempts trips on the 11th, a second cookie is unaffected', async () => {
        setup(); app = await buildApp();
        const cookie = await mintCookie('10.10.0.1');
        for (let i = 0; i < 10; i++) {
            expect((await attempt(`u${i}@example.com`, 'wrong', '10.10.0.1', { cookie })).statusCode).toBe(401);
        }
        const res = await attempt('u10@example.com', 'wrong', '10.10.0.1', { cookie });
        expect(res.statusCode).toBe(429);
        expect(res.headers['x-ratelimit-limit']).toBe(String(RATE_LIMITS.authLogin.max));
        expect((await attempt('real@example.com', 'right', '10.10.0.1')).statusCode).toBe(200);
    });

    it('cookie-less traffic is stopped by the existing per-IP-fallback cookie bucket (10) long before 30', async () => {
        setup(); app = await buildApp();
        const codes: number[] = [];
        for (let i = 0; i < 11; i++) codes.push((await attempt(`c${i}@example.com`, 'wrong', '10.11.0.1', { cookie: false })).statusCode);
        expect(codes).toEqual([...Array(10).fill(401), 429]);
    });
});

describe('what the limits leave out and what they never reveal', () => {
    it('/auth/google is not affected by the email or IP limits', async () => {
        setup(); app = await buildApp();
        for (let i = 0; i < 12; i++) {
            const cookie = await mintCookie('10.12.0.1');
            const r = await app.inject({
                method: 'POST', url: '/api/v1/auth/google', remoteAddress: '10.12.0.1',
                headers: { cookie }, payload: { idToken: 'tok' },
            });
            expect(r.statusCode).toBe(200);
        }
        expect(googleAuth).toHaveBeenCalledTimes(12);
    });

    it('hashes the email: the key is login-email:<64 hex>, and neither the 429 nor any log line carries the address or its hash', async () => {
        setup();
        const lines: string[] = [];
        app = await buildApp({ write: (s) => { lines.push(s); } });
        const email = 'Real@Example.com';
        const key = loginEmailKey(email);
        expect(key).toMatch(/^login-email:[0-9a-f]{64}$/);
        expect(key).not.toContain('example');

        await failMany(email, 10);
        const res = await attempt(email, 'wrong', '10.13.0.1');
        expect(res.statusCode).toBe(429);

        const hash = key.slice('login-email:'.length);
        const seen = JSON.stringify({ body: res.body, headers: res.headers }) + lines.join('');
        expect(lines.length).toBeGreaterThan(0); // the logger really was on
        for (const needle of [email, email.toLowerCase(), 'example.com', hash]) {
            expect(seen.toLowerCase()).not.toContain(needle.toLowerCase());
        }
    });
});

describe('login counters', () => {
    it('memory counter keeps a fixed window: attempts do not extend it, and it resets after it', async () => {
        let t = 1_000;
        const c = memoryLoginCounter(() => t);
        expect(await c.hit('k', 900_000)).toEqual({ count: 1, ttlMs: 900_000 });
        t += 500_000;
        expect(await c.hit('k', 900_000)).toEqual({ count: 2, ttlMs: 400_000 });
        t += 400_000;
        expect(await c.hit('k', 900_000)).toEqual({ count: 1, ttlMs: 900_000 }); // window over
        await c.clear('k');
        expect((await c.hit('k', 900_000)).count).toBe(1);
    });

    /** A recording stand-in for the ioredis MULTI chain. */
    function redisWith(exec: () => Promise<unknown>) {
        const calls: unknown[][] = [];
        const chain: Record<string, unknown> = {};
        for (const name of ['incr', 'pexpire', 'pttl']) {
            chain[name] = (...args: unknown[]) => { calls.push([name, ...args]); return chain; };
        }
        chain.exec = exec;
        return { calls, redis: { multi: () => chain, del: async () => 1 } as never };
    }

    it('redis counter: INCR + PEXPIRE NX + PTTL on the hashed key, count and ttl read back', async () => {
        const { calls, redis } = redisWith(async () => [[null, 3], [null, 0], [null, 123_000]]);
        const out = await redisLoginCounter(redis).hit(loginEmailKey('a@b.com'), 900_000);
        expect(out).toEqual({ count: 3, ttlMs: 123_000 });
        const key = loginEmailKey('a@b.com');
        expect(calls).toEqual([['incr', key], ['pexpire', key, 900_000, 'NX'], ['pttl', key]]);
        expect(JSON.stringify(calls)).not.toContain('a@b.com');
    });

    it('redis counter fails closed: a failed or missing MULTI result throws (a 500), never an open gate', async () => {
        for (const exec of [async () => null, async () => [[new Error('x'), null], [null, 0], [null, 1]]]) {
            const { redis } = redisWith(exec);
            await expect(redisLoginCounter(redis).hit('k', 1000)).rejects.toThrow();
        }
        setup();
        const { redis } = redisWith(async () => null);
        const app2 = Fastify({ logger: false });
        app2.setErrorHandler(errorHandler);
        app2.decorate('redis', redis);
        app2.decorate('createRateLimit', (() => async () => ({ isAllowed: false, isExceeded: false })) as never);
        const guard = createLoginGuard(app2);
        app2.post('/login', { preHandler: guard.check }, async () => ({ ok: true }));
        const res = await app2.inject({ method: 'POST', url: '/login', payload: { email: 'a@b.com' } });
        expect(res.statusCode).toBe(500);
        await app2.close();
    });
});
