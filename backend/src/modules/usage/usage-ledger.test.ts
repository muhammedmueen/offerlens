import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NewUsageLedgerRow } from '@/db/schema/usage-ledger.js';
import type { OcrProvider, OcrResult } from '@/providers/ocr/ocr.provider.js';

// These modules read config / connect to the DB at import time; neither is available under
// `npm test`, so both are mocked the way the rest of the suite does it.
vi.mock('@/config/index.js', () => ({
    get config() { return { AI_PROVIDER: 'mock', GOOGLE_CLOUD_CREDENTIALS: undefined }; },
}));

const guestsFindFirst = vi.fn();
vi.mock('@/db/index.js', () => ({
    db: {
        insert: () => ({ values: vi.fn(async () => {}) }),
        query: { guests: { findFirst: (...a: unknown[]) => guestsFindFirst(...a) } },
    },
}));

const load = () => import('./usage-ledger.js');

beforeEach(() => {
    guestsFindFirst.mockReset();
    vi.restoreAllMocks();
});

/** An OcrProvider whose success/failure and name are scripted per test. */
function fakeOcr(name: OcrProvider['name'], behaviour: () => Promise<OcrResult>): OcrProvider {
    return { name, extractText: behaviour };
}

const okResult: OcrResult = { text: 'hello', confidence: 0.9 };

describe('createUsageRecorder', () => {
    it('writes context and billedTo into the row', async () => {
        const { createUsageRecorder } = await load();
        const rows: NewUsageLedgerRow[] = [];
        const recorder = createUsageRecorder(
            { userId: 'u1', guestId: 'g1', offerId: 'o1' }, 'platform',
            async (r) => { rows.push(r); },
        );

        await recorder({
            purpose: 'metadata', provider: 'gemini', model: 'gemini-flash-lite-latest',
            inputTokens: 10, outputTokens: 5, thinkingTokens: 2, units: null,
            costUsd: 0.0001, success: true, errorCode: null,
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            userId: 'u1', guestId: 'g1', offerId: 'o1', billedTo: 'platform',
            purpose: 'metadata', provider: 'gemini', thinkingTokens: 2,
        });
    });

    it('turns missing context fields into null', async () => {
        const { createUsageRecorder } = await load();
        const rows: NewUsageLedgerRow[] = [];
        const recorder = createUsageRecorder({}, 'mock', async (r) => { rows.push(r); });
        await recorder({
            purpose: 'career', provider: 'mock', model: 'mock-v1',
            inputTokens: 0, outputTokens: 0, thinkingTokens: 0, units: null,
            costUsd: null, success: true, errorCode: null,
        });
        expect(rows[0].userId).toBeNull();
        expect(rows[0].guestId).toBeNull();
        expect(rows[0].offerId).toBeNull();
    });
});

describe('meterOcr', () => {
    it('records one ocr row for a successful google-vision call', async () => {
        const { meterOcr } = await load();
        const { VISION_TEXT_DETECTION_USD_PER_IMAGE } = await import('@/providers/ai/usage.js');
        const rows: NewUsageLedgerRow[] = [];

        const result = await meterOcr(
            fakeOcr('google-vision', async () => okResult),
            '/tmp/x.png',
            { offerId: 'o1' },
            async (r) => { rows.push(r); },
        );

        expect(result).toEqual(okResult);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            purpose: 'ocr', provider: 'google-vision', units: 1,
            costUsd: VISION_TEXT_DETECTION_USD_PER_IMAGE, billedTo: 'platform', success: true,
        });
    });

    it('records a failed row and rethrows when extraction throws', async () => {
        const { meterOcr } = await load();
        const rows: NewUsageLedgerRow[] = [];
        const boom = new Error('vision 500');

        await expect(meterOcr(
            fakeOcr('google-vision', async () => { throw boom; }),
            '/tmp/x.png', { offerId: 'o1' }, async (r) => { rows.push(r); },
        )).rejects.toBe(boom);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ success: false, units: 0, errorCode: 'provider_error' });
    });

    it('does not break when the insert itself rejects', async () => {
        const { meterOcr } = await load();
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await meterOcr(
            fakeOcr('google-vision', async () => okResult),
            '/tmp/x.png', { offerId: 'o1' },
            async () => { throw new Error('db down'); },
        );

        expect(result).toEqual(okResult);
        expect(errSpy).toHaveBeenCalled();
    });

    it('tags a mock provider as billedTo mock with null cost', async () => {
        const { meterOcr } = await load();
        const rows: NewUsageLedgerRow[] = [];
        await meterOcr(
            fakeOcr('mock', async () => okResult),
            '/tmp/x.png', {}, async (r) => { rows.push(r); },
        );
        expect(rows[0]).toMatchObject({ billedTo: 'mock', costUsd: null, units: 1 });
    });
});

describe('usageContextForRequest', () => {
    it('resolves a found guest to its id', async () => {
        const { usageContextForRequest, } = await load();
        guestsFindFirst.mockResolvedValue({ id: 'guest-row-1' });
        const ctx = await usageContextForRequest({ userId: 'u1', guestId: 'token-abc' });
        expect(ctx).toEqual({ userId: 'u1', guestId: 'guest-row-1', offerId: null });
    });

    it('gives guestId null when no guest row exists', async () => {
        const { usageContextForRequest } = await load();
        guestsFindFirst.mockResolvedValue(undefined);
        const ctx = await usageContextForRequest({ guestId: 'token-abc' });
        expect(ctx.guestId).toBeNull();
    });

    it('gives guestId null and logs when the lookup throws', async () => {
        const { usageContextForRequest } = await load();
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        guestsFindFirst.mockRejectedValue(new Error('db down'));
        const ctx = await usageContextForRequest({ guestId: 'token-abc' });
        expect(ctx.guestId).toBeNull();
        expect(errSpy).toHaveBeenCalled();
    });

    it('passes userId through with no guest token', async () => {
        const { usageContextForRequest } = await load();
        const ctx = await usageContextForRequest({ userId: 'u9' });
        expect(ctx).toEqual({ userId: 'u9', guestId: null, offerId: null });
        expect(guestsFindFirst).not.toHaveBeenCalled();
    });
});
