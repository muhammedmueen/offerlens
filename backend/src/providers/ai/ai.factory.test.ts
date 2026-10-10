import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Factory reads config at call time, and createUsageRecorder's default insert touches the DB.
// Mock both — the DB mock's values() is the spy the tests assert on.
const mockConfig = {
    AI_PROVIDER: 'gemini' as string,
    GEMINI_API_KEY: undefined as string | undefined,
    OPENAI_API_KEY: undefined as string | undefined,
    ANTHROPIC_API_KEY: undefined as string | undefined,
    GEMINI_MODEL: undefined as string | undefined,
    OPENAI_MODEL: undefined as string | undefined,
    ANTHROPIC_MODEL: undefined as string | undefined,
};
vi.mock('@/config/index.js', () => ({ get config() { return mockConfig; } }));

const insertValues = vi.fn((_row: Record<string, unknown>) => Promise.resolve());
vi.mock('@/db/index.js', () => ({
    db: { insert: () => ({ values: insertValues }) },
}));

const load = () => import('./ai.factory.js');

// The first test's `load()` cold-imports all three AI SDKs inside the test body (~1.6s warm).
// On a cold parallel run it overran the 5s default: the abandoned test's last two metered calls
// then landed in the NEXT test ("expected 1 call, got 3"). Timeout only; no assertion changed.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
    insertValues.mockClear();
    mockConfig.AI_PROVIDER = 'gemini';
    mockConfig.GEMINI_API_KEY = undefined;
    mockConfig.OPENAI_API_KEY = undefined;
    mockConfig.ANTHROPIC_API_KEY = undefined;
});

afterEach(() => {
    vi.restoreAllMocks();
});

const ctx = { userId: 'u1', guestId: 'g1', offerId: 'o1' };

describe('createAiProvider metering', () => {
    it('meters all four mock methods with context and billedTo mock', async () => {
        const { createAiProvider } = await load();
        const provider = createAiProvider({ provider: 'mock' }, ctx);

        await provider.analyzeOffer('x');
        await provider.extractMetadata('x');
        await provider.generateCareerPath({ role: 'r', companyType: 'c', industry: 'i' });
        await provider.generateNegotiationScript({
            companyName: 'Acme', role: 'r', currentOffer: {}, marketData: {}, suggestions: [], tone: 'professional',
        });

        expect(insertValues).toHaveBeenCalledTimes(4);
        const rows = insertValues.mock.calls.map((c) => c[0]);
        expect(rows.map((r: any) => r.purpose)).toEqual(['analysis', 'metadata', 'career', 'negotiation']);
        for (const r of rows) {
            expect(r).toMatchObject({ userId: 'u1', guestId: 'g1', offerId: 'o1', billedTo: 'mock' });
        }
    });

    it('falls back to the mock (billedTo mock) when no key exists for the requested provider', async () => {
        const { createAiProvider } = await load();
        const provider = createAiProvider({ provider: 'gemini' }, ctx); // no GEMINI_API_KEY
        await provider.extractMetadata('x');
        expect(insertValues).toHaveBeenCalledTimes(1);
        expect(insertValues.mock.calls[0][0]).toMatchObject({ billedTo: 'mock' });
    });

    it('tags a caller-supplied key as caller_key', async () => {
        const { createAiProvider } = await load();
        const { GeminiAiProvider } = await import('./gemini.ai.js');
        vi.spyOn(GeminiAiProvider.prototype as any, 'complete')
            .mockResolvedValue({ text: '{}', inputTokens: 10, outputTokens: 5 });

        const provider = createAiProvider({ provider: 'gemini', apiKey: 'caller-key' }, ctx);
        await provider.extractMetadata('x');

        expect(insertValues).toHaveBeenCalledTimes(1);
        expect(insertValues.mock.calls[0][0]).toMatchObject({ billedTo: 'caller_key' });
    });

    it('tags the server key as platform', async () => {
        mockConfig.GEMINI_API_KEY = 'server-key';
        const { createAiProvider } = await load();
        const { GeminiAiProvider } = await import('./gemini.ai.js');
        vi.spyOn(GeminiAiProvider.prototype as any, 'complete')
            .mockResolvedValue({ text: '{}', inputTokens: 10, outputTokens: 5 });

        const provider = createAiProvider({ provider: 'gemini' }, ctx);
        await provider.extractMetadata('x');

        expect(insertValues.mock.calls[0][0]).toMatchObject({ billedTo: 'platform' });
    });

    it('writes nothing when no usage context is given', async () => {
        const { createAiProvider } = await load();
        const provider = createAiProvider({ provider: 'mock' });
        await provider.extractMetadata('x');
        expect(insertValues).not.toHaveBeenCalled();
    });
});
