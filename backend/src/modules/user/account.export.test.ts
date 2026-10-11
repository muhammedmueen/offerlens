import { describe, it, expect, vi, beforeAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

// GET /account/export (task 4.7): scoped to the authenticated user, rejected without a token.
// The fake db below is deliberately LEAKY — every select returns user A's rows AND user B's,
// ignoring WHERE — so the test fails if the service ever relies on the query alone.

const SECRET = 'test-secret';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '44444444-4444-4444-8444-444444444444'; // brand-new account: owns nothing

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test', JWT_SECRET: 'test-secret' }; } }));

const dataByTable = vi.hoisted(() => new Map<unknown, unknown[]>());
const userRows = vi.hoisted(() => ({ rows: [] as Array<{ id: string }> }));

vi.mock('@/db/index.js', () => ({
    db: {
        select: () => ({ from: (table: unknown) => ({ where: async () => dataByTable.get(table) ?? [] }) }),
        // Resolve the id from the real WHERE clause, as Postgres would.
        query: {
            users: {
                findFirst: async ({ where }: { where: SQL }) => {
                    const { params } = new PgDialect().sqlToQuery(where);
                    return userRows.rows.find((u) => u.id === params[0]);
                },
            },
        },
    },
}));

let app: FastifyInstance;
beforeAll(async () => {
    const { offers } = await import('@/db/schema/offers.js');
    const { analyses } = await import('@/db/schema/analyses.js');
    const { corrections } = await import('@/db/schema/corrections.js');
    const { forumPosts, forumComments } = await import('@/db/schema/forum.js');
    const { usageLedger } = await import('@/db/schema/usage-ledger.js');

    const user = (id: string, email: string) => ({
        id, email, name: email, avatarUrl: null, isEmailVerified: true, plan: 'free',
        passwordHash: 'SECRET-HASH', googleId: 'g-' + id, createdAt: new Date(),
    });
    userRows.rows = [user(A, 'a@example.com'), user(B, 'b@example.com'), user(C, 'c@example.com')];

    dataByTable.set(offers, [
        { id: 'offer-A', userId: A, guestId: null, rawText: 'text of A', status: 'COMPLETED' },
        { id: 'offer-B', userId: B, guestId: null, rawText: 'text of B', status: 'COMPLETED' },
        // An unclaimed guest offer belongs to a cookie, not to any account.
        { id: 'offer-guest', userId: null, guestId: 'guest-1', rawText: 'guest text', status: 'COMPLETED' },
    ]);
    dataByTable.set(analyses, [{ offerId: 'offer-A', score: 71 }, { offerId: 'offer-B', score: 12 }]);
    dataByTable.set(corrections, [
        { id: 'c-A', userId: A, offerId: 'offer-A', field: 'ctc' },
        { id: 'c-B', userId: B, offerId: 'offer-B', field: 'ctc' },
    ]);
    dataByTable.set(forumPosts, [{ id: 'p-A', userId: A }, { id: 'p-B', userId: B }]);
    dataByTable.set(forumComments, [{ id: 'k-A', userId: A }, { id: 'k-B', userId: B }]);
    dataByTable.set(usageLedger, [{ id: 'l-A', userId: A }, { id: 'l-B', userId: B }, { id: 'l-none', userId: null }]);

    const { accountRoutes } = await import('./user.routes.js');
    app = Fastify();
    await app.register(accountRoutes, { prefix: '/account' });
    await app.ready();
}, 30_000);

const tokenFor = (userId: string) => jwt.sign({ userId, email: `${userId}@example.com` }, SECRET);
const get = (url: string, token?: string) =>
    app.inject({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('GET /account/export', () => {
    it('rejects a call with no token, a bad token, or only a guest cookie', async () => {
        for (const headers of [{}, { authorization: 'Bearer nonsense' }, { cookie: 'ol_guest=abc' }]) {
            const res = await app.inject({ method: 'GET', url: '/account/export', headers });
            expect(res.statusCode).toBe(401);
            expect(res.body).not.toContain('text of');
        }
    });

    it("user A gets A's data and none of B's", async () => {
        const res = await get('/account/export', tokenFor(A));
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-disposition']).toContain('attachment');

        const data = res.json().data;
        expect(data.profile.email).toBe('a@example.com');
        expect(data.offers.map((o: { id: string }) => o.id)).toEqual(['offer-A']);
        expect(data.offers[0].analysis.score).toBe(71);
        expect(data.corrections.map((c: { id: string }) => c.id)).toEqual(['c-A']);
        expect(data.forumPosts.map((p: { id: string }) => p.id)).toEqual(['p-A']);
        expect(data.forumComments.map((c: { id: string }) => c.id)).toEqual(['k-A']);
        expect(data.aiUsage.map((r: { id: string }) => r.id)).toEqual(['l-A']);

        for (const leak of ['offer-B', 'text of B', 'b@example.com', 'c-B', 'p-B', 'k-B', 'l-B', 'guest text', 'offer-guest']) {
            expect(res.body).not.toContain(leak);
        }
        // Credentials are not part of the user's data.
        expect(res.body).not.toContain('SECRET-HASH');
        expect(res.body).not.toContain('g-' + A);
    });

    it('is symmetric: user B gets only B, and a query param cannot name another account', async () => {
        const res = await get(`/account/export?userId=${A}&id=${A}`, tokenFor(B));
        const data = res.json().data;
        expect(data.profile.email).toBe('b@example.com');
        expect(data.offers.map((o: { id: string }) => o.id)).toEqual(['offer-B']);
        expect(res.body).not.toContain('text of A');
        expect(res.body).not.toContain('a@example.com');
    });

    it('exports a brand-new account (no offers, corrections or posts) as profile + empty collections', async () => {
        const res = await get('/account/export', tokenFor(C));
        expect(res.statusCode).toBe(200);
        const data = res.json().data;
        expect(data.profile).toMatchObject({ id: C, email: 'c@example.com', plan: 'free' });
        expect(data.offers).toEqual([]);
        expect(data.corrections).toEqual([]);
        expect(data.forumPosts).toEqual([]);
        expect(data.forumComments).toEqual([]);
        expect(data.aiUsage).toEqual([]);
        expect(res.body).not.toContain('b@example.com');
    });

    it('relies on drizzle compiling inArray(col, []) to `false` rather than throwing (the empty-offers case)', async () => {
        const { inArray } = await import('drizzle-orm');
        const { analyses } = await import('@/db/schema/analyses.js');
        const { sql } = new PgDialect().sqlToQuery(inArray(analyses.offerId, []));
        expect(sql).toBe('false');
    });

    it('answers 404 for a valid token whose user no longer exists', async () => {
        const res = await get('/account/export', tokenFor('33333333-3333-4333-8333-333333333333'));
        expect(res.statusCode).toBe(404);
    });
});
