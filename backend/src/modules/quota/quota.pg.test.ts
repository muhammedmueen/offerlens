import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Concurrency + refund proof against a REAL Postgres (task 4.3).
 *
 * Skipped unless QUOTA_PG_TEST is set, and every DB import is dynamic inside beforeAll, so the
 * default `npm test` (and CI, with no database) never loads them. Run it against a throwaway
 * database — see docs/LOCAL_DEVELOPMENT.md "Plans and quotas":
 *
 *   $env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/offerlens_quota_it'
 *   npm run db:migrate
 *   $env:QUOTA_PG_TEST='1'; npx vitest run src/modules/quota/quota.pg.test.ts
 */
describe.skipIf(!process.env.QUOTA_PG_TEST)('quota against Postgres', () => {
    let m: {
        db: typeof import('@/db/index.js').db;
        conn: typeof import('@/db/index.js').conn;
        schema: typeof import('@/db/schema/index.js');
        quota: typeof import('./quota.service.js');
        plans: typeof import('@/config/plans.js');
        errors: typeof import('@/shared/errors/app-error.js');
        drizzle: typeof import('drizzle-orm');
    };
    const guestId = randomUUID();
    const userId = randomUUID();
    const offerId = randomUUID();

    beforeAll(async () => {
        const dbMod = await import('@/db/index.js');
        m = {
            db: dbMod.db,
            conn: dbMod.conn,
            schema: await import('@/db/schema/index.js'),
            quota: await import('./quota.service.js'),
            plans: await import('@/config/plans.js'),
            errors: await import('@/shared/errors/app-error.js'),
            drizzle: await import('drizzle-orm'),
        };
        await m.db.insert(m.schema.guests).values({ id: guestId, fingerprint: `pg-test-${guestId}`, ipAddress: '127.0.0.1' });
        await m.db.insert(m.schema.users).values({ id: userId, email: `pg-test-${userId}@example.com` });
    }, 30_000);

    afterAll(async () => {
        if (!m) return;
        const { eq, inArray } = m.drizzle;
        await m.db.delete(m.schema.quotaCounters).where(inArray(m.schema.quotaCounters.subjectId, [guestId, userId]));
        await m.db.delete(m.schema.offers).where(eq(m.schema.offers.id, offerId));
        await m.db.delete(m.schema.users).where(eq(m.schema.users.id, userId));
        await m.db.delete(m.schema.guests).where(eq(m.schema.guests.id, guestId));
        await m.conn.end();
    });

    /** Five overlapping transactions, each holding its reservation for 50 ms before commit. */
    async function fireFive(subject: { type: 'user' | 'guest'; id: string; tier: import('@/config/plans.js').Tier }) {
        const results = await Promise.allSettled(Array.from({ length: 5 }, () =>
            m.db.transaction(async (tx) => {
                const r = await m.quota.reserve(tx, subject, 'analysis');
                await tx.execute(m.drizzle.sql`select pg_sleep(0.05)`);
                return r;
            })));
        const ok = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        for (const r of rejected) expect(r.reason).toBeInstanceOf(m.errors.QuotaExceededError);
        return { ok: ok.length, rejected: rejected.length };
    }

    async function counter(subjectId: string): Promise<number | undefined> {
        const { and, eq } = m.drizzle;
        const [row] = await m.db.select({ count: m.schema.quotaCounters.count }).from(m.schema.quotaCounters)
            .where(and(eq(m.schema.quotaCounters.subjectId, subjectId), eq(m.schema.quotaCounters.feature, 'analysis')));
        return row?.count;
    }

    it('guest (limit 1): exactly 1 of 5 concurrent reservations succeeds', async () => {
        const r = await fireFive({ type: 'guest', id: guestId, tier: m.plans.GUEST });
        expect(r).toEqual({ ok: 1, rejected: 4 });
        expect(await counter(guestId)).toBe(1);
    });

    it('free user (limit 3): exactly 3 of 5 concurrent reservations succeed', async () => {
        const r = await fireFive({ type: 'user', id: userId, tier: m.plans.PLANS.free });
        expect(r).toEqual({ ok: 3, rejected: 2 });
        expect(await counter(userId)).toBe(3);
    });

    it('a failed offer is refunded exactly once under concurrent refunds', async () => {
        const { eq } = m.drizzle;
        const { day } = (await import('@/shared/ist-day.js')).istDayWindow(new Date());
        await m.db.insert(m.schema.offers).values({
            id: offerId, userId, status: 'PROCESSING', isGuest: false,
            quotaSubjectType: 'user', quotaSubjectId: userId, quotaDay: day,
        });

        const before = await counter(userId);
        await Promise.all([
            m.db.transaction((tx) => m.quota.releaseOfferQuota(tx, offerId)),
            m.db.transaction((tx) => m.quota.releaseOfferQuota(tx, offerId)),
            m.quota.failOfferAndRefund(offerId, 'test failure'),
        ]);

        expect(await counter(userId)).toBe((before ?? 0) - 1);
        const [offer] = await m.db.select().from(m.schema.offers).where(eq(m.schema.offers.id, offerId));
        expect(offer.quotaRefunded).toBe(true);
        expect(offer.status).toBe('FAILED');
    });
});
