import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NewUsageLedgerRow } from '@/db/schema/usage-ledger.js';
import type { OcrProvider, OcrResult } from '@/providers/ocr/ocr.provider.js';

// These modules read config / connect to the DB at import time; neither is available under
// `npm test`, so both are mocked the way the rest of the suite does it. NODE_ENV is a mutable
// hoisted value so the OCR-guard tests below can switch between development and production.
const { configState } = vi.hoisted(() => ({ configState: { NODE_ENV: 'development' as string } }));
vi.mock('@/config/index.js', () => ({
    get config() { return { AI_PROVIDER: 'mock', GOOGLE_CLOUD_CREDENTIALS: undefined, NODE_ENV: configState.NODE_ENV }; },
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
    configState.NODE_ENV = 'development';
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

    // Honest OCR in production (the guard lives in meterOcr, the one shared choke point).
    describe('production OCR guard', () => {
        it('rejects a mock OCR call in production without running it or writing a row', async () => {
            configState.NODE_ENV = 'production';
            const { meterOcr } = await load();
            const rows: NewUsageLedgerRow[] = [];
            const extract = vi.fn(async () => okResult);

            await expect(meterOcr(
                fakeOcr('mock', extract),
                '/tmp/scan.png', {}, async (r) => { rows.push(r); },
            )).rejects.toMatchObject({ code: 'OCR_UNAVAILABLE', statusCode: 400 });

            // No canned text handed back, no ledger row, no fabricated cost.
            expect(extract).not.toHaveBeenCalled();
            expect(rows).toHaveLength(0);
        });

        it('still runs the mock in development (local behaviour unchanged)', async () => {
            configState.NODE_ENV = 'development';
            const { meterOcr } = await load();
            const rows: NewUsageLedgerRow[] = [];
            const result = await meterOcr(
                fakeOcr('mock', async () => okResult),
                '/tmp/scan.png', {}, async (r) => { rows.push(r); },
            );
            expect(result).toEqual(okResult);
            expect(rows).toHaveLength(1);
        });

        it('leaves the real provider path unchanged in production', async () => {
            configState.NODE_ENV = 'production';
            const { meterOcr } = await load();
            const rows: NewUsageLedgerRow[] = [];
            const result = await meterOcr(
                fakeOcr('google-vision', async () => okResult),
                '/tmp/scan.png', { offerId: 'o1' }, async (r) => { rows.push(r); },
            );
            expect(result).toEqual(okResult);
            expect(rows[0]).toMatchObject({ provider: 'google-vision', success: true, units: 1 });
        });
    });
});

describe('usageContextForRequest', () => {
    /** Injected so the test can see which of the two lookups ran. */
    function fakeGuests(overrides: Partial<{ findByToken: any; getOrCreateGuest: any }> = {}) {
        return {
            findByToken: vi.fn(async () => ({ id: 'guest-row-1' })),
            getOrCreateGuest: vi.fn(async () => ({ id: 'guest-row-new' })),
            ...overrides,
        } as any;
    }

    it('a first-visit guest gets a guest row created and attributed', async () => {
        const { usageContextForRequest } = await load();
        const guests = fakeGuests();
        const ctx = await usageContextForRequest({ guestId: 'token-abc', ip: '1.2.3.4' }, guests);
        expect(ctx).toEqual({ userId: null, guestId: 'guest-row-new', offerId: null });
        expect(guests.getOrCreateGuest).toHaveBeenCalledWith({ fingerprint: 'token-abc', ip: '1.2.3.4' });
        expect(guests.findByToken).not.toHaveBeenCalled();
    });

    it('a registered user stays read-only (findByToken, never getOrCreateGuest)', async () => {
        const { usageContextForRequest } = await load();
        const guests = fakeGuests();
        const ctx = await usageContextForRequest({ userId: 'u1', guestId: 'token-abc', ip: '1.2.3.4' }, guests);
        expect(ctx).toEqual({ userId: 'u1', guestId: 'guest-row-1', offerId: null });
        expect(guests.getOrCreateGuest).not.toHaveBeenCalled();
    });

    it('a registered user with no guest row gets guestId null', async () => {
        const { usageContextForRequest } = await load();
        const ctx = await usageContextForRequest(
            { userId: 'u1', guestId: 'token-abc', ip: '1.2.3.4' },
            fakeGuests({ findByToken: vi.fn(async () => undefined) }),
        );
        expect(ctx.guestId).toBeNull();
    });

    it('gives guestId null and logs when the lookup throws', async () => {
        const { usageContextForRequest } = await load();
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const ctx = await usageContextForRequest(
            { guestId: 'token-abc', ip: '1.2.3.4' },
            fakeGuests({ getOrCreateGuest: vi.fn(async () => { throw new Error('db down'); }) }),
        );
        expect(ctx.guestId).toBeNull();
        expect(errSpy).toHaveBeenCalled();
    });

    it('passes userId through with no guest token', async () => {
        const { usageContextForRequest } = await load();
        const guests = fakeGuests();
        const ctx = await usageContextForRequest({ userId: 'u9', ip: '1.2.3.4' }, guests);
        expect(ctx).toEqual({ userId: 'u9', guestId: null, offerId: null });
        expect(guests.findByToken).not.toHaveBeenCalled();
        expect(guests.getOrCreateGuest).not.toHaveBeenCalled();
    });
});