import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { GUEST, PLANS } from '@/config/plans.js';
import { AppError, QuotaExceededError } from '@/shared/errors/app-error.js';

// OfferService.create's quota wiring (task 4.3), with the DB, storage, queue and quota
// service all faked. The atomicity itself is proven against Postgres in quota.pg.test.ts.

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test', AI_PROVIDER: 'mock' }; } }));

const calls: string[] = [];
const offersFindFirst = vi.fn();
const insertedOffers: any[] = [];
const tx = {
    delete: () => ({ where: async () => { calls.push('delete'); } }),
    insert: () => ({ values: async (v: any) => { calls.push('insert'); if (v.textHash !== undefined) insertedOffers.push(v); } }),
};
vi.mock('@/db/index.js', () => ({
    db: {
        query: { offers: { findFirst: (...a: unknown[]) => offersFindFirst(...a) } },
        transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
}));

const ocrAdd = vi.fn();
vi.mock('@/queue/queues.js', () => ({ ocrQueue: { add: (...a: unknown[]) => ocrAdd(...a) } }));

const reserve = vi.fn();
const releaseOfferQuota = vi.fn();
const failOfferAndRefund = vi.fn();
vi.mock('@/modules/quota/quota.service.js', () => ({
    reserve: (...a: unknown[]) => { calls.push('reserve'); return reserve(...a); },
    releaseOfferQuota: (...a: unknown[]) => { calls.push('release'); return releaseOfferQuota(...a); },
    failOfferAndRefund: (...a: unknown[]) => failOfferAndRefund(...a),
}));

const upload = vi.fn(async () => '/stored/x.png');
const storageDelete = vi.fn(async () => {});
const fastify = {
    storage: { upload, delete: storageDelete },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
} as any;
const guestService = { getOrCreateGuest: vi.fn(async () => ({ id: 'guest-row' })) } as any;

// Imported once in a hook with its own timeout: offer.service pulls in all three AI SDKs, and a
// cold import inside a test body can blow the 5s per-test timeout under a parallel run.
let OfferService: typeof import('./offer.service.js').OfferService;
beforeAll(async () => {
    ({ OfferService } = await import('./offer.service.js'));
}, 30_000);
const load = async () => new OfferService(fastify, guestService);

const fileInput = {
    file: { filename: 'x.png', mimetype: 'image/png', encoding: '7bit', toBuffer: async () => Buffer.from('png') },
};

beforeEach(() => {
    calls.length = 0;
    insertedOffers.length = 0;
    for (const f of [offersFindFirst, ocrAdd, reserve, releaseOfferQuota, failOfferAndRefund, upload, storageDelete]) f.mockClear();
    offersFindFirst.mockResolvedValue(undefined);
    reserve.mockImplementation(async (_tx, subject) => ({ subjectType: subject.type, subjectId: subject.id, feature: 'analysis', day: '2026-10-10', count: 1 }));
    ocrAdd.mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('OfferService.create quota', () => {
    it('a non-FAILED duplicate returns early without reserving', async () => {
        const svc = await load();
        offersFindFirst.mockResolvedValue({ id: 'old', status: 'COMPLETED', createdAt: new Date(), isGuest: true });
        const r = await svc.create({ text: 'hello' }, 'tok', '1.1.1.1', undefined, GUEST);
        expect(r.id).toBe('old');
        expect(reserve).not.toHaveBeenCalled();
        expect(ocrAdd).not.toHaveBeenCalled();
    });

    it('a FAILED duplicate is refunded, then deleted, then a slot reserved', async () => {
        const svc = await load();
        offersFindFirst.mockResolvedValue({ id: 'old', status: 'FAILED', createdAt: new Date(), isGuest: true });
        await svc.create({ text: 'hello' }, 'tok', '1.1.1.1', undefined, GUEST);
        expect(releaseOfferQuota).toHaveBeenCalledWith(tx, 'old');
        expect(calls.slice(0, 3)).toEqual(['release', 'delete', 'reserve']);
    });

    it('over quota: no file stored, no enqueue, the 429 propagates', async () => {
        const svc = await load();
        const err = new QuotaExceededError({ feature: 'analysis', limit: 1, used: 1, tierId: 'guest', resetAt: new Date(), now: new Date() });
        reserve.mockRejectedValue(err);
        await expect(svc.create(fileInput, 'tok', '1.1.1.1', undefined, GUEST)).rejects.toBe(err);
        expect(upload).not.toHaveBeenCalled();
        expect(ocrAdd).not.toHaveBeenCalled();
    });

    it('an enqueue failure fails the offer, refunds, and answers 503', async () => {
        const svc = await load();
        ocrAdd.mockRejectedValue(new Error('redis down'));
        const err = await svc.create({ text: 'hello' }, 'tok', '1.1.1.1', undefined, GUEST).catch((e) => e);
        expect(err).toBeInstanceOf(AppError);
        expect(err.statusCode).toBe(503);
        expect(failOfferAndRefund).toHaveBeenCalledTimes(1);
        expect(failOfferAndRefund.mock.calls[0][0]).toBe(insertedOffers[0].id);
    });

    it('a registered caller is charged as the user, never the guest row', async () => {
        const svc = await load();
        await svc.create({ text: 'hello' }, 'tok', '1.1.1.1', 'user-1', PLANS.free);
        expect(reserve.mock.calls[0][1]).toEqual({ type: 'user', id: 'user-1', tier: PLANS.free });
        expect(insertedOffers[0]).toMatchObject({ quotaSubjectType: 'user', quotaSubjectId: 'user-1', quotaDay: '2026-10-10' });
    });

    it('a guest is charged as its guest row', async () => {
        const svc = await load();
        await svc.create({ text: 'hello' }, 'tok', '1.1.1.1', undefined, GUEST);
        expect(reserve.mock.calls[0][1]).toEqual({ type: 'guest', id: 'guest-row', tier: GUEST });
    });

    it('an unlimited tier stores no reservation', async () => {
        const svc = await load();
        reserve.mockResolvedValue(null);
        await svc.create({ text: 'hello' }, 'tok', '1.1.1.1', 'user-1', PLANS.unlimited);
        expect(insertedOffers[0]).toMatchObject({ quotaSubjectType: null, quotaSubjectId: null, quotaDay: null });
    });

    it('a rolled-back insert deletes the stored file', async () => {
        const svc = await load();
        const boom = new Error('insert failed');
        const origInsert = tx.insert;
        tx.insert = () => ({ values: async () => { throw boom; } });
        try {
            await expect(svc.create(fileInput, 'tok', '1.1.1.1', undefined, GUEST)).rejects.toBe(boom);
        } finally {
            tx.insert = origInsert;
        }
        expect(upload).toHaveBeenCalledTimes(1);
        expect(storageDelete).toHaveBeenCalledWith('/stored/x.png');
        expect(ocrAdd).not.toHaveBeenCalled();
    });
});
