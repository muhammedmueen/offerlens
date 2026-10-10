import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { GUEST, PLANS } from '@/config/plans.js';

// GET /quota (task 4.4): one route for users and guests, and NO write side effect.

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test' }; } }));
vi.mock('@/db/index.js', () => ({ db: {} }));

const findByToken = vi.fn();
const getOrCreateGuest = vi.fn();
vi.mock('@/modules/guest/guest.service.js', () => ({
    GuestService: class {
        findByToken = findByToken;
        getOrCreateGuest = getOrCreateGuest;
    },
}));

const tierForRequest = vi.fn();
const readCounts = vi.fn();
vi.mock('./quota.service.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./quota.service.js')>()),
    tierForRequest: (...a: unknown[]) => tierForRequest(...a),
    readCounts: (...a: unknown[]) => readCounts(...a),
}));

let app: FastifyInstance;
beforeAll(async () => {
    const { quotaRoutes } = await import('./quota.routes.js');
    app = Fastify();
    // Stand-ins for the authenticate hook and the guest-identity plugin.
    app.addHook('onRequest', async (req) => {
        req.userId = req.headers['x-user'] as string | undefined;
        req.guestId = req.headers['x-guest'] as string | undefined;
    });
    await app.register(quotaRoutes);
    await app.ready();
}, 30_000);

beforeEach(() => {
    for (const f of [findByToken, getOrCreateGuest, tierForRequest, readCounts]) f.mockReset();
});

describe('GET /quota', () => {
    it('a first-visit guest gets full quota and no guest row is created', async () => {
        tierForRequest.mockResolvedValue(GUEST);
        findByToken.mockResolvedValue(undefined);

        const res = await app.inject({ method: 'GET', url: '/quota', headers: { 'x-guest': 'tok' } });
        expect(res.statusCode).toBe(200);
        const data = res.json().data;
        expect(data.plan).toBe('guest');
        expect(data.quotas.analysis).toEqual({ limit: 1, used: 0, remaining: 1 });
        expect(data.accountAnalysesPerDay).toBe(3);
        expect(typeof data.resetAt).toBe('string');
        expect(getOrCreateGuest).not.toHaveBeenCalled();
        expect(readCounts).not.toHaveBeenCalled();
    });

    it('a returning guest reads their own counters', async () => {
        tierForRequest.mockResolvedValue(GUEST);
        findByToken.mockResolvedValue({ id: 'guest-row' });
        readCounts.mockResolvedValue({ analysis: 1 });

        const res = await app.inject({ method: 'GET', url: '/quota', headers: { 'x-guest': 'tok' } });
        expect(readCounts.mock.calls[0][0]).toEqual({ type: 'guest', id: 'guest-row' });
        expect(res.json().data.quotas.analysis).toEqual({ limit: 1, used: 1, remaining: 0 });
        expect(getOrCreateGuest).not.toHaveBeenCalled();
    });

    it('a user gets their plan with counts applied, never the guest row', async () => {
        tierForRequest.mockResolvedValue(PLANS.free);
        readCounts.mockResolvedValue({ analysis: 2, career: 4 });

        const res = await app.inject({ method: 'GET', url: '/quota', headers: { 'x-user': 'u1', 'x-guest': 'tok' } });
        const data = res.json().data;
        expect(data.plan).toBe('free');
        expect(readCounts.mock.calls[0][0]).toEqual({ type: 'user', id: 'u1' });
        expect(data.quotas.analysis).toEqual({ limit: 3, used: 2, remaining: 1 });
        expect(data.quotas.career).toEqual({ limit: 10, used: 4, remaining: 6 });
        expect(data.accountAnalysesPerDay).toBe(3);
        expect(findByToken).not.toHaveBeenCalled();
    });
});
