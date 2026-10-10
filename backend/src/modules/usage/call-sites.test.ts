import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PLANS } from '@/config/plans.js';

/**
 * Every AI/Vision call site threads the caller's identity into the ledger. These tests drive
 * the services directly with the mock provider and assert the row each one writes. The two
 * BullMQ workers build a `Worker` at import and are not unit-testable here; their wiring is
 * covered by tsc, review and the Docker smoke test.
 */

vi.mock('@/config/index.js', () => ({
    get config() { return { AI_PROVIDER: 'mock', GOOGLE_CLOUD_CREDENTIALS: undefined }; },
}));

const offersFindFirst = vi.fn();
const analysesFindFirst = vi.fn();
const insertValues = vi.fn((_row: Record<string, unknown>) => Promise.resolve());
vi.mock('@/db/index.js', () => ({
    db: {
        insert: () => ({ values: insertValues }),
        query: {
            offers: { findFirst: (...a: unknown[]) => offersFindFirst(...a) },
            analyses: { findFirst: (...a: unknown[]) => analysesFindFirst(...a) },
        },
    },
}));

// The career path cache would otherwise try a real Redis. Always a miss here.
vi.mock('@/shared/cache.js', () => ({
    cacheGetJson: async () => null,
    cacheSetJson: async () => true,
    cacheDelete: async () => {},
}));

vi.mock('@/queue/queues.js', () => ({
    ocrQueue: { add: vi.fn() },
    analysisQueue: { add: vi.fn() },
}));

const extractedData = {
    role: 'Software Engineer',
    companyName: 'Acme',
    companyType: 'product',
    industry: 'Technology',
    compensation: { totalCTC: 1_200_000, currency: 'INR' },
};

const fakeFastify = {
    log: { info() {}, warn() {}, error() {} },
    ocr: { name: 'google-vision' as const, extractText: async () => ({ text: 'hi', confidence: 0.9 }) },
} as any;

beforeEach(() => {
    insertValues.mockClear();
    offersFindFirst.mockReset();
    analysesFindFirst.mockReset();
    offersFindFirst.mockResolvedValue({ id: 'o1', userId: 'u1', guestId: 'g1', status: 'COMPLETED' });
    analysesFindFirst.mockResolvedValue({ extractedData });
});

describe('career call site', () => {
    it('records a career row with the offer context', async () => {
        const { CareerService } = await import('@/modules/career/career.service.js');
        await new CareerService(fakeFastify).generatePath('o1', 'u1', PLANS.unlimited);
        expect(insertValues).toHaveBeenCalledTimes(1);
        expect(insertValues.mock.calls[0][0]).toMatchObject({
            purpose: 'career', userId: 'u1', guestId: 'g1', offerId: 'o1',
        });
    });
});

describe('negotiation call site', () => {
    it('records a negotiation row with the offer context', async () => {
        const { NegotiationService } = await import('@/modules/negotiation/negotiation.service.js');
        await new NegotiationService(fakeFastify).generateScript('o1', 'u1', PLANS.unlimited);
        expect(insertValues).toHaveBeenCalledTimes(1);
        expect(insertValues.mock.calls[0][0]).toMatchObject({
            purpose: 'negotiation', userId: 'u1', guestId: 'g1', offerId: 'o1',
        });
    });
});

describe('metadata extraction call site', () => {
    it('records a metadata row with the passed context', async () => {
        const { OfferService } = await import('@/modules/offer/offer.service.js');
        const { GuestService } = await import('@/modules/guest/guest.service.js');
        await new OfferService(fakeFastify, new GuestService())
            .extractMetadataFromText('text', {}, { userId: 'u1', guestId: 'g1' });
        expect(insertValues).toHaveBeenCalledTimes(1);
        expect(insertValues.mock.calls[0][0]).toMatchObject({
            purpose: 'metadata', userId: 'u1', guestId: 'g1',
        });
    });
});

describe('OCR extraction call site', () => {
    it('records an ocr row with units 1', async () => {
        const { OfferService } = await import('@/modules/offer/offer.service.js');
        const { GuestService } = await import('@/modules/guest/guest.service.js');
        await new OfferService(fakeFastify, new GuestService()).extractTextFromFile(
            { filename: 'a.png', mimetype: 'image/png', toBuffer: async () => Buffer.from('x') },
            { guestId: 'g1' },
        );
        expect(insertValues).toHaveBeenCalledTimes(1);
        expect(insertValues.mock.calls[0][0]).toMatchObject({
            purpose: 'ocr', units: 1, guestId: 'g1',
        });
    });
});
