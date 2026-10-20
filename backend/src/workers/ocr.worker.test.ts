import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

/**
 * FLOW-2, OCR side: only the final attempt may write FAILED, so a retry that is still coming
 * does not end the processing page's poll.
 *
 * DB-free: bullmq's Worker is mocked to capture the processor; DB, queue and quota are stubbed.
 * Pasted-text jobs are used so no file or OCR provider is touched; the failure is injected at
 * the analysis enqueue, the last step of the attempt.
 */
const h = vi.hoisted(() => ({
    processors: {} as Record<string, (job: any) => Promise<unknown>>,
    events: [] as unknown[],
    enqueue: null as unknown as Mock,
    failOfferAndRefund: null as unknown as Mock,
}));

vi.mock('bullmq', () => ({
    Worker: class {
        constructor(name: string, processor: (job: any) => Promise<unknown>) {
            h.processors[name] = processor;
        }
    },
}));
vi.mock('./worker.js', () => ({ defaultWorkerOptions: {} }));
vi.mock('./stored-file.js', () => ({
    runThenPurgeFile: (_job: unknown, _path: unknown, run: () => Promise<unknown>) => run(),
}));
vi.mock('@/db/index.js', () => ({
    db: { update: () => ({ set: (values: unknown) => ({ where: async () => { h.events.push(values); } }) }) },
}));
vi.mock('@/providers/ocr/ocr.factory.js', () => ({ createOcrProvider: () => ({}) }));
vi.mock('@/queue/queues.js', () => ({ analysisQueue: { add: (...args: unknown[]) => h.enqueue(...args) } }));
vi.mock('@/modules/usage/usage-ledger.js', () => ({ meterOcr: vi.fn() }));
vi.mock('@/modules/quota/quota.service.js', () => ({
    failOfferAndRefund: (...args: unknown[]) => h.failOfferAndRefund(...args),
}));

await import('./ocr.worker.js');
const processor = h.processors['ocr-queue'];

const DOWN = 'Connection is closed.';
const LETTER = 'This offer letter is long enough to clear the minimum extracted text length check.';
const job = (attemptsMade: number) => ({
    id: `job-${attemptsMade}`,
    data: { offerId: 'offer-1', text: LETTER },
    attemptsMade,
    opts: { attempts: 3 },
});
const statuses = () => h.events
    .filter((e): e is { status: string } => typeof e === 'object' && e !== null && 'status' in e)
    .map((e) => e.status);

beforeEach(() => {
    h.events.length = 0;
    h.enqueue = vi.fn(async () => { throw new Error(DOWN); });
    h.failOfferAndRefund = vi.fn(async () => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('OCR worker attempts (FLOW-2)', () => {
    it('attempt 1 of 3 fails: rethrows, leaves PROCESSING, writes no FAILED and refunds nothing', async () => {
        await expect(processor(job(0))).rejects.toThrow(DOWN);
        expect(statuses()).toEqual(['PROCESSING']);
        expect(h.events.some((e) => typeof e === 'object' && e !== null && 'failureReason' in e)).toBe(false);
        expect(h.failOfferAndRefund).not.toHaveBeenCalled();
    });

    it('final attempt fails: FAILED with the reason, refunded exactly once, rethrown', async () => {
        await expect(processor(job(2))).rejects.toThrow(DOWN);
        expect(h.failOfferAndRefund).toHaveBeenCalledTimes(1);
        expect(h.failOfferAndRefund).toHaveBeenCalledWith('offer-1', DOWN);
        expect(statuses()).toEqual(['PROCESSING']);
    });

    it('attempt 2 writes PROCESSING before doing any work', async () => {
        await expect(processor(job(1))).rejects.toThrow(DOWN);
        expect(h.events[0]).toEqual({ status: 'PROCESSING' });
    });

    it('success on a retry: enqueues analysis, stays PROCESSING, no refund', async () => {
        h.enqueue = vi.fn(async () => undefined);
        await expect(processor(job(1))).resolves.toBeUndefined();
        expect(h.enqueue).toHaveBeenCalledTimes(1);
        expect(statuses()).toEqual(['PROCESSING']);
        expect(h.failOfferAndRefund).not.toHaveBeenCalled();
    });
});
