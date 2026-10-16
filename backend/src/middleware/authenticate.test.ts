import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';

// requireRegistered must distinguish three cases on a members-only route:
//   - no Authorization header        -> 403 GUEST_RESTRICTED (a true guest)
//   - present but invalid/expired    -> 401 TOKEN_EXPIRED (so the client refreshes)
//   - valid token                    -> passes, request.userId set from the token (bearer wins)
// The expired-token case was the bug: it fell through to 403, so the frontend's 401-only
// refresh interceptor never fired and the user silently looked logged out.

const SECRET = 'test-secret';

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test', JWT_SECRET: SECRET }; } }));
vi.mock('@/db/index.js', () => ({ db: {} }));

const { requireRegistered, requireAuth } = await import('./authenticate.js');

const tokenFor = (userId: string, opts?: jwt.SignOptions) =>
    jwt.sign({ userId, email: `${userId}@example.com` }, SECRET, opts);

async function call(
    guard: typeof requireRegistered,
    headers: Record<string, string> = {},
) {
    const app = Fastify();
    app.get('/me', { preHandler: [guard] }, async (req) => ({ userId: req.userId ?? null }));
    const res = await app.inject({ method: 'GET', url: '/me', headers });
    await app.close();
    return res;
}

describe('requireRegistered', () => {
    it('no token + guest cookie -> 403 GUEST_RESTRICTED', async () => {
        const res = await call(requireRegistered, { cookie: 'ol_guest=3f2504e0-4f89-41d3-9a0c-0305e82c3301.sig' });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe('GUEST_RESTRICTED');
    });

    it('present expired token -> 401 (not 403), so the client can refresh', async () => {
        const res = await call(requireRegistered, {
            authorization: `Bearer ${tokenFor('u1', { expiresIn: '-1s' })}`,
        });
        expect(res.statusCode).toBe(401);
        expect(res.json().error.code).toBe('TOKEN_EXPIRED');
    });

    it('present garbage token -> 401', async () => {
        const res = await call(requireRegistered, { authorization: 'Bearer not-a-real-jwt' });
        expect(res.statusCode).toBe(401);
        expect(res.json().error.code).toBe('TOKEN_EXPIRED');
    });

    it('valid token -> 200 and userId comes from the token (bearer wins over any guest cookie)', async () => {
        const res = await call(requireRegistered, {
            authorization: `Bearer ${tokenFor('u1')}`,
            cookie: 'ol_guest=3f2504e0-4f89-41d3-9a0c-0305e82c3301.sig',
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().userId).toBe('u1');
    });
});

describe('requireAuth', () => {
    it('rejects a missing token with 401 UNAUTHORIZED', async () => {
        const res = await call(requireAuth);
        expect(res.statusCode).toBe(401);
        expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('rejects an expired token with 401 and passes a valid one', async () => {
        const expired = await call(requireAuth, { authorization: `Bearer ${tokenFor('u1', { expiresIn: '-1s' })}` });
        expect(expired.statusCode).toBe(401);
        const ok = await call(requireAuth, { authorization: `Bearer ${tokenFor('u2')}` });
        expect(ok.statusCode).toBe(200);
        expect(ok.json().userId).toBe('u2');
    });
});
