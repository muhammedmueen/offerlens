import { describe, it, expect, vi, beforeEach } from 'vitest';

const inserted: Record<string, unknown>[] = [];
const redisStore = new Map<string, string>();

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test' }; } }));
vi.mock('@/db/index.js', () => ({
    db: { insert: () => ({ values: async (v: Record<string, unknown>) => { inserted.push(v); } }) },
}));
vi.mock('@/shared/cache.js', () => ({
    cached: async (_k: string, _t: number, f: () => unknown) => f(),
    cacheDelete: async () => undefined,
    getRedis: () => ({
        exists: async (k: string) => (redisStore.has(k) ? 1 : 0),
        set: async (k: string, v: string) => { redisStore.set(k, v); },
    }),
}));

const { SalaryService, submitCooldownKey, dayStartUtc } = await import('./salary.service.js');

const base = { role: 'Engineer', city: 'Pune', experienceYears: 3, ctc: 1_500_000, companyType: 'product' as const };

beforeEach(() => { inserted.length = 0; redisStore.clear(); });

describe('SalaryService.submit anonymity (task 4.6)', () => {
    it('stores no user or guest linkage, even when the caller supplies identifiers', async () => {
        // `userId` is cast in: the type no longer accepts it, and the row must still not carry it.
        await new SalaryService().submit({ ...base, fingerprint: 'guest-token', userId: 'user-1' } as never);

        expect(inserted).toHaveLength(1);
        const row = inserted[0];
        expect(row).not.toHaveProperty('userId');
        expect(row).not.toHaveProperty('fingerprint');
        expect(JSON.stringify(row)).not.toContain('guest-token');
        expect(JSON.stringify(row)).not.toContain('user-1');
        expect(row).toMatchObject({ role: 'engineer', city: 'pune', ctc: 1_500_000, status: 'approved' });
    });

    it('still blocks a repeat submission within the hour, using Redis not the row', async () => {
        const svc = new SalaryService();
        await svc.submit({ ...base, fingerprint: 'guest-token' });
        await expect(svc.submit({ ...base, fingerprint: 'guest-token' })).rejects.toMatchObject({ statusCode: 429 });
        expect(inserted).toHaveLength(1);
    });

    it('stores the matched role and canonical city (5.2), still with no identifier', async () => {
        await new SalaryService().submit({ ...base, role: 'SDE-2', city: 'Bengaluru', fingerprint: 'guest-token' });
        expect(inserted[0]).toMatchObject({ role: 'software engineer', city: 'bangalore' });
        expect(inserted[0]).not.toHaveProperty('fingerprint');
        expect(inserted[0]).not.toHaveProperty('userId');
    });

    it('writes exactly the allowed columns, and never an offer id or company name (5.4)', async () => {
        // The card sends the same six keys as the Explorer. Even if a body carried more, the
        // explicit field list means none of it reaches the row.
        await new SalaryService().submit({
            ...base, companySize: '201-1000', fingerprint: 'guest-token',
            offerId: 'offer-123', companyName: 'Acme Payments',
        } as never);
        expect(Object.keys(inserted[0]).sort()).toEqual(
            ['city', 'companySize', 'companyType', 'createdAt', 'ctc', 'experienceYears', 'role', 'status', 'updatedAt'],
        );
        expect(JSON.stringify(inserted[0])).not.toMatch(/offer-123|Acme|acme/);
    });

    it('coarsens created_at and updated_at to the UTC day (5.4, D6)', async () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date('2026-10-12T23:59:59.999Z'));
            await new SalaryService().submit({ ...base, fingerprint: 'guest-token' });
        } finally {
            vi.useRealTimers();
        }
        expect((inserted[0].createdAt as Date).toISOString()).toBe('2026-10-12T00:00:00.000Z');
        expect((inserted[0].updatedAt as Date).toISOString()).toBe('2026-10-12T00:00:00.000Z');
    });

    it('dayStartUtc drops the time and ignores the input offset', () => {
        expect(dayStartUtc(new Date('2026-10-12T23:59:59.999Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z');
        expect(dayStartUtc(new Date('2026-10-12T05:30:00+05:30')).toISOString()).toBe('2026-10-12T00:00:00.000Z');
    });

    it('marks the cooldown 429 with details.reason ALREADY_SUBMITTED, keeping the limiter code (D7)', async () => {
        const svc = new SalaryService();
        await svc.submit({ ...base, fingerprint: 'guest-token' });
        await expect(svc.submit({ ...base, fingerprint: 'guest-token' })).rejects.toMatchObject({
            statusCode: 429,
            code: 'RATE_LIMIT_EXCEEDED',
            details: { reason: 'ALREADY_SUBMITTED' },
        });
    });

    it('keys the cooldown on a hash, never the raw token', () => {
        expect(submitCooldownKey('guest-token')).not.toContain('guest-token');
    });
});
