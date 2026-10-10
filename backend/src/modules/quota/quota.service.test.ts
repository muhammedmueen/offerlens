import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema/index.js';
import { offers } from '@/db/schema/offers.js';
import { GUEST, PLANS } from '@/config/plans.js';
import { QuotaExceededError } from '@/shared/errors/app-error.js';
import { istDayWindow } from '@/shared/ist-day.js';

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test' }; } }));

const userSelect = vi.fn();
vi.mock('@/db/index.js', () => ({
    db: {
        select: () => ({ from: () => ({ where: () => ({ limit: () => userSelect() }) }) }),
    },
}));

const load = () => import('./quota.service.js');

// A real Drizzle instance with no connection: renders SQL text only.
const sqlDb = drizzle.mock({ schema });

const guest = { type: 'guest' as const, id: '00000000-0000-0000-0000-000000000001', tier: GUEST };
const freeUser = { type: 'user' as const, id: '00000000-0000-0000-0000-000000000002', tier: PLANS.free };
const unlimitedUser = { type: 'user' as const, id: '00000000-0000-0000-0000-000000000003', tier: PLANS.unlimited };

/** An executor whose reservation upsert RETURNING yields `rows`. */
function upsertExecutor(rows: { count: number }[]) {
    const insert = vi.fn(() => ({
        values: () => ({ onConflictDoUpdate: () => ({ returning: () => Promise.resolve(rows) }) }),
    }));
    return { insert } as any;
}

beforeEach(() => {
    userSelect.mockReset();
});

describe('SQL shape', () => {
    it('reserve is one conditional upsert', async () => {
        const { reserveStatement } = await load();
        const q = reserveStatement(sqlDb as any, freeUser, 'analysis', '2026-10-10', 3).toSQL();
        expect(q.sql).toContain('on conflict ("subject_type","subject_id","feature","day") do update set');
        expect(q.sql).toMatch(/where "quota_counters"\."count" < \$\d+/);
        expect(q.sql).toContain('returning "count"');
        expect(q.params).toContain(3);
    });

    it('release never goes below zero', async () => {
        const { releaseStatement } = await load();
        const q = releaseStatement(sqlDb as any, {
            subjectType: 'user', subjectId: freeUser.id, feature: 'analysis', day: '2026-10-10',
        }).toSQL();
        expect(q.sql).toMatch(/"count" - 1/);
        expect(q.sql).toMatch(/"quota_counters"\."count" > \$\d+/);
        expect(q.params).toContain(0);
    });

    it('refund claim is conditional on quota_refunded = false and a reservation', async () => {
        const { claimRefundStatement } = await load();
        const q = claimRefundStatement(sqlDb as any, 'offer-1').toSQL();
        expect(q.sql).toMatch(/"offers"\."quota_refunded" = \$\d+/);
        expect(q.sql).toContain('"offers"."quota_day" is not null');
        expect(q.sql).toContain('returning');
    });
});

describe('reserve', () => {
    const now = new Date('2026-10-10T10:00:00.000Z');

    it('unlimited runs no query and returns null', async () => {
        const { reserve } = await load();
        const ex = upsertExecutor([]);
        await expect(reserve(ex, unlimitedUser, 'analysis', now)).resolves.toBeNull();
        expect(ex.insert).not.toHaveBeenCalled();
    });

    it('a limit of 0 throws without a query', async () => {
        const { reserve } = await load();
        const ex = upsertExecutor([{ count: 1 }]);
        await expect(reserve(ex, guest, 'career', now)).rejects.toBeInstanceOf(QuotaExceededError);
        expect(ex.insert).not.toHaveBeenCalled();
    });

    it('returns the reservation for today (IST) on success', async () => {
        const { reserve } = await load();
        const r = await reserve(upsertExecutor([{ count: 2 }]), freeUser, 'analysis', now);
        expect(r).toEqual({ subjectType: 'user', subjectId: freeUser.id, feature: 'analysis', day: '2026-10-10', count: 2 });
    });

    it('an empty RETURNING is over quota', async () => {
        const { reserve } = await load();
        const err = await reserve(upsertExecutor([]), freeUser, 'analysis', now).catch((e) => e);
        expect(err).toBeInstanceOf(QuotaExceededError);
        expect(err.details).toEqual({
            feature: 'analysis', limit: 3, used: 3, remaining: 0,
            resetAt: istDayWindow(now).resetAt.toISOString(), plan: 'free',
        });
    });
});

