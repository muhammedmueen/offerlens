import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

/**
 * FLOW-2: only the final attempt may write FAILED. ProcessingPage stops polling on FAILED, so a
 * non-final FAILED showed "Analysis Failed" for an offer whose BullMQ retry then completed.
 *
 * DB-free: bullmq's Worker is mocked to capture the processor, and the DB, AI provider and quota
 * service are stubbed. `events` records DB writes and AI calls in order.
 */
const h = vi.hoisted(() => ({
    processors: {} as Record<string, (job: any) => Promise<unknown>>,
    events: [] as unknown[],
    analyzeOffer: null as unknown as Mock,
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
vi.mock('@/config/index.js', () => ({ config: { NODE_ENV: 'test', AI_PROVIDER: 'mock' } }));

const update = () => ({ set: (values: unknown) => ({ where: async () => { h.events.push(values); } }) });
vi.mock('@/db/index.js', () => ({
    db: {
        update,
        query: { offers: { findFirst: async () => ({ id: 'offer-1', userId: null, guestId: 'g-1', userContext: {}, ocrConfidence: null }) } },
        transaction: async (fn: (tx: unknown) => Promise<void>) => fn({
            insert: () => ({ values: async () => { h.events.push('insert analysis'); } }),
            update,
        }),
    },
}));
vi.mock('@/providers/ai/ai.factory.js', () => ({
    createAiProvider: () => ({ analyzeOffer: (...args: unknown[]) => h.analyzeOffer(...args) }),
    describeSelection: () => 'default provider',
}));
vi.mock('@/modules/salary/salary.service.js', () => ({ SalaryService: class {} }));
vi.mock('@/modules/quota/quota.service.js', () => ({
    failOfferAndRefund: (...args: unknown[]) => h.failOfferAndRefund(...args),
}));

await import('./analysis.worker.js');
const processor = h.processors['analysis-queue'];

const BUSY = 'All AI models are currently busy. Please try again.';
const job = (attemptsMade: number) => ({
    id: `job-${attemptsMade}`,
    data: { offerId: 'offer-1', text: 'Offer letter text' },
    attemptsMade,
    opts: { attempts: 3 },
    updateData: vi.fn(),
});
const statuses = () => h.events
    .filter((e): e is { status: string } => typeof e === 'object' && e !== null && 'status' in e)
    .map((e) => e.status);

beforeEach(() => {
    h.events.length = 0;
    h.analyzeOffer = vi.fn(async () => { h.events.push('ai'); throw new Error(BUSY); });
    h.failOfferAndRefund = vi.fn(async () => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('analysis worker attempts (FLOW-2)', () => {
    it('attempt 1 of 3 fails: rethrows, leaves PROCESSING, writes no FAILED and refunds nothing', async () => {
        await expect(processor(job(0))).rejects.toThrow(BUSY);
        expect(statuses()).toEqual(['PROCESSING']);
        // No reason is recorded on a non-final attempt (the start write clears it to null).
        expect(
            h.events.some(
                (e) => typeof e === 'object' && e !== null && (e as { failureReason?: unknown }).failureReason != null,
            ),
        ).toBe(false);
        expect(h.failOfferAndRefund).not.toHaveBeenCalled();
    });

    it('final attempt fails: FAILED with the reason, refunded exactly once, rethrown', async () => {
        await expect(processor(job(2))).rejects.toThrow(BUSY);
        expect(h.failOfferAndRefund).toHaveBeenCalledTimes(1);
        expect(h.failOfferAndRefund).toHaveBeenCalledWith('offer-1', BUSY);
        // The FAILED write is failOfferAndRefund's, in its refund transaction; none elsewhere.
        expect(statuses()).toEqual(['PROCESSING']);
    });

    it('attempt 2 writes PROCESSING before doing any work', async () => {
        await expect(processor(job(1))).rejects.toThrow(BUSY);
        expect(h.events[0]).toEqual({ status: 'PROCESSING', failureReason: null });
        expect(h.events.indexOf('ai')).toBeGreaterThan(0);
    });

    it('success on a retry: COMPLETED, no refund', async () => {
        h.analyzeOffer = vi.fn(async () => {
            h.events.push('ai');
            return { extractedData: {}, redFlags: [], benefits: [], negotiationSuggestions: [] };
        });
        await expect(processor(job(1))).resolves.toBeUndefined();
        expect(statuses()).toEqual(['PROCESSING', 'COMPLETED']);
        expect(h.events).toContain('insert analysis');
        expect(h.failOfferAndRefund).not.toHaveBeenCalled();
    });
});