describe('releaseOfferQuota', () => {
    it('refunds at most once', async () => {
        const { releaseOfferQuota } = await load();
        const claim = vi.fn()
            .mockResolvedValueOnce([{ subjectType: 'user', subjectId: freeUser.id, day: '2026-10-09' }])
            .mockResolvedValue([]);
        const decrement = vi.fn(() => Promise.resolve());
        const ex = {
            update: (table: unknown) => ({
                set: () => ({
                    where: table === offers ? () => ({ returning: claim }) : decrement,
                }),
            }),
        } as any;

        await expect(releaseOfferQuota(ex, 'offer-1')).resolves.toBe(true);
        await expect(releaseOfferQuota(ex, 'offer-1')).resolves.toBe(false);
        expect(claim).toHaveBeenCalledTimes(2);
        expect(decrement).toHaveBeenCalledTimes(1);
    });
});

describe('tierForRequest', () => {
    it('no user is GUEST without a query', async () => {
        const { tierForRequest } = await load();
        await expect(tierForRequest({})).resolves.toBe(GUEST);
        expect(userSelect).not.toHaveBeenCalled();
    });

    it('reads users.plan once and memoises', async () => {
        const { tierForRequest } = await load();
        userSelect.mockResolvedValue([{ plan: 'unlimited' }]);
        const req: { userId?: string; tier?: any } = { userId: 'u1' };
        await expect(tierForRequest(req)).resolves.toBe(PLANS.unlimited);
        await expect(tierForRequest(req)).resolves.toBe(PLANS.unlimited);
        expect(userSelect).toHaveBeenCalledTimes(1);
    });

    it('a missing user row is free', async () => {
        const { tierForRequest } = await load();
        userSelect.mockResolvedValue([]);
        await expect(tierForRequest({ userId: 'u1' })).resolves.toBe(PLANS.free);
    });
});

describe('buildQuotaSnapshot', () => {
    const window = istDayWindow(new Date('2026-10-10T10:00:00.000Z'));

    it('guest with no counts', async () => {
        const { buildQuotaSnapshot } = await load();
        const s = buildQuotaSnapshot(GUEST, {}, window);
        expect(s.plan).toBe('guest');
        expect(s.day).toBe('2026-10-10');
        expect(s.resetAt).toBe('2026-10-10T18:30:00.000Z');
        expect(s.quotas.analysis).toEqual({ limit: 1, used: 0, remaining: 1 });
        expect(s.quotas.autofill).toEqual({ limit: 30, used: 0, remaining: 30 });
        expect(s.accountAnalysesPerDay).toBe(3);
    });

    it('free with partial counts', async () => {
        const { buildQuotaSnapshot } = await load();
        const s = buildQuotaSnapshot(PLANS.free, { analysis: 2, career: 10 }, window);
        expect(s.quotas.analysis).toEqual({ limit: 3, used: 2, remaining: 1 });
        expect(s.quotas.career).toEqual({ limit: 10, used: 10, remaining: 0 });
        expect(s.quotas.negotiation).toEqual({ limit: 10, used: 0, remaining: 10 });
    });

    it('unlimited has null limit and remaining', async () => {
        const { buildQuotaSnapshot } = await load();
        const s = buildQuotaSnapshot(PLANS.unlimited, { analysis: 7 }, window);
        expect(s.quotas.analysis).toEqual({ limit: null, used: 7, remaining: null });
    });

    it('remaining never goes below 0', async () => {
        const { buildQuotaSnapshot } = await load();
        const s = buildQuotaSnapshot(PLANS.free, { analysis: 9 }, window);
        expect(s.quotas.analysis.remaining).toBe(0);
    });
});
